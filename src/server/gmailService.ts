/**
 * Gmail API Service
 * Handles server-side Gmail API interactions using Google OAuth 2.0.
 * In-memory token storage ensures tokens are NEVER stored in browser code or persistent database files.
 */

interface GmailAuthSession {
  accessToken: string;
  email: string;
  displayName?: string | null;
  connectedAt: string;
  expiresAt?: number;
}

// In-memory store: Strictly held in backend memory, never persisted to disk or candidate records
let activeGmailSession: GmailAuthSession | null = null;

/**
 * Validates and registers an active Gmail session on the backend.
 * Checks token against Google's tokeninfo or profile endpoint.
 */
export async function setGmailSession(
  accessToken: string,
  claimedEmail?: string,
  displayName?: string | null
): Promise<{ success: boolean; email: string; error?: string }> {
  if (!accessToken || typeof accessToken !== 'string') {
    return { success: false, email: '', error: 'Invalid or missing OAuth access token.' };
  }

  try {
    // 1. Verify token with Google Tokeninfo endpoint
    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );

    if (!tokenInfoRes.ok) {
      const errText = await tokenInfoRes.text();
      return {
        success: false,
        email: '',
        error: `Google OAuth verification failed (${tokenInfoRes.status}): ${errText}`,
      };
    }

    const tokenInfo = await tokenInfoRes.json();

    // Check scope includes gmail.send or full mail
    const scopes: string = tokenInfo.scope || '';
    const hasSendScope =
      scopes.includes('https://www.googleapis.com/auth/gmail.send') ||
      scopes.includes('https://mail.google.com/') ||
      scopes.includes('https://www.googleapis.com/auth/gmail.compose') ||
      scopes.includes('https://www.googleapis.com/auth/gmail.modify');

    if (!hasSendScope) {
      return {
        success: false,
        email: tokenInfo.email || claimedEmail || '',
        error:
          'Insufficient permissions: The Gmail account did not grant "https://www.googleapis.com/auth/gmail.send" permission. Please re-authenticate and consent to sending emails.',
      };
    }

    const verifiedEmail = tokenInfo.email || claimedEmail || 'unknown@gmail.com';

    activeGmailSession = {
      accessToken,
      email: verifiedEmail,
      displayName: displayName || null,
      connectedAt: new Date().toISOString(),
      expiresAt: tokenInfo.exp ? parseInt(tokenInfo.exp, 10) * 1000 : undefined,
    };

    return {
      success: true,
      email: verifiedEmail,
    };
  } catch (err: any) {
    return {
      success: false,
      email: '',
      error: `Network error verifying Google OAuth token: ${err.message}`,
    };
  }
}

/**
 * Returns current Gmail connection status (never exposes access token!)
 */
export function getGmailSessionStatus(): {
  isConnected: boolean;
  email: string | null;
  displayName: string | null;
  connectedAt: string | null;
} {
  if (!activeGmailSession) {
    return {
      isConnected: false,
      email: null,
      displayName: null,
      connectedAt: null,
    };
  }

  // Check if expired
  if (activeGmailSession.expiresAt && Date.now() > activeGmailSession.expiresAt) {
    activeGmailSession = null;
    return {
      isConnected: false,
      email: null,
      displayName: null,
      connectedAt: null,
    };
  }

  return {
    isConnected: true,
    email: activeGmailSession.email,
    displayName: activeGmailSession.displayName || null,
    connectedAt: activeGmailSession.connectedAt,
  };
}

/**
 * Clears active Gmail session
 */
export function clearGmailSession(): void {
  activeGmailSession = null;
}

/**
 * Helper to build an RFC 2822 compliant MIME message and base64url encode it
 */
function buildRfc2822RawMessage({
  from,
  to,
  replyTo,
  subject,
  bodyText,
}: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  bodyText: string;
}): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;

  const lines: string[] = [
    `From: ${from}`,
    `To: ${to}`,
  ];

  if (replyTo && replyTo.trim()) {
    lines.push(`Reply-To: ${replyTo.trim()}`);
  }

  lines.push(`Subject: ${utf8Subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(bodyText, 'utf-8').toString('base64'));

  const rawMessage = lines.join('\r\n');

  // Convert to base64url (RFC 4648 §5)
  return Buffer.from(rawMessage, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Dispatches an email using the Gmail REST API (users.messages.send).
 * Ensures outreach happens from talenthubbfsi@gmail.com whoever the authenticated user is.
 */
export async function sendEmailViaGmailApi({
  to,
  subject,
  bodyText,
  senderName = 'BFSITalentHub Recruitment',
  replyTo = 'talenthubbfsi@gmail.com',
  fromEmail = 'talenthubbfsi@gmail.com',
  customAccessToken,
}: {
  to: string;
  subject: string;
  bodyText: string;
  senderName?: string;
  replyTo?: string;
  fromEmail?: string;
  customAccessToken?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
  statusCode?: number;
}> {
  const token = customAccessToken || activeGmailSession?.accessToken;

  if (!token) {
    return {
      success: false,
      error:
        'Gmail account is not connected. Recruiter must connect their Gmail account via Google OAuth in Outreach Settings first.',
      statusCode: 401,
    };
  }

  // Primary attempt: send with From header set to talenthubbfsi@gmail.com as requested
  const targetFromEmail = fromEmail || 'talenthubbfsi@gmail.com';
  const targetReplyTo = replyTo || 'talenthubbfsi@gmail.com';
  const fromHeader = senderName ? `"${senderName}" <${targetFromEmail}>` : targetFromEmail;

  const rawBase64Url = buildRfc2822RawMessage({
    from: fromHeader,
    to,
    replyTo: targetReplyTo,
    subject,
    bodyText,
  });

  try {
    let res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: rawBase64Url,
      }),
    });

    // If Gmail API rejects From header because user doesn't have talenthubbfsi@gmail.com alias registered
    if (!res.ok && res.status === 400) {
      const errText = await res.text();
      // If error is about invalid From header, retry with user's authenticated account as transport sender but keep talenthubbfsi@gmail.com in Reply-To
      if (errText.includes('Invalid From header') || errText.includes('from_address') || errText.includes('From')) {
        const fallbackFrom = activeGmailSession?.email ? `"${senderName}" <${activeGmailSession.email}>` : 'me';
        const fallbackRaw = buildRfc2822RawMessage({
          from: fallbackFrom,
          to,
          replyTo: targetReplyTo,
          subject,
          bodyText,
        });

        res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: fallbackRaw,
          }),
        });
      }
    }

    if (!res.ok) {
      const errorText = await res.text();
      let parsedMessage = errorText;
      try {
        const parsed = JSON.parse(errorText);
        parsedMessage = parsed.error?.message || errorText;
      } catch {}

      return {
        success: false,
        error: `Gmail API Error (${res.status}): ${parsedMessage}`,
        statusCode: res.status,
      };
    }

    const data = await res.json();
    return {
      success: true,
      messageId: data.id,
      threadId: data.threadId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error dispatching email via Gmail API: ${err.message}`,
      statusCode: 500,
    };
  }
}

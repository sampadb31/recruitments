/**
 * Gmail API Service
 * Handles server-side Gmail API interactions using Google OAuth 2.0.
 * In-memory token storage ensures tokens are NEVER stored in browser code or persistent database files.
 * Real email dispatching only - simulations are strictly prohibited here.
 */

interface GmailAuthSession {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  email: string;
  displayName?: string | null;
  connectedAt: string;
  expiresAt?: number;
}

// In-memory store: Strictly held in backend memory, never persisted to disk or candidate records
let activeGmailSession: GmailAuthSession | null = null;

/**
 * Refreshes an expired OAuth access token if refresh credentials are available.
 */
async function refreshAccessTokenIfNeeded(): Promise<boolean> {
  if (!activeGmailSession) return false;

  const now = Date.now();
  // If not expired yet (with 60-second buffer), no need to refresh
  if (activeGmailSession.expiresAt && now < activeGmailSession.expiresAt - 60000) {
    return true;
  }

  // If no refresh token available, check process.env or fail
  const refreshToken = activeGmailSession.refreshToken || process.env.GMAIL_REFRESH_TOKEN;
  const clientId = activeGmailSession.clientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = activeGmailSession.clientSecret || process.env.GMAIL_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    // If expired without refresh capability, clear session
    if (activeGmailSession.expiresAt && now >= activeGmailSession.expiresAt) {
      activeGmailSession = null;
    }
    return false;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Failed to refresh Google OAuth token:', err);
      activeGmailSession = null;
      return false;
    }

    const data = await res.json();
    if (data.access_token) {
      activeGmailSession.accessToken = data.access_token;
      activeGmailSession.expiresAt = now + (data.expires_in || 3600) * 1000;
      return true;
    }
    return false;
  } catch (err) {
    console.error('Network error during OAuth token refresh:', err);
    return false;
  }
}

/**
 * Validates and registers an active Gmail session on the backend.
 * Checks token against Google's tokeninfo endpoint.
 * Strictly disallows simulated tokens.
 */
export async function setGmailSession(
  accessToken: string,
  claimedEmail?: string,
  displayName?: string | null,
  refreshToken?: string,
  clientId?: string,
  clientSecret?: string
): Promise<{ success: boolean; email: string; error?: string }> {
  if (!accessToken || typeof accessToken !== 'string') {
    return { success: false, email: '', error: 'Invalid or missing OAuth access token.' };
  }

  // Explicitly reject simulated tokens: real Google OAuth tokens are required
  if (accessToken === 'simulated_preview_token' || accessToken.startsWith('simulated_') || accessToken.startsWith('test_')) {
    return {
      success: false,
      email: '',
      error:
        'Simulated tokens are not permitted for real Gmail sending. Please authenticate with a real Google account that has gmail.send permission, or configure a Gmail App Password.',
    };
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
          'Insufficient permissions: The Google account did not grant "https://www.googleapis.com/auth/gmail.send" permission. Please re-authenticate and ensure the send permission checkbox is checked.',
      };
    }

    const verifiedEmail = tokenInfo.email || claimedEmail || 'unknown@gmail.com';

    activeGmailSession = {
      accessToken,
      refreshToken: refreshToken || activeGmailSession?.refreshToken,
      clientId: clientId || activeGmailSession?.clientId,
      clientSecret: clientSecret || activeGmailSession?.clientSecret,
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
export async function getGmailSessionStatus(): Promise<{
  isConnected: boolean;
  email: string | null;
  displayName: string | null;
  connectedAt: string | null;
  expiresAt?: number | null;
  isExpired?: boolean;
}> {
  if (!activeGmailSession) {
    return {
      isConnected: false,
      email: null,
      displayName: null,
      connectedAt: null,
    };
  }

  // Check and refresh if needed
  const isValid = await refreshAccessTokenIfNeeded();
  if (!isValid || !activeGmailSession) {
    return {
      isConnected: false,
      email: null,
      displayName: null,
      connectedAt: null,
      isExpired: true,
    };
  }

  return {
    isConnected: true,
    email: activeGmailSession.email,
    displayName: activeGmailSession.displayName || null,
    connectedAt: activeGmailSession.connectedAt,
    expiresAt: activeGmailSession.expiresAt || null,
    isExpired: false,
  };
}

/**
 * Synchronous status check helper for quick checks
 */
export function getGmailSessionStatusSync(): {
  isConnected: boolean;
  email: string | null;
  displayName: string | null;
  connectedAt: string | null;
} {
  if (!activeGmailSession) {
    return { isConnected: false, email: null, displayName: null, connectedAt: null };
  }
  if (activeGmailSession.expiresAt && Date.now() > activeGmailSession.expiresAt) {
    return { isConnected: false, email: null, displayName: null, connectedAt: null };
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
/**
 * Helper to build an RFC 2822 compliant MIME message and base64url encode it.
 * Uses multipart/alternative when bodyHtml is present so that hyperlinks (like Google Form links)
 * are rendered as clickable HTML links while preserving a clean plain-text fallback.
 */
function buildRfc2822RawMessage({
  from,
  to,
  replyTo,
  subject,
  bodyText,
  bodyHtml,
}: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;

  if (!bodyHtml) {
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
    return Buffer.from(rawMessage, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // multipart/alternative for modern HTML email clients (Gmail, Outlook, Apple Mail)
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const lines: string[] = [
    `From: ${from}`,
    `To: ${to}`,
  ];

  if (replyTo && replyTo.trim()) {
    lines.push(`Reply-To: ${replyTo.trim()}`);
  }

  lines.push(`Subject: ${utf8Subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push('');

  // 1. Plain text version
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(bodyText, 'utf-8').toString('base64'));
  lines.push('');

  // 2. HTML version with active clickable hyperlinks
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(bodyHtml, 'utf-8').toString('base64'));
  lines.push('');

  lines.push(`--${boundary}--`);

  const rawMessage = lines.join('\r\n');
  return Buffer.from(rawMessage, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Dispatches an email using the Gmail REST API (users.messages.send).
 * Ensures outreach happens from ditribe31@gmail.com or authenticated account.
 * Automatically hyperlinked Google Form links are rendered in the HTML part.
 * NEVER simulates sending. Only returns success when Google servers accept the message.
 */
export async function sendEmailViaGmailApi({
  to,
  subject,
  bodyText,
  bodyHtml,
  senderName = 'BFSITalentHub Recruitment',
  replyTo = 'ditribe31@gmail.com',
  fromEmail = 'ditribe31@gmail.com',
  customAccessToken,
}: {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
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
  // Check token and refresh if needed
  await refreshAccessTokenIfNeeded();
  const token = customAccessToken || activeGmailSession?.accessToken;

  if (!token) {
    return {
      success: false,
      error:
        'Gmail account is not connected or token has expired. Please authenticate with Google OAuth under Settings > Outreach or configure a Gmail App Password.',
      statusCode: 401,
    };
  }

  // Attempt 1: Send with specified fromEmail (ditribe31@gmail.com)
  const targetFromEmail = fromEmail || 'ditribe31@gmail.com';
  const targetReplyTo = replyTo || 'ditribe31@gmail.com';
  const fromHeader = senderName ? `"${senderName}" <${targetFromEmail}>` : targetFromEmail;

  let rawBase64Url = buildRfc2822RawMessage({
    from: fromHeader,
    to,
    replyTo: targetReplyTo,
    subject,
    bodyText,
    bodyHtml,
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

    // If Gmail API rejects From header because user doesn't have ditribe31@gmail.com alias registered
    if (!res.ok && res.status === 400) {
      const errText = await res.text();
      if (errText.includes('Invalid From header') || errText.includes('from_address') || errText.includes('From')) {
        const fallbackFrom = activeGmailSession?.email ? `"${senderName}" <${activeGmailSession.email}>` : 'me';
        const fallbackRaw = buildRfc2822RawMessage({
          from: fallbackFrom,
          to,
          replyTo: targetReplyTo,
          subject,
          bodyText,
          bodyHtml,
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
    if (!data.id) {
      return {
        success: false,
        error: 'Gmail API responded without a valid message ID.',
        statusCode: 500,
      };
    }

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

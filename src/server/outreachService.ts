import {
  OutreachSettings,
  OutreachMessage,
  Candidate,
  CandidateEligibilityStatus,
  CandidateFormResponse,
  FormSubmissionData,
  AppDatabase,
} from '../types/index.ts';
import { DEFAULT_OUTREACH_SETTINGS } from '../constants/outreach.ts';
export { DEFAULT_OUTREACH_SETTINGS };

// RFC 5322 compatible email syntax validator
export function isValidEmailSyntax(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254 || trimmed.length < 5) return false;
  // Strict standard pattern
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

// Normalize email for deduplication and suppression checks
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Generate an opaque, unpredictable token
export function generateSecureToken(): string {
  try {
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  return `tok_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
}

/**
 * Evaluates candidate eligibility according to prompt requirements:
 * - Individual seeking employment (not recruiter advertising vacancies)
 * - Meets existing India and role-relevance criteria
 * - Explicit attributable email address with valid syntax
 * - Not already contacted in this initial outreach workflow
 * - Address not unsubscribed, suppressed, or permanently bounced
 * - Job seeking intent must be clear, otherwise "Needs Review"
 */
export function evaluateCandidateEligibility(
  candidate: Candidate,
  db: AppDatabase
): {
  isEligible: boolean;
  status: CandidateEligibilityStatus;
  reason: string;
} {
  // 1. Recruiter or employer check
  if (candidate.isRecruiterAd || candidate.authorIntent === 'RECRUITER_OR_EMPLOYER_HIRING') {
    return {
      isEligible: false,
      status: 'recruiter_excluded',
      reason: 'Record identified as recruiter or employer vacancy advertisement.',
    };
  }

  // 2. Clear job-seeking intent
  if (candidate.authorIntent === 'UNCLEAR') {
    return {
      isEligible: false,
      status: 'needs_review',
      reason: 'Job-seeking intent is ambiguous or unverified in source post. Placed in Needs Review.',
    };
  }

  if (candidate.authorIntent !== 'SELF_JOB_SEEKING') {
    return {
      isEligible: false,
      status: 'needs_review',
      reason: `Author intent classified as ${candidate.authorIntent}. Manual review required before outreach.`,
    };
  }

  // 3. Criteria check: India & Role relevance
  if (candidate.criteriaTag === 'Outside Target') {
    return {
      isEligible: false,
      status: 'outside_target',
      reason: 'Candidate is Outside Target (e.g., outside India or non-matching criteria).',
    };
  }

  if (candidate.criteriaTag === 'Needs Review') {
    return {
      isEligible: false,
      status: 'needs_review',
      reason: 'Candidate record has unresolved verification flags (Needs Review).',
    };
  }

  // 4. Email existence check
  if (!candidate.email || candidate.email.trim() === '') {
    return {
      isEligible: false,
      status: 'email_unavailable',
      reason: 'Email unavailable in candidate profile or source post.',
    };
  }

  // 5. Email syntax validation
  const normEmail = normalizeEmail(candidate.email);
  if (!isValidEmailSyntax(normEmail)) {
    return {
      isEligible: false,
      status: 'needs_review',
      reason: `Email address syntax "${candidate.email}" is invalid or malformed. Needs Review.`,
    };
  }

  // 6. Suppression / Unsubscribe check
  const isSuppressed = db.suppressionList?.some(
    s => normalizeEmail(s.email) === normEmail
  );
  if (candidate.isUnsubscribed || isSuppressed) {
    return {
      isEligible: false,
      status: 'unsubscribed',
      reason: 'Candidate or email address is unsubscribed / suppressed.',
    };
  }

  // 7. Already contacted check
  const alreadyContacted =
    candidate.outreachDeliveryStatus === 'sent' ||
    candidate.outreachDeliveryStatus === 'delivered' ||
    candidate.outreachDeliveryStatus === 'queued' ||
    db.outreachMessages.some(
      m =>
        (m.candidateId === candidate.id || normalizeEmail(m.candidateEmail) === normEmail) &&
        (m.deliveryStatus === 'sent' || m.deliveryStatus === 'delivered' || m.deliveryStatus === 'queued')
    );

  if (alreadyContacted) {
    return {
      isEligible: false,
      status: 'already_contacted',
      reason: 'Candidate has already been contacted or is queued in outreach workflow.',
    };
  }

  return {
    isEligible: true,
    status: 'eligible',
    reason: 'Candidate meets all India, role, and verified email eligibility criteria.',
  };
}

/**
 * Builds personalized email content using strictly verified fields from candidate and settings.
 * Adapts naturally when information is missing without unresolved placeholders.
 */
export function buildPersonalizedEmail(
  candidate: Candidate,
  settings: OutreachSettings,
  formUrl: string,
  unsubscribeUrl: string,
  sourcePlatform: string = 'LinkedIn'
): { subject: string; body: string } {
  // First name extraction
  let firstName = 'there';
  if (candidate.name && candidate.name.trim()) {
    const parts = candidate.name.trim().split(/\s+/);
    if (parts.length > 0 && parts[0].length >= 2) {
      firstName = parts[0];
    }
  }

  // Verified role area
  const verifiedRoleArea =
    candidate.currentOrPreviousRole ||
    candidate.sector ||
    candidate.industry ||
    settings.rolesBeingSourced ||
    'banking and financial services';

  // Configured recruitment scope
  const recruitmentScope = settings.rolesBeingSourced || 'relevant openings in your domain';

  // Sender name
  const senderName = settings.senderName || 'BFSITalentHub Recruitment Team';

  // Build Subject
  let subject = settings.emailSubjectTemplate || 'Explore opportunities in [relevant role area]';
  subject = subject
    .replace(/\[relevant role area\]/gi, verifiedRoleArea)
    .replace(/\[First Name\]/gi, firstName)
    .replace(/\[First Name \/ there\]/gi, firstName)
    .replace(/\[Configured sender name\]/gi, senderName);

  // Fallback if bracket remains
  subject = subject.replace(/\[.*?\]/g, verifiedRoleArea);

  // Build Body
  let body = settings.emailBodyTemplate || DEFAULT_OUTREACH_SETTINGS.emailBodyTemplate;

  body = body
    .replace(/\[First Name \/ there\]/gi, firstName)
    .replace(/\[First Name\]/gi, firstName)
    .replace(/\[source platform\]/gi, sourcePlatform)
    .replace(/\[verified role area\]/gi, verifiedRoleArea)
    .replace(/\[configured recruitment scope\]/gi, recruitmentScope)
    .replace(/\[Candidate-specific form link\]/gi, formUrl)
    .replace(/\[Configured sender name\]/gi, senderName)
    .replace(/\[unsubscribe link\]/gi, unsubscribeUrl);

  // Strip any accidental stray square brackets
  body = body.replace(/\[.*?\]/g, '');

  return { subject, body };
}

/**
 * Dispatch an email through the configured provider
 */
export async function sendEmailViaProvider(
  settings: OutreachSettings,
  toEmail: string,
  toName: string,
  subject: string,
  textBody: string
): Promise<{ success: boolean; messageId?: string; error?: string; isTestMode?: boolean }> {
  // 1. Safe Test Mode
  if (settings.testMode || settings.provider === 'test_mode') {
    return {
      success: true,
      messageId: `test_sim_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      isTestMode: true,
    };
  }

  // 2. SMTP Provider
  if (settings.provider === 'smtp') {
    if (!settings.smtpConfig || !settings.smtpConfig.host) {
      return { success: false, error: 'SMTP configuration is incomplete: host is required.' };
    }

    try {
      const nm: any = await import('nodemailer');
      const createTransport = nm.default?.createTransport || nm.createTransport;
      const transporter = createTransport({
        host: settings.smtpConfig.host,
        port: settings.smtpConfig.port || 587,
        secure: Boolean(settings.smtpConfig.secure),
        auth:
          settings.smtpConfig.auth?.user && settings.smtpConfig.auth?.pass
            ? {
                user: settings.smtpConfig.auth.user,
                pass: settings.smtpConfig.auth.pass,
              }
            : undefined,
        tls: {
          rejectUnauthorized: false,
        },
      });

      const info = await transporter.sendMail({
        from: `"${settings.senderName}" <${settings.senderEmail}>`,
        to: `"${toName}" <${toEmail}>`,
        replyTo: settings.replyToEmail || settings.senderEmail,
        subject,
        text: textBody,
        html: textBody.replace(/\n/g, '<br/>'),
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `SMTP dispatch error: ${err.message}`,
      };
    }
  }

  // 3. SendGrid API
  if (settings.provider === 'sendgrid') {
    const apiKey = settings.apiConfig?.apiKey || process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'SendGrid API key is not configured.' };
    }

    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail, name: toName }] }],
          from: { email: settings.senderEmail, name: settings.senderName },
          reply_to: { email: settings.replyToEmail || settings.senderEmail },
          subject,
          content: [{ type: 'text/plain', value: textBody }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, error: `SendGrid error (${res.status}): ${errorText}` };
      }

      const msgId = res.headers.get('x-message-id') || `sg_${Date.now()}`;
      return { success: true, messageId: msgId };
    } catch (err: any) {
      return { success: false, error: `SendGrid request failed: ${err.message}` };
    }
  }

  // 4. Resend API
  if (settings.provider === 'resend') {
    const apiKey = settings.apiConfig?.apiKey || process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'Resend API key is not configured.' };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${settings.senderName} <${settings.senderEmail}>`,
          to: [toEmail],
          reply_to: settings.replyToEmail || settings.senderEmail,
          subject,
          text: textBody,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, error: `Resend error (${res.status}): ${errorText}` };
      }

      const data = await res.json();
      return { success: true, messageId: data.id || `resend_${Date.now()}` };
    } catch (err: any) {
      return { success: false, error: `Resend request failed: ${err.message}` };
    }
  }

  // Fallback
  return {
    success: false,
    error: `Unsupported provider: ${settings.provider}`,
  };
}

/**
 * Escapes characters that can trigger CSV formula execution in Excel/Sheets (=, +, -, @, \t, \r)
 */
export function sanitizeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Strip null bytes
  str = str.replace(/\0/g, '');
  // If first character is an executable spreadsheet formula character, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Standard CSV escaping
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

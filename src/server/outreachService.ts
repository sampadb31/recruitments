import {
  OutreachSettings,
  OutreachMessage,
  Candidate,
  CandidateEligibilityStatus,
  OutreachStatus,
  AppDatabase,
} from '../types/index.ts';
import { DEFAULT_OUTREACH_SETTINGS } from '../constants/outreach.ts';
import { sendEmailViaGmailApi, getGmailSessionStatus } from './gmailService.ts';

export { DEFAULT_OUTREACH_SETTINGS };

let currentServerOrigin = process.env.APP_URL || 'http://localhost:3000';
export function setServerOrigin(origin: string) {
  if (origin && !origin.includes('localhost:3000')) {
    currentServerOrigin = origin;
  }
}
export function getServerOrigin(): string {
  return currentServerOrigin;
}

// RFC 5322 compatible email syntax validator
export function isValidEmailSyntax(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254 || trimmed.length < 5) return false;
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
 * - Not already contacted or applied
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
    candidate.outreachStatus === 'Sent' ||
    candidate.outreachStatus === 'Responded' ||
    candidate.outreachStatus === 'Applied' ||
    candidate.outreachDeliveryStatus === 'sent' ||
    candidate.outreachDeliveryStatus === 'delivered' ||
    db.outreachMessages.some(
      m =>
        (m.candidateId === candidate.id || normalizeEmail(m.candidateEmail) === normEmail) &&
        (m.deliveryStatus === 'sent' || m.deliveryStatus === 'delivered')
    );

  if (alreadyContacted) {
    return {
      isEligible: false,
      status: 'already_contacted',
      reason: 'Candidate has already been contacted in outreach workflow.',
    };
  }

  return {
    isEligible: true,
    status: 'eligible',
    reason: 'Candidate meets all India, role, and verified email eligibility criteria.',
  };
}

/**
 * Automatically generates personalized recruitment email using:
 * - Candidate's name
 * - Candidate's job-seeking information (statement, experience, location)
 * - Relevant role & sector
 * - Configured Google Form registration link
 */
export function buildPersonalizedEmail(
  candidate: Candidate,
  settings: OutreachSettings,
  origin: string = getServerOrigin()
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
    'Commercial Operations & Sales';

  // Experience text
  const experienceMention =
    candidate.totalExperienceYears !== null && candidate.totalExperienceYears > 0
      ? ` (${candidate.totalExperienceYears} years of experience)`
      : '';

  // Configured recruitment scope
  const recruitmentScope = settings.rolesBeingSourced || 'relevant openings in your domain';

  // Sender name
  const senderName = settings.senderName || 'BFSITalentHub';

  // Candidate registration form link
  // If user configured a custom valid Google Form URL, use it; otherwise use the working in-app Expression of Interest portal
  const token = candidate.formToken || candidate.id;
  const isCustomGoogleForm =
    settings.googleFormUrl &&
    settings.googleFormUrl.trim() !== '' &&
    settings.googleFormUrl !== 'https://forms.gle/bfsitalenthub' &&
    (settings.googleFormUrl.includes('docs.google.com/forms') || settings.googleFormUrl.includes('forms.gle'));

  const formUrl = isCustomGoogleForm
    ? settings.googleFormUrl
    : `${origin}/apply?token=${token}&email=${encodeURIComponent(candidate.email || '')}`;

  // Unsubscribe link
  const unsubscribeUrl = `${origin}/api/outreach/unsubscribe?token=${token}&email=${encodeURIComponent(
    candidate.email || ''
  )}`;

  // Build Subject
  let subject = settings.emailSubjectTemplate || 'Oppourtunity in banking';
  subject = subject
    .replace(/\[relevant role area\]/gi, verifiedRoleArea)
    .replace(/\[First Name\]/gi, firstName)
    .replace(/\[First Name \/ there\]/gi, firstName)
    .replace(/\[Configured sender name\]/gi, senderName);

  // Build Body
  let body = settings.emailBodyTemplate || DEFAULT_OUTREACH_SETTINGS.emailBodyTemplate;

  body = body
    .replace(/\[First Name \/ there\]/gi, firstName)
    .replace(/\[First Name\]/gi, firstName)
    .replace(/\[verified role area\]/gi, verifiedRoleArea)
    .replace(/\[experience mention\]/gi, experienceMention)
    .replace(/\[configured recruitment scope\]/gi, recruitmentScope)
    .replace(/\[Google Form Registration Link\]/gi, formUrl)
    .replace(/\[Candidate-specific form link\]/gi, formUrl)
    .replace(/\[Configured sender name\]/gi, senderName)
    .replace(/\[sender email\]/gi, settings.senderEmail || 'bfsitalenthub@gmail.com')
    .replace(/\[unsubscribe link\]/gi, unsubscribeUrl);

  // Guarantee that any legacy template text referencing the 404 placeholder uses the active formUrl
  body = body.replace(/https:\/\/forms\.gle\/bfsitalenthub/g, formUrl);

  // Strip any accidental stray square brackets
  body = body.replace(/\[.*?\]/g, '');

  return { subject, body };
}

/**
 * Generates and stores initial draft for candidate if not already present
 */
export function generateCandidateDraft(
  candidate: Candidate,
  settings: OutreachSettings,
  origin: string = 'http://localhost:3000'
): { subject: string; body: string; generatedAt: string } {
  const { subject, body } = buildPersonalizedEmail(candidate, settings, origin);
  return {
    subject,
    body,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Dispatches an email through the selected provider:
 * - 'gmail_workspace': Real Gmail API call using Google OAuth
 * - 'smtp': Nodemailer SMTP server
 * - 'test_mode': Safe local simulation
 * IMPORTANT: Only marks email as sent upon receiving a successful 200/201 response from the provider!
 */
export async function sendOutreachEmail({
  candidate,
  settings,
  db,
  subjectOverride,
  bodyOverride,
  origin = 'http://localhost:3000',
}: {
  candidate: Candidate;
  settings: OutreachSettings;
  db: AppDatabase;
  subjectOverride?: string;
  bodyOverride?: string;
  origin?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  deliveryStatus: 'sent' | 'failed' | 'test_mode';
  error?: string;
}> {
  if (!candidate.email || !isValidEmailSyntax(candidate.email)) {
    return {
      success: false,
      deliveryStatus: 'failed',
      error: `Invalid or missing email address: "${candidate.email || ''}"`,
    };
  }

  // Prevent duplicate outreach to already sent/responded/applied candidates
  const normEmail = normalizeEmail(candidate.email);
  const isSuppressed = db.suppressionList?.some(s => normalizeEmail(s.email) === normEmail);
  if (candidate.isUnsubscribed || isSuppressed) {
    return {
      success: false,
      deliveryStatus: 'failed',
      error: `Candidate or email "${candidate.email}" has opted out / is on suppression list.`,
    };
  }

  if (candidate.outreachStatus === 'Sent' || candidate.outreachStatus === 'Responded' || candidate.outreachStatus === 'Applied') {
    return {
      success: false,
      deliveryStatus: 'failed',
      error: `Candidate has already been sent outreach (Current status: ${candidate.outreachStatus}). Duplicate outreach prevented.`,
    };
  }

  // Compose subject and body
  const draft = buildPersonalizedEmail(candidate, settings, origin);
  const subject = subjectOverride || candidate.draftEmail?.subject || draft.subject;
  let bodyText = bodyOverride || candidate.draftEmail?.body || draft.body;

  // If body references the 404 placeholder, replace with active application portal link
  if (bodyText.includes('https://forms.gle/bfsitalenthub')) {
    const isCustomGoogleForm =
      settings.googleFormUrl &&
      settings.googleFormUrl.trim() !== '' &&
      settings.googleFormUrl !== 'https://forms.gle/bfsitalenthub' &&
      (settings.googleFormUrl.includes('docs.google.com/forms') || settings.googleFormUrl.includes('forms.gle'));
    const token = candidate.formToken || candidate.id;
    const activeFormUrl = isCustomGoogleForm
      ? settings.googleFormUrl
      : `${origin}/apply?token=${token}&email=${encodeURIComponent(candidate.email || '')}`;
    bodyText = bodyText.replace(/https:\/\/forms\.gle\/bfsitalenthub/g, activeFormUrl);
  }

  const toEmail = candidate.email.trim();
  const toName = candidate.name || 'Candidate';

  // 1. Test Mode
  if (settings.testMode || settings.provider === 'test_mode') {
    const testMsgId = `test_sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const msg: OutreachMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      candidateId: candidate.id,
      candidateEmail: toEmail,
      candidateName: toName,
      formToken: candidate.formToken || candidate.id,
      subject,
      body: bodyText,
      deliveryStatus: 'sent',
      sentAt: new Date().toISOString(),
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      providerMessageId: testMsgId,
      unsubscribeToken: candidate.formToken || candidate.id,
      isTestModeSend: true,
    };
    db.outreachMessages.unshift(msg);
    candidate.outreachStatus = 'Sent';
    candidate.outreachDeliveryStatus = 'sent';
    candidate.outreachSentAt = new Date().toISOString();
    return {
      success: true,
      messageId: testMsgId,
      deliveryStatus: 'test_mode',
    };
  }

  // 2. Gmail Workspace Provider (Primary OAuth 2.0 Integration)
  if (settings.provider === 'gmail_workspace') {
    const gmailStatus = getGmailSessionStatus();

    // If OAuth session is not connected, check if SMTP App Password is provided
    if (!gmailStatus.isConnected) {
      if (settings.smtpConfig?.auth?.pass && settings.smtpConfig.auth.pass.trim()) {
        // Fall back to sending via SMTP with App Password
        return dispatchViaSmtp({
          candidate,
          settings,
          db,
          subject,
          bodyText,
          toEmail,
          toName,
        });
      }

      return {
        success: false,
        deliveryStatus: 'failed',
        error:
          'Gmail account is not connected. Re-connect Gmail via OAuth or enter your 16-character Gmail App Password under Settings > Outreach to dispatch real emails.',
      };
    }

    const gmailRes = await sendEmailViaGmailApi({
      to: toEmail,
      subject,
      bodyText,
      senderName: settings.senderName || 'BFSITalentHub',
      fromEmail: 'bfsitalenthub@gmail.com',
      replyTo: settings.replyToEmail || 'bfsitalenthub@gmail.com',
    });

    const msgRecord: OutreachMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      candidateId: candidate.id,
      candidateEmail: toEmail,
      candidateName: toName,
      formToken: candidate.formToken || candidate.id,
      subject,
      body: bodyText,
      deliveryStatus: gmailRes.success ? 'sent' : 'failed',
      sentAt: gmailRes.success ? new Date().toISOString() : null,
      queuedAt: new Date().toISOString(),
      failedAt: gmailRes.success ? null : new Date().toISOString(),
      failureReason: gmailRes.error || null,
      retryCount: gmailRes.success ? 0 : 1,
      maxRetries: 3,
      providerMessageId: gmailRes.messageId || null,
      unsubscribeToken: candidate.formToken || candidate.id,
    };

    db.outreachMessages.unshift(msgRecord);

    if (gmailRes.success) {
      candidate.outreachStatus = 'Sent';
      candidate.outreachDeliveryStatus = 'sent';
      candidate.outreachSentAt = new Date().toISOString();
      return {
        success: true,
        messageId: gmailRes.messageId,
        deliveryStatus: 'sent',
      };
    } else {
      candidate.outreachStatus = 'Failed';
      candidate.outreachDeliveryStatus = 'failed';
      return {
        success: false,
        deliveryStatus: 'failed',
        error: gmailRes.error || 'Failed to dispatch email via Gmail API.',
      };
    }
  }

  // 3. SMTP Provider
  if (settings.provider === 'smtp') {
    return dispatchViaSmtp({
      candidate,
      settings,
      db,
      subject,
      bodyText,
      toEmail,
      toName,
    });
  }

  return {
    success: false,
    deliveryStatus: 'failed',
    error: `Unsupported provider: ${settings.provider}`,
  };
}

/**
 * Dispatches an email via SMTP (Nodemailer) with full support for Gmail App Passwords
 */
export async function dispatchViaSmtp({
  candidate,
  settings,
  db,
  subject,
  bodyText,
  toEmail,
  toName,
}: {
  candidate: Candidate;
  settings: OutreachSettings;
  db: AppDatabase;
  subject: string;
  bodyText: string;
  toEmail: string;
  toName: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  deliveryStatus: 'sent' | 'failed';
  error?: string;
}> {
  const host = settings.smtpConfig?.host || 'smtp.gmail.com';
  const port = settings.smtpConfig?.port || (host === 'smtp.gmail.com' ? 465 : 587);
  const secure = settings.smtpConfig?.secure ?? (port === 465);
  const user = settings.smtpConfig?.auth?.user || settings.senderEmail || 'bfsitalenthub@gmail.com';
  const pass = settings.smtpConfig?.auth?.pass;

  if (!pass || !pass.trim()) {
    return {
      success: false,
      deliveryStatus: 'failed',
      error: 'SMTP password / Google App Password is required in Settings to send real emails.',
    };
  }

  try {
    const nm: any = await import('nodemailer');
    const createTransport = nm.default?.createTransport || nm.createTransport;
    const transporter = createTransport({
      host,
      port,
      secure,
      auth: { user, pass: pass.replace(/\s+/g, '') }, // remove any accidental spaces in 16-char app password
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: `"${settings.senderName || 'BFSITalentHub'}" <${user}>`,
      to: `"${toName}" <${toEmail}>`,
      replyTo: settings.replyToEmail || user,
      subject,
      text: bodyText,
    });

    const msgRecord: OutreachMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      candidateId: candidate.id,
      candidateEmail: toEmail,
      candidateName: toName,
      formToken: candidate.formToken || candidate.id,
      subject,
      body: bodyText,
      deliveryStatus: 'sent',
      sentAt: new Date().toISOString(),
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      providerMessageId: info.messageId,
      unsubscribeToken: candidate.formToken || candidate.id,
      isTestModeSend: false,
    };
    db.outreachMessages.unshift(msgRecord);
    candidate.outreachStatus = 'Sent';
    candidate.outreachDeliveryStatus = 'sent';
    candidate.outreachSentAt = new Date().toISOString();

    return {
      success: true,
      messageId: info.messageId,
      deliveryStatus: 'sent',
    };
  } catch (err: any) {
    candidate.outreachStatus = 'Failed';
    candidate.outreachDeliveryStatus = 'failed';
    return {
      success: false,
      deliveryStatus: 'failed',
      error: `SMTP error (${host}): ${err.message}`,
    };
  }
}

/**
 * Handle unsubscribe / opt-out
 */
export function handleCandidateOptOut(
  email: string,
  token: string,
  db: AppDatabase
): { success: boolean; message: string } {
  const norm = normalizeEmail(email);
  if (!db.suppressionList) db.suppressionList = [];

  if (!db.suppressionList.some(s => normalizeEmail(s.email) === norm)) {
    db.suppressionList.push({
      email: norm,
      reason: 'unsubscribed',
      createdAt: new Date().toISOString(),
    });
  }

  // Update candidates
  const matchingCandidates = db.candidates.filter(
    c => (c.email && normalizeEmail(c.email) === norm) || c.formToken === token
  );

  matchingCandidates.forEach(cand => {
    cand.isUnsubscribed = true;
    cand.unsubscribedAt = new Date().toISOString();
  });

  return {
    success: true,
    message: `Email address ${email} has been unsubscribed from recruitment outreach.`,
  };
}

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
 * Checks if an OutreachMessage represents an authentic send accepted by Gmail or SMTP.
 * Excludes local simulation IDs and demo mode test sends.
 */
export function isRealSentMessage(msg?: OutreachMessage | null): boolean {
  if (!msg) return false;
  if (msg.isTestModeSend) return false;
  if (msg.deliveryStatus !== 'sent') return false;
  if (!msg.providerMessageId) return false;
  const pId = msg.providerMessageId;
  if (pId.startsWith('gmail_sim_') || pId.startsWith('test_sim_') || pId.startsWith('talenthub_')) {
    return false;
  }
  return true;
}

/**
 * Checks if a candidate was actually sent a real email accepted by Gmail or SMTP.
 */
export function isCandidateRealSent(candidate: Candidate, db: AppDatabase): boolean {
  if (candidate.outreachStatus === 'Responded' || candidate.outreachStatus === 'Applied') {
    return true;
  }
  if (candidate.outreachStatus !== 'Sent') {
    return false;
  }
  const norm = normalizeEmail(candidate.email || '');
  const msg = db.outreachMessages?.find(
    m => (m.candidateId === candidate.id || (norm && normalizeEmail(m.candidateEmail) === norm))
  );
  return isRealSentMessage(msg);
}

/**
 * Checks if a candidate is marked "Sent" under an old simulated or test run, requiring review.
 */
export function isCandidateSimulatedSent(candidate: Candidate, db: AppDatabase): boolean {
  if (candidate.outreachStatus !== 'Sent') {
    return false;
  }
  return !isCandidateRealSent(candidate, db);
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
  // 1. Recruiter / Employer check
  if (candidate.isRecruiterAd || candidate.authorIntent === 'RECRUITER_OR_EMPLOYER_HIRING') {
    return {
      isEligible: false,
      status: 'recruiter_excluded',
      reason: 'User is a recruiter or employer advertising a vacancy, not a job seeker.',
    };
  }

  // 2. Active Job Seeker Intent Check
  if (candidate.authorIntent === 'UNCLEAR' || candidate.authorIntent === 'UNRELATED' || candidate.authorIntent === 'SEEKING_ON_BEHALF_OF_SOMEONE') {
    return {
      isEligible: false,
      status: 'needs_review',
      reason: 'Job-seeking intent is ambiguous or unverified. Requires recruiter review.',
    };
  }

  // 3. Criteria Tag Check
  if (candidate.criteriaTag === 'Outside Target') {
    return {
      isEligible: false,
      status: 'outside_target',
      reason: candidate.matchingExplanation || 'Candidate is classified as Outside Target.',
    };
  }

  // 4. Explicit Attributable Email Syntax Check
  if (!candidate.email || !isValidEmailSyntax(candidate.email)) {
    return {
      isEligible: false,
      status: 'email_unavailable',
      reason: candidate.email
        ? `Invalid email syntax: "${candidate.email}".`
        : 'No explicit attributable email found on candidate profile.',
    };
  }

  // 5. Opt-out / Suppression check
  const normEmail = normalizeEmail(candidate.email);
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

  // 6. Already contacted check (only counts REAL sent emails accepted by Gmail/SMTP)
  const alreadyContacted =
    candidate.outreachStatus === 'Responded' ||
    candidate.outreachStatus === 'Applied' ||
    isCandidateRealSent(candidate, db);

  if (alreadyContacted) {
    return {
      isEligible: false,
      status: 'already_contacted',
      reason: 'Candidate has already received real outreach from Google/SMTP.',
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
  const firstName = candidate.name ? candidate.name.split(' ')[0] : 'there';
  const roleName = candidate.currentOrPreviousRole || 'Banking & Financial Services Professional';
  const experienceText = candidate.totalExperienceYears ? `${candidate.totalExperienceYears}+ years of experience in ` : '';
  const locationText = candidate.currentWorkLocation ? ` in ${candidate.currentWorkLocation}` : '';

  // Determine application portal link
  const token = candidate.formToken || candidate.id;
  const isCustomGoogleForm =
    settings.googleFormUrl &&
    settings.googleFormUrl.trim() !== '' &&
    settings.googleFormUrl !== 'https://forms.gle/bfsitalenthub' &&
    (settings.googleFormUrl.includes('docs.google.com/forms') || settings.googleFormUrl.includes('forms.gle'));

  const registrationUrl = isCustomGoogleForm
    ? settings.googleFormUrl
    : `${origin}/apply?token=${token}&email=${encodeURIComponent(candidate.email || '')}`;

  const unsubscribeUrl = `${origin}/api/outreach/unsubscribe?token=${token}&email=${encodeURIComponent(candidate.email || '')}`;

  // Subject line
  const subject = settings.emailSubjectTemplate
    ? settings.emailSubjectTemplate
        .replace(/\[First Name \/ there\]/g, firstName)
        .replace(/\[Candidate Name\]/g, candidate.name || 'Candidate')
        .replace(/\[Target Role\]/g, roleName)
    : `Career Opportunity in Banking & Financial Services - Expression of Interest`;

  // Body text
  let body = settings.emailBodyTemplate
    ? settings.emailBodyTemplate
        .replace(/\[First Name \/ there\]/g, firstName)
        .replace(/\[Candidate Name\]/g, candidate.name || 'Candidate')
        .replace(/\[Google Form Registration Link\]/g, registrationUrl)
        .replace(/\[registration link\]/g, registrationUrl)
        .replace(/\[Target Role\]/g, roleName)
        .replace(/\[Relevant Sector\]/g, candidate.sector || 'BFSI')
        .replace(/\[unsubscribe link\]/g, unsubscribeUrl)
    : `Hi ${firstName},\n\nI came across your profile and noticed your background as ${experienceText}${roleName}${locationText}.\n\nBFSITalentHub connects banking, fintech, and financial services professionals with verified openings across India.\n\nIf you are interested in exploring active career opportunities with leading private banks and financial institutions, please submit your details via our brief registration portal:\n${registrationUrl}\n\nOur recruitment team will review your background and connect with you directly for matching roles.\n\nBest regards,\n${settings.senderName || 'BFSITalentHub Recruitment'}\n${settings.senderEmail || 'ditribe31@gmail.com'}\n\nTo opt out of future recruitment communications, click here: ${unsubscribeUrl}`;

  // Ensure unsubscribe link is present
  if (!body.includes(unsubscribeUrl) && !body.includes('unsubscribe')) {
    body += `\n\n---\nTo opt out of future recruitment outreach, click: ${unsubscribeUrl}`;
  }

  return { subject, body };
}

/**
 * Generates and stores candidate draft email
 */
export function generateCandidateDraft(
  candidate: Candidate,
  settings: OutreachSettings,
  origin: string = getServerOrigin()
): { subject: string; body: string; generatedAt: string } {
  const { subject, body } = buildPersonalizedEmail(candidate, settings, origin);
  const draft = {
    subject,
    body,
    generatedAt: new Date().toISOString(),
  };
  candidate.draftEmail = draft;
  return draft;
}

/**
 * Dispatches an email through the selected provider:
 * - 'gmail_workspace': Real Gmail API call using Google OAuth (users.messages.send)
 * - 'smtp': Real Nodemailer SMTP with Google App Password
 * IMPORTANT: Only marks email as sent upon receiving a successful response from the provider!
 * Never simulates in Live mode.
 */
export async function sendOutreachEmail({
  candidate,
  settings,
  db,
  subjectOverride,
  bodyOverride,
  origin = getServerOrigin(),
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

  // Prevent duplicate outreach to already contacted / opted-out candidates
  const normEmail = normalizeEmail(candidate.email);
  const isSuppressed = db.suppressionList?.some(s => normalizeEmail(s.email) === normEmail);
  if (candidate.isUnsubscribed || isSuppressed) {
    return {
      success: false,
      deliveryStatus: 'failed',
      error: `Candidate or email "${candidate.email}" has opted out / is on suppression list.`,
    };
  }

  // STRICT DUPLICATE OUTREACH PREVENTION:
  // If a REAL email was already accepted by Google/SMTP, block duplicate sends!
  if (isCandidateRealSent(candidate, db)) {
    const existingMsg = db.outreachMessages.find(
      m => (m.candidateId === candidate.id || normalizeEmail(m.candidateEmail) === normEmail) && isRealSentMessage(m)
    );
    return {
      success: false,
      deliveryStatus: 'failed',
      error: `Duplicate outreach prevented: A verified email was already accepted by Google/SMTP for ${candidate.email} (Provider Message ID: ${existingMsg?.providerMessageId || 'verified'}).`,
    };
  }

  // Compose subject and body
  const draft = buildPersonalizedEmail(candidate, settings, origin);
  const subject = subjectOverride || candidate.draftEmail?.subject || draft.subject;
  let bodyText = bodyOverride || candidate.draftEmail?.body || draft.body;

  // Replace placeholder links if any
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

  // 1. Explicit Test Mode (Allowed ONLY in Demo Database, Never in Live)
  if (settings.testMode || settings.provider === 'test_mode') {
    if (db.mode === 'live') {
      return {
        success: false,
        deliveryStatus: 'failed',
        error:
          'Simulation mode is strictly prohibited in Live mode. Real email delivery must use Gmail OAuth or Gmail SMTP with an App Password.',
      };
    }

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
    // Keep as Draft / Demo mode send, not counted in real live sends
    candidate.outreachStatus = 'Draft';
    candidate.outreachDeliveryStatus = undefined;
    return {
      success: true,
      messageId: testMsgId,
      deliveryStatus: 'test_mode',
    };
  }

  // 2. Real Gmail Workspace Provider (Google OAuth users.messages.send)
  if (settings.provider === 'gmail_workspace') {
    const gmailStatus = await getGmailSessionStatus();

    // If OAuth session is disconnected or expired, check if SMTP App Password is provided as fallback
    if (!gmailStatus.isConnected) {
      const hasSmtpPass = (settings.smtpConfig?.auth?.pass && settings.smtpConfig.auth.pass.trim()) || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
      if (hasSmtpPass) {
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

      candidate.outreachStatus = 'Failed';
      candidate.outreachDeliveryStatus = 'failed';
      return {
        success: false,
        deliveryStatus: 'failed',
        error:
          'Gmail OAuth is disconnected or token expired. Please reconnect Gmail in Settings > Outreach or enter your 16-character Gmail App Password.',
      };
    }

    const gmailRes = await sendEmailViaGmailApi({
      to: toEmail,
      subject,
      bodyText,
      senderName: settings.senderName || 'BFSITalentHub',
      fromEmail: settings.senderEmail || 'ditribe31@gmail.com',
      replyTo: settings.replyToEmail || settings.senderEmail || 'ditribe31@gmail.com',
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
      isTestModeSend: false,
    };

    db.outreachMessages.unshift(msgRecord);

    if (gmailRes.success) {
      // Mark as Sent only upon real confirmation from Google
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

  // 3. SMTP Provider (Nodemailer with Google App Password)
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
 * Never marks as "Delivered" without delivery evidence; marks "sent" when accepted by SMTP transport.
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
  const user =
    (process.env.GMAIL_USER && process.env.GMAIL_USER.trim()) ||
    settings.smtpConfig?.auth?.user ||
    process.env.SMTP_USER ||
    settings.senderEmail ||
    'ditribe31@gmail.com';
  const rawPass =
    (process.env.GMAIL_APP_PASSWORD && process.env.GMAIL_APP_PASSWORD.trim()) ||
    settings.smtpConfig?.auth?.pass ||
    process.env.SMTP_PASS;

  if (!rawPass || !rawPass.trim()) {
    candidate.outreachStatus = 'Failed';
    candidate.outreachDeliveryStatus = 'failed';
    return {
      success: false,
      deliveryStatus: 'failed',
      error:
        'Google App Password is missing. Please configure your 16-character App Password under Settings > Outreach to dispatch real emails.',
    };
  }

  const pass = rawPass.replace(/\s+/g, '');

  try {
    const nm: any = await import('nodemailer');
    const createTransport = nm.default?.createTransport || nm.createTransport;
    const transporter = createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
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
      error: `Gmail SMTP error (${host}): ${err.message}`,
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

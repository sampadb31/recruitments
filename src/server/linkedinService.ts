import { Candidate, LinkedInOutreachRecord, LinkedInOutreachStatus, AppDatabase } from '../types/index.ts';
import { isValidEmailSyntax } from './outreachService.ts';

export interface LinkedInApiStatus {
  isConfigured: boolean;
  mode: 'official_api' | 'ready_queue_mode';
  hasPersonalAccessToken: boolean;
  hasClientCredentials: boolean;
  tokenScopes?: string[];
  missingSetup: string[];
  setupGuide: {
    title: string;
    steps: string[];
    documentationUrl: string;
  };
}

/**
 * Inspect available LinkedIn API configuration and permissions from server environment.
 * Tokens and secrets are never returned to client or logged.
 */
export function getLinkedInApiStatus(): LinkedInApiStatus {
  const token = (process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_TOKEN || '').trim();
  const clientId = (process.env.LINKEDIN_CLIENT_ID || '').trim();
  const clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();

  const hasPersonalAccessToken = Boolean(token && token.length > 10);
  const hasClientCredentials = Boolean(clientId && clientSecret);

  const missingSetup: string[] = [];
  if (!hasPersonalAccessToken) {
    missingSetup.push('LINKEDIN_ACCESS_TOKEN: Personal OAuth 2.0 User Access Token with Invitations / Member connection permissions.');
  }
  if (!hasClientCredentials) {
    missingSetup.push('LINKEDIN_CLIENT_ID & LINKEDIN_CLIENT_SECRET: Registered LinkedIn Developer Application credentials.');
  }

  const isConfigured = hasPersonalAccessToken;

  return {
    isConfigured,
    mode: isConfigured ? 'official_api' : 'ready_queue_mode',
    hasPersonalAccessToken,
    hasClientCredentials,
    missingSetup,
    setupGuide: {
      title: 'LinkedIn Developer Portal Configuration Guide',
      steps: [
        '1. Log in to the LinkedIn Developer Portal (https://www.linkedin.com/developers) and create or select your recruitment application.',
        '2. Under Products, request access to "Member Data Portability" or "Community Management API" / "Share on LinkedIn and Member Invitations".',
        '3. Add the OAuth 2.0 Redirect URL in the Auth tab and grant the member invitation scope (e.g., w_member_social / invitations).',
        '4. Authorize your personal recruiter LinkedIn profile via the OAuth 2.0 flow to obtain a user access token.',
        '5. Configure LINKEDIN_ACCESS_TOKEN (and optionally LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET) in your server environment variables.',
      ],
      documentationUrl: 'https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/invitations',
    },
  };
}

/**
 * Checks if a candidate is eligible for LinkedIn outreach:
 * - Matches criteria
 * - Personally job-seeking (not recruiter ad, not seeking for others)
 * - Has NO valid email address
 * - Has a LinkedIn profile URL
 */
export function isCandidateEligibleForLinkedIn(candidate: Candidate): boolean {
  if (candidate.criteriaTag !== 'Matches Criteria') return false;
  if (candidate.authorIntent !== 'SELF_JOB_SEEKING') return false;
  if (candidate.isRecruiterAd || candidate.isSeekingForOthers) return false;

  // Must NOT have a valid email address
  const hasValidEmail = Boolean(candidate.email && isValidEmailSyntax(candidate.email));
  if (hasValidEmail) return false;

  // Must have a LinkedIn profile URL
  const profile = candidate.profileUrl || candidate.profileUrlOrTelegramId || '';
  if (!profile || !profile.toLowerCase().includes('linkedin.com')) return false;

  return true;
}

/**
 * Extracts candidate's clean first name
 */
function extractFirstName(name: string | null): string {
  if (!name) return 'there';
  const clean = name.trim().split(/\s+/)[0];
  return clean || 'there';
}

/**
 * Generates a personalized LinkedIn connection note strictly using evidence stored for the candidate.
 * LinkedIn connection notes have a strict maximum limit of 300 characters.
 * Does NOT invent experience, companies, or facts.
 */
export function generatePersonalizedConnectionNote(candidate: Candidate): string {
  const firstName = extractFirstName(candidate.name);
  const role = candidate.currentOrPreviousRole || candidate.evidence?.currentOrPreviousRole || '';
  const employer = candidate.employer || candidate.evidence?.employer || '';
  const location = candidate.currentWorkLocation || candidate.preferredLocation || candidate.evidence?.currentLocation || '';
  const expYears = candidate.totalExperienceYears;
  const sector = candidate.sector || candidate.industry || candidate.evidence?.sector || '';

  // Build concise, evidence-grounded segments
  let backgroundSnippet = '';
  if (role && employer) {
    backgroundSnippet = `as ${role} at ${employer}`;
  } else if (role) {
    backgroundSnippet = `in ${role}`;
  } else if (employer) {
    backgroundSnippet = `at ${employer}`;
  }

  let expSnippet = '';
  if (expYears && expYears > 0) {
    expSnippet = ` (${expYears} yrs exp)`;
  }

  let locSnippet = '';
  if (location) {
    // Keep location short, e.g. "Mumbai"
    const city = location.split(',')[0].trim();
    if (city) {
      locSnippet = ` in ${city}`;
    }
  }

  let domainMention = 'BFSI & commercial sales';
  if (sector && sector.toLowerCase().includes('pharma')) {
    domainMention = 'BFSI / pharma sales';
  } else if (sector && sector.toLowerCase().includes('fmcg')) {
    domainMention = 'BFSI / FMCG corporate sales';
  } else if (sector && sector.toLowerCase().includes('nbfc')) {
    domainMention = 'BFSI / NBFC lending sales';
  }

  // Compose note within 300 characters
  let note = `Hi ${firstName}, saw your post seeking opportunities. Impressed by your background ${backgroundSnippet}${expSnippet}${locSnippet}. We are hiring for ${domainMention} roles and would love to connect!`;

  // Strict safety check: if exceeds 295 chars, trim safely
  if (note.length > 295) {
    note = `Hi ${firstName}, saw your post regarding new roles. Impressed by your background ${backgroundSnippet}. We are hiring for BFSI sales roles and would love to connect!`;
  }
  if (note.length > 295) {
    note = `Hi ${firstName}, saw your post regarding new roles. We have active BFSI recruitment openings matching your profile and would love to connect!`;
  }

  return note;
}

/**
 * Generates a personalized follow-up message draft strictly from candidate's stored evidence.
 * Displayed for review & editing upon invitation acceptance. Never auto-sent.
 */
export function generatePersonalizedFollowUpMessage(
  candidate: Candidate,
  recruiterName = 'BFSITalentHub Recruitment'
): string {
  const firstName = extractFirstName(candidate.name);
  const role = candidate.currentOrPreviousRole || candidate.evidence?.currentOrPreviousRole || 'sales professional';
  const employer = candidate.employer || candidate.evidence?.employer || '';
  const location = candidate.currentWorkLocation || candidate.preferredLocation || 'India';
  const expYears = candidate.totalExperienceYears;
  const employerMention = employer ? ` at ${employer}` : '';
  const expMention = expYears ? ` with ${expYears} years of experience` : '';

  return `Hi ${firstName},

Thank you for accepting my connection invitation!

Following up on your post regarding new career opportunities, we noticed your background as ${role}${employerMention}${expMention} based in ${location}.

Our team at BFSITalentHub is currently representing leading financial institutions, private banks, and NBFCs across India for commercial sales and relationship management positions.

If you are open to discussing active openings that align with your profile, I would be delighted to share the specific role details:

👉 Quick candidate review portal: https://ais-dev-6qmxl33keayjsiujes4pxz-753012129268.asia-southeast1.run.app/apply

Feel free to reply directly here on LinkedIn with your preferred contact number or email address, or submit your preferences via the link above.

Looking forward to connecting!

Best regards,
${recruiterName}`;
}

/**
 * Ensures candidate has a LinkedIn outreach record initialized if eligible.
 * Prevents duplicate invitations by reusing existing status and timestamps.
 */
export function ensureCandidateLinkedInOutreach(
  candidate: Candidate,
  existingRecord?: LinkedInOutreachRecord
): LinkedInOutreachRecord | null {
  if (!isCandidateEligibleForLinkedIn(candidate)) {
    return null;
  }

  const profileUrl = candidate.profileUrl || candidate.profileUrlOrTelegramId || '';

  // If candidate already has an outreach record, preserve it to prevent duplicates
  if (existingRecord) {
    if (!existingRecord.connectionNote) {
      existingRecord.connectionNote = generatePersonalizedConnectionNote(candidate);
      existingRecord.connectionNoteGeneratedAt = new Date().toISOString();
    }
    return existingRecord;
  }

  if (candidate.linkedInOutreach) {
    return candidate.linkedInOutreach;
  }

  const record: LinkedInOutreachRecord = {
    candidateId: candidate.id,
    candidateName: candidate.name,
    profileUrl,
    status: 'Ready Queue',
    connectionNote: generatePersonalizedConnectionNote(candidate),
    connectionNoteGeneratedAt: new Date().toISOString(),
    invitationId: null,
    invitationSentAt: null,
    invitationAcceptedAt: null,
    followUpDraft: null,
    followUpSentAt: null,
    followUpMessageId: null,
    lastFailureReason: null,
    lastFailureTimestamp: null,
    syncTimestamp: new Date().toISOString(),
    isSimulated: false,
  };

  candidate.linkedInOutreachStatus = 'Ready Queue';
  candidate.linkedInOutreach = record;
  return record;
}

/**
 * Send LinkedIn connection invitation
 * - Demo Mode: Simulates action safely without contacting LinkedIn
 * - Live Mode: Checks official API configuration. If missing, refuses to claim sent and keeps in Ready Queue.
 */
export async function sendLinkedInInvitation(params: {
  candidate: Candidate;
  note: string;
  mode: 'demo' | 'live';
  db: AppDatabase;
}): Promise<{
  success: boolean;
  invitationId?: string;
  status: LinkedInOutreachStatus;
  isSimulated: boolean;
  message: string;
  error?: string;
  missingSetup?: string[];
}> {
  const { candidate, note, mode, db } = params;

  // Duplicate invitation check
  const existingStatus = candidate.linkedInOutreachStatus;
  if (
    existingStatus === 'Invitation Sent' ||
    existingStatus === 'Invitation Accepted' ||
    existingStatus === 'Follow-Up Drafted' ||
    existingStatus === 'Follow-Up Sent'
  ) {
    return {
      success: false,
      status: existingStatus,
      isSimulated: Boolean(candidate.linkedInOutreach?.isSimulated),
      message: `An invitation has already been recorded for this candidate on ${candidate.linkedInOutreach?.invitationSentAt || 'a previous run'}. Duplicate invites are prevented.`,
      error: 'Duplicate invitation prevented.',
    };
  }

  // Demo Mode: Safely simulate
  if (mode === 'demo') {
    const simId = `inv_sim_${candidate.id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    const sentAt = new Date().toISOString();

    const record: LinkedInOutreachRecord = {
      candidateId: candidate.id,
      candidateName: candidate.name,
      profileUrl: candidate.profileUrl || candidate.profileUrlOrTelegramId || '',
      status: 'Invitation Sent',
      connectionNote: note,
      connectionNoteGeneratedAt: candidate.linkedInOutreach?.connectionNoteGeneratedAt || sentAt,
      invitationId: simId,
      invitationSentAt: sentAt,
      invitationAcceptedAt: null,
      followUpDraft: null,
      followUpSentAt: null,
      followUpMessageId: null,
      lastFailureReason: null,
      lastFailureTimestamp: null,
      syncTimestamp: sentAt,
      isSimulated: true,
    };

    candidate.linkedInOutreachStatus = 'Invitation Sent';
    candidate.linkedInOutreach = record;

    // Also track in db.linkedInOutreachRecords
    if (!db.linkedInOutreachRecords) db.linkedInOutreachRecords = [];
    const idx = db.linkedInOutreachRecords.findIndex(r => r.candidateId === candidate.id);
    if (idx >= 0) {
      db.linkedInOutreachRecords[idx] = record;
    } else {
      db.linkedInOutreachRecords.push(record);
    }

    return {
      success: true,
      invitationId: simId,
      status: 'Invitation Sent',
      isSimulated: true,
      message: `[Demo Sandbox] Connection invitation simulated for ${candidate.name || 'Candidate'}. (Simulated ID: ${simId})`,
    };
  }

  // Live Mode: Check official API configuration
  const apiStatus = getLinkedInApiStatus();
  if (!apiStatus.isConfigured) {
    // Missing access - do NOT claim sent, keep in Ready Queue
    const errorMsg = 'LinkedIn Invitations API access is not configured. Candidate remains in the Ready Queue.';
    if (candidate.linkedInOutreach) {
      candidate.linkedInOutreach.lastFailureReason = errorMsg;
      candidate.linkedInOutreach.lastFailureTimestamp = new Date().toISOString();
    }
    return {
      success: false,
      status: 'Ready Queue',
      isSimulated: false,
      message: errorMsg,
      error: 'Approved LinkedIn Invitations API access is not configured. Real invitation cannot be dispatched automatically.',
      missingSetup: apiStatus.missingSetup,
    };
  }

  // Official LinkedIn Invitations API call
  try {
    const token = (process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_TOKEN)!.trim();
    const profileUrl = candidate.profileUrl || candidate.profileUrlOrTelegramId || '';

    // Official LinkedIn v2 Invitations endpoint
    // Standard schema requires recipient invitee URN or member identifier
    const response = await fetch('https://api.linkedin.com/v2/invitations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202401',
      },
      body: JSON.stringify({
        invitee: {
          'com.linkedin.voyager.growth.invitation.InviteeProfileUrl': {
            profileUrl,
          },
        },
        message: note,
      }),
    });

    const bodyText = await response.text();
    let parsedBody: any = {};
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = { raw: bodyText };
    }

    if (!response.ok) {
      const failReason = parsedBody.message || parsedBody.serviceErrorCode || `HTTP ${response.status}: ${response.statusText}`;
      if (candidate.linkedInOutreach) {
        candidate.linkedInOutreach.lastFailureReason = failReason;
        candidate.linkedInOutreach.lastFailureTimestamp = new Date().toISOString();
        candidate.linkedInOutreach.status = 'Failed';
      }
      candidate.linkedInOutreachStatus = 'Failed';
      return {
        success: false,
        status: 'Failed',
        isSimulated: false,
        message: `LinkedIn API error: ${failReason}`,
        error: failReason,
      };
    }

    const invitationId = parsedBody.id || parsedBody.invitationId || `li_inv_${Date.now()}`;
    const sentAt = new Date().toISOString();

    const record: LinkedInOutreachRecord = {
      candidateId: candidate.id,
      candidateName: candidate.name,
      profileUrl,
      status: 'Invitation Sent',
      connectionNote: note,
      connectionNoteGeneratedAt: candidate.linkedInOutreach?.connectionNoteGeneratedAt || sentAt,
      invitationId,
      invitationSentAt: sentAt,
      invitationAcceptedAt: null,
      followUpDraft: null,
      followUpSentAt: null,
      followUpMessageId: null,
      lastFailureReason: null,
      lastFailureTimestamp: null,
      syncTimestamp: sentAt,
      isSimulated: false,
    };

    candidate.linkedInOutreachStatus = 'Invitation Sent';
    candidate.linkedInOutreach = record;

    if (!db.linkedInOutreachRecords) db.linkedInOutreachRecords = [];
    const idx = db.linkedInOutreachRecords.findIndex(r => r.candidateId === candidate.id);
    if (idx >= 0) {
      db.linkedInOutreachRecords[idx] = record;
    } else {
      db.linkedInOutreachRecords.push(record);
    }

    return {
      success: true,
      invitationId,
      status: 'Invitation Sent',
      isSimulated: false,
      message: `Invitation successfully dispatched via official LinkedIn API (ID: ${invitationId}).`,
    };
  } catch (err: any) {
    const errorMsg = err.message || 'Network error contacting LinkedIn API';
    if (candidate.linkedInOutreach) {
      candidate.linkedInOutreach.lastFailureReason = errorMsg;
      candidate.linkedInOutreach.lastFailureTimestamp = new Date().toISOString();
      candidate.linkedInOutreach.status = 'Failed';
    }
    candidate.linkedInOutreachStatus = 'Failed';
    return {
      success: false,
      status: 'Failed',
      isSimulated: false,
      message: `Failed to dispatch invitation: ${errorMsg}`,
      error: errorMsg,
    };
  }
}

/**
 * Check acceptance status of invitation:
 * - Demo Mode: Simulates candidate acceptance and generates personalized follow-up draft.
 * - Live Mode: Checks official LinkedIn API if configured.
 * When acceptance is detected, generates a personalized follow-up message draft from candidate's stored evidence.
 * Does NOT send the follow-up message automatically.
 */
export async function syncInvitationAcceptance(params: {
  candidate: Candidate;
  mode: 'demo' | 'live';
  db: AppDatabase;
}): Promise<{
  success: boolean;
  status: LinkedInOutreachStatus;
  isAccepted: boolean;
  followUpDraft?: { message: string; generatedAt: string };
  message: string;
}> {
  const { candidate, mode, db } = params;

  if (candidate.linkedInOutreachStatus !== 'Invitation Sent') {
    return {
      success: false,
      status: candidate.linkedInOutreachStatus || 'Ready Queue',
      isAccepted: candidate.linkedInOutreachStatus === 'Invitation Accepted' || candidate.linkedInOutreachStatus === 'Follow-Up Drafted' || candidate.linkedInOutreachStatus === 'Follow-Up Sent',
      message: `Candidate is in "${candidate.linkedInOutreachStatus}" status (expected "Invitation Sent").`,
    };
  }

  // Demo mode: simulate candidate accepting invitation
  if (mode === 'demo') {
    const acceptedAt = new Date().toISOString();
    const followUpDraftText = generatePersonalizedFollowUpMessage(candidate);
    const draftObj = {
      message: followUpDraftText,
      generatedAt: acceptedAt,
      editedByRecruiter: false,
      lastSavedAt: null,
    };

    if (candidate.linkedInOutreach) {
      candidate.linkedInOutreach.status = 'Invitation Accepted';
      candidate.linkedInOutreach.invitationAcceptedAt = acceptedAt;
      candidate.linkedInOutreach.followUpDraft = draftObj;
      candidate.linkedInOutreach.syncTimestamp = acceptedAt;
    }
    candidate.linkedInOutreachStatus = 'Invitation Accepted';

    // Sync in db.linkedInOutreachRecords
    if (db.linkedInOutreachRecords && candidate.linkedInOutreach) {
      const idx = db.linkedInOutreachRecords.findIndex(r => r.candidateId === candidate.id);
      if (idx >= 0) db.linkedInOutreachRecords[idx] = candidate.linkedInOutreach;
    }

    return {
      success: true,
      status: 'Invitation Accepted',
      isAccepted: true,
      followUpDraft: draftObj,
      message: `[Demo Sandbox] Invitation accepted! A personalized follow-up message draft has been generated from stored candidate evidence for your review.`,
    };
  }

  // Live mode
  const apiStatus = getLinkedInApiStatus();
  if (!apiStatus.isConfigured) {
    return {
      success: false,
      status: candidate.linkedInOutreachStatus,
      isAccepted: false,
      message: 'LinkedIn API credentials are not configured. Cannot poll live acceptance status automatically.',
    };
  }

  try {
    const token = (process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_TOKEN)!.trim();
    const invId = candidate.linkedInOutreach?.invitationId;
    if (!invId) {
      return {
        success: false,
        status: candidate.linkedInOutreachStatus,
        isAccepted: false,
        message: 'No invitation ID recorded for this candidate.',
      };
    }

    const response = await fetch(`https://api.linkedin.com/v2/invitations/${invId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202401',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        status: candidate.linkedInOutreachStatus,
        isAccepted: false,
        message: `LinkedIn status check returned HTTP ${response.status}`,
      };
    }

    const data: any = await response.json();
    const isAccepted = data.status === 'ACCEPTED' || data.invitationState === 'ACCEPTED';

    if (isAccepted) {
      const acceptedAt = new Date().toISOString();
      const followUpDraftText = generatePersonalizedFollowUpMessage(candidate);
      const draftObj = {
        message: followUpDraftText,
        generatedAt: acceptedAt,
        editedByRecruiter: false,
        lastSavedAt: null,
      };

      if (candidate.linkedInOutreach) {
        candidate.linkedInOutreach.status = 'Invitation Accepted';
        candidate.linkedInOutreach.invitationAcceptedAt = acceptedAt;
        candidate.linkedInOutreach.followUpDraft = draftObj;
        candidate.linkedInOutreach.syncTimestamp = acceptedAt;
      }
      candidate.linkedInOutreachStatus = 'Invitation Accepted';

      return {
        success: true,
        status: 'Invitation Accepted',
        isAccepted: true,
        followUpDraft: draftObj,
        message: 'Candidate has accepted the LinkedIn invitation! Personalized follow-up message draft generated.',
      };
    }

    return {
      success: true,
      status: 'Invitation Sent',
      isAccepted: false,
      message: 'Invitation is still pending candidate review.',
    };
  } catch (err: any) {
    return {
      success: false,
      status: candidate.linkedInOutreachStatus,
      isAccepted: false,
      message: `Failed to check status: ${err.message}`,
    };
  }
}

/**
 * Send personalized LinkedIn follow-up message.
 * Strictly requires explicit recruiter click (never automated).
 */
export async function sendLinkedInFollowUpMessage(params: {
  candidate: Candidate;
  messageText: string;
  mode: 'demo' | 'live';
  db: AppDatabase;
}): Promise<{
  success: boolean;
  messageId?: string;
  status: LinkedInOutreachStatus;
  message: string;
  error?: string;
}> {
  const { candidate, messageText, mode, db } = params;

  if (!messageText || !messageText.trim()) {
    return {
      success: false,
      status: candidate.linkedInOutreachStatus || 'Invitation Accepted',
      message: 'Follow-up message cannot be empty.',
      error: 'Message content is empty.',
    };
  }

  // Demo Mode: Safely simulate
  if (mode === 'demo') {
    const msgId = `li_msg_sim_${candidate.id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    const sentAt = new Date().toISOString();

    if (candidate.linkedInOutreach) {
      candidate.linkedInOutreach.status = 'Follow-Up Sent';
      candidate.linkedInOutreach.followUpSentAt = sentAt;
      candidate.linkedInOutreach.followUpMessageId = msgId;
      if (candidate.linkedInOutreach.followUpDraft) {
        candidate.linkedInOutreach.followUpDraft.message = messageText;
      }
    }
    candidate.linkedInOutreachStatus = 'Follow-Up Sent';

    if (db.linkedInOutreachRecords && candidate.linkedInOutreach) {
      const idx = db.linkedInOutreachRecords.findIndex(r => r.candidateId === candidate.id);
      if (idx >= 0) db.linkedInOutreachRecords[idx] = candidate.linkedInOutreach;
    }

    return {
      success: true,
      messageId: msgId,
      status: 'Follow-Up Sent',
      message: `[Demo Sandbox] Follow-up message simulated successfully! (Simulated Message ID: ${msgId})`,
    };
  }

  // Live Mode: Official API check
  const apiStatus = getLinkedInApiStatus();
  if (!apiStatus.isConfigured) {
    return {
      success: false,
      status: candidate.linkedInOutreachStatus || 'Invitation Accepted',
      message: 'LinkedIn messaging API is not configured. Configure LINKEDIN_ACCESS_TOKEN in server environment.',
      error: 'LinkedIn API access token missing.',
    };
  }

  try {
    const token = (process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_TOKEN)!.trim();
    const response = await fetch('https://api.linkedin.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202401',
      },
      body: JSON.stringify({
        recipients: [candidate.linkedInOutreach?.profileUrl],
        message: {
          body: messageText,
        },
      }),
    });

    const bodyText = await response.text();
    let parsedBody: any = {};
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = { raw: bodyText };
    }

    if (!response.ok) {
      const failReason = parsedBody.message || `HTTP ${response.status}: ${response.statusText}`;
      return {
        success: false,
        status: candidate.linkedInOutreachStatus || 'Invitation Accepted',
        message: `LinkedIn Message API error: ${failReason}`,
        error: failReason,
      };
    }

    const messageId = parsedBody.id || `li_msg_${Date.now()}`;
    const sentAt = new Date().toISOString();

    if (candidate.linkedInOutreach) {
      candidate.linkedInOutreach.status = 'Follow-Up Sent';
      candidate.linkedInOutreach.followUpSentAt = sentAt;
      candidate.linkedInOutreach.followUpMessageId = messageId;
      if (candidate.linkedInOutreach.followUpDraft) {
        candidate.linkedInOutreach.followUpDraft.message = messageText;
      }
    }
    candidate.linkedInOutreachStatus = 'Follow-Up Sent';

    if (db.linkedInOutreachRecords && candidate.linkedInOutreach) {
      const idx = db.linkedInOutreachRecords.findIndex(r => r.candidateId === candidate.id);
      if (idx >= 0) db.linkedInOutreachRecords[idx] = candidate.linkedInOutreach;
    }

    return {
      success: true,
      messageId,
      status: 'Follow-Up Sent',
      message: `Follow-up message delivered via LinkedIn API (ID: ${messageId}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      status: candidate.linkedInOutreachStatus || 'Invitation Accepted',
      message: `Failed to send LinkedIn message: ${err.message}`,
      error: err.message,
    };
  }
}

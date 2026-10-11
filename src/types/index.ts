export type CriteriaTag = 'Matches Criteria' | 'Needs Review' | 'Outside Target';

export type TimeWindow = '24h' | '7d' | '30d';

export type RoleFamilyCategory =
  | 'all_roles_india'
  | 'tech_engineering'
  | 'general_sales'
  | 'operations_hr_marketing'
  | 'fmcg_manufacturing_paints'
  | 'pharma_healthcare'
  | 'technology_sales'
  | 'banking_nbfc_fintech'
  | 'insurance'
  | 'hospitality';

export interface QueryCatalogueStats {
  runsCount: number;
  retrievedCount: number;
  duplicatesCount: number;
  matchedCount: number;
  rejectedCount: number;
}

export interface QueryCatalogueItem {
  id: string;
  category: RoleFamilyCategory;
  categoryLabel: string;
  sectorTag: string;
  roleTerms: string[];
  phraseTerms: string[];
  compiledQuery: string;
  enabled: boolean;
  stats?: QueryCatalogueStats;
  lastUsedAt?: string | null;
}

export interface QueryCatalogueConfig {
  maxQueriesPerRun: number;
  maxPostsPerQuery?: number;
  timeWindow?: TimeWindow;
  rotationIndex: number;
  rotationMode?: 'sequential' | 'balanced_round_robin' | 'all_enabled';
  lastRotatedAt?: string | null;
}

export type AuthorIntent =
  | 'SELF_JOB_SEEKING'
  | 'RECRUITER_OR_EMPLOYER_HIRING'
  | 'SEEKING_ON_BEHALF_OF_SOMEONE'
  | 'UNRELATED'
  | 'UNCLEAR';

export type TargetSector =
  | 'any'
  | 'pharma'
  | 'FMCG'
  | 'manufacturing'
  | 'paints'
  | 'hospitality'
  | 'technology sales'
  | 'fintech'
  | 'NBFC'
  | 'wealthtech'
  | 'automotive'
  | 'retail'
  | 'logistics';

export const TARGET_SECTORS: TargetSector[] = [
  'any',
  'pharma',
  'FMCG',
  'manufacturing',
  'paints',
  'hospitality',
  'technology sales',
  'fintech',
  'NBFC',
  'wealthtech',
  'automotive',
  'retail',
  'logistics',
];

export type PlatformType = 'LinkedIn' | 'Telegram' | 'Demo';
export type CollectionMethod = 'Manual' | 'Connected' | 'Demo' | 'Apify';

export interface SourcePost {
  id: string;
  platform: PlatformType;
  collectionMethod: CollectionMethod;
  content: string;
  sourceUrl?: string | null;
  externalId?: string | null; // post ID or URN
  authorIdentifier?: string | null; // username, profile slug, or URL
  authorName?: string | null;
  authorHeadline?: string | null;
  authorLocation?: string | null;
  authorProfileUrl?: string | null;
  postedAt?: string | null; // Original publication timestamp
  receivedAt: string;
  extractionState: 'pending' | 'extracted' | 'failed' | 'rejected_post' | 'recruiter_ad';
  authorIntent?: AuthorIntent | null;
  intentEvidence?: string | null;
  rejectionReason?: string | null;
  extractionError?: string | null;
  extractedCandidateId?: string | null;
  duplicateOfPostId?: string | null;
  rawPayload?: any;
}

export interface CandidateCheckResult {
  passed: boolean | null; // true = passed, false = failed, null = missing/conflicting/needs review
  evidence: string; // Direct quote or supporting explanation
}

export interface CandidateSixPointCheck {
  authorIsPersonallySeekingJob: CandidateCheckResult;
  currentlyEmployedInSalesRole: CandidateCheckResult;
  currentlyWorkingInIndia: CandidateCheckResult;
  totalExperience1To10Years: CandidateCheckResult & { experienceType?: 'stated' | 'calculated' | 'unknown' };
  currentEmployerInTargetSector: CandidateCheckResult & { detectedSector?: string | null };
  postDateWithinSelectedPeriod: CandidateCheckResult;
  author_seeking_job?: boolean | null;
  author_based_in_india?: boolean | 'unknown' | null;
  intent_evidence?: string | null;
  location_evidence?: string | null;
  currentCity?: string | null;
  currentStateOrUT?: string | null;
  preferredLocation?: string | null;
  rejection_or_review_reason?: string | null;
}

// Backwards-compatible alias for existing references
export type CandidateFivePointCheck = CandidateSixPointCheck;

export interface CandidateEvidence {
  candidateName?: string;
  currentOrPreviousRole?: string;
  employer?: string;
  sector?: string;
  industry?: string;
  salesExperienceSummary?: string;
  totalExperienceYears?: string;
  currentLocation?: string;
  preferredLocation?: string;
  jobSeekingStatement?: string;
  statedAvailability?: string;
  contactDetails?: string;
  postDate?: string;
  profileUrl?: string;
}

export interface Candidate {
  id: string;
  name: string | null;
  currentOrPreviousRole: string | null;
  employer: string | null;
  sector: string | null;
  currentWorkLocation: string | null;
  industry: string | null;
  salesExperienceSummary: string | null;
  totalExperienceYears: number | null;
  experienceType: 'stated' | 'calculated' | 'unknown';
  preferredLocation: string | null;
  jobSeekingStatement: string | null;
  statedAvailability: string | null;
  originalPostDate: string | null;
  postUrl: string | null;
  profileUrl: string | null;
  email: string | null;
  phone: string | null;
  profileUrlOrTelegramId: string | null;
  authorIntent: AuthorIntent;
  intentEvidence: string | null;
  criteriaTag: CriteriaTag;
  matchingExplanation: string;
  isRecruiterAd: boolean;
  isSeekingForOthers?: boolean;
  validationChecks: CandidateSixPointCheck;
  sourcePostIds: string[];
  firstSeenAt: string;
  lastUpdatedAt: string;
  isManuallyCorrected: boolean;
  manuallyCorrectedFields: string[];
  originalValuesBeforeCorrection?: Record<string, any>;
  uncertainDuplicateCandidateIds?: string[];
  evidence?: CandidateEvidence;
  recruiterNotes?: string;
  // Outreach & Candidate Response workflow fields
  formToken?: string;
  outreachDeliveryStatus?: OutreachDeliveryStatus;
  eligibilityStatus?: CandidateEligibilityStatus;
  eligibilityReason?: string;
  engagementStatus?: EngagementStatus;
  assignedRecruiter?: string | null;
  outreachSentAt?: string | null;
  formSubmittedAt?: string | null;
  isUnsubscribed?: boolean;
  unsubscribedAt?: string | null;
  candidateResponseId?: string | null;
}

export interface AppErrorDetails {
  outgoingPayload?: Record<string, any>;
  httpStatus?: number;
  statusText?: string;
  responseBody?: any;
  message?: string;
  rejectedField?: string;
  remedy?: string;
  timestamp?: string;
}

export interface ScanRun {
  id: string;
  runAt: string;
  triggerType: 'manual' | 'scheduled' | 'webhook' | 'analysis' | 'find_candidates' | 'reprocess';
  mode?: 'demo' | 'live';
  receivedPostsCount: number;
  extractedCandidatesCount: number;
  rejectedPostsCount?: number;
  duplicatesFoundCount: number;
  failuresCount: number;
  durationMs: number;
  status: 'success' | 'warning' | 'failed' | 'running';
  message: string;
  error?: string;
  errorDetails?: AppErrorDetails;
  queryConfig?: {
    timeWindow: '24h' | '7d';
    limit: number;
    postedLimit?: string;
    maxPosts?: number;
    searchQuery?: string;
    searchQueries?: string[];
    useSmallTestQuery?: boolean;
    postedWithinHours?: number;
  };
}

export interface ActiveCollectionRun {
  runId: string;
  mode: 'demo' | 'live';
  status: 'starting' | 'fetching_posts' | 'classifying_intent' | 'validating_profiles' | 'analyzing' | 'completed' | 'failed';
  timeWindow: '24h' | '7d';
  limit: number;
  useSmallTestQuery?: boolean;
  fetchedPostsCount: number;
  analyzedCandidatesCount: number;
  rejectedPostsCount?: number;
  duplicatesCount: number;
  failuresCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  errorDetails?: AppErrorDetails;
  logs: string[];
}

export interface CriteriaFilters {
  requiredKeywords: string[];
  targetSectors: TargetSector[];
  excludedIndustries: string[];
  minExperienceYears: number;
  maxExperienceYears: number;
  excludeSeniorLeadership: boolean;
  strictRecruiterAdFiltering: boolean;
  locationFilter: string;
  targetCountry: string; // e.g. "India"
  allowBankingIndustry: boolean;
  matchAnySector: boolean;
  matchAnyRole: boolean;
  roleScope?: 'all_roles' | 'sales_only' | 'custom' | string;
  sectorScope?: 'all_sectors' | 'selected_sectors' | string;
}

export interface ScheduleSettings {
  scheduledTimes: string[];
  timezone: string;
  isPaused: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  cronSecret: string;
}

export interface ConnectionsConfig {
  apify: {
    actorId: string;
    isConfigured: boolean;
    lastRunAt: string | null;
    status: 'connected' | 'setup_required' | 'error';
    errorMessage?: string;
  };
  telegram: {
    botToken: string;
    permittedChatIds: string[];
    webhookUrl: string;
    isConnected: boolean;
    status: 'connected' | 'setup_required' | 'error';
    lastSyncAt: string | null;
    errorMessage?: string;
  };
  linkedin: {
    provider: 'apify' | 'rapidapi' | 'proxycurl' | 'partner_oauth' | 'none';
    apiKey: string;
    isConnected: boolean;
    status: 'connected' | 'setup_required' | 'error';
    lastSyncAt: string | null;
    errorMessage?: string;
  };
}

export interface OutreachSettings {
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  provider: 'smtp' | 'sendgrid' | 'resend' | 'gmail_workspace' | 'test_mode';
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  apiConfig?: {
    apiKey: string;
  };
  gmailAccessToken?: string;
  organizationDescription: string;
  rolesBeingSourced: string;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  dailySendingLimit: number;
  delayBetweenEmailsSeconds: number;
  automaticOutreachEnabled: boolean;
  testMode: boolean; // Safe preview mode: records test sends without dispatching real emails
  lastTestedAt?: string | null;
  lastTestStatus?: 'success' | 'failed' | null;
  lastTestMessage?: string | null;
}

export type OutreachDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'bounced'
  | 'suppressed_unsubscribed'
  | 'suppressed_already_submitted';

export type CandidateEligibilityStatus =
  | 'eligible'
  | 'email_unavailable'
  | 'already_contacted'
  | 'unsubscribed'
  | 'needs_review'
  | 'outside_target'
  | 'recruiter_excluded';

export type EngagementStatus =
  | 'New Response'
  | 'Under Review'
  | 'Contacted'
  | 'Shortlisted'
  | 'Not Suitable'
  | 'On Hold';

export interface FormSubmissionData {
  fullName: string;
  email: string;
  mobile?: string;
  currentCityState: string;
  preferredLocations: string;
  roleFunctionOfInterest: string;
  totalWorkExperience: string; // Including "Fresher"
  currentEmployerDesignation?: string;
  bankingFinancialServicesExperience?: string;
  noticePeriodAvailability: string;
  expectedAnnualCtc?: string;
  linkedInProfileUrl?: string;
  resumeFileName?: string;
  resumeFileId?: string; // Stored server-side securely
  resumeFileSize?: number;
  consentGiven: boolean;
  consentWordingVersion: string;
  consentTimestamp: string;
}

export interface CandidateFormResponse {
  id: string;
  candidateId: string;
  token: string;
  submittedAt: string;
  submissionIp?: string;
  fields: FormSubmissionData;
  sourcePlatform: PlatformType;
  sourcePostUrl?: string | null;
  sourcingRunId?: string | null;
  outreachMessageId?: string | null;
  recruiterNotes?: string;
}

export interface OutreachMessage {
  id: string;
  candidateId: string;
  candidateEmail: string;
  candidateName: string;
  formToken: string;
  subject: string;
  body: string;
  deliveryStatus: OutreachDeliveryStatus;
  sentAt?: string | null;
  queuedAt: string;
  failedAt?: string | null;
  failureReason?: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string | null;
  providerMessageId?: string | null;
  formSubmittedAt?: string | null;
  unsubscribeToken: string;
  unsubscribedAt?: string | null;
  isTestModeSend?: boolean;
}

export interface CandidateOutreachMeta {
  formToken: string;
  eligibilityStatus: CandidateEligibilityStatus;
  eligibilityReason?: string;
  engagementStatus?: EngagementStatus;
  assignedRecruiter?: string | null;
  outreachMessageId?: string | null;
  initialOutreachSentAt?: string | null;
  formSubmittedAt?: string | null;
  isUnsubscribed?: boolean;
  unsubscribedAt?: string | null;
  recruiterNotes?: string;
}

export interface AppDatabase {
  candidates: Candidate[];
  posts: SourcePost[];
  scanRuns: ScanRun[];
  criteria: CriteriaFilters;
  schedule: ScheduleSettings;
  connections: ConnectionsConfig;
  outreachSettings: OutreachSettings;
  outreachMessages: OutreachMessage[];
  candidateResponses: CandidateFormResponse[];
  suppressionList: {
    email: string;
    reason: 'unsubscribed' | 'bounced_permanent' | 'recruiter_blacklisted';
    createdAt: string;
  }[];
  queryCatalogue?: QueryCatalogueItem[];
  queryConfig?: QueryCatalogueConfig;
}

export interface ExtractionResult {
  candidateName: string | null;
  currentOrPreviousRole: string | null;
  employer: string | null;
  sector: string | null;
  currentWorkLocation: string | null;
  industry: string | null;
  salesExperienceSummary: string | null;
  totalExperienceYears: number | null;
  experienceType: 'stated' | 'calculated' | 'unknown';
  preferredLocation: string | null;
  jobSeekingStatement: string | null;
  statedAvailability: string | null;
  originalPostDate: string | null;
  email: string | null;
  phone: string | null;
  profileUrlOrTelegramId: string | null;
  postUrl: string | null;
  authorIntent: AuthorIntent;
  intentEvidence: string | null;
  rejectionReason?: string | null;
  isRecruiterAd: boolean;
  isSeekingForOthers?: boolean;
  criteriaTag: CriteriaTag;
  matchingExplanation: string;
  validationChecks: CandidateSixPointCheck;
  evidence: CandidateEvidence;
  isExtractionReliable: boolean;
  sourceTypeUsed: 'gemini' | 'simulated_fallback';
}

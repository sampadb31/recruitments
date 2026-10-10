import {
  SourcePost,
  Candidate,
  ScanRun,
  CriteriaFilters,
  ScheduleSettings,
  ConnectionsConfig,
  AppDatabase,
  TARGET_SECTORS,
} from '../types/index.ts';
import { isApifyConfigured } from './apify.ts';

export const initialCriteriaFilters: CriteriaFilters = {
  requiredKeywords: [
    'sales',
    'account executive',
    'business development',
    'medical representative',
    'territory sales',
    'software sales',
  ],
  targetSectors: TARGET_SECTORS,
  excludedIndustries: [],
  minExperienceYears: 1,
  maxExperienceYears: 10,
  excludeSeniorLeadership: true,
  strictRecruiterAdFiltering: true,
  locationFilter: 'India',
  targetCountry: 'India',
  allowBankingIndustry: true,
};

export const initialScheduleSettings: ScheduleSettings = {
  scheduledTimes: ['09:00', '18:00'],
  timezone: 'Asia/Kolkata',
  isPaused: false,
  lastRunAt: '2026-10-04T03:30:00.000Z',
  nextRunAt: '2026-10-04T12:30:00.000Z',
  cronSecret: 'rdc_secret_cron_token_live_9a8b7c',
};

export const initialConnectionsConfig: ConnectionsConfig = {
  apify: {
    actorId: 'harvestapi/linkedin-post-search',
    isConfigured: isApifyConfigured(),
    lastRunAt: null,
    status: isApifyConfigured() ? 'connected' : 'setup_required',
    errorMessage: isApifyConfigured()
      ? undefined
      : 'APIFY_API_TOKEN secret is not set in environment.',
  },
  telegram: {
    botToken: '',
    permittedChatIds: ['-1002345678901', '@sales_jobseekers_hub'],
    webhookUrl:
      'https://ais-dev-y4kj63tf3c3olzwwtdavrt-753012129268.asia-southeast1.run.app/api/telegram/webhook',
    isConnected: false,
    status: 'setup_required',
    lastSyncAt: null,
    errorMessage:
      'Bot token not configured. Telegram webhook awaiting verification.',
  },
  linkedin: {
    provider: 'apify',
    apiKey: '',
    isConnected: isApifyConfigured(),
    status: isApifyConfigured() ? 'connected' : 'setup_required',
    lastSyncAt: null,
    errorMessage: isApifyConfigured()
      ? undefined
      : 'Apify actor harvestapi/linkedin-post-search requires APIFY_API_TOKEN.',
  },
};

/**
 * Canonical test posts covering the 7 mandatory verification scenarios from the brief:
 * 1. A recruiter advertising a sales vacancy (RECRUITER_OR_EMPLOYER_HIRING -> Rejected)
 * 2. A qualifying pharma sales employee seeking a job (SELF_JOB_SEEKING -> Matches Criteria)
 * 3. An unrelated FMCG post (UNRELATED -> Rejected)
 * 4. A job seeker with unknown experience (SELF_JOB_SEEKING -> Needs Review)
 * 5. A tech engineer with no sales responsibilities (SELF_JOB_SEEKING -> Outside Target)
 * 6. A sales job seeker currently working outside India (SELF_JOB_SEEKING -> Outside Target)
 * 7. A job seeker mentioning "hiring managers" (SELF_JOB_SEEKING -> Matches Criteria)
 * 8. NBFC commercial loan sales candidate (SELF_JOB_SEEKING -> Matches Criteria)
 */
export const initialSamplePosts: SourcePost[] = [
  // 1. Recruiter advertising a sales vacancy
  {
    id: 'post_verify_01_recruiter',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000001',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000001',
    authorIdentifier: 'https://www.linkedin.com/in/talentsprint-agency',
    authorName: 'TalentSprint Hiring Agency',
    authorHeadline: 'Lead Recruiter | Delhi NCR, India',
    authorLocation: 'Gurgaon, Haryana, India',
    authorProfileUrl: 'https://www.linkedin.com/in/talentsprint-agency',
    content:
      '🚨 WE ARE HIRING: Urgent opening for 5 B2B Sales Executives for our corporate manufacturing client in Pune. CTC 8-12 LPA. Requirements: 2-4 years experience. Send updated CV to jobs@talentsprint.com.',
    postedAt: '2026-10-03T19:00:00.000Z',
    receivedAt: '2026-10-03T19:05:00.000Z',
    extractionState: 'recruiter_ad',
    authorIntent: 'RECRUITER_OR_EMPLOYER_HIRING',
    intentEvidence:
      'Post is a recruiter advertisement soliciting candidate CVs for a corporate vacancy ("We are hiring... Send updated CV to").',
    rejectionReason: 'Rejected Post: Recruiter vacancy advertisement.',
  },

  // 2. Qualifying pharma sales employee seeking a job
  {
    id: 'post_verify_02_pharma',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000002',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000002',
    authorIdentifier: 'https://www.linkedin.com/in/rohit-deshmukh-pharma',
    authorName: 'Rohit Deshmukh',
    authorHeadline:
      'Area Sales Manager at Sun Pharma | Medical Representative | Mumbai, India',
    authorLocation: 'Mumbai, Maharashtra, India',
    authorProfileUrl: 'https://www.linkedin.com/in/rohit-deshmukh-pharma',
    content:
      'I have 5 years in pharmaceutical sales as a Medical Representative and Area Sales Manager at Sun Pharma, and I am actively seeking a new role in Mumbai or Pune. Consistently exceeded sales targets by 115%. Contact: rohit.deshmukh@pharmamail.com',
    postedAt: '2026-10-03T14:30:00.000Z',
    receivedAt: '2026-10-03T14:35:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_verify_02_pharma',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author explicitly states personal job search: "I am actively seeking a new role in Mumbai or Pune."',
  },

  // 3. Unrelated FMCG post
  {
    id: 'post_verify_03_unrelated',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000003',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000003',
    authorIdentifier: 'https://www.linkedin.com/in/vikram-fmcg-insights',
    authorName: 'Vikram Malhotra',
    authorHeadline: 'FMCG Market Analyst & Consultant | Delhi, India',
    authorLocation: 'New Delhi, Delhi, India',
    authorProfileUrl: 'https://www.linkedin.com/in/vikram-fmcg-insights',
    content:
      'Five ways to improve FMCG sales distribution and supply chain logistics in rural tier-2 markets. 1. Incentivize distributor sales reps. 2. Implement predictive replenishment... Read my full analysis on Substack.',
    postedAt: '2026-10-02T11:00:00.000Z',
    receivedAt: '2026-10-02T11:05:00.000Z',
    extractionState: 'rejected_post',
    authorIntent: 'UNRELATED',
    intentEvidence:
      'Post consists of thought leadership and market analysis ("Five ways to improve FMCG sales distribution").',
    rejectionReason:
      'Rejected Post: Unrelated sales advice or industry thought leadership.',
  },

  // 4. Job seeker with unknown experience
  {
    id: 'post_verify_04_unknown_exp',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000004',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000004',
    authorIdentifier: 'https://www.linkedin.com/in/amit-verma-paints',
    authorName: 'Amit Verma',
    authorHeadline:
      'Territory Sales Executive at Berger Paints | Delhi NCR, India',
    authorLocation: 'New Delhi, Delhi, India',
    authorProfileUrl: 'https://www.linkedin.com/in/amit-verma-paints',
    content:
      'I am exploring new sales opportunities in the paints and decorative coatings sector across Delhi NCR. Open to work as Territory Sales Executive. Please connect or reach out at amit.verma@paintmail.com #OpenToWork',
    postedAt: '2026-10-03T16:20:00.000Z',
    receivedAt: '2026-10-03T16:25:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_verify_04_unknown_exp',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author explicitly states: "I am exploring new sales opportunities in the paints and decorative coatings sector... Open to work as Territory Sales Executive."',
  },

  // 5. Tech engineer with no sales responsibilities
  {
    id: 'post_verify_05_tech_engineer',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000005',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000005',
    authorIdentifier: 'https://www.linkedin.com/in/rahul-verma-dev',
    authorName: 'Rahul Verma',
    authorHeadline:
      'Senior Backend Software Engineer at TechStack | Python & Go | Bengaluru, India',
    authorLocation: 'Bengaluru, Karnataka, India',
    authorProfileUrl: 'https://www.linkedin.com/in/rahul-verma-dev',
    content:
      'After 4 years building distributed backend microservices and databases in Go and Python at TechStack, I am open to work and seeking new software engineering opportunities in Bengaluru. No sales experience. Email: rahul.tech@devmail.io',
    postedAt: '2026-10-02T13:45:00.000Z',
    receivedAt: '2026-10-02T13:50:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_verify_05_tech_engineer',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author is personally seeking software engineering roles: "seeking new software engineering opportunities in Bengaluru."',
  },

  // 6. Sales job seeker currently working outside India
  {
    id: 'post_verify_06_outside_india',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000006',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000006',
    authorIdentifier: 'https://www.linkedin.com/in/alexchen-saas',
    authorName: 'Alex Chen',
    authorHeadline:
      'Account Executive at CloudScale | SaaS Technology Sales | Singapore',
    authorLocation: 'Singapore',
    authorProfileUrl: 'https://www.linkedin.com/in/alexchen-saas',
    content:
      "I'm officially on the market! Over the past 6 years, I've worked in Enterprise B2B SaaS software sales closing mid-market contracts at CloudScale. Seeking new sales opportunities based in Singapore. Feel free to connect or email alex.chen.sales@techmail.io",
    postedAt: '2026-10-03T10:45:00.000Z',
    receivedAt: '2026-10-03T10:50:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_verify_06_outside_india',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author states: "I\'m officially on the market! ... Seeking new sales opportunities based in Singapore."',
  },

  // 7. Job seeker mentioning "hiring managers"
  {
    id: 'post_verify_07_hiring_managers',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000007',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000007',
    authorIdentifier: 'https://www.linkedin.com/in/priyasharma-sales',
    authorName: 'Priya Sharma',
    authorHeadline:
      'Senior Sales Executive at NatureFresh Foods | FMCG Sales | Mumbai, India',
    authorLocation: 'Mumbai, Maharashtra, India',
    authorProfileUrl: 'https://www.linkedin.com/in/priyasharma-sales',
    content:
      'After a rewarding 4 years driving B2B sales in retail distribution at NatureFresh Foods, I am exploring new opportunities in Mumbai. Please connect me with hiring managers in the FMCG sector! Reach me at priya.sharma91@example.com',
    postedAt: '2026-10-03T09:15:00.000Z',
    receivedAt: '2026-10-03T09:20:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_verify_07_hiring_managers',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author personally seeks a job and asks network: "I am exploring new opportunities in Mumbai. Please connect me with hiring managers in the FMCG sector!"',
  },

  // 8. NBFC loan sales candidate (Fintech / NBFC sector check)
  {
    id: 'post_verify_08_nbfc',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000008',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000008',
    authorIdentifier: 'https://www.linkedin.com/in/karthik-raman-nbfc',
    authorName: 'Karthik Raman',
    authorHeadline:
      'Loan Sales Manager at Shriram Finance | NBFC Commercial Vehicle Loans | Chennai, India',
    authorLocation: 'Chennai, Tamil Nadu, India',
    authorProfileUrl: 'https://www.linkedin.com/in/karthik-raman-nbfc',
    content:
      'Seeking a new role in commercial vehicle finance and lending! 3 years experience at Shriram Finance (NBFC) in Chennai as a Loan Sales Manager. Achieved 130% sales quota. Available in 30 days. Contact: karthik.raman@nbfcmail.in',
    postedAt: '2026-10-03T11:20:00.000Z',
    receivedAt: '2026-10-03T11:25:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_verify_08_nbfc',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author personally seeks a new job: "Seeking a new role in commercial vehicle finance and lending!"',
  },

  // 9. Divya Nair - Fullstack Software Engineer in Bengaluru
  {
    id: 'post_demo_09_engineer',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000009',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000009',
    authorIdentifier: 'https://www.linkedin.com/in/divya-nair-dev',
    authorName: 'Divya Nair',
    authorHeadline: 'Fullstack Engineer (React & Node.js) | Bengaluru, India',
    authorLocation: 'Bengaluru, Karnataka, India',
    authorProfileUrl: 'https://www.linkedin.com/in/divya-nair-dev',
    content:
      'I am open to work! After 4 years building scalable web platforms at FinTechWorks in Bengaluru, I am actively looking for my next software engineering role. Immediate joiner. Email: divya.nair@devmail.in',
    postedAt: '2026-10-04T08:30:00.000Z',
    receivedAt: '2026-10-04T08:35:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_demo_09_engineer',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'I am open to work! ... actively looking for my next software engineering role.',
  },

  // 10. Ankit Joshi - Operations & Supply Chain Lead in Pune
  {
    id: 'post_demo_10_operations',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000010',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000010',
    authorIdentifier: 'https://www.linkedin.com/in/ankit-joshi-ops',
    authorName: 'Ankit Joshi',
    authorHeadline: 'Operations & Supply Chain Manager | Pune, India',
    authorLocation: 'Pune, Maharashtra, India',
    authorProfileUrl: 'https://www.linkedin.com/in/ankit-joshi-ops',
    content:
      'Exploring new career opportunities in supply chain operations. 5 years experience managing warehouse logistics and inventory distribution in Pune. Open to discussions. Reach me at ankit.ops@mailhub.in',
    postedAt: '2026-10-04T09:15:00.000Z',
    receivedAt: '2026-10-04T09:20:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_demo_10_operations',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Exploring new career opportunities in supply chain operations.',
  },

  // 11. Sneha Iyer - Digital Marketing & Growth Lead in Mumbai
  {
    id: 'post_demo_11_marketing',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000011',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000011',
    authorIdentifier: 'https://www.linkedin.com/in/sneha-iyer-growth',
    authorName: 'Sneha Iyer',
    authorHeadline: 'Growth Marketing Manager | Performance Ads | Mumbai, India',
    authorLocation: 'Mumbai, Maharashtra, India',
    authorProfileUrl: 'https://www.linkedin.com/in/sneha-iyer-growth',
    content:
      'Seeking a new role in growth marketing! 4 years experience leading paid acquisition, SEO, and retention campaigns across India. Available within 30 days. Contact: sneha.mkt@inboxmail.in #OpenToWork',
    postedAt: '2026-10-04T10:00:00.000Z',
    receivedAt: '2026-10-04T10:05:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_demo_11_marketing',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Seeking a new role in growth marketing! ... #OpenToWork',
  },

  // 12. Manish Aggarwal - Finance & Accounting Lead in Delhi NCR
  {
    id: 'post_demo_12_finance',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000012',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000012',
    authorIdentifier: 'https://www.linkedin.com/in/manish-aggarwal-fin',
    authorName: 'Manish Aggarwal',
    authorHeadline: 'Senior Financial Analyst & Corporate Accounts | New Delhi, India',
    authorLocation: 'New Delhi, Delhi, India',
    authorProfileUrl: 'https://www.linkedin.com/in/manish-aggarwal-fin',
    content:
      'I am looking for a new opportunity in financial planning and corporate accounts in Delhi NCR. 6 years hands-on experience in financial modeling, audits, and MIS reporting. Connect or DM me!',
    postedAt: '2026-10-04T11:45:00.000Z',
    receivedAt: '2026-10-04T11:50:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_demo_12_finance',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'I am looking for a new opportunity in financial planning and corporate accounts.',
  },

  // 13. Preeti Saxena - HR & Talent Acquisition Specialist in Gurgaon
  {
    id: 'post_demo_13_hr',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000013',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000013',
    authorIdentifier: 'https://www.linkedin.com/in/preeti-saxena-hr',
    authorName: 'Preeti Saxena',
    authorHeadline: 'Human Resources Generalist & Talent Lead | Gurgaon, India',
    authorLocation: 'Gurgaon, Haryana, India',
    authorProfileUrl: 'https://www.linkedin.com/in/preeti-saxena-hr',
    content:
      'Open to work as HR Generalist or Talent Partner in Delhi NCR or remote India. 3 years experience in end-to-end recruitment, onboarding, and employee engagement. Immediate joiner. Reach out at preeti.hr@workmail.in',
    postedAt: '2026-10-04T12:10:00.000Z',
    receivedAt: '2026-10-04T12:15:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_demo_13_hr',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Open to work as HR Generalist or Talent Partner in Delhi NCR or remote India.',
  },

  // 14. Vikram Rao - Data Analyst in Hyderabad
  {
    id: 'post_demo_14_data',
    platform: 'LinkedIn',
    collectionMethod: 'Demo',
    externalId: 'urn:li:activity:7247000014',
    sourceUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000014',
    authorIdentifier: 'https://www.linkedin.com/in/vikram-rao-data',
    authorName: 'Vikram Rao',
    authorHeadline: 'Data Analyst (SQL, Python, PowerBI) | Hyderabad, India',
    authorLocation: 'Hyderabad, Telangana, India',
    authorProfileUrl: 'https://www.linkedin.com/in/vikram-rao-data',
    content:
      'Seeking my next role as a Data Analyst in Hyderabad or remote. 3 years experience building BI dashboards, ETL pipelines, and business insights. Immediate joiner. Reach out via email: vikram.rao.data@analystmail.in',
    postedAt: '2026-10-04T13:00:00.000Z',
    receivedAt: '2026-10-04T13:05:00.000Z',
    extractionState: 'extracted',
    extractedCandidateId: 'cand_demo_14_data',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Seeking my next role as a Data Analyst in Hyderabad or remote.',
  },
];

export const initialSampleCandidates: Candidate[] = [
  // 1. Rohit Deshmukh - Pharma Sales (Matches Criteria)
  {
    id: 'cand_verify_02_pharma',
    name: 'Rohit Deshmukh',
    currentOrPreviousRole: 'Area Sales Manager / Medical Representative',
    employer: 'Sun Pharma',
    sector: 'pharma',
    currentWorkLocation: 'Mumbai, Maharashtra, India',
    industry: 'Pharmaceuticals',
    salesExperienceSummary:
      '5 years in pharmaceutical sales as Medical Representative and Area Sales Manager at Sun Pharma. Exceeded sales targets by 115%.',
    totalExperienceYears: 5,
    experienceType: 'stated',
    preferredLocation: 'Mumbai or Pune, India',
    jobSeekingStatement:
      'I am actively seeking a new role in Mumbai or Pune.',
    statedAvailability: 'Open to discussions',
    originalPostDate: '2026-10-03T14:30:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000002',
    profileUrl: 'https://www.linkedin.com/in/rohit-deshmukh-pharma',
    email: 'rohit.deshmukh@pharmamail.com',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/rohit-deshmukh-pharma',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author personally states: "I am actively seeking a new role in Mumbai or Pune."',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking sales professional currently working in pharma in India with 5 years stated experience (within 1–10 years).',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: {
        passed: true,
        evidence: '"I am actively seeking a new role in Mumbai or Pune."',
      },
      currentlyEmployedInSalesRole: {
        passed: true,
        evidence:
          'Area Sales Manager at Sun Pharma, Medical Representative pharmaceutical commercial sales.',
      },
      currentlyWorkingInIndia: {
        passed: true,
        evidence: 'Profile location: Mumbai, Maharashtra, India.',
      },
      totalExperience1To10Years: {
        passed: true,
        evidence:
          '5 years in pharmaceutical sales stated in post (within 1–10 years).',
        experienceType: 'stated',
      },
      currentEmployerInTargetSector: {
        passed: true,
        evidence:
          'Sun Pharma operates in the eligible Pharmaceutical (pharma) sector.',
        detectedSector: 'pharma',
      },
      postDateWithinSelectedPeriod: {
        passed: true,
        evidence: 'Posted Oct 3, 2026 (within selected date window).',
      },
    },
    sourcePostIds: ['post_verify_02_pharma'],
    firstSeenAt: '2026-10-03T14:35:00.000Z',
    lastUpdatedAt: '2026-10-03T14:35:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
    evidence: {
      candidateName: 'Rohit Deshmukh',
      currentOrPreviousRole: 'Area Sales Manager',
      employer: 'Sun Pharma',
      sector: 'pharma',
      totalExperienceYears: '5 years stated in post',
      currentLocation: 'Mumbai, Maharashtra, India',
      jobSeekingStatement: 'I am actively seeking a new role in Mumbai or Pune.',
      postDate: '2026-10-03T14:30:00.000Z',
    },
  },

  // 2. Priya Sharma - FMCG Sales with "hiring managers" mention (Matches Criteria)
  {
    id: 'cand_verify_07_hiring_managers',
    name: 'Priya Sharma',
    currentOrPreviousRole: 'Senior Sales Executive',
    employer: 'NatureFresh Foods',
    sector: 'FMCG',
    currentWorkLocation: 'Mumbai, Maharashtra, India',
    industry: 'Fast Moving Consumer Goods (FMCG)',
    salesExperienceSummary:
      '4 years driving B2B sales in FMCG retail distribution at NatureFresh Foods.',
    totalExperienceYears: 4,
    experienceType: 'stated',
    preferredLocation: 'Mumbai, India',
    jobSeekingStatement:
      'I am exploring new opportunities in Mumbai. Please connect me with hiring managers in the FMCG sector!',
    statedAvailability: 'Open to discussions',
    originalPostDate: '2026-10-03T09:15:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000007',
    profileUrl: 'https://www.linkedin.com/in/priyasharma-sales',
    email: 'priya.sharma91@example.com',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/priyasharma-sales',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author is personally seeking a job ("Please connect me with hiring managers" does not indicate recruiter hiring).',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking sales professional currently working in FMCG in India with 4 years experience. Mention of hiring managers refers to connecting with employers, not a recruiter ad.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: {
        passed: true,
        evidence:
          '"I am exploring new opportunities in Mumbai. Please connect me with hiring managers in the FMCG sector!"',
      },
      currentlyEmployedInSalesRole: {
        passed: true,
        evidence:
          'Senior Sales Executive driving B2B sales in retail distribution at NatureFresh Foods.',
      },
      currentlyWorkingInIndia: {
        passed: true,
        evidence: 'Location: Mumbai, Maharashtra, India.',
      },
      totalExperience1To10Years: {
        passed: true,
        evidence:
          '4 years stated in post (within 1–10 years inclusive).',
        experienceType: 'stated',
      },
      currentEmployerInTargetSector: {
        passed: true,
        evidence:
          'NatureFresh Foods operates in the eligible FMCG sector.',
        detectedSector: 'FMCG',
      },
      postDateWithinSelectedPeriod: {
        passed: true,
        evidence: 'Posted Oct 3, 2026 (within selected date window).',
      },
    },
    sourcePostIds: ['post_verify_07_hiring_managers'],
    firstSeenAt: '2026-10-03T09:20:00.000Z',
    lastUpdatedAt: '2026-10-03T09:20:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
    evidence: {
      candidateName: 'Priya Sharma',
      currentOrPreviousRole: 'Senior Sales Executive',
      employer: 'NatureFresh Foods',
      sector: 'FMCG',
      totalExperienceYears: '4 years stated',
      currentLocation: 'Mumbai, Maharashtra, India',
      jobSeekingStatement:
        'I am exploring new opportunities in Mumbai. Please connect me with hiring managers in the FMCG sector!',
      postDate: '2026-10-03T09:15:00.000Z',
    },
  },

  // 3. Karthik Raman - NBFC Loan Sales (Matches Criteria)
  {
    id: 'cand_verify_08_nbfc',
    name: 'Karthik Raman',
    currentOrPreviousRole: 'Loan Sales Manager',
    employer: 'Shriram Finance',
    sector: 'NBFC',
    currentWorkLocation: 'Chennai, Tamil Nadu, India',
    industry: 'NBFC Commercial Vehicle Finance',
    salesExperienceSummary:
      '3 years commercial vehicle lending and loan sales at Shriram Finance. Achieved 130% quota.',
    totalExperienceYears: 3,
    experienceType: 'stated',
    preferredLocation: 'Chennai, India',
    jobSeekingStatement:
      'Seeking a new role in commercial vehicle finance and lending!',
    statedAvailability: '30 days',
    originalPostDate: '2026-10-03T11:20:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000008',
    profileUrl: 'https://www.linkedin.com/in/karthik-raman-nbfc',
    email: 'karthik.raman@nbfcmail.in',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/karthik-raman-nbfc',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author personally seeks a role: "Seeking a new role in commercial vehicle finance and lending!"',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking loan sales manager at Shriram Finance (NBFC is an eligible sector, not excluded as commercial banking). 3 years experience in India.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: {
        passed: true,
        evidence:
          '"Seeking a new role in commercial vehicle finance and lending!"',
      },
      currentlyEmployedInSalesRole: {
        passed: true,
        evidence:
          'Loan Sales Manager at Shriram Finance, commercial vehicle lending.',
      },
      currentlyWorkingInIndia: {
        passed: true,
        evidence: 'Location: Chennai, Tamil Nadu, India.',
      },
      totalExperience1To10Years: {
        passed: true,
        evidence: '3 years experience stated in post (within 1–10 years).',
        experienceType: 'stated',
      },
      currentEmployerInTargetSector: {
        passed: true,
        evidence:
          'Shriram Finance operates as an NBFC (eligible sector).',
        detectedSector: 'NBFC',
      },
      postDateWithinSelectedPeriod: {
        passed: true,
        evidence: 'Posted Oct 3, 2026 (within selected date window).',
      },
    },
    sourcePostIds: ['post_verify_08_nbfc'],
    firstSeenAt: '2026-10-03T11:25:00.000Z',
    lastUpdatedAt: '2026-10-03T11:25:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 4. Amit Verma - Unknown Experience (Needs Review)
  {
    id: 'cand_verify_04_unknown_exp',
    name: 'Amit Verma',
    currentOrPreviousRole: 'Territory Sales Executive',
    employer: 'Berger Paints',
    sector: 'paints',
    currentWorkLocation: 'New Delhi, Delhi, India',
    industry: 'Paints & Coatings',
    salesExperienceSummary:
      'Territory sales executive in decorative coatings and architectural paints.',
    totalExperienceYears: null,
    experienceType: 'unknown',
    preferredLocation: 'Delhi NCR, India',
    jobSeekingStatement:
      'I am exploring new sales opportunities in the paints and decorative coatings sector across Delhi NCR.',
    statedAvailability: null,
    originalPostDate: '2026-10-03T16:20:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000004',
    profileUrl: 'https://www.linkedin.com/in/amit-verma-paints',
    email: 'amit.verma@paintmail.com',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/amit-verma-paints',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author personally seeks a role: "I am exploring new sales opportunities in the paints and decorative coatings sector."',
    criteriaTag: 'Needs Review',
    matchingExplanation:
      'Needs Review: Personal job-seeking intent, sales role, paints sector, and India location are confirmed, but total years of experience is not specified in the post or headline.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: {
        passed: true,
        evidence:
          '"I am exploring new sales opportunities in the paints and decorative coatings sector across Delhi NCR."',
      },
      currentlyEmployedInSalesRole: {
        passed: true,
        evidence:
          'Territory Sales Executive at Berger Paints.',
      },
      currentlyWorkingInIndia: {
        passed: true,
        evidence: 'Location: New Delhi, Delhi, India.',
      },
      totalExperience1To10Years: {
        passed: null,
        evidence:
          'Total experience duration not stated. Cannot assume whether between 1–10 years.',
        experienceType: 'unknown',
      },
      currentEmployerInTargetSector: {
        passed: true,
        evidence:
          'Berger Paints operates in the eligible Paints & Coatings sector.',
        detectedSector: 'paints',
      },
      postDateWithinSelectedPeriod: {
        passed: true,
        evidence: 'Posted Oct 3, 2026 (within selected date window).',
      },
    },
    sourcePostIds: ['post_verify_04_unknown_exp'],
    firstSeenAt: '2026-10-03T16:25:00.000Z',
    lastUpdatedAt: '2026-10-03T16:25:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 5. Rahul Verma - Tech engineer (Matches Criteria: Any role and sector accepted with 1-10y exp & India)
  {
    id: 'cand_verify_05_tech_engineer',
    name: 'Rahul Verma',
    currentOrPreviousRole: 'Senior Backend Software Engineer',
    employer: 'TechStack',
    sector: null,
    currentWorkLocation: 'Bengaluru, Karnataka, India',
    currentCity: 'Bengaluru',
    currentStateOrUT: 'Karnataka',
    industry: 'Software Engineering',
    salesExperienceSummary: null,
    totalExperienceYears: 4,
    experienceType: 'stated',
    preferredLocation: 'Bengaluru, India',
    jobSeekingStatement:
      'seeking new software engineering opportunities in Bengaluru.',
    statedAvailability: null,
    originalPostDate: '2026-10-02T13:45:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000005',
    profileUrl: 'https://www.linkedin.com/in/rahul-verma-dev',
    email: 'rahul.tech@devmail.io',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/rahul-verma-dev',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author seeks an engineering job ("seeking new software engineering opportunities in Bengaluru").',
    author_seeking_job: true,
    author_based_in_india: true,
    location_evidence: 'Profile location: Bengaluru, Karnataka, India.',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Individual job-seeker in Bengaluru, Karnataka, India with 4 years experience. Any role and sector accepted.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: {
        passed: true,
        evidence:
          '"seeking new software engineering opportunities in Bengaluru."',
      },
      currentlyEmployedInSalesRole: {
        passed: true,
        evidence:
          'Senior Backend Software Engineer. Working in any role is accepted.',
      },
      currentlyWorkingInIndia: {
        passed: true,
        evidence: 'Bengaluru, Karnataka, India.',
      },
      totalExperience1To10Years: {
        passed: true,
        evidence: '4 years backend engineering stated in post (within 1–10 years).',
        experienceType: 'stated',
      },
      currentEmployerInTargetSector: {
        passed: true,
        evidence:
          'TechStack. Working in any sector is accepted.',
      },
      postDateWithinSelectedPeriod: {
        passed: true,
        evidence: 'Posted Oct 2, 2026.',
      },
      author_seeking_job: true,
      author_based_in_india: true,
      currentCity: 'Bengaluru',
      currentStateOrUT: 'Karnataka',
    },
    sourcePostIds: ['post_verify_05_tech_engineer'],
    firstSeenAt: '2026-10-02T13:50:00.000Z',
    lastUpdatedAt: '2026-10-02T13:50:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 6. Alex Chen - Outside India (Outside Target)
  {
    id: 'cand_verify_06_outside_india',
    name: 'Alex Chen',
    currentOrPreviousRole: 'Account Executive',
    employer: 'CloudScale',
    sector: 'technology sales',
    currentWorkLocation: 'Singapore',
    industry: 'Enterprise B2B SaaS',
    salesExperienceSummary:
      '6 years Enterprise B2B SaaS software sales closing mid-market contracts at CloudScale.',
    totalExperienceYears: 6,
    experienceType: 'stated',
    preferredLocation: 'Singapore',
    jobSeekingStatement:
      "I'm officially on the market! Seeking new sales opportunities based in Singapore.",
    statedAvailability: 'Open to discussions',
    originalPostDate: '2026-10-03T10:45:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000006',
    profileUrl: 'https://www.linkedin.com/in/alexchen-saas',
    email: 'alex.chen.sales@techmail.io',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/alexchen-saas',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence:
      'Author states: "I\'m officially on the market! ... Seeking new sales opportunities based in Singapore."',
    criteriaTag: 'Outside Target',
    matchingExplanation:
      'Outside Target: Fails India location condition. Candidate currently works and seeks roles in Singapore, not India.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: {
        passed: true,
        evidence:
          '"I\'m officially on the market! Seeking new sales opportunities based in Singapore."',
      },
      currentlyEmployedInSalesRole: {
        passed: true,
        evidence:
          'Account Executive selling Enterprise B2B SaaS software.',
      },
      currentlyWorkingInIndia: {
        passed: false,
        evidence:
          'Profile location: Singapore (Fails: Currently working outside India).',
      },
      totalExperience1To10Years: {
        passed: true,
        evidence: '6 years experience stated in post.',
        experienceType: 'stated',
      },
      currentEmployerInTargetSector: {
        passed: true,
        evidence:
          'CloudScale operates in eligible Technology Sales sector.',
        detectedSector: 'technology sales',
      },
      postDateWithinSelectedPeriod: {
        passed: true,
        evidence: 'Posted Oct 3, 2026.',
      },
    },
    sourcePostIds: ['post_verify_06_outside_india'],
    firstSeenAt: '2026-10-03T10:50:00.000Z',
    lastUpdatedAt: '2026-10-03T10:50:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 7. Divya Nair - Software Engineer in Bengaluru (Matches Criteria)
  {
    id: 'cand_demo_09_engineer',
    name: 'Divya Nair',
    currentOrPreviousRole: 'Fullstack Engineer (React & Node.js)',
    employer: 'FinTechWorks',
    sector: 'technology sales',
    currentWorkLocation: 'Bengaluru, Karnataka, India',
    currentCity: 'Bengaluru',
    currentStateOrUT: 'Karnataka',
    industry: 'Software Engineering',
    salesExperienceSummary: null,
    totalExperienceYears: 4,
    experienceType: 'stated',
    preferredLocation: 'Bengaluru, India',
    jobSeekingStatement: 'I am open to work! ... actively looking for my next software engineering role.',
    statedAvailability: 'Immediate Joiner',
    originalPostDate: '2026-10-04T08:30:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000009',
    profileUrl: 'https://www.linkedin.com/in/divya-nair-dev',
    email: 'divya.nair@devmail.in',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/divya-nair-dev',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'I am open to work! ... actively looking for my next software engineering role.',
    author_seeking_job: true,
    author_based_in_india: true,
    location_evidence: 'Bengaluru, Karnataka, India',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking engineer based in Bengaluru, Karnataka, India with 4 years experience. Any role and sector accepted.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: { passed: true, evidence: 'Actively looking for next software engineering role.' },
      currentlyEmployedInSalesRole: { passed: true, evidence: 'Fullstack Engineer (React & Node.js). Any role accepted.' },
      currentlyWorkingInIndia: { passed: true, evidence: 'Bengaluru, Karnataka, India.' },
      totalExperience1To10Years: { passed: true, evidence: '4 years experience stated in post.', experienceType: 'stated' },
      currentEmployerInTargetSector: { passed: true, evidence: 'FinTechWorks. Any sector accepted.' },
      postDateWithinSelectedPeriod: { passed: true, evidence: 'Posted Oct 4, 2026.' },
      author_seeking_job: true,
      author_based_in_india: true,
      currentCity: 'Bengaluru',
      currentStateOrUT: 'Karnataka',
    },
    sourcePostIds: ['post_demo_09_engineer'],
    firstSeenAt: '2026-10-04T08:35:00.000Z',
    lastUpdatedAt: '2026-10-04T08:35:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 8. Ankit Joshi - Operations & Supply Chain in Pune (Matches Criteria)
  {
    id: 'cand_demo_10_operations',
    name: 'Ankit Joshi',
    currentOrPreviousRole: 'Operations & Supply Chain Manager',
    employer: 'LogiCore Distribution',
    sector: 'manufacturing',
    currentWorkLocation: 'Pune, Maharashtra, India',
    currentCity: 'Pune',
    currentStateOrUT: 'Maharashtra',
    industry: 'Supply Chain & Logistics',
    salesExperienceSummary: null,
    totalExperienceYears: 5,
    experienceType: 'stated',
    preferredLocation: 'Pune, India',
    jobSeekingStatement: 'Exploring new career opportunities in supply chain operations.',
    statedAvailability: '30 days',
    originalPostDate: '2026-10-04T09:15:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000010',
    profileUrl: 'https://www.linkedin.com/in/ankit-joshi-ops',
    email: 'ankit.ops@mailhub.in',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/ankit-joshi-ops',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Exploring new career opportunities in supply chain operations.',
    author_seeking_job: true,
    author_based_in_india: true,
    location_evidence: 'Pune, Maharashtra, India',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking operations manager based in Pune, Maharashtra, India with 5 years experience. Any role and sector accepted.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: { passed: true, evidence: 'Exploring new career opportunities.' },
      currentlyEmployedInSalesRole: { passed: true, evidence: 'Operations Manager. Any role accepted.' },
      currentlyWorkingInIndia: { passed: true, evidence: 'Pune, Maharashtra, India.' },
      totalExperience1To10Years: { passed: true, evidence: '5 years experience stated in post.', experienceType: 'stated' },
      currentEmployerInTargetSector: { passed: true, evidence: 'LogiCore Distribution. Any sector accepted.' },
      postDateWithinSelectedPeriod: { passed: true, evidence: 'Posted Oct 4, 2026.' },
      author_seeking_job: true,
      author_based_in_india: true,
      currentCity: 'Pune',
      currentStateOrUT: 'Maharashtra',
    },
    sourcePostIds: ['post_demo_10_operations'],
    firstSeenAt: '2026-10-04T09:20:00.000Z',
    lastUpdatedAt: '2026-10-04T09:20:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 9. Sneha Iyer - Digital Marketing in Mumbai (Matches Criteria)
  {
    id: 'cand_demo_11_marketing',
    name: 'Sneha Iyer',
    currentOrPreviousRole: 'Growth Marketing Manager',
    employer: 'BrandScale India',
    sector: 'FMCG',
    currentWorkLocation: 'Mumbai, Maharashtra, India',
    currentCity: 'Mumbai',
    currentStateOrUT: 'Maharashtra',
    industry: 'Marketing & Advertising',
    salesExperienceSummary: null,
    totalExperienceYears: 4,
    experienceType: 'stated',
    preferredLocation: 'Mumbai, India',
    jobSeekingStatement: 'Seeking a new role in growth marketing! #OpenToWork',
    statedAvailability: '30 days',
    originalPostDate: '2026-10-04T10:00:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000011',
    profileUrl: 'https://www.linkedin.com/in/sneha-iyer-growth',
    email: 'sneha.mkt@inboxmail.in',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/sneha-iyer-growth',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Seeking a new role in growth marketing!',
    author_seeking_job: true,
    author_based_in_india: true,
    location_evidence: 'Mumbai, Maharashtra, India',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking growth marketer based in Mumbai, Maharashtra, India with 4 years experience. Any role and sector accepted.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: { passed: true, evidence: 'Seeking a new role in growth marketing.' },
      currentlyEmployedInSalesRole: { passed: true, evidence: 'Growth Marketing Manager. Any role accepted.' },
      currentlyWorkingInIndia: { passed: true, evidence: 'Mumbai, Maharashtra, India.' },
      totalExperience1To10Years: { passed: true, evidence: '4 years experience stated in post.', experienceType: 'stated' },
      currentEmployerInTargetSector: { passed: true, evidence: 'BrandScale India. Any sector accepted.' },
      postDateWithinSelectedPeriod: { passed: true, evidence: 'Posted Oct 4, 2026.' },
      author_seeking_job: true,
      author_based_in_india: true,
      currentCity: 'Mumbai',
      currentStateOrUT: 'Maharashtra',
    },
    sourcePostIds: ['post_demo_11_marketing'],
    firstSeenAt: '2026-10-04T10:05:00.000Z',
    lastUpdatedAt: '2026-10-04T10:05:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 10. Manish Aggarwal - Finance & Accounting in Delhi (Matches Criteria)
  {
    id: 'cand_demo_12_finance',
    name: 'Manish Aggarwal',
    currentOrPreviousRole: 'Senior Financial Analyst',
    employer: 'Apex Capital Advisors',
    sector: 'fintech',
    currentWorkLocation: 'New Delhi, Delhi, India',
    currentCity: 'Delhi',
    currentStateOrUT: 'Delhi',
    industry: 'Financial Services',
    salesExperienceSummary: null,
    totalExperienceYears: 6,
    experienceType: 'stated',
    preferredLocation: 'Delhi NCR, India',
    jobSeekingStatement: 'I am looking for a new opportunity in financial planning and corporate accounts in Delhi NCR.',
    statedAvailability: 'Open to discussions',
    originalPostDate: '2026-10-04T11:45:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000012',
    profileUrl: 'https://www.linkedin.com/in/manish-aggarwal-fin',
    email: 'manish.aggarwal@inboxmail.in',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/manish-aggarwal-fin',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'I am looking for a new opportunity in financial planning and corporate accounts.',
    author_seeking_job: true,
    author_based_in_india: true,
    location_evidence: 'New Delhi, Delhi, India',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking financial analyst based in New Delhi, India with 6 years experience. Any role and sector accepted.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: { passed: true, evidence: 'Looking for a new opportunity in financial planning.' },
      currentlyEmployedInSalesRole: { passed: true, evidence: 'Senior Financial Analyst. Any role accepted.' },
      currentlyWorkingInIndia: { passed: true, evidence: 'New Delhi, Delhi, India.' },
      totalExperience1To10Years: { passed: true, evidence: '6 years experience stated in post.', experienceType: 'stated' },
      currentEmployerInTargetSector: { passed: true, evidence: 'Apex Capital Advisors. Any sector accepted.' },
      postDateWithinSelectedPeriod: { passed: true, evidence: 'Posted Oct 4, 2026.' },
      author_seeking_job: true,
      author_based_in_india: true,
      currentCity: 'Delhi',
      currentStateOrUT: 'Delhi',
    },
    sourcePostIds: ['post_demo_12_finance'],
    firstSeenAt: '2026-10-04T11:50:00.000Z',
    lastUpdatedAt: '2026-10-04T11:50:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 11. Preeti Saxena - HR Specialist in Gurgaon (Matches Criteria)
  {
    id: 'cand_demo_13_hr',
    name: 'Preeti Saxena',
    currentOrPreviousRole: 'Human Resources Generalist',
    employer: 'TalentPeak Solutions',
    sector: 'hospitality',
    currentWorkLocation: 'Gurgaon, Haryana, India',
    currentCity: 'Gurgaon',
    currentStateOrUT: 'Haryana',
    industry: 'Human Resources',
    salesExperienceSummary: null,
    totalExperienceYears: 3,
    experienceType: 'stated',
    preferredLocation: 'Delhi NCR or Remote India',
    jobSeekingStatement: 'Open to work as HR Generalist or Talent Partner in Delhi NCR or remote India.',
    statedAvailability: 'Immediate Joiner',
    originalPostDate: '2026-10-04T12:10:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000013',
    profileUrl: 'https://www.linkedin.com/in/preeti-saxena-hr',
    email: 'preeti.hr@workmail.in',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/preeti-saxena-hr',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Open to work as HR Generalist or Talent Partner.',
    author_seeking_job: true,
    author_based_in_india: true,
    location_evidence: 'Gurgaon, Haryana, India',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking HR professional based in Gurgaon, Haryana, India with 3 years experience. Any role and sector accepted.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: { passed: true, evidence: 'Open to work as HR Generalist.' },
      currentlyEmployedInSalesRole: { passed: true, evidence: 'HR Generalist. Any role accepted.' },
      currentlyWorkingInIndia: { passed: true, evidence: 'Gurgaon, Haryana, India.' },
      totalExperience1To10Years: { passed: true, evidence: '3 years experience stated in post.', experienceType: 'stated' },
      currentEmployerInTargetSector: { passed: true, evidence: 'TalentPeak Solutions. Any sector accepted.' },
      postDateWithinSelectedPeriod: { passed: true, evidence: 'Posted Oct 4, 2026.' },
      author_seeking_job: true,
      author_based_in_india: true,
      currentCity: 'Gurgaon',
      currentStateOrUT: 'Haryana',
    },
    sourcePostIds: ['post_demo_13_hr'],
    firstSeenAt: '2026-10-04T12:15:00.000Z',
    lastUpdatedAt: '2026-10-04T12:15:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },

  // 12. Vikram Rao - Data Analyst in Hyderabad (Matches Criteria)
  {
    id: 'cand_demo_14_data',
    name: 'Vikram Rao',
    currentOrPreviousRole: 'Data Analyst (SQL & BI)',
    employer: 'InsightMatrix Analytics',
    sector: 'technology sales',
    currentWorkLocation: 'Hyderabad, Telangana, India',
    currentCity: 'Hyderabad',
    currentStateOrUT: 'Telangana',
    industry: 'Data & Analytics',
    salesExperienceSummary: null,
    totalExperienceYears: 3,
    experienceType: 'stated',
    preferredLocation: 'Hyderabad, India',
    jobSeekingStatement: 'Seeking my next role as a Data Analyst in Hyderabad or remote.',
    statedAvailability: 'Immediate Joiner',
    originalPostDate: '2026-10-04T13:00:00.000Z',
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7247000014',
    profileUrl: 'https://www.linkedin.com/in/vikram-rao-data',
    email: 'vikram.rao.data@analystmail.in',
    phone: null,
    profileUrlOrTelegramId: 'https://www.linkedin.com/in/vikram-rao-data',
    authorIntent: 'SELF_JOB_SEEKING',
    intentEvidence: 'Seeking my next role as a Data Analyst in Hyderabad or remote.',
    author_seeking_job: true,
    author_based_in_india: true,
    location_evidence: 'Hyderabad, Telangana, India',
    criteriaTag: 'Matches Criteria',
    matchingExplanation:
      'Confirmed Match: Self job-seeking data analyst based in Hyderabad, Telangana, India with 3 years experience. Any role and sector accepted.',
    isRecruiterAd: false,
    validationChecks: {
      authorIsPersonallySeekingJob: { passed: true, evidence: 'Seeking my next role as a Data Analyst.' },
      currentlyEmployedInSalesRole: { passed: true, evidence: 'Data Analyst (SQL & BI). Any role accepted.' },
      currentlyWorkingInIndia: { passed: true, evidence: 'Hyderabad, Telangana, India.' },
      totalExperience1To10Years: { passed: true, evidence: '3 years experience stated in post.', experienceType: 'stated' },
      currentEmployerInTargetSector: { passed: true, evidence: 'InsightMatrix Analytics. Any sector accepted.' },
      postDateWithinSelectedPeriod: { passed: true, evidence: 'Posted Oct 4, 2026.' },
      author_seeking_job: true,
      author_based_in_india: true,
      currentCity: 'Hyderabad',
      currentStateOrUT: 'Telangana',
    },
    sourcePostIds: ['post_demo_14_data'],
    firstSeenAt: '2026-10-04T13:05:00.000Z',
    lastUpdatedAt: '2026-10-04T13:05:00.000Z',
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
  },
];

export const initialScanRuns: ScanRun[] = [
  {
    id: 'run_verify_canonical',
    runAt: '2026-10-03T19:10:00.000Z',
    triggerType: 'find_candidates',
    mode: 'demo',
    receivedPostsCount: 8,
    extractedCandidatesCount: 3,
    rejectedPostsCount: 2,
    duplicatesFoundCount: 0,
    failuresCount: 0,
    durationMs: 3450,
    status: 'success',
    message:
      '[Demo Sandbox] Verification run completed: 8 posts ingested, 2 rejected (recruiter ad & unrelated), 3 matched criteria, 1 needing review, 2 outside target.',
    queryConfig: {
      timeWindow: '7d',
      limit: 20,
      postedLimit: 'week',
      maxPosts: 20,
    },
  },
];

export function getInitialDemoDatabase(): AppDatabase {
  return {
    candidates: JSON.parse(JSON.stringify(initialSampleCandidates)),
    posts: JSON.parse(JSON.stringify(initialSamplePosts)),
    scanRuns: JSON.parse(JSON.stringify(initialScanRuns)),
    criteria: JSON.parse(JSON.stringify(initialCriteriaFilters)),
    schedule: JSON.parse(JSON.stringify(initialScheduleSettings)),
    connections: JSON.parse(JSON.stringify(initialConnectionsConfig)),
  };
}

import { OutreachSettings } from '../types/index.ts';

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  senderName: 'BFSITalentHub',
  senderEmail: 'recruitment@bfsitalenthub.in',
  replyToEmail: 'careers@bfsitalenthub.in',
  provider: 'test_mode',
  smtpConfig: {
    host: 'smtp.mailtrap.io',
    port: 587,
    secure: false,
    auth: {
      user: '',
      pass: '',
    },
  },
  apiConfig: {
    apiKey: '',
  },
  organizationDescription:
    'BFSITalentHub is a premier talent discovery and placement network connecting banking, financial services, fintech, and commercial sales professionals with leading institutions across India.',
  rolesBeingSourced:
    'Commercial Sales, Branch Banking, Loan Officers, B2B Account Executives, Wealth Advisors, and Territory Sales Managers',
  emailSubjectTemplate: 'Explore opportunities in [relevant role area]',
  emailBodyTemplate: `Hi [First Name / there],

I came across your [source platform] post mentioning that you are exploring new opportunities in [verified role area].

We are collecting expressions of interest for [configured recruitment scope]. If you would like to be considered for relevant opportunities, please share your details through the link below:

[Candidate-specific form link]

Our recruitment team will review your details and may contact you where there is a suitable match.

This is an automated invitation. Please submit your details through the form.

Regards,
[Configured sender name]

If you do not wish to receive further recruitment emails from us, you can opt out here: [unsubscribe link]`,
  dailySendingLimit: 50,
  delayBetweenEmailsSeconds: 5,
  automaticOutreachEnabled: false, // Strictly OFF initially
  testMode: true, // Safe test mode default
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
};

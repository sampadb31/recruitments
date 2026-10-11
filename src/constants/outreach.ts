import { OutreachSettings } from '../types/index.ts';

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  senderName: 'BFSITalentHub',
  senderEmail: 'bfsitalenthub@gmail.com',
  replyToEmail: 'bfsitalenthub@gmail.com',
  provider: 'gmail_workspace',
  googleFormUrl: '', // Defaults to the active built-in /apply Expression of Interest portal
  sendingMode: 'auto_send', // Automatically dispatch outreach for matched candidates with email
  gmailConnected: false,
  gmailConnectedEmail: 'bfsitalenthub@gmail.com',
  gmailConnectedAt: null,
  smtpConfig: {
    host: 'smtp.mailtrap.io',
    port: 587,
    secure: false,
    auth: {
      user: '',
      pass: '',
    },
  },
  organizationDescription:
    'BFSITalentHub is a premier recruitment and talent discovery network connecting banking, financial services, fintech, and commercial sales professionals with leading institutions across India.',
  rolesBeingSourced:
    'Commercial Sales, Branch Banking, Loan Officers, B2B Account Executives, Wealth Advisors, and Territory Sales Managers',
  emailSubjectTemplate: 'Oppourtunity in banking',
  emailBodyTemplate: `Hi [First Name / there],

I came across your LinkedIn post about seeking a job opportunity.

BFSITalentHub is inviting expressions of interest for various career opportunities with a reputed bank.

If you’d like to be considered for relevant opportunities, please submit your details through this form:
[Google Form Registration Link]

Our recruitment team will review your submission and may contact you if a suitable opportunity becomes available.

This is an automated invitation. Please submit your details through the form.

Regards,
BFSITalentHub

If you do not wish to receive further recruitment emails from us, you can opt out here: [unsubscribe link]`,
  dailySendingLimit: 50,
  delayBetweenEmailsSeconds: 5,
  automaticOutreachEnabled: true,
  testMode: false,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
  lastTestRecipient: 'bfsitalenthub@gmail.com',
};

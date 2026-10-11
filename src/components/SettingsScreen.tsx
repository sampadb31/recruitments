import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Sliders,
  Clock,
  Sparkles,
  ShieldCheck,
  Send,
  Linkedin,
  Save,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  Play,
  Pause,
  Key,
  ExternalLink,
  MapPin,
  Building,
  Mail,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  FileCheck2,
  AlertCircle,
} from 'lucide-react';
import { AppDatabase, CriteriaFilters, ScheduleSettings, OutreachSettings, ApifyDiagnostics } from '../types/index.ts';
import { connectGmailWithOAuth, disconnectGmailSession } from '../lib/firebaseAuth.ts';

interface SettingsScreenProps {
  data: AppDatabase;
  mode: 'demo' | 'live';
  onUpdateSettings: (updates: {
    criteria?: Partial<CriteriaFilters>;
    schedule?: Partial<ScheduleSettings>;
    connections?: any;
    outreachSettings?: Partial<OutreachSettings>;
  }) => Promise<void>;
  geminiConfigured: boolean;
  apifyConfigured?: boolean;
  apifyDiagnostics?: ApifyDiagnostics | null;
  onRefreshStatus?: () => Promise<void>;
  showToast?: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  data,
  mode,
  onUpdateSettings,
  geminiConfigured,
  apifyConfigured,
  apifyDiagnostics,
  onRefreshStatus,
  showToast = () => {},
}) => {
  const { criteria, schedule, connections, outreachSettings } = data;

  // Active section tab in Settings
  const [activeSection, setActiveSection] = useState<'outreach' | 'criteria' | 'harvesting'>('outreach');

  // Criteria form state
  const [minExp, setMinExp] = useState(criteria.minExperienceYears || 1);
  const [maxExp, setMaxExp] = useState(criteria.maxExperienceYears || 10);
  const [excludeSenior, setExcludeSenior] = useState(criteria.excludeSeniorLeadership ?? true);
  const [strictAds, setStrictAds] = useState(criteria.strictRecruiterAdFiltering ?? true);
  const [allowBanking, setAllowBanking] = useState(criteria.allowBankingIndustry ?? true);
  const [matchAnySector, setMatchAnySector] = useState(criteria.matchAnySector ?? true);
  const [matchAnyRole, setMatchAnyRole] = useState(criteria.matchAnyRole ?? true);
  const [targetCountry, setTargetCountry] = useState(criteria.targetCountry || 'India');

  const [keywordsList, setKeywordsList] = useState<string[]>(criteria.requiredKeywords || []);
  const [newKeyword, setNewKeyword] = useState('');

  // Schedule state
  const [scheduledTimes, setScheduledTimes] = useState<string[]>(schedule.scheduledTimes);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [isPaused, setIsPaused] = useState(schedule.isPaused);

  // Outreach Settings form state
  const [senderName, setSenderName] = useState(outreachSettings?.senderName || 'BFSITalentHub');
  const [senderEmail, setSenderEmail] = useState(outreachSettings?.senderEmail || 'bfsitalenthub@gmail.com');
  const [replyToEmail, setReplyToEmail] = useState(outreachSettings?.replyToEmail || 'bfsitalenthub@gmail.com');
  const [googleFormUrl, setGoogleFormUrl] = useState(
    outreachSettings?.googleFormUrl === 'https://forms.gle/bfsitalenthub' ? '' : (outreachSettings?.googleFormUrl || '')
  );
  const [sendingMode, setSendingMode] = useState<'require_approval' | 'auto_send'>(
    outreachSettings?.sendingMode || 'auto_send'
  );
  const [subjectTemplate, setSubjectTemplate] = useState(
    outreachSettings?.emailSubjectTemplate || 'Oppourtunity in banking'
  );
  const [bodyTemplate, setBodyTemplate] = useState(
    outreachSettings?.emailBodyTemplate || ''
  );
  const [dailyLimit, setDailyLimit] = useState(outreachSettings?.dailySendingLimit || 50);
  const [delaySeconds, setDelaySeconds] = useState(outreachSettings?.delayBetweenEmailsSeconds || 5);
  const [testMode, setTestMode] = useState(outreachSettings?.testMode || false);

  // Email Delivery Method (Gmail OAuth vs Google App Password / SMTP)
  const [outreachProvider, setOutreachProvider] = useState<'gmail_workspace' | 'smtp'>(
    outreachSettings?.provider === 'smtp' ? 'smtp' : 'gmail_workspace'
  );
  const [smtpUser, setSmtpUser] = useState(outreachSettings?.smtpConfig?.auth?.user || 'bfsitalenthub@gmail.com');
  const [smtpPass, setSmtpPass] = useState(outreachSettings?.smtpConfig?.auth?.pass || '');
  const [isSendingSmtpTest, setIsSendingSmtpTest] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Gmail OAuth Connection state
  const isGmailConnected = Boolean(outreachSettings?.gmailConnected);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [gmailAuthError, setGmailAuthError] = useState<string | null>(null);

  // Test Email state
  const [testRecipient, setTestRecipient] = useState(
    outreachSettings?.lastTestRecipient || outreachSettings?.gmailConnectedEmail || 'bfsitalenthub@gmail.com'
  );
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    messageId?: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // Apify Verification state
  const [isVerifyingApify, setIsVerifyingApify] = useState(false);
  const [apifyVerificationResult, setApifyVerificationResult] = useState<{
    tested: boolean;
    success: boolean;
    username?: string;
    email?: string;
    plan?: string;
    error?: string;
  } | null>(null);

  const handleVerifyApify = async () => {
    setIsVerifyingApify(true);
    setApifyVerificationResult(null);
    try {
      const res = await fetch('/api/apify/verify');
      const data = await res.json();
      if (data.configured) {
        setApifyVerificationResult({
          tested: true,
          success: true,
          username: data.user?.username,
          email: data.user?.email,
          plan: data.user?.plan,
        });
        showToast('Apify authentication succeeded!', 'success');
      } else {
        setApifyVerificationResult({
          tested: true,
          success: false,
          error: data.error || 'Failed to authenticate with Apify token',
        });
        showToast(data.error || 'Apify authentication failed', 'error');
      }
      if (onRefreshStatus) {
        await onRefreshStatus();
      }
    } catch (err: any) {
      setApifyVerificationResult({
        tested: true,
        success: false,
        error: err.message || 'Network request failed',
      });
      showToast('Error verifying Apify token', 'error');
    } finally {
      setIsVerifyingApify(false);
    }
  };
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSchedulerCmd, setCopiedSchedulerCmd] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Add keyword
  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywordsList.includes(newKeyword.trim().toLowerCase())) {
      setKeywordsList([...keywordsList, newKeyword.trim().toLowerCase()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (kw: string) => {
    setKeywordsList(keywordsList.filter(k => k !== kw));
  };

  // Connect Gmail with Google OAuth 2.0
  const handleConnectGmail = async () => {
    setIsConnectingGmail(true);
    setGmailAuthError(null);
    try {
      const result = await connectGmailWithOAuth();
      showToast(`Gmail account ${result.email} connected with gmail.send permission!`, 'success');
      setSenderEmail('bfsitalenthub@gmail.com');
      setReplyToEmail('bfsitalenthub@gmail.com');
      setTestRecipient('bfsitalenthub@gmail.com');

      await onUpdateSettings({
        outreachSettings: {
          gmailConnected: true,
          gmailConnectedEmail: result.email,
          senderEmail: 'bfsitalenthub@gmail.com',
          replyToEmail: 'bfsitalenthub@gmail.com',
        },
      });
    } catch (err: any) {
      console.error(err);
      setGmailAuthError(err.message || 'Failed to authenticate with Google OAuth.');
      showToast(err.message || 'Google OAuth failed', 'error');
    } finally {
      setIsConnectingGmail(false);
    }
  };

  // Disconnect Gmail
  const handleDisconnectGmail = async () => {
    if (!window.confirm('Disconnect your Gmail account? You will need to re-authenticate to send recruitment emails.')) return;
    try {
      await disconnectGmailSession();
      await onUpdateSettings({
        outreachSettings: {
          gmailConnected: false,
          gmailConnectedEmail: null,
          gmailConnectedAt: null,
        },
      });
      showToast('Gmail account disconnected.', 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Send Test Email via Gmail API
  const handleSendTestEmail = async () => {
    if (!isGmailConnected) {
      showToast('Please connect your Gmail account before sending a test email.', 'error');
      return;
    }

    if (!testRecipient || !testRecipient.includes('@')) {
      showToast('Please enter a valid recipient email address.', 'error');
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/gmail/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: testRecipient.trim(),
          mode,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to send test email via Gmail API.');
      }

      setTestResult({
        success: true,
        message: `Verified: Test email delivered via Gmail API! Message ID: ${body.messageId}`,
        messageId: body.messageId,
      });
      showToast(`Test email successfully delivered to ${testRecipient}!`, 'success');
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Test email failed.',
      });
      showToast(err.message, 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Test Email via Gmail SMTP / Google App Password
  const handleTestSmtp = async () => {
    if (!smtpPass || !smtpPass.trim()) {
      showToast('Please enter your 16-character Google App Password first.', 'error');
      return;
    }
    setIsSendingSmtpTest(true);
    setSmtpTestResult(null);
    try {
      const res = await fetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          targetEmail: testRecipient || 'bfsitalenthub@gmail.com',
          user: smtpUser || senderEmail || 'bfsitalenthub@gmail.com',
          pass: smtpPass.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gmail SMTP test failed.');
      setSmtpTestResult({
        success: true,
        message: data.message || `Verified: Real test email sent to ${testRecipient}! Check your Sent folder and inbox.`,
      });
      showToast(`Verified: Real test email sent to ${testRecipient}!`, 'success');
      if (onRefreshStatus) await onRefreshStatus();
    } catch (err: any) {
      setSmtpTestResult({
        success: false,
        message: err.message || 'Gmail SMTP test failed.',
      });
      showToast(err.message, 'error');
    } finally {
      setIsSendingSmtpTest(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await onUpdateSettings({
        criteria: {
          minExperienceYears: minExp,
          maxExperienceYears: maxExp,
          excludeSeniorLeadership: excludeSenior,
          strictRecruiterAdFiltering: strictAds,
          targetCountry,
          allowBankingIndustry: allowBanking,
          matchAnySector,
          matchAnyRole,
          requiredKeywords: keywordsList,
          excludedIndustries: allowBanking ? [] : ['banking', 'financial services'],
        },
        schedule: {
          scheduledTimes,
          timezone,
          isPaused,
        },
        outreachSettings: {
          provider: outreachProvider,
          senderName,
          senderEmail,
          replyToEmail,
          googleFormUrl,
          sendingMode,
          emailSubjectTemplate: subjectTemplate,
          emailBodyTemplate: bodyTemplate,
          dailySendingLimit: dailyLimit,
          delayBetweenEmailsSeconds: delaySeconds,
          testMode,
          smtpConfig: {
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
              user: smtpUser || senderEmail || 'bfsitalenthub@gmail.com',
              pass: smtpPass.trim(),
            },
          },
        },
      });

      setSaveSuccess(true);
      showToast('Settings successfully updated.', 'success');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      showToast('Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const currentOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-dev-yt5l4dk4wihdl7guwdo27a-753012129268.asia-southeast1.run.app';

  const schedulerEndpoint = `${currentOrigin}/api/jobs/scheduled-scan`;

  const sampleGcloudCommand = `gcloud scheduler jobs create http recruitment-collector-scan \\
  --schedule="0 9,18 * * *" \\
  --time-zone="${timezone}" \\
  --uri="${schedulerEndpoint}" \\
  --http-method=POST \\
  --headers="Authorization=Bearer ${schedule.cronSecret}"`;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-blue-400" />
            <span>Settings & Integration Configuration</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure Gmail API OAuth 2.0 outreach, candidate qualification rules, and automated scan schedules.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-4 rounded-xl text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Settings successfully updated across database and outreach processors.</span>
        </div>
      )}

      {/* Section Sub-Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSection('outreach')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSection === 'outreach'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Gmail & Outreach Settings</span>
          {isGmailConnected && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
        </button>

        <button
          onClick={() => setActiveSection('criteria')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSection === 'criteria'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Candidate Criteria Filters</span>
        </button>

        <button
          onClick={() => setActiveSection('harvesting')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSection === 'harvesting'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Linkedin className="w-4 h-4" />
          <span>Apify Harvesting & Scheduler</span>
        </button>
      </div>

      {/* SECTION 1: GMAIL API & OUTREACH SETTINGS */}
      {activeSection === 'outreach' && (
        <div className="space-y-6">
          {/* Card A: Connect Gmail Account with Google OAuth 2.0 OR Google App Password (SMTP) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-500/20 to-blue-500/20 border border-red-500/30 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>Recruiter Gmail Email Integration</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Send real recruitment emails directly from <code className="text-indigo-300 font-mono">bfsitalenthub@gmail.com</code> to candidate inboxes.
                  </p>
                </div>
              </div>

              {/* Provider Selection Tabs */}
              <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setOutreachProvider('smtp')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    outreachProvider === 'smtp'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Google App Password (Direct / 100% Reliable)
                </button>
                <button
                  type="button"
                  onClick={() => setOutreachProvider('gmail_workspace')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    outreachProvider === 'gmail_workspace'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  OAuth 2.0 Popup
                </button>
              </div>
            </div>

            {/* Provider Option 1: Google App Password / SMTP */}
            {outreachProvider === 'smtp' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/60 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center space-x-2 text-blue-300 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    <span>Direct Gmail Delivery via Google App Password</span>
                  </div>
                  <p className="leading-relaxed text-slate-400">
                    Because preview environments can have dynamic URLs not yet listed in Google Cloud OAuth authorized domains, a <strong>Google App Password</strong> allows the server to connect directly to Google's official mail servers (<code className="text-indigo-300 font-mono">smtp.gmail.com:465</code>). All sent emails are guaranteed to reach recipients and will appear immediately in your Gmail <strong>Sent</strong> box.
                  </p>
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1">
                    <span className="font-semibold text-white block">How to get your 16-character Google App Password (takes 30 seconds):</span>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                      <li>Log in to your Google Account (<span className="text-white font-mono">bfsitalenthub@gmail.com</span>) and go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-400 underline font-mono">myaccount.google.com/apppasswords</a></li>
                      <li>Name the app <strong className="text-white">BFSITalentHub</strong> and click <strong>Create</strong></li>
                      <li>Copy the 16-letter code and paste it below.</li>
                    </ol>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">
                      Sender Gmail Address
                    </label>
                    <input
                      type="email"
                      value={smtpUser}
                      onChange={e => setSmtpUser(e.target.value)}
                      placeholder="bfsitalenthub@gmail.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">
                      16-Character Google App Password
                    </label>
                    <input
                      type="password"
                      value={smtpPass}
                      onChange={e => setSmtpPass(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Held securely in backend storage for candidate outreach.</span>
                  </div>
                </div>

                {/* SMTP Test Dispatch */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <FileCheck2 className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Send Test Email via Gmail SMTP
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Dispatches a real email directly through Google SMTP to verify your App Password and confirm delivery.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <input
                      type="email"
                      placeholder="Recipient email (e.g. bfsitalenthub@gmail.com)"
                      value={testRecipient}
                      onChange={e => setTestRecipient(e.target.value)}
                      className="w-full sm:w-80 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />

                    <button
                      type="button"
                      onClick={handleTestSmtp}
                      disabled={isSendingSmtpTest}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                    >
                      {isSendingSmtpTest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-white" />
                      )}
                      <span>{isSendingSmtpTest ? 'Sending via Gmail...' : 'Send Test Email via Gmail'}</span>
                    </button>
                  </div>

                  {smtpTestResult && (
                    <div
                      className={`p-3 rounded-lg border text-xs ${
                        smtpTestResult.success
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 font-mono'
                          : 'bg-rose-950/60 border-rose-800 text-rose-300'
                      }`}
                    >
                      {smtpTestResult.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Provider Option 2: OAuth 2.0 Popup */}
            {outreachProvider === 'gmail_workspace' && (
              <div className="space-y-4">
                {gmailAuthError && (
                  <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Authentication Notice:</span>
                      <p className="mt-0.5 leading-relaxed">{gmailAuthError}</p>
                    </div>
                  </div>
                )}

                {/* Connection Actions */}
                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-3">
                  {!isGmailConnected ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-semibold text-white block">
                          Connect Your Recruiter Gmail Account
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Authenticates securely via Google OAuth 2.0 with scope <code className="text-indigo-300 font-mono">https://www.googleapis.com/auth/gmail.send</code>.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleConnectGmail}
                        disabled={isConnectingGmail}
                        className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-medium text-xs shadow-md transition disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {isConnectingGmail ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                            />
                          </svg>
                        )}
                        <span>{isConnectingGmail ? 'Authenticating...' : 'Connect Gmail'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-400">Authorized Recruiter Email:</span>
                          <span className="text-sm font-bold text-emerald-400 font-mono">
                            {outreachSettings?.gmailConnectedEmail || senderEmail}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Permission Active: <code className="text-indigo-300 font-mono">https://www.googleapis.com/auth/gmail.send</code>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleDisconnectGmail}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shrink-0"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect Gmail</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Test Email Verification Feature */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <FileCheck2 className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Test Email Verification (Gmail API)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Send a test email through your connected OAuth session to verify API permissions.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <input
                      type="email"
                      placeholder="Enter recipient email (e.g. bfsitalenthub@gmail.com)"
                      value={testRecipient}
                      onChange={e => setTestRecipient(e.target.value)}
                      className="w-full sm:w-80 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />

                    <button
                      type="button"
                      onClick={handleSendTestEmail}
                      disabled={isSendingTest || !isGmailConnected}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                    >
                      {isSendingTest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-white" />
                      )}
                      <span>{isSendingTest ? 'Sending Test Email...' : 'Send Test Email via Gmail API'}</span>
                    </button>
                  </div>

                  {testResult && (
                    <div
                      className={`p-3 rounded-lg border text-xs ${
                        testResult.success
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 font-mono'
                          : 'bg-rose-950/60 border-rose-800 text-rose-300'
                      }`}
                    >
                      {testResult.message}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Card B: Sending Mode & Google Form Link */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Approval Workflow & Automatic Sending Mode */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center space-x-2">
                <Lock className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Sending Mode & Recruiter Approval</h3>
              </div>
              <p className="text-xs text-slate-400">
                Choose whether emails require explicit recruiter approval prior to sending or send automatically.
              </p>

              <div className="space-y-3 text-xs">
                {/* Require Approval (Default) */}
                <label
                  className={`flex items-start p-3.5 rounded-xl border cursor-pointer transition ${
                    sendingMode === 'require_approval'
                      ? 'bg-blue-950/50 border-blue-600 ring-1 ring-blue-500'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="sendingMode"
                    value="require_approval"
                    checked={sendingMode === 'require_approval'}
                    onChange={() => setSendingMode('require_approval')}
                    className="w-4 h-4 text-blue-600 mt-0.5 mr-3 cursor-pointer"
                  />
                  <div>
                    <span className="font-semibold text-white block">
                      Require Recruiter Approval (Default / Recommended)
                    </span>
                    <p className="text-slate-400 mt-0.5 text-[11px] leading-relaxed">
                      All candidate emails start in <strong>Draft</strong> status. Recruiter reviews and approves each email before it can be dispatched via Gmail.
                    </p>
                  </div>
                </label>

                {/* Controlled Automatic Sending */}
                <label
                  className={`flex items-start p-3.5 rounded-xl border cursor-pointer transition ${
                    sendingMode === 'auto_send'
                      ? 'bg-indigo-950/50 border-indigo-600 ring-1 ring-indigo-500'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="sendingMode"
                    value="auto_send"
                    checked={sendingMode === 'auto_send'}
                    onChange={() => setSendingMode('auto_send')}
                    className="w-4 h-4 text-indigo-600 mt-0.5 mr-3 cursor-pointer"
                  />
                  <div>
                    <span className="font-semibold text-white block">
                      Controlled Automatic Sending (After Testing)
                    </span>
                    <p className="text-slate-400 mt-0.5 text-[11px] leading-relaxed">
                      Eligible candidate emails can be dispatched automatically upon collection using the rate limits and daily limits configured below.
                    </p>
                  </div>
                </label>
              </div>

              {/* Rate Limits */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Daily Sending Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={dailyLimit}
                    onChange={e => setDailyLimit(parseInt(e.target.value, 10) || 50)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                  <span className="text-[10px] text-slate-500">Max emails per 24 hours</span>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Delay Between Sends (Seconds)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={delaySeconds}
                    onChange={e => setDelaySeconds(parseInt(e.target.value, 10) || 5)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                  <span className="text-[10px] text-slate-500">Throttles Gmail API calls</span>
                </div>
              </div>
            </div>

            {/* Google Form Link & Sender Identity */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center space-x-2">
                <ExternalLink className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Google Form Registration Link & Identity</h3>
              </div>
              <p className="text-xs text-slate-400">
                The Google Form link inserted into candidate outreach emails for candidate response collection.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold block">
                      Google Form Registration URL
                    </label>
                    <a
                      href="/apply"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                    >
                      <span>Preview In-App Form</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="url"
                    placeholder="https://docs.google.com/forms/d/e/... or https://forms.gle/..."
                    value={googleFormUrl}
                    onChange={e => setGoogleFormUrl(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Paste your active Google Form link. If left default or blank, candidate emails automatically use the built-in candidate registration portal (<code className="text-indigo-300 font-mono">/apply</code>), guaranteeing links never 404.
                  </p>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Recruiter Display Name
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={e => setSenderName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Reply-To Email Address
                  </label>
                  <input
                    type="email"
                    value={replyToEmail}
                    onChange={e => setReplyToEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card C: Personalized Email Template Editor */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Personalized Email Template</h3>
            </div>
            <p className="text-xs text-slate-400">
              Personalized dynamically using the candidate's name, job-seeking information, and relevant role.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Subject Template</label>
                <input
                  type="text"
                  value={subjectTemplate}
                  onChange={e => setSubjectTemplate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Body Template</label>
                <textarea
                  rows={9}
                  value={bodyTemplate}
                  onChange={e => setBodyTemplate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white font-sans leading-relaxed whitespace-pre-wrap"
                />
              </div>

              {/* Template Tokens */}
              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300 block mb-1">Available Template Tokens:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '[First Name / there]',
                    '[verified role area]',
                    '[experience mention]',
                    '[configured recruitment scope]',
                    '[Google Form Registration Link]',
                    '[Configured sender name]',
                    '[sender email]',
                    '[unsubscribe link]',
                  ].map(t => (
                    <code key={t} className="px-2 py-0.5 rounded bg-slate-900 text-indigo-300 font-mono text-[10px]">
                      {t}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: CANDIDATE QUALIFICATION FILTERS */}
      {activeSection === 'criteria' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">Target Candidate Criteria (Sales in India)</h2>
          </div>
          <p className="text-xs text-slate-400">
            Enforces the 5 conditions: Currently employed in sales, currently in India, 1–10 years experience, personal job-seeking statement, and post date within period.
          </p>

          <div className="space-y-4 text-xs">
            {/* Target Country */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Target Work Country</label>
              <input
                type="text"
                value={targetCountry}
                onChange={e => setTargetCountry(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>

            {/* Experience Limits */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Reported Experience Range (Years Inclusive)
              </label>
              <div className="flex items-center space-x-3">
                <div className="w-1/2">
                  <span className="text-[11px] text-slate-400 block mb-0.5">Min Years</span>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={minExp}
                    onChange={e => setMinExp(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="w-1/2">
                  <span className="text-[11px] text-slate-400 block mb-0.5">Max Years</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={maxExp}
                    onChange={e => setMaxExp(parseInt(e.target.value, 10) || 10)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Match Across Any Role Policy */}
            <div className="flex items-start justify-between p-3 rounded-xl bg-slate-800/50 border border-blue-800/40">
              <div>
                <span className="text-xs font-semibold text-blue-300 block flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Match Candidates Across Any Role (Sales & Non-Sales)</span>
                </span>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Matches eligible job seekers in ANY functional role having 1–10 years experience.
                </p>
              </div>
              <input
                type="checkbox"
                checked={matchAnyRole}
                onChange={e => setMatchAnyRole(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0 mt-1 cursor-pointer"
              />
            </div>

            {/* Match Across Any Sector Policy */}
            <div className="flex items-start justify-between p-3 rounded-xl bg-slate-800/50 border border-emerald-800/40">
              <div>
                <span className="text-xs font-semibold text-emerald-300 block flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Match Candidates Across Any Sector (1–10 Years Experience)</span>
                </span>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Matches eligible job-seeking candidates across any industry domain having 1–10 years experience.
                </p>
              </div>
              <input
                type="checkbox"
                checked={matchAnySector}
                onChange={e => setMatchAnySector(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-0 mt-1 cursor-pointer"
              />
            </div>

            {/* Exclude Senior Leadership Toggle */}
            <div className="flex items-start justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/60">
              <div>
                <span className="text-xs font-semibold text-white block">
                  Exclude Clear Senior Leadership Roles
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Filters out VP, C-Level, Director, and Head of roles into "Outside Target".
                </p>
              </div>
              <input
                type="checkbox"
                checked={excludeSenior}
                onChange={e => setExcludeSenior(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0 mt-1"
              />
            </div>

            {/* Strict Recruiter Ad Filtering */}
            <div className="flex items-start justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/60">
              <div>
                <span className="text-xs font-semibold text-white block">
                  Strict Recruiter Vacancy Ad & Third-Party Rejection
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Distinguishes job-seeking individuals from agency vacancy ads and posts seeking on someone else's behalf.
                </p>
              </div>
              <input
                type="checkbox"
                checked={strictAds}
                onChange={e => setStrictAds(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0 mt-1"
              />
            </div>

            {/* Required Keywords */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Target Role Keywords
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {keywordsList.map(kw => (
                  <span
                    key={kw}
                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-slate-700 text-[11px]"
                  >
                    <span>{kw}</span>
                    <button
                      onClick={() => handleRemoveKeyword(kw)}
                      className="text-slate-400 hover:text-white ml-1 font-bold cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Add role keyword..."
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: APIFY HARVESTING & SCHEDULER */}
      {activeSection === 'harvesting' && (
        <div className="space-y-6">
          {/* Apify Actor Integration Info & Diagnostics Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Linkedin className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-bold text-white">Apify LinkedIn Post Search Actor</h2>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  apifyConfigured
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : apifyDiagnostics?.isPlaceholder
                    ? 'bg-amber-950 text-amber-200 border-amber-600'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {apifyConfigured
                  ? 'Connected'
                  : apifyDiagnostics?.isPlaceholder
                  ? 'Placeholder Value Detected'
                  : 'Setup Required'}
              </span>
            </div>

            {/* Diagnostic Alert Box if Placeholder is Detected */}
            {apifyDiagnostics?.isPlaceholder && (
              <div className="bg-amber-950/70 border border-amber-600/80 rounded-xl p-4 text-xs space-y-2.5 text-amber-100">
                <div className="flex items-center space-x-2 font-bold text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Why You're Seeing an Error: Placeholder Token In Secrets</span>
                </div>
                <p className="leading-relaxed">
                  The environment variable <code className="bg-amber-900/80 px-1 py-0.5 rounded font-mono text-amber-200">APIFY_API_TOKEN</code> is currently saved as the literal placeholder text <strong className="text-amber-300">"MY_APIFY_API_TOKEN"</strong> instead of your actual Apify API key.
                </p>
                <div className="bg-slate-950/80 p-3 rounded-lg border border-amber-700/50 space-y-2 text-[11px]">
                  <p className="font-semibold text-white">How to fix in 3 quick steps:</p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300">
                    <li>
                      Go to <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline font-medium">Apify Console &gt; Integrations</a> and copy your <strong className="text-white">Personal API token</strong> (starts with <code className="text-amber-300 font-mono">apify_api_</code>).
                    </li>
                    <li>
                      In Google AI Studio, open <strong className="text-white">Settings</strong> (gear icon) &gt; <strong className="text-white">Secrets</strong>.
                    </li>
                    <li>
                      Find <code className="text-amber-300 font-mono">APIFY_API_TOKEN</code>, click <strong className="text-white">Edit</strong>, replace <code className="text-slate-400 font-mono">"MY_APIFY_API_TOKEN"</code> with your actual Apify token, and save.
                    </li>
                  </ol>
                </div>
              </div>
            )}

            <div className="text-xs space-y-3 text-slate-300">
              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-slate-300 font-mono text-[11px]">
                  <span className="text-slate-400">Actor ID:</span>
                  <span className="text-indigo-300 font-semibold">harvestapi/linkedin-post-search</span>
                </div>
                <div className="flex justify-between text-slate-300 font-mono text-[11px]">
                  <span className="text-slate-400">Secret Token Var:</span>
                  <span className="text-amber-300 font-semibold">APIFY_API_TOKEN</span>
                </div>
                <div className="flex justify-between text-slate-300 font-mono text-[11px]">
                  <span className="text-slate-400">Detected Value Status:</span>
                  <span className={apifyConfigured ? 'text-emerald-400' : apifyDiagnostics?.isPlaceholder ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                    {apifyConfigured
                      ? `Active (${apifyDiagnostics?.maskedSample || 'Valid'})`
                      : apifyDiagnostics?.isPlaceholder
                      ? 'Set to placeholder "MY_APIFY_API_TOKEN" (Invalid)'
                      : 'Not set in environment'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300 font-mono text-[11px]">
                  <span className="text-slate-400">Storage Location:</span>
                  <span className="text-emerald-400">Server-side environment only (Never in frontend)</span>
                </div>
              </div>

              {/* Action buttons & Live verification */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={handleVerifyApify}
                  disabled={isVerifyingApify}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow"
                >
                  {isVerifyingApify ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>{isVerifyingApify ? 'Verifying...' : 'Verify Apify Token'}</span>
                </button>

                <a
                  href="https://console.apify.com/account/integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center space-x-1.5"
                >
                  <span>Open Apify Integrations</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Verification Result Feedback */}
              {apifyVerificationResult && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    apifyVerificationResult.success
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-800 text-rose-200'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold">
                    {apifyVerificationResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {apifyVerificationResult.success
                        ? 'Apify Authentication Verified Successfully!'
                        : 'Apify Authentication Failed'}
                    </span>
                  </div>
                  {apifyVerificationResult.success ? (
                    <p className="text-[11px] text-emerald-300/90">
                      Connected to Apify as user <strong className="text-white">@{apifyVerificationResult.username}</strong>
                      {apifyVerificationResult.plan ? ` (Plan: ${apifyVerificationResult.plan})` : ''}.
                    </p>
                  ) : (
                    <p className="text-[11px] text-rose-300/90 leading-relaxed">
                      {apifyVerificationResult.error}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scheduled Processing Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-white">Automated Scheduled Processing</h2>
              </div>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 border cursor-pointer ${
                  isPaused
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                <span>{isPaused ? 'Resume Processing' : 'Active (Running)'}</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Scheduled Times (24h)</label>
                  <input
                    type="text"
                    value={scheduledTimes.join(', ')}
                    onChange={e =>
                      setScheduledTimes(
                        e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      )
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Timezone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {/* Endpoint */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-semibold block">Cloud Scheduler Backend Endpoint</label>
                <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 font-mono text-[11px] text-slate-300 break-all select-all">
                  {schedulerEndpoint}
                </div>
              </div>

              {/* Secret Cron Token */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-slate-300 font-semibold">Cron Authorization Secret</label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(schedule.cronSecret);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 2000);
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedSecret ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSecret ? 'Copied' : 'Copy Token'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={schedule.cronSecret}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono focus:outline-none"
                />
              </div>

              {/* Cloud Scheduler Setup Instructions */}
              <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Google Cloud Scheduler Command (No Open Browser Tab Needed)
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(sampleGcloudCommand);
                      setCopiedSchedulerCmd(true);
                      setTimeout(() => setCopiedSchedulerCmd(false), 2000);
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedSchedulerCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Copy Command</span>
                  </button>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[10px] font-mono text-emerald-300 overflow-x-auto whitespace-pre">
                  {sampleGcloudCommand}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

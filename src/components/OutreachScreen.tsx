import React, { useState, useEffect } from 'react';
import {
  Send,
  Mail,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Check,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Users,
  Search,
  Filter,
  FileText,
  Play,
  Lock,
  Loader2,
  Eye,
  AlertTriangle,
  RefreshCw,
  SendHorizontal,
  CheckSquare,
  Square,
  Info,
} from 'lucide-react';
import { AppDatabase, Candidate, OutreachStatus, OutreachMessage } from '../types/index.ts';

interface OutreachScreenProps {
  data: AppDatabase;
  mode: 'demo' | 'live';
  onRefresh: () => Promise<void>;
  onNavigateToSettings: () => void;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export const OutreachScreen: React.FC<OutreachScreenProps> = ({
  data,
  mode,
  onRefresh,
  onNavigateToSettings,
  showToast,
}) => {
  const { candidates, outreachSettings, outreachMessages } = data;
  const isGmailConnected = Boolean(outreachSettings?.gmailConnected);
  const hasSmtpConfigured = Boolean(
    (outreachSettings?.smtpConfig?.auth as any)?.hasPass ||
    (outreachSettings?.smtpConfig?.auth?.pass && outreachSettings.smtpConfig.auth.pass.trim())
  );
  const activeProvider = outreachSettings?.provider || 'gmail_workspace';

  // Overall readiness: ready if either OAuth connected OR SMTP password provided
  const isReadyToSend =
    (activeProvider === 'gmail_workspace' && (isGmailConnected || hasSmtpConfigured)) ||
    (activeProvider === 'smtp' && hasSmtpConfigured) ||
    (mode === 'demo' && activeProvider === 'test_mode');

  const senderEmail = outreachSettings?.senderEmail || 'ditribe31@gmail.com';
  const sendingMode = outreachSettings?.sendingMode || 'auto_send';

  const [activeStatusFilter, setActiveStatusFilter] = useState<OutreachStatus | 'all' | 'simulated'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [editingDraft, setEditingDraft] = useState<{ subject: string; body: string } | null>(null);
  const [isSendingSingle, setIsSendingSingle] = useState(false);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [isResettingSimulated, setIsResettingSimulated] = useState(false);
  const [batchResult, setBatchResult] = useState<{ sentCount: number; failedCount: number; errors: string[] } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Test Email Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState(senderEmail || 'ditribe31@gmail.com');
  const [testConfirmed, setTestConfirmed] = useState(true);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    accepted?: boolean;
    provider?: string;
    message?: string;
    messageId?: string;
    timestamp?: string;
    smtpResponse?: string;
  } | null>(null);
  const [emailModalTab, setEmailModalTab] = useState<'preview' | 'edit'>('preview');

  // Review Simulated Sends Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedSimulatedIds, setSelectedSimulatedIds] = useState<string[]>([]);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [connectionHealthMessage, setConnectionHealthMessage] = useState<string | null>(null);

  useEffect(() => {
    handleCheckConnection();
  }, [mode]);

  // Helper to detect simulated messages
  const isMessageSimulated = (msg?: OutreachMessage | null) => {
    if (!msg) return true;
    if (msg.isTestModeSend) return true;
    if (!msg.providerMessageId) return true;
    const pId = msg.providerMessageId;
    return pId.startsWith('talenthub_') || pId.startsWith('test_sim_') || pId.startsWith('gmail_sim_');
  };

  const isCandidateSimulated = (cand: Candidate) => {
    if (cand.outreachStatus !== 'Sent') return false;
    const msg = outreachMessages?.find(m => m.candidateId === cand.id);
    return isMessageSimulated(msg);
  };

  // Simulated / Test mode candidates needing review
  const simulatedCandidates = candidates.filter(isCandidateSimulated);
  const simulatedSentCount = simulatedCandidates.length;

  // Real verified sent candidates (accepted by Google Gmail API or SMTP)
  const realSentCandidates = candidates.filter(c => {
    if (c.outreachStatus !== 'Sent') return false;
    const msg = outreachMessages?.find(m => m.candidateId === c.id);
    return msg && msg.deliveryStatus === 'sent' && !isMessageSimulated(msg);
  });
  const realSentCount = realSentCandidates.length;

  // Status counts
  const draftCount = candidates.filter(c => c.outreachStatus === 'Draft' || !c.outreachStatus).length;
  const approvedCount = candidates.filter(c => c.outreachStatus === 'Approved').length;
  const failedCount = candidates.filter(c => c.outreachStatus === 'Failed').length;
  const respondedCount = candidates.filter(c => c.outreachStatus === 'Responded').length;
  const appliedCount = candidates.filter(c => c.outreachStatus === 'Applied').length;

  // Filtered candidate list
  const filteredCandidates = candidates.filter(cand => {
    if (activeStatusFilter === 'simulated') {
      if (!isCandidateSimulated(cand)) return false;
    } else if (activeStatusFilter !== 'all') {
      const status = cand.outreachStatus || 'Draft';
      if (status !== activeStatusFilter) return false;
      // If viewing 'Sent', exclude simulated ones unless explicitly filtering simulated
      if (activeStatusFilter === 'Sent' && isCandidateSimulated(cand)) return false;
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = cand.name ? cand.name.toLowerCase().includes(q) : false;
      const matchEmail = cand.email ? cand.email.toLowerCase().includes(q) : false;
      const matchRole = cand.currentOrPreviousRole ? cand.currentOrPreviousRole.toLowerCase().includes(q) : false;
      const matchCompany = cand.employer ? cand.employer.toLowerCase().includes(q) : false;
      return matchName || matchEmail || matchRole || matchCompany;
    }

    return true;
  });

  // Check Connection Health
  const handleCheckConnection = async () => {
    setIsCheckingConnection(true);
    setConnectionHealthMessage(null);
    try {
      const res = await fetch(`/api/outreach/connection-status?mode=${mode}`);
      const info = await res.json();
      await onRefresh();

      if (info.isReadyToSend) {
        setConnectionHealthMessage(`Active & Verified: ${info.activeTransportDesc}`);
        showToast(`Outreach Transport Ready: ${info.activeTransportDesc}`, 'success');
      } else {
        setConnectionHealthMessage(`Disconnected: ${info.activeTransportDesc}`);
        showToast('No active email transport connected. Please check Settings.', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsCheckingConnection(false);
    }
  };

  // Send Test Email Handler
  const handleSendTestEmail = async () => {
    if (!testRecipient || !testRecipient.includes('@')) {
      showToast('Please enter a valid recipient email address.', 'error');
      return;
    }
    if (!testConfirmed) {
      showToast('Please confirm test email dispatch checkbox.', 'error');
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/outreach/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: testRecipient.trim(),
          mode,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Test email failed to send.');
      }

      setTestResult({
        success: true,
        accepted: body.accepted ?? true,
        provider: body.provider,
        message: body.message,
        messageId: body.messageId,
        timestamp: body.timestamp,
        smtpResponse: body.smtpResponse,
      });
      showToast(`Test email successfully sent to ${testRecipient}!`, 'success');
      await onRefresh();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message,
      });
      showToast(err.message, 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Reset Simulated Sends (targeted or all)
  const handleResetSimulatedSends = async (ids?: string[], targetStatus: 'Approved' | 'Draft' = 'Approved') => {
    try {
      setIsResettingSimulated(true);
      const res = await fetch('/api/outreach/reset-simulated-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          candidateIds: ids && ids.length > 0 ? ids : undefined,
          targetStatus,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Reset failed');
      showToast(`Moved ${body.resetCount || 0} candidate(s) to "${targetStatus}" status for real outreach!`, 'success');
      setIsReviewModalOpen(false);
      setSelectedSimulatedIds([]);
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsResettingSimulated(false);
    }
  };

  // Approve draft
  const handleApprove = async (candId: string) => {
    try {
      const res = await fetch('/api/outreach/approve-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: candId, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to approve candidate');

      showToast('Candidate draft approved for sending.', 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Change status manually
  const handleUpdateStatus = async (candId: string, newStatus: OutreachStatus) => {
    try {
      const res = await fetch('/api/outreach/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: candId, status: newStatus, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update status');

      showToast(`Candidate status updated to ${newStatus}.`, 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Send single candidate email
  const handleSendSingle = async (cand: Candidate) => {
    if (!isReadyToSend) {
      showToast('No active email transport connected. Please connect Gmail OAuth or enter your Gmail App Password in Settings.', 'error');
      onNavigateToSettings();
      return;
    }

    setIsSendingSingle(true);
    setSendError(null);
    try {
      const res = await fetch('/api/outreach/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: cand.id,
          mode,
          subject: editingDraft?.subject,
          body: editingDraft?.body,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to dispatch email.');
      }

      showToast(`Email successfully delivered to ${cand.email} (Provider ID: ${body.messageId})!`, 'success');
      setSelectedCandidate(null);
      setEditingDraft(null);
      await onRefresh();
    } catch (err: any) {
      setSendError(err.message);
      showToast(err.message, 'error');
      await onRefresh();
    } finally {
      setIsSendingSingle(false);
    }
  };

  // Batch send approved candidates
  const handleBatchSend = async () => {
    if (!isReadyToSend) {
      showToast('No active email transport connected. Please connect Gmail OAuth or enter your 16-character App Password in Settings first.', 'error');
      onNavigateToSettings();
      return;
    }

    const countToSend = sendingMode === 'auto_send' ? approvedCount + draftCount : approvedCount;
    if (countToSend === 0) {
      showToast('No candidates available for sending. Please approve candidate drafts first.', 'info');
      return;
    }

    const providerDesc = isGmailConnected
      ? `Gmail OAuth (${senderEmail})`
      : hasSmtpConfigured
      ? `Gmail SMTP (${senderEmail})`
      : 'Demo Simulation';

    const confirmMsg =
      sendingMode === 'auto_send'
        ? `Confirm sending real outreach emails to ${countToSend} candidate(s) via ${providerDesc}?\n\nEmails will be dispatched directly to inboxes with Google message tracking.`
        : `Confirm dispatching verified outreach emails to ${approvedCount} approved candidate(s) via ${providerDesc}?`;

    if (!window.confirm(confirmMsg)) return;

    setIsBatchSending(true);
    setBatchResult(null);
    try {
      const res = await fetch('/api/outreach/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Batch send failed');

      setBatchResult({
        sentCount: body.sentCount || 0,
        failedCount: body.failedCount || 0,
        errors: body.errors || [],
      });

      if (body.sentCount > 0) {
        showToast(`Successfully dispatched ${body.sentCount} recruitment emails via ${providerDesc}!`, 'success');
      } else {
        showToast(body.message || 'No emails were dispatched.', 'info');
      }
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsBatchSending(false);
    }
  };

  const getStatusBadge = (cand: Candidate) => {
    const isSimulated = isCandidateSimulated(cand);
    if (isSimulated) {
      return (
        <span
          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800 flex items-center space-x-1"
          title="Simulated test record. Real email was not delivered. Review required to send real email."
        >
          <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
          <span>Simulated (Review Needed)</span>
        </span>
      );
    }

    const status: OutreachStatus = cand.outreachStatus || 'Draft';
    switch (status) {
      case 'Draft':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">Draft</span>;
      case 'Approved':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800">Approved</span>;
      case 'Sent':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            <span>Sent (Verified)</span>
          </span>
        );
      case 'Failed':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">Failed</span>;
      case 'Responded':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">Responded</span>;
      case 'Applied':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">Applied</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Automated Gmail Outreach Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30">
                <Mail className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-bold text-white tracking-tight">
                    Gmail Outreach Automation
                  </h1>
                  <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Automated Dispatch Active</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Sends 1st outreach email automatically from <span className="font-mono text-slate-200">{senderEmail}</span> immediately when candidates under "Matches Criteria" have an email address.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setTestResult(null);
                setTestRecipient(senderEmail);
                setTestConfirmed(true);
                setIsTestModalOpen(true);
              }}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <SendHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Test Live Send</span>
            </button>
            <button
              onClick={onNavigateToSettings}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <span>Outreach Settings</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Automation Policy Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Active Transport</span>
            <span className="font-semibold text-white mt-0.5 block flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{isGmailConnected ? 'Gmail OAuth 2.0' : hasSmtpConfigured ? 'Gmail SMTP' : 'Configuration Ready'}</span>
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Auto-Trigger Rule</span>
            <span className="font-semibold text-white mt-0.5 block">
              1st Mail on Scrape Match
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Daily Rate Limit</span>
            <span className="font-semibold text-white mt-0.5 block">
              {outreachSettings?.dailySendingLimit || 50} emails/day (2s jitter)
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Embedded Registration</span>
            <a
              href={outreachSettings?.googleFormUrl || 'https://forms.gle/4NfxJ2j2eW4P9vCQA'}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline mt-0.5 block truncate font-mono text-[11px] flex items-center space-x-1"
            >
              <span>Google Form Link</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      </div>
      {/* Top Banner & Primary Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30">
                <Send className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
                  <span>Candidate Recruitment Outreach</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 border border-blue-800 text-blue-400 font-normal">
                    {senderEmail}
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Deliver personalized invitations to vetted BFSI candidates with Google Form registration link & unsubscribe compliance.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Send Test Email Button */}
            <button
              onClick={() => {
                setTestResult(null);
                setTestRecipient(senderEmail);
                setIsTestModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-800/60 font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
              title="Test real email dispatching to a specified inbox before batch sending"
            >
              <SendHorizontal className="w-4 h-4 text-emerald-400" />
              <span>Send Test Email</span>
            </button>

            {/* Outreach Settings Button */}
            <button
              onClick={onNavigateToSettings}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Outreach Settings</span>
            </button>

            {/* Batch Send Button */}
            <button
              onClick={handleBatchSend}
              disabled={isBatchSending || (sendingMode === 'require_approval' && approvedCount === 0)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center space-x-2 shadow-md cursor-pointer"
            >
              {isBatchSending ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Play className="w-4 h-4 text-white fill-white" />
              )}
              <span>
                {isBatchSending
                  ? 'Dispatching Emails...'
                  : sendingMode === 'auto_send'
                  ? 'Dispatch Pending Emails'
                  : `Send Approved Emails (${approvedCount})`}
              </span>
            </button>
          </div>
        </div>

        {/* Real Transport Connection Status Card */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            isReadyToSend
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-amber-950/40 border-amber-800/80 text-amber-200'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {isReadyToSend ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              <span className="font-semibold block text-sm">
                {isGmailConnected
                  ? `Active Transport: Google Gmail API OAuth (${outreachSettings?.gmailConnectedEmail || senderEmail})`
                  : hasSmtpConfigured
                  ? `Active Transport: Gmail SMTP Server (${outreachSettings?.smtpConfig?.auth?.user || senderEmail})`
                  : 'No Email Transport Connected — Cannot Send Real Emails'}
              </span>
              <p className="text-[11px] opacity-85 mt-0.5">
                {isReadyToSend ? (
                  <>
                    Emails will be sent from <strong className="text-white font-mono">{senderEmail}</strong>. All messages are directly verified with Google servers (Message-ID recorded).
                    {connectionHealthMessage && <span className="block text-emerald-300 font-mono mt-0.5">{connectionHealthMessage}</span>}
                  </>
                ) : (
                  'Connect your Gmail account via OAuth in Settings or configure a 16-character Google App Password for smtp.gmail.com.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleCheckConnection}
              disabled={isCheckingConnection}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs flex items-center space-x-1 transition cursor-pointer"
              title="Ping server to check Gmail OAuth and SMTP status"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingConnection ? 'animate-spin' : ''}`} />
              <span>Check Connection</span>
            </button>

            {!isReadyToSend && (
              <button
                onClick={onNavigateToSettings}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
              >
                Configure Provider
              </button>
            )}

            <a
              href="/apply"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 flex items-center space-x-1.5 transition cursor-pointer"
              title="Open and test the Candidate Registration / Expression of Interest Form"
            >
              <span>Application Portal (/apply)</span>
              <ExternalLink className="w-3 h-3 text-indigo-400" />
            </a>
          </div>
        </div>

        {/* Simulated / Test Mode Review Banner */}
        {simulatedSentCount > 0 && (
          <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold block text-amber-100">
                  {simulatedSentCount} Candidate(s) were logged under simulated/disconnected mode
                </span>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  These records have simulated IDs (<code className="font-mono text-amber-200">gmail_sim_...</code>) and were <strong>not</strong> dispatched to inboxes. They are excluded from verified send counts. Review them to dispatch real emails.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => {
                  setSelectedSimulatedIds(simulatedCandidates.map(c => c.id));
                  setIsReviewModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Review & Retry ({simulatedSentCount})</span>
              </button>
              <button
                onClick={() => handleResetSimulatedSends()}
                disabled={isResettingSimulated}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-700/60 font-semibold text-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {isResettingSimulated ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>Reset All to Approved</span>
              </button>
            </div>
          </div>
        )}

        {/* Status Filters Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-800">
          {/* Draft */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Draft' ? 'all' : 'Draft')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Draft'
                ? 'bg-slate-800 border-slate-500 shadow-sm ring-1 ring-slate-500'
                : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/70'
            }`}
          >
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Draft</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-slate-200">{draftCount}</span>
              <span className="text-[10px] text-slate-500">pending review</span>
            </div>
          </button>

          {/* Approved */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Approved' ? 'all' : 'Approved')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Approved'
                ? 'bg-blue-950/70 border-blue-500 shadow-sm ring-1 ring-blue-500'
                : 'bg-blue-950/20 border-blue-900/40 hover:bg-blue-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">Approved</span>
              <Check className="w-3 h-3 text-blue-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-blue-400">{approvedCount}</span>
              <span className="text-[10px] text-blue-300/70">ready to send</span>
            </div>
          </button>

          {/* Real Sent (Verified) */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Sent' ? 'all' : 'Sent')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Sent'
                ? 'bg-emerald-950/70 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                : 'bg-emerald-950/20 border-emerald-900/40 hover:bg-emerald-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">Verified Sent</span>
              <Send className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-emerald-400">{realSentCount}</span>
              <span className="text-[10px] text-emerald-300/70">Google verified</span>
            </div>
          </button>

          {/* Failed */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Failed' ? 'all' : 'Failed')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Failed'
                ? 'bg-rose-950/70 border-rose-500 shadow-sm ring-1 ring-rose-500'
                : 'bg-rose-950/20 border-rose-900/40 hover:bg-rose-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-rose-300 uppercase tracking-wider">Failed</span>
              <XCircle className="w-3 h-3 text-rose-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-rose-400">{failedCount}</span>
              <span className="text-[10px] text-rose-300/70">needs attention</span>
            </div>
          </button>

          {/* Responded */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Responded' ? 'all' : 'Responded')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Responded'
                ? 'bg-amber-950/70 border-amber-500 shadow-sm ring-1 ring-amber-500'
                : 'bg-amber-950/20 border-amber-900/40 hover:bg-amber-950/40'
            }`}
          >
            <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider block">Responded</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-amber-400">{respondedCount}</span>
              <span className="text-[10px] text-amber-300/70">in discussions</span>
            </div>
          </button>

          {/* Applied */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Applied' ? 'all' : 'Applied')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Applied'
                ? 'bg-purple-950/70 border-purple-500 shadow-sm ring-1 ring-purple-500'
                : 'bg-purple-950/20 border-purple-900/40 hover:bg-purple-950/40'
            }`}
          >
            <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider block">Applied</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-purple-400">{appliedCount}</span>
              <span className="text-[10px] text-purple-300/70">form completed</span>
            </div>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 font-medium">Viewing Status:</span>
            <span className="font-semibold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
              {activeStatusFilter === 'all'
                ? 'All Candidates'
                : activeStatusFilter === 'simulated'
                ? 'Simulated / Unsent Records'
                : activeStatusFilter}
            </span>
            {activeStatusFilter !== 'all' && (
              <button
                onClick={() => setActiveStatusFilter('all')}
                className="text-blue-400 hover:text-blue-300 text-[11px] underline cursor-pointer"
              >
                Clear Filter
              </button>
            )}
            {simulatedSentCount > 0 && activeStatusFilter !== 'simulated' && (
              <button
                onClick={() => setActiveStatusFilter('simulated')}
                className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 text-[11px] font-semibold hover:bg-amber-900/80 cursor-pointer"
              >
                Show Simulated Only ({simulatedSentCount})
              </button>
            )}
          </div>

          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search candidate name, email, role..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Batch Result Notification */}
      {batchResult && (
        <div className="p-4 rounded-2xl border bg-slate-900 border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Batch Send Completed</span>
            </h3>
            <button onClick={() => setBatchResult(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
          <p className="text-slate-300">
            Dispatched <strong>{batchResult.sentCount}</strong> email(s) successfully via Google/SMTP. {batchResult.failedCount} failed.
          </p>
          {batchResult.errors.length > 0 && (
            <div className="bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/60 text-rose-300 font-mono text-[11px] space-y-1">
              {batchResult.errors.map((err, idx) => (
                <div key={idx}>• {err}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Candidates List with Outreach Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCandidates.length === 0 ? (
          <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-2">
            <Mail className="w-10 h-10 mx-auto text-slate-600 stroke-1" />
            <p className="text-sm font-semibold text-slate-400">No Candidates in Current Filter</p>
            <p className="text-xs">Try switching status filters or search term above.</p>
          </div>
        ) : (
          filteredCandidates.map(candidate => {
            const status: OutreachStatus = candidate.outreachStatus || 'Draft';
            const hasEmail = Boolean(candidate.email);
            const isSimulated = isCandidateSimulated(candidate);
            const candMsg = outreachMessages?.find(m => m.candidateId === candidate.id);

            return (
              <div
                key={candidate.id}
                className={`bg-slate-900 border rounded-2xl p-5 shadow-sm transition flex flex-col justify-between space-y-4 ${
                  isSimulated ? 'border-amber-700/60 bg-amber-950/10' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  {/* Status header & Tag */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      {getStatusBadge(candidate)}
                      <span className="text-[10px] text-slate-400 font-mono">
                        {candidate.criteriaTag}
                      </span>
                    </div>

                    <select
                      value={status}
                      onChange={e => handleUpdateStatus(candidate.id, e.target.value as OutreachStatus)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-[10px] text-slate-300 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Approved">Approved</option>
                      <option value="Sent">Sent</option>
                      <option value="Failed">Failed</option>
                      <option value="Responded">Responded</option>
                      <option value="Applied">Applied</option>
                    </select>
                  </div>

                  {/* Candidate Info */}
                  <div>
                    <h3 className="text-sm font-bold text-white truncate">
                      {candidate.name || 'Name Not Provided'}
                    </h3>
                    <p className="text-xs text-slate-300 truncate mt-0.5">
                      {candidate.currentOrPreviousRole || 'Sales Professional'}
                      {candidate.employer && <span className="text-slate-400"> at {candidate.employer}</span>}
                    </p>
                    {candidate.currentWorkLocation && (
                      <p className="text-[11px] text-emerald-400 mt-0.5">
                        📍 {candidate.currentWorkLocation}
                      </p>
                    )}
                  </div>

                  {/* Email & Contact */}
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Email:</span>
                      {hasEmail ? (
                        <span className="text-blue-400 font-mono font-medium truncate max-w-[180px]">
                          {candidate.email}
                        </span>
                      ) : (
                        <span className="text-rose-400 italic">Missing Email</span>
                      )}
                    </div>
                    {candidate.outreachSentAt && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{isSimulated ? 'Simulated At:' : 'Sent At:'}</span>
                        <span className="font-mono">{new Date(candidate.outreachSentAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {candMsg?.providerMessageId && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>Message ID:</span>
                        <span className="font-mono truncate max-w-[150px] text-slate-400" title={candMsg.providerMessageId}>
                          {candMsg.providerMessageId}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Draft preview snippet */}
                  {candidate.draftEmail && (
                    <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800 text-[11px] space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-slate-300 font-semibold truncate">
                          Subject: {candidate.draftEmail.subject}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 text-[9px] font-semibold flex items-center space-x-1 shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Google Form Linked</span>
                        </span>
                      </div>
                      <p className="text-slate-400 line-clamp-2 italic text-[10px]">
                        "{candidate.draftEmail.body.slice(0, 140)}..."
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => {
                      setSelectedCandidate(candidate);
                      setEditingDraft({
                        subject: candidate.draftEmail?.subject || '',
                        body: candidate.draftEmail?.body || '',
                      });
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium flex items-center space-x-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>View Draft</span>
                  </button>

                  <div className="flex items-center space-x-1.5">
                    {isSimulated ? (
                      <button
                        onClick={() => {
                          setSelectedCandidate(candidate);
                          setEditingDraft({
                            subject: candidate.draftEmail?.subject || '',
                            body: candidate.draftEmail?.body || '',
                          });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/50 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                        title="Review and dispatch real email to this candidate"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Review & Retry</span>
                      </button>
                    ) : status === 'Draft' ? (
                      <button
                        onClick={() => handleApprove(candidate.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/50 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                    ) : null}

                    {(status === 'Approved' || status === 'Failed') && hasEmail && (
                      <button
                        onClick={() => handleSendSingle(candidate)}
                        disabled={isSendingSingle}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center space-x-1 transition cursor-pointer disabled:opacity-50"
                        title="Send recruitment email directly via Gmail"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Real</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Email Review & Customization Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-indigo-400" />
                  <span>Review Outreach Email</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Invitation for {selectedCandidate.name || 'Candidate'} ({selectedCandidate.email})
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
                  <button
                    onClick={() => setEmailModalTab('preview')}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                      emailModalTab === 'preview'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Gmail Hyperlink Preview</span>
                  </button>
                  <button
                    onClick={() => setEmailModalTab('edit')}
                    className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                      emailModalTab === 'edit'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Edit Raw Text</span>
                  </button>
                </div>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {isCandidateSimulated(selectedCandidate) && (
                <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-800 text-amber-200 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-amber-100">Simulated Record Notice</span>
                    <p className="text-[11px] mt-0.5 text-amber-300/90 leading-relaxed">
                      This candidate was previously logged in test/simulation mode. No email was sent through Google servers. Click "Send Real Email Now" below to deliver an authentic email directly to <strong>{selectedCandidate.email}</strong> from <strong>{senderEmail}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {sendError && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Dispatch Error</span>
                    <p className="text-[11px] mt-0.5">{sendError}</p>
                  </div>
                </div>
              )}

              {/* Recipient & Provider Details */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Recipient</span>
                  <span className="text-white font-medium">{selectedCandidate.name || 'Candidate'}</span>
                  <p className="text-blue-400 font-mono text-[11px]">{selectedCandidate.email || 'No email'}</p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Sender Account (Gmail)</span>
                  <span className="text-emerald-400 font-medium">
                    {outreachSettings?.senderName || 'BFSITalentHub Recruitment'}
                  </span>
                  <p className="text-slate-300 font-mono text-[11px]">{senderEmail}</p>
                </div>
              </div>

              {/* Verified Hyperlink Notice */}
              {(() => {
                const token = selectedCandidate.formToken || selectedCandidate.id;
                const rawForm = outreachSettings?.googleFormUrl?.trim();
                const activeFormUrl = rawForm && rawForm !== '' && rawForm !== 'https://forms.gle/bfsitalenthub' && (rawForm.startsWith('http://') || rawForm.startsWith('https://'))
                  ? rawForm
                  : `${window.location.origin}/apply?token=${token}&email=${encodeURIComponent(selectedCandidate.email || '')}`;
                const unsubUrl = `${window.location.origin}/api/outreach/unsubscribe?token=${token}&email=${encodeURIComponent(selectedCandidate.email || '')}`;

                return (
                  <>
                    <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-center justify-between text-emerald-200">
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-emerald-300 block">Google Form Hyperlink Active</span>
                          <span className="text-[11px] text-emerald-400/80">
                            When sent via Gmail, the recipient receives a clickable button and active HTML hyperlink.
                          </span>
                        </div>
                      </div>
                      <a
                        href={activeFormUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-700/50 hover:bg-emerald-600/60 text-white font-semibold text-[11px] border border-emerald-500/50 flex items-center space-x-1 shrink-0 transition"
                        title="Test clicking the form link before sending"
                      >
                        <span>Test Open Form</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {emailModalTab === 'preview' ? (
                      /* Realistic Gmail Rendered Preview */
                      <div className="space-y-3">
                        <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-inner">
                          {/* Gmail Simulated Header */}
                          <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 space-y-1 text-[11px]">
                            <div className="flex items-center justify-between text-slate-400">
                              <div>
                                <span className="text-slate-500">From: </span>
                                <strong className="text-slate-200">{outreachSettings?.senderName || 'BFSITalentHub Recruitment'}</strong>{' '}
                                &lt;{senderEmail}&gt;
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">Gmail API (users.messages.send)</span>
                            </div>
                            <div>
                              <span className="text-slate-500">To: </span>
                              <span className="text-slate-300">{selectedCandidate.name || 'Candidate'}</span> &lt;{selectedCandidate.email}&gt;
                            </div>
                            <div>
                              <span className="text-slate-500">Subject: </span>
                              <span className="text-white font-semibold">{editingDraft?.subject || 'Career Opportunity'}</span>
                            </div>
                          </div>

                          {/* Gmail Simulated Email Body with Interactive Hyperlinks */}
                          <div className="p-5 bg-white text-slate-800 rounded-b-xl space-y-4 font-sans leading-relaxed text-xs">
                            {/* Email Card Top Banner */}
                            <div className="bg-gradient-to-r from-slate-900 to-slate-800 -mx-5 -mt-5 p-4 text-white flex items-center justify-between">
                              <div>
                                <h4 className="font-bold text-sm tracking-tight">BFSITalentHub</h4>
                                <p className="text-[10px] text-slate-400">Career Opportunities & Talent Network</p>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-semibold">
                                Recruitment Outreach
                              </span>
                            </div>

                            {/* Message paragraphs */}
                            <div className="space-y-3 pt-2 text-slate-700 text-xs">
                              {editingDraft?.body
                                ? editingDraft.body
                                    .split(/\n\n+/)
                                    .filter(p => !p.includes(activeFormUrl) && !p.includes(unsubUrl) && !p.includes('/apply') && !p.includes('opt out'))
                                    .map((p, idx) => (
                                      <p key={idx} className="whitespace-pre-line">
                                        {p}
                                      </p>
                                    ))
                                : null}
                            </div>

                            {/* The Clickable Google Form Hyperlink Callout */}
                            <div className="my-4 p-4 rounded-xl bg-blue-50 border-2 border-blue-200 text-center space-y-2.5">
                              <p className="font-bold text-blue-950 text-xs">
                                📋 Candidate Registration & Expression of Interest Form
                              </p>
                              <div>
                                <a
                                  href={activeFormUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition"
                                >
                                  <span>👉 Open Google Form Application</span>
                                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                                </a>
                              </div>
                              <p className="text-[11px] text-slate-600 font-mono break-all">
                                Direct Hyperlink:{' '}
                                <a
                                  href={activeFormUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-semibold"
                                >
                                  {activeFormUrl}
                                </a>
                              </p>
                            </div>

                            {/* Sign-off */}
                            <div className="text-slate-600 pt-1 text-xs">
                              <p>Best regards,</p>
                              <p className="font-semibold text-slate-800">
                                {outreachSettings?.senderName || 'BFSITalentHub Recruitment'}
                              </p>
                              <p className="text-slate-500 text-[11px]">{senderEmail}</p>
                            </div>

                            {/* Footer opt-out */}
                            <div className="pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
                              <p>
                                To opt out of future recruitment outreach,{' '}
                                <a
                                  href={unsubUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-500 underline"
                                >
                                  click here to unsubscribe
                                </a>
                                .
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Raw Text Editor */
                      <div className="space-y-4">
                        <div>
                          <label className="text-slate-300 font-semibold block mb-1">Email Subject</label>
                          <input
                            type="text"
                            value={editingDraft?.subject || ''}
                            onChange={e =>
                              setEditingDraft(prev => (prev ? { ...prev, subject: e.target.value } : null))
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="text-slate-300 font-semibold block mb-1">Email Message Body (Plain Text)</label>
                          <textarea
                            rows={10}
                            value={editingDraft?.body || ''}
                            onChange={e =>
                              setEditingDraft(prev => (prev ? { ...prev, body: e.target.value } : null))
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white font-sans leading-relaxed whitespace-pre-wrap"
                          />
                        </div>

                        <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                          <span className="font-semibold text-slate-300 block">Active Google Form Link:</span>
                          <p className="text-indigo-300 font-mono break-all">{activeFormUrl}</p>
                          <p className="text-[10px] text-slate-500">
                            The system automatically builds both plain text and rich HTML containing active clickable hyperlinks before sending through Gmail.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <button
                onClick={() => setSelectedCandidate(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    handleApprove(selectedCandidate.id);
                    setSelectedCandidate(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/50 text-xs font-semibold cursor-pointer"
                >
                  Approve Draft
                </button>

                <button
                  onClick={() => handleSendSingle(selectedCandidate)}
                  disabled={isSendingSingle || !selectedCandidate.email}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSendingSingle ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>{isSendingSingle ? 'Sending Real Email...' : 'Send Real Email Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Test Email Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30">
                  <SendHorizontal className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Send Real Verification Email</h3>
                  <p className="text-xs text-slate-400">
                    Test live delivery through Google's servers before batch outreach.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Sender Account:</span>
                  <span className="font-mono text-emerald-300 font-semibold">{senderEmail}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Transport Mode:</span>
                  <span className="font-medium text-slate-200">
                    {isGmailConnected
                      ? 'Google Gmail API (OAuth 2.0)'
                      : hasSmtpConfigured
                      ? 'Gmail SMTP Server (smtp.gmail.com:465)'
                      : 'None configured'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-slate-200 font-semibold block mb-1.5">
                  Test Recipient Email Address
                </label>
                <input
                  type="email"
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  placeholder="e.g. ditribe31@gmail.com or your personal email"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter your own email address to check your inbox and verify the email arrived.
                </p>
              </div>

              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testConfirmed}
                    onChange={e => setTestConfirmed(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded mt-0.5 cursor-pointer"
                  />
                  <span>
                    I confirm sending a real verification email to <strong className="text-white font-mono">{testRecipient || 'this recipient'}</strong> from <strong className="text-emerald-300 font-mono">{senderEmail}</strong>.
                  </span>
                </label>
              </div>

              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    testResult.success
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200 text-xs'
                      : 'bg-rose-950/60 border-rose-800 text-rose-300 text-xs'
                  }`}
                >
                  <div className="font-bold flex items-center space-x-1.5">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {testResult.success
                        ? 'Email Successfully Accepted by Gmail SMTP!'
                        : 'Dispatch Failed / Rejected by Gmail SMTP'}
                    </span>
                  </div>
                  <p className="leading-relaxed">{testResult.message}</p>
                  {testResult.messageId && (
                    <p className="text-slate-400 font-mono text-[11px]">
                      Google Provider Message ID: <span className="text-emerald-300">{testResult.messageId}</span>
                    </p>
                  )}
                  {testResult.smtpResponse && (
                    <p className="text-slate-400 font-mono text-[11px]">
                      SMTP Server Response: <span className="text-emerald-300">{testResult.smtpResponse}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleSendTestEmail}
                disabled={isSendingTest || !testRecipient || !testConfirmed}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md transition cursor-pointer"
              >
                {isSendingTest ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-white" />
                )}
                <span>{isSendingTest ? 'Sending via Google...' : 'Confirm & Send Test Email'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Simulated Sends Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-600/20 border border-amber-500/30">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Review Simulated Outreach Sends</h3>
                  <p className="text-xs text-slate-400">
                    These candidate records were marked "Sent" under simulation and never reached Gmail inboxes.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                To prevent duplicate sending, each candidate below is held until reviewed. Choose an action to either move them to <strong>Approved</strong> (ready for real dispatch via Batch Send) or reset them to <strong>Draft</strong>:
              </p>

              <div className="space-y-2">
                {simulatedCandidates.map(cand => {
                  const isChecked = selectedSimulatedIds.includes(cand.id);
                  const msg = outreachMessages?.find(m => m.candidateId === cand.id);

                  return (
                    <div
                      key={cand.id}
                      onClick={() => {
                        setSelectedSimulatedIds(prev =>
                          prev.includes(cand.id) ? prev.filter(i => i !== cand.id) : [...prev, cand.id]
                        );
                      }}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'bg-amber-950/40 border-amber-600/80 ring-1 ring-amber-500'
                          : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-amber-400">
                          {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </div>
                        <div>
                          <span className="font-bold text-white block">{cand.name || 'Candidate'}</span>
                          <span className="text-blue-400 font-mono text-[11px]">{cand.email}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {cand.currentOrPreviousRole || 'BFSI Professional'}
                            {cand.employer && ` at ${cand.employer}`}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-mono text-amber-300 block">
                          {msg?.providerMessageId || 'gmail_sim_record'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {msg?.sentAt ? new Date(msg.sentAt).toLocaleTimeString() : 'Local simulation'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleResetSimulatedSends(selectedSimulatedIds, 'Draft')}
                  disabled={isResettingSimulated || selectedSimulatedIds.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Move Selected to Draft
                </button>

                <button
                  onClick={() => handleResetSimulatedSends(selectedSimulatedIds, 'Approved')}
                  disabled={isResettingSimulated || selectedSimulatedIds.length === 0}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isResettingSimulated ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Approve Selected for Real Send ({selectedSimulatedIds.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sending Logs */}
      {outreachMessages && outreachMessages.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>Outreach Activity & Delivery Logs ({outreachMessages.length})</span>
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">Real provider responses</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2 rounded-l-lg">Time</th>
                  <th className="px-3 py-2">Candidate</th>
                  <th className="px-3 py-2">Recipient Email</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 rounded-r-lg">Provider Message ID / Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {outreachMessages.slice(0, 10).map(msg => {
                  const isSim = isMessageSimulated(msg);
                  return (
                    <tr key={msg.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                        {msg.sentAt ? new Date(msg.sentAt).toLocaleTimeString() : 'Queued'}
                      </td>
                      <td className="px-3 py-2 font-medium text-white">{msg.candidateName}</td>
                      <td className="px-3 py-2 font-mono text-blue-400">{msg.candidateEmail}</td>
                      <td className="px-3 py-2 truncate max-w-xs">{msg.subject}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isSim
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : msg.deliveryStatus === 'sent'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {isSim ? 'Simulated' : msg.deliveryStatus === 'sent' ? 'Sent' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-400 truncate max-w-xs">
                        {msg.providerMessageId || msg.failureReason || 'Pending'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

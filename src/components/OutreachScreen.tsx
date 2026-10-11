import React, { useState } from 'react';
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
  const connectedEmail = outreachSettings?.senderEmail || 'bfsitalenthub@gmail.com';
  const sendingMode = outreachSettings?.sendingMode || 'auto_send';

  const [activeStatusFilter, setActiveStatusFilter] = useState<OutreachStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [editingDraft, setEditingDraft] = useState<{ subject: string; body: string } | null>(null);
  const [isSendingSingle, setIsSendingSingle] = useState(false);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [isResettingSimulated, setIsResettingSimulated] = useState(false);
  const [batchResult, setBatchResult] = useState<{ sentCount: number; failedCount: number; errors: string[] } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Simulated / Test mode sent count (emails that were simulated rather than delivered via real Gmail API)
  const simulatedSentCount = candidates.filter(c => {
    if (c.outreachStatus !== 'Sent') return false;
    const msg = outreachMessages?.find(m => m.candidateId === c.id);
    return !msg || msg.isTestModeSend || msg.providerMessageId?.startsWith('talenthub_') || msg.providerMessageId?.startsWith('test_sim_') || msg.providerMessageId?.startsWith('gmail_sim_');
  }).length;

  const handleResetSimulatedSends = async () => {
    try {
      setIsResettingSimulated(true);
      const res = await fetch('/api/outreach/reset-simulated-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Reset failed');
      showToast(`Successfully moved ${body.resetCount || 0} candidates back to "Approved" status!`, 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsResettingSimulated(false);
    }
  };

  // Status counts
  const draftCount = candidates.filter(c => c.outreachStatus === 'Draft' || !c.outreachStatus).length;
  const approvedCount = candidates.filter(c => c.outreachStatus === 'Approved').length;
  const sentCount = candidates.filter(c => c.outreachStatus === 'Sent').length;
  const failedCount = candidates.filter(c => c.outreachStatus === 'Failed').length;
  const respondedCount = candidates.filter(c => c.outreachStatus === 'Responded').length;
  const appliedCount = candidates.filter(c => c.outreachStatus === 'Applied').length;

  // Filtered candidate list
  const filteredCandidates = candidates.filter(cand => {
    // Only candidates with email or job-seeking status
    const status = cand.outreachStatus || 'Draft';
    if (activeStatusFilter !== 'all' && status !== activeStatusFilter) {
      return false;
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
    if (!isGmailConnected && outreachSettings?.provider === 'gmail_workspace') {
      showToast('Gmail account not connected. Please connect your Gmail in Outreach Settings.', 'error');
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
        throw new Error(body.error || 'Failed to dispatch email via Gmail API.');
      }

      showToast(`Email successfully delivered to ${cand.email} via Gmail API (ID: ${body.messageId})!`, 'success');
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

  // Batch send approved
  const handleBatchSend = async () => {
    if (!isGmailConnected && outreachSettings?.provider === 'gmail_workspace') {
      showToast('Gmail account not connected. Please connect your Gmail in Outreach Settings first.', 'error');
      onNavigateToSettings();
      return;
    }

    const countToSend = sendingMode === 'auto_send' ? approvedCount + draftCount : approvedCount;
    if (countToSend === 0) {
      showToast('No approved candidates available for sending. Please approve candidate drafts first.', 'info');
      return;
    }

    const confirmMsg =
      sendingMode === 'auto_send'
        ? `Ready to send emails to ${countToSend} candidate(s) via your connected Gmail (${connectedEmail})?`
        : `Ready to dispatch verified recruitment emails to ${approvedCount} recruiter-approved candidate(s) via your connected Gmail (${connectedEmail})?`;

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
        showToast(`Successfully dispatched ${body.sentCount} recruitment emails via Gmail API!`, 'success');
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

  const getStatusBadge = (status: OutreachStatus) => {
    switch (status) {
      case 'Draft':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">Draft</span>;
      case 'Approved':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800">Approved</span>;
      case 'Sent':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">Sent</span>;
      case 'Failed':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">Failed</span>;
      case 'Responded':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">Responded</span>;
      case 'Applied':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">Applied</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">Draft</span>;
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white flex items-center space-x-2">
                <Mail className="w-5 h-5 text-indigo-400" />
                <span>Recruiter Outreach & Gmail Dispatch</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800">
                Gmail API OAuth 2.0
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Generate personalized candidate recruitment emails, review drafts with approval control, and dispatch directly through the verified Google Gmail API using the recruiter account.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onNavigateToSettings}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Outreach Settings</span>
            </button>

            <button
              onClick={handleBatchSend}
              disabled={isBatchSending || (!isGmailConnected && outreachSettings?.provider === 'gmail_workspace')}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition flex items-center space-x-1.5 shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isBatchSending ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Send className="w-4 h-4 text-white" />
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

        {/* Gmail Connection Status Card */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            isGmailConnected
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-amber-950/40 border-amber-800/80 text-amber-200'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {isGmailConnected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              <span className="font-semibold block">
                {isGmailConnected
                  ? `Connected Recruiter Gmail: ${connectedEmail}`
                  : 'Recruiter Gmail Account Not Connected'}
              </span>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isGmailConnected
                  ? `OAuth permission: https://www.googleapis.com/auth/gmail.send (Minimum required). Mode: ${
                      sendingMode === 'auto_send' ? 'Controlled Automatic Sending' : 'Require Recruiter Approval (Default)'
                    }`
                  : 'Click "Outreach Settings" to connect your recruiter Gmail account with Google OAuth 2.0.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {!isGmailConnected && (
              <button
                onClick={onNavigateToSettings}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
              >
                Connect Gmail Account
              </button>
            )}
            <a
              href="/apply"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 flex items-center space-x-1.5 transition cursor-pointer"
              title="Open and test the Candidate Registration / Expression of Interest Form"
            >
              <span>Candidate Form Portal (/apply)</span>
              <ExternalLink className="w-3 h-3 text-indigo-400" />
            </a>
          </div>
        </div>

        {/* Simulated / Test Mode Recovery Banner */}
        {simulatedSentCount > 0 && (
          <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold block text-amber-100">
                  {simulatedSentCount} Candidates marked "Sent" in Test / Simulation Mode
                </span>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  These were logged locally with simulated test identifiers and were not sent to Google Gmail servers. Click below to move them back to <strong>Approved</strong> status for live dispatch.
                </p>
              </div>
            </div>
            <button
              onClick={handleResetSimulatedSends}
              disabled={isResettingSimulated}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition flex items-center space-x-1.5 shrink-0 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isResettingSimulated ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>Reset {simulatedSentCount} to Approved</span>
            </button>
          </div>
        )}

        {/* 6 Outreach Status Filters Bar */}
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

          {/* Sent */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Sent' ? 'all' : 'Sent')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Sent'
                ? 'bg-emerald-950/70 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                : 'bg-emerald-950/20 border-emerald-900/40 hover:bg-emerald-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">Sent</span>
              <Send className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-emerald-400">{sentCount}</span>
              <span className="text-[10px] text-emerald-300/70">dispatched</span>
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
              <span className="text-[10px] text-amber-300/70">interested</span>
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
              <span className="text-[10px] text-purple-300/70">form submitted</span>
            </div>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 font-medium">Viewing Status:</span>
            <span className="font-semibold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
              {activeStatusFilter === 'all' ? 'All Outreach Candidates' : activeStatusFilter}
            </span>
            {activeStatusFilter !== 'all' && (
              <button
                onClick={() => setActiveStatusFilter('all')}
                className="text-blue-400 hover:text-blue-300 text-[11px] underline cursor-pointer"
              >
                Clear Filter
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
            Dispatched <strong>{batchResult.sentCount}</strong> email(s) successfully via Gmail API. {batchResult.failedCount} failed.
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

            return (
              <div
                key={candidate.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-sm transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Status header & Tag */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      {getStatusBadge(status)}
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
                      {candidate.currentOrPreviousRole || 'Sales Role'}
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
                        <span>Sent At:</span>
                        <span>{new Date(candidate.outreachSentAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Draft preview snippet */}
                  {candidate.draftEmail && (
                    <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800 text-[11px] space-y-1">
                      <div className="text-slate-300 font-semibold truncate">
                        Subject: {candidate.draftEmail.subject}
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
                    <span>View / Edit Email</span>
                  </button>

                  <div className="flex items-center space-x-1.5">
                    {status === 'Draft' && (
                      <button
                        onClick={() => handleApprove(candidate.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/50 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                    )}

                    {(status === 'Approved' || status === 'Draft' || status === 'Failed') && hasEmail && (
                      <button
                        onClick={() => handleSendSingle(candidate)}
                        disabled={isSendingSingle}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center space-x-1 transition cursor-pointer disabled:opacity-50"
                        title="Send recruitment email directly via connected Gmail"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Now</span>
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
                  Personalized invitation for {selectedCandidate.name || 'Candidate'} ({selectedCandidate.email})
                </p>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {sendError && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Gmail Dispatch Error</span>
                    <p className="text-[11px] mt-0.5">{sendError}</p>
                  </div>
                </div>
              )}

              {/* Recipient Details */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Recipient</span>
                  <span className="text-white font-medium">{selectedCandidate.name || 'Candidate'}</span>
                  <p className="text-blue-400 font-mono text-[11px]">{selectedCandidate.email || 'No email'}</p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Sender Account</span>
                  <span className="text-emerald-400 font-medium">
                    {outreachSettings?.senderName || 'BFSITalentHub Recruitment'}
                  </span>
                  <p className="text-slate-300 font-mono text-[11px]">{connectedEmail}</p>
                </div>
              </div>

              {/* Subject */}
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

              {/* Body */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Email Message Body</label>
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
                <span className="font-semibold text-slate-300 block">Registration Link Included:</span>
                <p className="text-indigo-300 font-mono">{outreachSettings?.googleFormUrl || 'https://forms.gle/bfsitalenthub'}</p>
                <p className="text-[10px] text-slate-500">
                  Recipient can also opt out via automated one-click unsubscribe URL attached at footer.
                </p>
              </div>
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
                  <span>{isSendingSingle ? 'Sending via Gmail...' : 'Send via Gmail API'}</span>
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
            <span className="text-[10px] text-slate-500 font-mono">Real-time Gmail API responses</span>
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
                  <th className="px-3 py-2 rounded-r-lg">Gmail Message ID / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {outreachMessages.slice(0, 10).map(msg => (
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
                          msg.deliveryStatus === 'sent'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {msg.deliveryStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400 truncate max-w-xs">
                      {msg.providerMessageId || msg.failureReason || 'Pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

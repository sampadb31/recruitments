import React, { useState, useEffect } from 'react';
import {
  Linkedin,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Info,
  Edit3,
  Save,
  MessageSquare,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { Candidate, LinkedInOutreachStatus, AppDatabase } from '../types/index.ts';

interface LinkedInOutreachSectionProps {
  data: AppDatabase;
  mode: 'demo' | 'live';
  onRefresh: () => Promise<void>;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

interface LinkedInApiStatus {
  isConfigured: boolean;
  mode: 'official_api' | 'ready_queue_mode';
  hasPersonalAccessToken: boolean;
  hasClientCredentials: boolean;
  missingSetup: string[];
  setupGuide: {
    title: string;
    steps: string[];
    documentationUrl: string;
  };
}

export const LinkedInOutreachSection: React.FC<LinkedInOutreachSectionProps> = ({
  data,
  mode,
  onRefresh,
  showToast,
}) => {
  const { candidates } = data;
  const [apiStatus, setApiStatus] = useState<LinkedInApiStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [activeStatusFilter, setActiveStatusFilter] = useState<LinkedInOutreachStatus | 'all'>('all');
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
  const [editingDrafts, setEditingDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchLinkedInStatus();
  }, [mode]);

  const fetchLinkedInStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/linkedin/status');
      if (res.ok) {
        const body = await res.json();
        setApiStatus(body);
      }
    } catch (err) {
      console.error('Failed to fetch LinkedIn API status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const setActionLoading = (id: string, action: string, loading: boolean) => {
    setLoadingActions(prev => ({
      ...prev,
      [`${id}_${action}`]: loading,
    }));
  };

  const isActionLoading = (id: string, action: string) => {
    return Boolean(loadingActions[`${id}_${action}`]);
  };

  // Filter candidates eligible for LinkedIn outreach:
  // Must match criteria, be self job-seeking, not recruiter ad, have no valid email, and have a LinkedIn profile URL
  const eligibleLinkedInCandidates = candidates.filter(c => {
    if (c.linkedInOutreachStatus && c.linkedInOutreachStatus !== 'Not Applicable') {
      return true;
    }
    const hasValidEmail = Boolean(c.email && c.email.includes('@'));
    if (!hasValidEmail && c.criteriaTag === 'Matches Criteria' && c.authorIntent === 'SELF_JOB_SEEKING') {
      const p = c.profileUrl || c.profileUrlOrTelegramId || '';
      return p.toLowerCase().includes('linkedin.com');
    }
    return false;
  });

  // Status counts
  const readyQueueCount = eligibleLinkedInCandidates.filter(
    c => !c.linkedInOutreachStatus || c.linkedInOutreachStatus === 'Ready Queue'
  ).length;
  const sentCount = eligibleLinkedInCandidates.filter(c => c.linkedInOutreachStatus === 'Invitation Sent').length;
  const acceptedCount = eligibleLinkedInCandidates.filter(
    c => c.linkedInOutreachStatus === 'Invitation Accepted' || c.linkedInOutreachStatus === 'Follow-Up Drafted'
  ).length;
  const followUpSentCount = eligibleLinkedInCandidates.filter(c => c.linkedInOutreachStatus === 'Follow-Up Sent').length;
  const failedCount = eligibleLinkedInCandidates.filter(c => c.linkedInOutreachStatus === 'Failed').length;

  const filteredCandidates = eligibleLinkedInCandidates.filter(c => {
    if (activeStatusFilter === 'all') return true;
    const s = c.linkedInOutreachStatus || 'Ready Queue';
    if (activeStatusFilter === 'Invitation Accepted') {
      return s === 'Invitation Accepted' || s === 'Follow-Up Drafted';
    }
    return s === activeStatusFilter;
  });

  // Action: Send / Simulate Invitation
  const handleSendInvitation = async (cand: Candidate) => {
    setActionLoading(cand.id, 'invite', true);
    try {
      const res = await fetch('/api/linkedin/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: cand.id,
          mode,
          note: cand.linkedInOutreach?.connectionNote,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || body.message || 'Failed to dispatch LinkedIn invitation.');
      }

      showToast(body.message || `Invitation recorded for ${cand.name || 'Candidate'}!`, 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
      await onRefresh();
    } finally {
      setActionLoading(cand.id, 'invite', false);
    }
  };

  // Action: Check Acceptance / Simulate Acceptance
  const handleCheckAcceptance = async (cand: Candidate) => {
    setActionLoading(cand.id, 'check', true);
    try {
      const res = await fetch('/api/linkedin/check-acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: cand.id,
          mode,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || body.message || 'Failed to check acceptance status.');
      }

      if (body.isAccepted) {
        showToast(body.message, 'success');
      } else {
        showToast(body.message || 'Invitation is still pending candidate acceptance.', 'info');
      }
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(cand.id, 'check', false);
    }
  };

  // Action: Save Follow-up Draft edits
  const handleSaveDraft = async (cand: Candidate, messageText: string) => {
    setActionLoading(cand.id, 'saveDraft', true);
    try {
      const res = await fetch('/api/linkedin/save-followup-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: cand.id,
          mode,
          message: messageText,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save follow-up draft.');
      }

      showToast('Follow-up draft saved.', 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(cand.id, 'saveDraft', false);
    }
  };

  // Action: Explicit Recruiter Send Follow-Up Message (Never automated)
  const handleSendFollowUp = async (cand: Candidate, messageText?: string) => {
    const textToSend =
      messageText ||
      editingDrafts[cand.id] ||
      cand.linkedInOutreach?.followUpDraft?.message;

    if (!textToSend || !textToSend.trim()) {
      showToast('Please enter a follow-up message before sending.', 'error');
      return;
    }

    const confirmMsg =
      mode === 'demo'
        ? `[Demo Simulation] Confirm sending personalized follow-up message to ${cand.name || 'Candidate'}?\n\nThis will safely simulate delivering the follow-up message without contacting LinkedIn.`
        : `Confirm dispatching verified follow-up message to ${cand.name || 'Candidate'} via LinkedIn Messaging API?`;

    if (!window.confirm(confirmMsg)) return;

    setActionLoading(cand.id, 'sendFollowUp', true);
    try {
      const res = await fetch('/api/linkedin/send-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: cand.id,
          mode,
          message: textToSend,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || body.message || 'Failed to dispatch follow-up message.');
      }

      showToast(body.message || `Follow-up message sent to ${cand.name}!`, 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(cand.id, 'sendFollowUp', false);
    }
  };

  // Action: Regenerate Connection Note
  const handleRegenerateNote = async (cand: Candidate) => {
    setActionLoading(cand.id, 'regenNote', true);
    try {
      const res = await fetch('/api/linkedin/regenerate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: cand.id,
          mode,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to regenerate note.');

      showToast('Personalized connection note generated from stored evidence.', 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(cand.id, 'regenNote', false);
    }
  };

  // Action: Copy Note & Open Profile (Manual connect fallback)
  const handleCopyNoteAndOpenProfile = (cand: Candidate, note: string) => {
    const profileUrl = cand.profileUrl || cand.profileUrlOrTelegramId || '';
    navigator.clipboard.writeText(note);
    setCopiedCandidateId(cand.id);
    setTimeout(() => setCopiedCandidateId(null), 2500);

    if (profileUrl) {
      window.open(profileUrl, '_blank', 'noopener,noreferrer');
      showToast(`Personalized note copied to clipboard! Opening LinkedIn profile for ${cand.name || 'candidate'}.`, 'success');
    } else {
      showToast('Note copied to clipboard!', 'success');
    }
  };

  const getLinkedInStatusBadge = (status: LinkedInOutreachStatus | undefined) => {
    const s = status || 'Ready Queue';
    switch (s) {
      case 'Ready Queue':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Ready Queue</span>
          </span>
        );
      case 'Invitation Sent':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-800 flex items-center space-x-1">
            <Send className="w-3 h-3 text-blue-400" />
            <span>Invitation Sent</span>
          </span>
        );
      case 'Invitation Accepted':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
            <UserCheck className="w-3 h-3 text-emerald-400" />
            <span>Accepted • Draft Ready</span>
          </span>
        );
      case 'Follow-Up Drafted':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800 flex items-center space-x-1">
            <Edit3 className="w-3 h-3 text-purple-400" />
            <span>Follow-Up Drafted</span>
          </span>
        );
      case 'Follow-Up Sent':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Follow-Up Delivered</span>
          </span>
        );
      case 'Failed':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center space-x-1">
            <XCircle className="w-3 h-3 text-rose-400" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300">
            {s}
          </span>
        );
    }
  };

  const isConfigured = Boolean(apiStatus?.isConfigured);

  return (
    <div className="space-y-6">
      {/* LinkedIn Mode & API Inspection Status Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2.5 rounded-xl bg-[#0077b5]/20 border border-[#0077b5]/40">
                <Linkedin className="w-5 h-5 text-[#0077b5]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2.5">
                  <span>LinkedIn Outreach Workflow</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-indigo-950 border border-indigo-800 text-indigo-300">
                    No Email Needed
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Targeted connection invitations & follow-up messaging for vetted BFSI candidates who have no valid email.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
            >
              <Info className="w-4 h-4 text-blue-400" />
              <span>LinkedIn Setup Guide</span>
              {showSetupGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Integration State Notice Card */}
        {mode === 'demo' ? (
          <div className="p-4 rounded-xl border border-indigo-800/80 bg-indigo-950/40 text-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <span className="font-semibold block text-indigo-100 text-sm">
                  Demo Sandbox Simulation Active
                </span>
                <p className="text-[11px] text-indigo-300/80 mt-0.5">
                  Invitations and acceptance checks are safely simulated with mock IDs (<code>inv_sim_...</code>). Zero live calls are made to LinkedIn or candidate profiles.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-indigo-900/60 border border-indigo-700 text-[10px] font-mono text-indigo-300 uppercase shrink-0">
              Zero External Contact Guaranteed
            </span>
          </div>
        ) : isConfigured ? (
          <div className="p-4 rounded-xl border border-emerald-800/80 bg-emerald-950/40 text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold block text-emerald-100 text-sm">
                  Official LinkedIn Invitations API: Connected & Verified
                </span>
                <p className="text-[11px] text-emerald-300/80 mt-0.5">
                  Invitations will be dispatched via official LinkedIn API with recruiter profile credentials and tracked invitation URNs.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-emerald-900/60 border border-emerald-700 text-[10px] font-mono text-emerald-300 uppercase shrink-0">
              Official API Mode
            </span>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-amber-800/80 bg-amber-950/40 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold block text-amber-100 text-sm">
                  LinkedIn Ready-Queue Mode Active (Official API Not Configured)
                </span>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  Official LinkedIn Invitations API access is missing. Candidates are held in the <strong>Ready Queue</strong> with generated evidence-based notes. Real invitations are <strong>not claimed sent</strong>. You can connect manually with 1-click or configure server credentials.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-amber-900/60 border border-amber-700 text-[10px] font-mono text-amber-300 uppercase shrink-0">
              Ready-Queue Mode
            </span>
          </div>
        )}

        {/* Expandable Setup Guide Panel */}
        {showSetupGuide && (
          <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/70 text-slate-300 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center space-x-2">
                <Info className="w-4 h-4 text-blue-400" />
                <span>LinkedIn Developer Portal Integration Checklist</span>
              </h3>
              <a
                href="https://www.linkedin.com/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-400 hover:text-blue-300 underline flex items-center space-x-1"
              >
                <span>Open Developer Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-2 text-slate-300">
              <p className="text-slate-400">
                To enable automated invitation dispatching in Live mode through the official LinkedIn Invitations API:
              </p>
              <ul className="list-decimal pl-5 space-y-1.5 font-mono text-[11px]">
                <li>Create or select an App in the LinkedIn Developer Portal (https://www.linkedin.com/developers).</li>
                <li>Request product approval for <strong>"Member Data Portability"</strong> or <strong>"Community Management API" / "Share on LinkedIn and Member Invitations"</strong>.</li>
                <li>Configure the OAuth 2.0 redirect URL and authorize your personal recruiter profile to grant the member invitation scope (e.g. <code>w_member_social</code> / invitations).</li>
                <li>Provide <code>LINKEDIN_ACCESS_TOKEN</code> in your server environment variables.</li>
              </ul>
              <div className="pt-2 border-t border-slate-700 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Current Live Status: {isConfigured ? '✅ Configured' : '⚠️ Missing LINKEDIN_ACCESS_TOKEN'}</span>
                <span>Security Notice: Browser automation, scraping, and session cookies are strictly forbidden.</span>
              </div>
            </div>
          </div>
        )}

        {/* Status Filter Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800">
          {/* Ready Queue */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Ready Queue' ? 'all' : 'Ready Queue')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Ready Queue'
                ? 'bg-amber-950/70 border-amber-500 shadow-sm ring-1 ring-amber-500'
                : 'bg-amber-950/20 border-amber-900/40 hover:bg-amber-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">Ready Queue</span>
              <Clock className="w-3 h-3 text-amber-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-amber-300">{readyQueueCount}</span>
              <span className="text-[10px] text-amber-400/70">pending invite</span>
            </div>
          </button>

          {/* Invitation Sent */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Invitation Sent' ? 'all' : 'Invitation Sent')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Invitation Sent'
                ? 'bg-blue-950/70 border-blue-500 shadow-sm ring-1 ring-blue-500'
                : 'bg-blue-950/20 border-blue-900/40 hover:bg-blue-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">Invites Sent</span>
              <Send className="w-3 h-3 text-blue-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-blue-400">{sentCount}</span>
              <span className="text-[10px] text-blue-300/70">awaiting accept</span>
            </div>
          </button>

          {/* Accepted / Draft Ready */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Invitation Accepted' ? 'all' : 'Invitation Accepted')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Invitation Accepted'
                ? 'bg-purple-950/70 border-purple-500 shadow-sm ring-1 ring-purple-500'
                : 'bg-purple-950/20 border-purple-900/40 hover:bg-purple-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider">Accepted / Draft</span>
              <UserCheck className="w-3 h-3 text-purple-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-purple-400">{acceptedCount}</span>
              <span className="text-[10px] text-purple-300/70">review draft</span>
            </div>
          </button>

          {/* Follow-Up Delivered */}
          <button
            onClick={() => setActiveStatusFilter(activeStatusFilter === 'Follow-Up Sent' ? 'all' : 'Follow-Up Sent')}
            className={`text-left rounded-xl p-2.5 border transition cursor-pointer ${
              activeStatusFilter === 'Follow-Up Sent'
                ? 'bg-emerald-950/70 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                : 'bg-emerald-950/20 border-emerald-900/40 hover:bg-emerald-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">Follow-Up Sent</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-emerald-400">{followUpSentCount}</span>
              <span className="text-[10px] text-emerald-300/70">message delivered</span>
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
              <span className="text-[10px] text-rose-300/70">issues</span>
            </div>
          </button>
        </div>
      </div>

      {/* Candidate Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredCandidates.length === 0 ? (
          <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-2">
            <Linkedin className="w-10 h-10 mx-auto text-slate-600 stroke-1" />
            <p className="text-sm font-semibold text-slate-400">No Candidates in Current LinkedIn Filter</p>
            <p className="text-xs">
              All candidates with no email matching criteria are queued here for LinkedIn connection and follow-up.
            </p>
          </div>
        ) : (
          filteredCandidates.map(candidate => {
            const status = candidate.linkedInOutreachStatus || 'Ready Queue';
            const record = candidate.linkedInOutreach;
            const profileUrl = candidate.profileUrl || candidate.profileUrlOrTelegramId || '';
            const note = record?.connectionNote || '';
            const isCopied = copiedCandidateId === candidate.id;
            const isInviting = isActionLoading(candidate.id, 'invite');
            const isChecking = isActionLoading(candidate.id, 'check');
            const isRegenerating = isActionLoading(candidate.id, 'regenNote');
            const isSendingFollowUp = isActionLoading(candidate.id, 'sendFollowUp');
            const isSavingDraft = isActionLoading(candidate.id, 'saveDraft');

            // Follow-up draft state
            const followUpText =
              editingDrafts[candidate.id] !== undefined
                ? editingDrafts[candidate.id]
                : record?.followUpDraft?.message || '';

            return (
              <div
                key={candidate.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 hover:border-slate-700 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Card Header: Name, Status badge, Profile Link */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-white text-base">
                          {candidate.name || 'Unnamed Candidate'}
                        </h3>
                        {getLinkedInStatusBadge(status)}
                      </div>
                      <p className="text-xs text-slate-300 font-medium mt-0.5">
                        {candidate.currentOrPreviousRole || 'BFSI Professional'}
                        {candidate.employer && (
                          <span className="text-slate-400"> at <strong className="text-slate-200">{candidate.employer}</strong></span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-1">
                        {candidate.currentWorkLocation && (
                          <span>📍 {candidate.currentWorkLocation}</span>
                        )}
                        {candidate.totalExperienceYears !== null && (
                          <span>⏱ {candidate.totalExperienceYears} yrs experience ({candidate.experienceType})</span>
                        )}
                        <span className="text-rose-400/90 font-mono text-[10px]">
                          ✉️ No Email Found
                        </span>
                      </div>
                    </div>

                    {profileUrl && (
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-[#0077b5]/20 hover:text-[#0077b5] text-slate-300 border border-slate-700 transition cursor-pointer flex items-center space-x-1 shrink-0 text-xs"
                        title="Open candidate's public LinkedIn profile in a new tab"
                      >
                        <Linkedin className="w-3.5 h-3.5" />
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Candidate Stated Job-Seeking Statement from Evidence */}
                  {candidate.jobSeekingStatement && (
                    <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                        Stored Evidence (Job Seeking Statement):
                      </span>
                      <p className="italic text-slate-300">"{candidate.jobSeekingStatement}"</p>
                    </div>
                  )}

                  {/* Personalized Connection Note (Evidence Grounded, Under 300 Chars) */}
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-blue-400 flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        <span>Personalized Connection Note</span>
                      </span>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`font-mono text-[10px] ${
                            note.length <= 300 ? 'text-emerald-400' : 'text-rose-400 font-bold'
                          }`}
                        >
                          {note.length}/300 chars
                        </span>
                        <button
                          onClick={() => handleRegenerateNote(candidate)}
                          disabled={isRegenerating || status === 'Follow-Up Sent'}
                          className="text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-40"
                          title="Regenerate note strictly using candidate's stored evidence"
                        >
                          <RotateCcw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 selection:bg-blue-600/30">
                      {note || 'Generating note...'}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-500">
                        Strictly uses verified candidate facts. Never invents facts.
                      </span>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(note);
                          setCopiedCandidateId(candidate.id);
                          setTimeout(() => setCopiedCandidateId(null), 2000);
                          showToast('Note copied to clipboard!', 'info');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium flex items-center space-x-1 transition cursor-pointer"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-semibold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-400" />
                            <span>Copy Note</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Invitation Metadata & Timestamps if dispatched */}
                  {record?.invitationSentAt && (
                    <div className="p-2.5 rounded-xl bg-slate-800/30 border border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center space-x-1.5 font-mono text-[10px]">
                        <span>ID: {record.invitationId || 'inv_recorded'}</span>
                        {record.isSimulated && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[9px]">
                            Simulated
                          </span>
                        )}
                      </span>
                      <span>Dispatched: {new Date(record.invitationSentAt).toLocaleString()}</span>
                    </div>
                  )}

                  {/* Follow-up Draft Editor when Invitation Accepted */}
                  {(status === 'Invitation Accepted' || status === 'Follow-Up Drafted') && (
                    <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-300 flex items-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Candidate Accepted • Review Follow-Up Draft</span>
                        </span>
                        <span className="text-[10px] text-emerald-400/80 font-mono">
                          Requires Recruiter Send
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300">
                        A personalized message draft was generated from {candidate.name}'s verified background. Review or edit before sending:
                      </p>

                      <textarea
                        rows={6}
                        value={followUpText}
                        onChange={e =>
                          setEditingDrafts(prev => ({
                            ...prev,
                            [candidate.id]: e.target.value,
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-sans"
                        placeholder="Personalized follow-up message..."
                      />

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => handleSaveDraft(candidate, followUpText)}
                          disabled={isSavingDraft}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          <span>Save Draft</span>
                        </button>

                        <button
                          onClick={() => handleSendFollowUp(candidate, followUpText)}
                          disabled={isSendingFollowUp}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
                        >
                          {isSendingFollowUp ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Send Follow-Up Message</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Follow-Up Delivered Record */}
                  {status === 'Follow-Up Sent' && (
                    <div className="bg-emerald-950/30 border border-emerald-800/80 rounded-xl p-3 text-xs text-emerald-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center space-x-1 text-emerald-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Follow-Up Delivered</span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          {record?.followUpSentAt ? new Date(record.followUpSentAt).toLocaleTimeString() : 'Delivered'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 font-mono text-xs">
                        Message ID: {record?.followUpMessageId || 'li_msg_sent'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Primary Actions Bar */}
                <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  {status === 'Ready Queue' && (
                    <>
                      {mode === 'demo' ? (
                        <button
                          onClick={() => handleSendInvitation(candidate)}
                          disabled={isInviting}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow cursor-pointer disabled:opacity-50"
                        >
                          {isInviting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Simulate Send Invite</span>
                        </button>
                      ) : isConfigured ? (
                        <button
                          onClick={() => handleSendInvitation(candidate)}
                          disabled={isInviting}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow cursor-pointer disabled:opacity-50"
                        >
                          {isInviting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Send Official Invitation</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCopyNoteAndOpenProfile(candidate, note)}
                          className="px-3.5 py-1.5 rounded-xl bg-[#0077b5] hover:bg-[#006097] text-white font-semibold text-xs flex items-center space-x-1.5 shadow cursor-pointer"
                          title="Copies note to clipboard and opens candidate's profile so you can send connection invite directly on LinkedIn"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Note & Connect on LinkedIn</span>
                        </button>
                      )}

                      <span className="text-[10px] text-slate-500">
                        {mode === 'demo'
                          ? 'Demo: Simulates API action'
                          : isConfigured
                          ? 'Official Invitations API'
                          : 'Held in Ready Queue'}
                      </span>
                    </>
                  )}

                  {status === 'Invitation Sent' && (
                    <>
                      <button
                        onClick={() => handleCheckAcceptance(candidate)}
                        disabled={isChecking}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow cursor-pointer disabled:opacity-50"
                      >
                        {isChecking ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {mode === 'demo' ? 'Simulate Candidate Acceptance' : 'Check Acceptance Status'}
                        </span>
                      </button>

                      <span className="text-[10px] text-blue-400 font-mono">
                        Awaiting candidate response
                      </span>
                    </>
                  )}

                  {(status === 'Invitation Accepted' || status === 'Follow-Up Drafted') && (
                    <div className="w-full flex items-center justify-between text-xs text-slate-400">
                      <span>Invitation Accepted</span>
                      <span className="text-purple-300 font-medium">Review & send draft above</span>
                    </div>
                  )}

                  {status === 'Follow-Up Sent' && (
                    <div className="w-full flex items-center justify-between text-xs text-emerald-400">
                      <span>✓ Completed outreach cycle</span>
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline flex items-center space-x-1"
                      >
                        <span>View on LinkedIn</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

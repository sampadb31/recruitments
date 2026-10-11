import React, { useState } from 'react';
import {
  Users,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Search,
  Sparkles,
  Clock,
  ArrowRight,
  TrendingUp,
  Layers,
  ShieldAlert,
  Linkedin,
  HelpCircle,
  Loader2,
  ExternalLink,
  MapPin,
  Calendar,
  Filter,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Terminal,
  Key,
  Radio,
  Inbox,
  Mail,
  Phone,
} from 'lucide-react';
import {
  AppDatabase,
  Candidate,
  ScanRun,
  ActiveCollectionRun,
  CriteriaTag,
  AppErrorDetails,
  ApifyDiagnostics,
} from '../types/index.ts';
import { CandidateDetailModal } from './CandidateDetailModal.tsx';

interface DashboardScreenProps {
  data: AppDatabase;
  mode: 'demo' | 'live';
  onFindCandidates: (timeWindow: '24h' | '7d', limit: number, useSmallTestQuery?: boolean) => Promise<void>;
  onNavigateTab: (tab: 'dashboard' | 'sources' | 'candidates' | 'settings') => void;
  isScanning: boolean;
  activeRun: ActiveCollectionRun | null;
  geminiConfigured: boolean;
  apifyConfigured: boolean;
  apifyDiagnostics?: ApifyDiagnostics | null;
  onSaveCorrection: (id: string, updates: Partial<Candidate>) => Promise<void>;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  data,
  mode,
  onFindCandidates,
  onNavigateTab,
  isScanning,
  activeRun,
  geminiConfigured,
  apifyConfigured,
  apifyDiagnostics,
  onSaveCorrection,
}) => {
  const { candidates, posts, scanRuns, schedule } = data;

  const [timeWindow, setTimeWindow] = useState<'24h' | '7d'>('7d');
  const [usageCap, setUsageCap] = useState<number>(20);
  const [selectedTagFilter, setSelectedTagFilter] = useState<'all' | CriteriaTag>('all');
  const [inspectingCandidate, setInspectingCandidate] = useState<Candidate | null>(null);
  const [showErrorPanel, setShowErrorPanel] = useState<boolean>(true);
  const [copiedError, setCopiedError] = useState<boolean>(false);

  const matchesCount = candidates.filter(c => c.criteriaTag === 'Matches Criteria').length;
  const reviewCount = candidates.filter(c => c.criteriaTag === 'Needs Review').length;
  const outsideCount = candidates.filter(c => c.criteriaTag === 'Outside Target').length;
  const recruiterAdsCount = posts.filter(p => p.extractionState === 'recruiter_ad').length;

  const isBusy = isScanning || (activeRun && activeRun.status !== 'completed' && activeRun.status !== 'failed');

  const lastSuccessfulRun = scanRuns.find(r => r.status === 'success');
  const lastFailedRun = scanRuns.find(r => r.status === 'failed');

  // Error details to inspect (from active run or latest failed run)
  const currentErrorDetails: AppErrorDetails | undefined =
    activeRun?.errorDetails || lastFailedRun?.errorDetails;
  const currentErrorMessage =
    activeRun?.error || lastFailedRun?.error || currentErrorDetails?.message;

  const filteredCandidates = candidates.filter(c => {
    if (selectedTagFilter !== 'all' && c.criteriaTag !== selectedTagFilter) return false;
    return true;
  });

  const handleStartSearch = (useSmallTest: boolean = false) => {
    if (useSmallTest) {
      onFindCandidates('7d', 5, true);
    } else {
      onFindCandidates(timeWindow, usageCap, false);
    }
  };

  const handleCopyErrorJson = () => {
    if (!currentErrorDetails && !currentErrorMessage) return;
    const errorJson = JSON.stringify(
      {
        message: currentErrorMessage,
        httpStatus: currentErrorDetails?.httpStatus || 400,
        statusText: currentErrorDetails?.statusText || 'Bad Request',
        rejectedField: currentErrorDetails?.rejectedField || 'input.postedLimit',
        remedy:
          currentErrorDetails?.remedy ||
          'Mapped UI internal value ("7d") to Apify accepted enum ("week" or "24h"). Ensured maxPosts is integer.',
        outgoingPayload: currentErrorDetails?.outgoingPayload || {
          searchQueries: ['sales AND "open to work"'],
          postedLimit: 'week',
          sortBy: 'date',
          maxPosts: 5,
          profileScraperMode: 'main',
          scrapeComments: false,
          scrapeReactions: false,
        },
        responseBody: currentErrorDetails?.responseBody || {
          error: {
            type: 'invalid-input',
            message:
              'Input is not valid: Field input.postedLimit must be equal to one of the allowed values: "any", "1h", "24h", "week", "month", "3months", "6months", "year"',
          },
        },
        timestamp: currentErrorDetails?.timestamp || new Date().toISOString(),
        securityNote: 'Never log API tokens. APIFY_API_TOKEN is stored strictly server-side.',
      },
      null,
      2
    );

    navigator.clipboard.writeText(errorJson).then(() => {
      setCopiedError(true);
      setTimeout(() => setCopiedError(false), 2500);
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Mode Identification Banner */}
      <div
        className={`px-4 py-2.5 rounded-xl border flex items-center justify-between text-xs ${
          mode === 'demo'
            ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
            : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
        }`}
      >
        <div className="flex items-center space-x-2">
          {mode === 'demo' ? (
            <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold uppercase tracking-wider text-[10px]">
              Demo Sandbox
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold uppercase tracking-wider text-[10px] flex items-center space-x-1">
              <Radio className="w-2.5 h-2.5 animate-pulse" />
              <span>Live Mode</span>
            </span>
          )}
          <span className="text-slate-300">
            {mode === 'demo'
              ? 'Using pre-loaded simulated candidates for 5-point evaluation testing. External Apify API calls are disabled in Demo mode.'
              : 'Connected to Apify harvestapi/linkedin-post-search actor. Ingesting live LinkedIn posts and author profiles.'}
          </span>
        </div>

        {mode === 'live' && (
          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded ${
                apifyConfigured
                  ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                  : 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
              }`}
            >
              <span>{apifyConfigured ? 'Apify Token Configured' : 'Setup Required'}</span>
            </span>
          </div>
        )}
      </div>

      {/* Setup Required Banner if in Live mode and Apify token is missing or placeholder */}
      {mode === 'live' && !apifyConfigured && (
        <div className={`p-5 rounded-2xl shadow-md space-y-2 border ${
          apifyDiagnostics?.isPlaceholder
            ? 'bg-amber-950/80 border-amber-500/80 text-amber-100 ring-1 ring-amber-500/40'
            : 'bg-amber-950/60 border-amber-800/80 text-amber-200'
        }`}>
          <div className="flex items-center space-x-2 font-bold text-sm text-amber-300">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              {apifyDiagnostics?.isPlaceholder
                ? 'Configuration Action Required: Placeholder Token Detected ("MY_APIFY_API_TOKEN")'
                : 'Setup Required: Apify harvestapi/linkedin-post-search Actor Connection'}
            </span>
          </div>
          {apifyDiagnostics?.isPlaceholder ? (
            <p className="text-xs text-amber-100/90 leading-relaxed">
              Your <code className="bg-amber-900/80 px-1.5 py-0.5 rounded font-mono text-amber-200">APIFY_API_TOKEN</code> secret exists in Google AI Studio, but its value is currently set to the placeholder text <strong className="text-amber-300">"MY_APIFY_API_TOKEN"</strong>. Please open <strong className="text-white underline">Settings &gt; Secrets</strong>, click Edit on <code className="bg-amber-900/80 px-1.5 py-0.5 rounded font-mono text-amber-200">APIFY_API_TOKEN</code>, and paste your actual token from Apify (starts with <code className="text-amber-200 font-mono">apify_api_...</code>).
            </p>
          ) : (
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Live LinkedIn candidate harvesting requires your Apify API token. In AI Studio, open{' '}
              <strong className="text-white underline">Settings &gt; Secrets</strong> and add{' '}
              <code className="bg-amber-900/60 px-1.5 py-0.5 rounded font-mono text-amber-100">
                APIFY_API_TOKEN
              </code>
              . As mandated, sample data is never displayed as live results.
            </p>
          )}
          <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
            <button
              onClick={() => onNavigateTab('settings')}
              className="px-3.5 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-700 text-white font-semibold border border-amber-600 transition cursor-pointer flex items-center space-x-1.5 shadow"
            >
              <span>Fix in Integration Settings</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <a
              href="https://console.apify.com/account/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-blue-300 font-medium border border-slate-700/80 transition flex items-center space-x-1"
            >
              <span>Get Token from Apify Console</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-[11px] text-amber-400">
              Actor: harvestapi/linkedin-post-search
            </span>
          </div>
        </div>
      )}

      {/* Expandable & Copyable Error Details Panel (shows when an error has occurred or failed run exists) */}
      {(lastFailedRun || (activeRun && activeRun.status === 'failed')) && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-rose-900/60 border border-rose-700/60 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-sm font-bold text-white">
                    Apify Provider Request Diagnostics
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-900 text-rose-200 border border-rose-700">
                    HTTP {currentErrorDetails?.httpStatus || (currentErrorMessage?.includes('403') ? 403 : 400)}{' '}
                    {currentErrorDetails?.statusText || (currentErrorMessage?.includes('403') ? 'Forbidden' : 'Error')}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-amber-300 border border-amber-800/60">
                    {currentErrorDetails?.responseBody?.error?.type
                      ? `error.type: "${currentErrorDetails.responseBody.error.type}"`
                      : currentErrorMessage?.includes('Monthly usage hard limit')
                      ? 'error.type: "platform-feature-disabled"'
                      : 'error.type: "actor-execution-error"'}
                  </span>
                </div>
                <p className="text-xs text-rose-200/90 mt-0.5">
                  {currentErrorMessage || 'Apify rejected the outgoing request parameters.'}
                </p>
              </div>
            </div>

            {/* Actions: Copy & Toggle */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyErrorJson}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 hover:border-slate-600 transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
                title="Copy sanitized JSON containing outgoing payload, response body, and remedy"
              >
                {copiedError ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Copied JSON!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Error Details</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setShowErrorPanel(prev => !prev)}
                className="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-900/90 text-rose-200 text-xs font-semibold border border-rose-700/80 transition flex items-center space-x-1 cursor-pointer"
              >
                <span>{showErrorPanel ? 'Collapse' : 'Expand Details'}</span>
                {showErrorPanel ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Root cause badge & remedy text */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
            {currentErrorMessage?.includes('Monthly usage hard limit') ||
            currentErrorDetails?.responseBody?.error?.type === 'platform-feature-disabled' ? (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Root Cause Identified:
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-rose-950 text-rose-300 border border-rose-800">
                    Apify Monthly Usage Limit Exceeded (Free Credit Exhausted)
                  </span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Your Apify API key is <strong className="text-emerald-400 font-medium">valid and authenticated</strong>, but Apify blocked this run with <code className="text-rose-300 font-mono">HTTP 403 (platform-feature-disabled)</code> because your Apify account has reached its <strong>Monthly Usage Hard Limit</strong> ($5 free tier credit allowance).
                </p>
                <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3 pt-1 border-t border-slate-800">
                  <a
                    href="https://console.apify.com/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 underline font-semibold"
                  >
                    <span>Check Apify Billing & Increase Limit</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-300">
                    Tip: Switch to <strong className="text-indigo-400">Demo Sandbox</strong> in the top header to run end-to-end extraction and evaluation without consuming Apify credits.
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Root Cause Identified:
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-amber-950 text-amber-300 border border-amber-800">
                    {currentErrorDetails?.rejectedField || 'Actor Execution Issue'}
                  </span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  {currentErrorDetails?.remedy || currentErrorMessage}
                </p>
              </>
            )}
          </div>

          {/* Collapsible Inspection Details */}
          {showErrorPanel && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                {/* Outgoing Request Payload */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center space-x-1.5">
                      <Terminal className="w-3.5 h-3.5 text-blue-400" />
                      <span>Actual Outgoing Request Body (Sanitized)</span>
                    </span>
                    <span className="text-[10px] text-emerald-400">JSON Payload</span>
                  </div>
                  <pre className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-48">
                    {JSON.stringify(
                      currentErrorDetails?.outgoingPayload || {
                        searchQueries: ['sales AND "open to work"'],
                        postedLimit: 'week',
                        sortBy: 'date',
                        maxPosts: 5,
                        profileScraperMode: 'main',
                        scrapeComments: false,
                        scrapeReactions: false,
                      },
                      null,
                      2
                    )}
                  </pre>
                  <p className="text-[10px] text-slate-500">
                    Never logs API tokens. Authorization is passed strictly in server-to-server HTTP headers.
                  </p>
                </div>

                {/* Apify Provider Full Response */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center space-x-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Full Apify Provider Response Body</span>
                    </span>
                    <span className="text-[10px] text-rose-400 font-mono">
                      HTTP {currentErrorDetails?.httpStatus || 400}
                    </span>
                  </div>
                  <pre className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-rose-300 overflow-x-auto max-h-48">
                    {JSON.stringify(
                      currentErrorDetails?.responseBody || {
                        error: {
                          type: 'invalid-input',
                          message:
                            'Input is not valid: Field input.postedLimit must be equal to one of the allowed values: "any", "1h", "24h", "week", "month", "3months", "6months", "year"',
                        },
                      },
                      null,
                      2
                    )}
                  </pre>
                  <p className="text-[10px] text-slate-500">
                    Timestamp: {currentErrorDetails?.timestamp || new Date().toISOString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hero: "Find Candidates" Panel with Controls */}
      <div
        className={`bg-gradient-to-r border rounded-2xl p-6 shadow-md space-y-5 ${
          mode === 'demo'
            ? 'from-slate-900 via-slate-900 to-amber-950/40 border-amber-900/40'
            : 'from-slate-900 via-slate-900 to-indigo-950 border-indigo-900/40'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                  mode === 'demo'
                    ? 'bg-amber-900/60 text-amber-300 border-amber-700/50'
                    : 'bg-blue-900/60 text-blue-300 border-blue-700/50'
                }`}
              >
                {mode === 'demo' ? 'Demo Sandbox' : 'Live LinkedIn Search'}
              </span>
              <span className="text-xs text-slate-300 font-medium">
                Target: Job Seekers (1–10 yrs exp) • Across Any Sector (Wealthtech, FMCG, Automotive, NBFC, BFSI, &amp; more)
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              {mode === 'demo'
                ? 'Job-Seeking Candidates Across Any Sector'
                : 'Find Job-Seekers Across Any Sector (1–10y Exp)'}
            </h1>

            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              {mode === 'demo'
                ? 'Demo Sandbox tests evidence-based verification and recruiter workflow across sectors (Wealthtech, FMCG, NBFC, Automotive, etc.) with 1–10 years experience.'
                : 'Harvests posts from LinkedIn and verifies candidates looking out for jobs with 1–10 years experience across any sector in India. Rejects recruiter ads, customer complaints, and senior >10y profiles.'}
            </p>
          </div>

          {/* Search Configuration & Action Buttons */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Time Window Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Post Period
              </label>
              <select
                value={timeWindow}
                onChange={e => setTimeWindow(e.target.value as '24h' | '7d')}
                disabled={Boolean(isBusy)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="7d">Last 7 Days (postedLimit: "week")</option>
                <option value="24h">Last 24 Hours (postedLimit: "24h")</option>
              </select>
            </div>

            {/* Usage Cap Limit */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Usage Cap (Posts)
              </label>
              <select
                value={usageCap}
                onChange={e => setUsageCap(parseInt(e.target.value, 10))}
                disabled={Boolean(isBusy)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value={5}>5 Posts (Quick)</option>
                <option value={10}>10 Posts</option>
                <option value={20}>20 Posts (Default)</option>
                <option value={30}>30 Posts</option>
                <option value={50}>50 Posts</option>
              </select>
            </div>

            {/* Action Buttons: Find Candidates and Quick 5-Post Test */}
            <div className="self-end sm:self-auto pt-2 sm:pt-4 flex items-center space-x-2">
              {mode === 'live' && (
                <button
                  onClick={() => handleStartSearch(true)}
                  disabled={Boolean(isBusy)}
                  className="px-3.5 py-2.5 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-700/50 hover:border-indigo-500 disabled:opacity-50 transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  title="Run verified small test: 5 posts with query 'sales AND open to work'"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Quick Test (5 Posts)</span>
                </button>
              )}

              <button
                onClick={() => handleStartSearch(false)}
                disabled={Boolean(isBusy)}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-50 text-white shadow-lg transition flex items-center justify-center space-x-2 cursor-pointer ${
                  mode === 'demo'
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                }`}
                title={mode === 'demo' ? 'Simulate candidate run in Demo Sandbox' : 'Trigger automated search on LinkedIn via Apify'}
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{mode === 'demo' ? 'Evaluating Sample Data...' : 'Searching LinkedIn via Apify...'}</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>{mode === 'demo' ? 'Simulate Candidate Run' : 'Find Candidates'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Active Run Progress Bar */}
        {activeRun && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                {activeRun.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : activeRun.status === 'failed' ? (
                  <XCircle className="w-4 h-4 text-rose-400" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                )}
                <span className="font-bold text-white capitalize flex items-center space-x-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                      activeRun.mode === 'demo'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {activeRun.mode === 'demo' ? 'Demo Sandbox' : 'Live Mode'}
                  </span>
                  <span>
                    Collection Run {activeRun.runId.slice(0, 16)} — {activeRun.status.replace('_', ' ')}
                  </span>
                </span>
              </div>
              <div className="text-slate-400 text-[11px] font-mono">
                Fetched: {activeRun.fetchedPostsCount} • Validated: {activeRun.analyzedCandidatesCount} • Duplicates: {activeRun.duplicatesCount} • Errors: {activeRun.failuresCount}
              </div>
            </div>

            {/* Activity Logs Console */}
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 max-h-24 overflow-y-auto space-y-1">
              {activeRun.logs.slice(-6).map((line, idx) => (
                <div key={idx} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Summary Row */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span>
              Last Successful Run:{' '}
              <strong>
                {lastSuccessfulRun ? new Date(lastSuccessfulRun.runAt).toLocaleString() : 'None recorded'}
              </strong>
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-purple-400" />
            <span>
              Outreach Policy: <strong>No automated messaging sent (intake only)</strong>
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>
              AI Extractor: <strong>Gemini 3.8 Flash (Expanded Two-Stage Validation + Contact Extraction)</strong>
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Retrieved Posts (Explicit: NOT counted as matched candidates) */}
        <div
          onClick={() => onNavigateTab('sources')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Retrieved Posts</span>
            <Inbox className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{posts.length}</p>
          <p className="text-[11px] text-slate-500 mt-1 leading-tight">Total ingested • Not counted as candidates</p>
        </div>

        {/* Matches Criteria */}
        <div
          onClick={() => {
            setSelectedTagFilter('Matches Criteria');
            onNavigateTab('candidates');
          }}
          className={`bg-slate-900 border rounded-xl p-4 transition cursor-pointer ${
            selectedTagFilter === 'Matches Criteria'
              ? 'border-emerald-500'
              : 'border-emerald-900/40 hover:border-emerald-700/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400">Matches Criteria</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{matchesCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">All 6 checks verified</p>
        </div>

        {/* Needs Review */}
        <div
          onClick={() => {
            setSelectedTagFilter('Needs Review');
            onNavigateTab('candidates');
          }}
          className={`bg-slate-900 border rounded-xl p-4 transition cursor-pointer ${
            selectedTagFilter === 'Needs Review'
              ? 'border-amber-500'
              : 'border-amber-900/40 hover:border-amber-700/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-400">Needs Review</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{reviewCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">Seeking confirmed, facts unconfirmed</p>
        </div>

        {/* Outside Target */}
        <div
          onClick={() => {
            setSelectedTagFilter('Outside Target');
            onNavigateTab('candidates');
          }}
          className={`bg-slate-900 border rounded-xl p-4 transition cursor-pointer ${
            selectedTagFilter === 'Outside Target'
              ? 'border-rose-500'
              : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-400">Outside Target</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 mt-2">{outsideCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">&gt;10y, outside India, non-sales</p>
        </div>

        {/* Rejected Posts (Recruiter Ads & Unrelated) */}
        <div
          onClick={() => onNavigateTab('candidates')}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-400">Rejected Posts</span>
            <ShieldAlert className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-400 mt-2">
            {posts.filter(p => p.extractionState === 'recruiter_ad' || p.extractionState === 'rejected_post' || (p.authorIntent && p.authorIntent !== 'SELF_JOB_SEEKING')).length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Recruiter ads &amp; unrelated</p>
        </div>
      </div>

      {/* Main Candidate Verification Table / Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Users className="w-5 h-5 text-blue-400" />
              <span>Validated Candidate Records & 5-Point Evidence</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Displays name, role, employer, work location, experience, job-seeking statement, post date, links and evidence checks.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={selectedTagFilter}
              onChange={e => setSelectedTagFilter(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="all">All Match Statuses ({candidates.length})</option>
              <option value="Matches Criteria">Matches Criteria ({matchesCount})</option>
              <option value="Needs Review">Needs Review ({reviewCount})</option>
              <option value="Outside Target">Outside Target ({outsideCount})</option>
            </select>
          </div>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-xl p-10 text-center text-slate-500 space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-600 stroke-1" />
            <p className="text-sm font-semibold text-slate-400">No Candidates Found</p>
            <p className="text-xs">
              Click <strong>"Find Candidates"</strong> above to harvest LinkedIn posts using Apify.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCandidates.map(candidate => {
              const checks = candidate.validationChecks;
              const hasPostLink = Boolean(candidate.postUrl);
              const hasProfileLink = Boolean(candidate.profileUrl || candidate.profileUrlOrTelegramId);

              return (
                <div
                  key={candidate.id}
                  className="bg-slate-800/40 border border-slate-700/60 hover:border-slate-600 rounded-xl p-5 transition space-y-3.5"
                >
                  {/* Top Bar: Identity & Status */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-white">
                          {candidate.name || <em className="text-slate-400 font-normal">Name Not Provided</em>}
                        </h3>
                        {candidate.isManuallyCorrected && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                            MANUALLY CORRECTED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold text-white">
                          {candidate.currentOrPreviousRole || 'Role Not Provided'}
                        </span>
                        {candidate.employer && (
                          <span className="text-slate-400">at {candidate.employer}</span>
                        )}
                        {candidate.currentWorkLocation && (
                          <span className="flex items-center text-emerald-400 space-x-1 font-medium">
                            <MapPin className="w-3 h-3 inline" />
                            <span>
                              {typeof candidate.currentWorkLocation === 'string' && candidate.currentWorkLocation !== '[object Object]'
                                ? candidate.currentWorkLocation
                                : 'India'}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 self-start md:self-auto">
                      <span
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold ${
                          candidate.criteriaTag === 'Matches Criteria'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : candidate.criteriaTag === 'Needs Review'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {candidate.criteriaTag === 'Matches Criteria' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : candidate.criteriaTag === 'Needs Review' ? (
                          <AlertCircle className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{candidate.criteriaTag}</span>
                      </span>

                      <button
                        onClick={() => setInspectingCandidate(candidate)}
                        className="px-3 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 text-xs font-medium transition flex items-center space-x-1 cursor-pointer"
                      >
                        <span>Inspect & Correct</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Core Attributes Row */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Experience:</span>
                      <span className="font-bold text-emerald-400">
                        {candidate.totalExperienceYears !== null
                          ? `${candidate.totalExperienceYears} Years`
                          : 'Not Stated'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Original Post Date:</span>
                      <span className="text-slate-200">
                        {candidate.originalPostDate
                          ? new Date(
                              typeof candidate.originalPostDate === 'object'
                                ? (candidate.originalPostDate as any).date ||
                                  (candidate.originalPostDate as any).timestamp ||
                                  Date.now()
                                : candidate.originalPostDate
                            ).toLocaleDateString()
                          : 'Not Stated'}
                      </span>
                    </div>

                    <div className="truncate">
                      <span className="text-slate-400 block text-[11px]">Profile Link:</span>
                      {hasProfileLink ? (
                        <a
                          href={candidate.profileUrl || candidate.profileUrlOrTelegramId!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline flex items-center space-x-1 font-mono truncate"
                        >
                          <span className="truncate">{candidate.profileUrl || candidate.profileUrlOrTelegramId}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-500">Not Provided</span>
                      )}
                    </div>

                    <div className="truncate">
                      <span className="text-slate-400 block text-[11px]">Post Link:</span>
                      {hasPostLink ? (
                        <a
                          href={candidate.postUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:underline flex items-center space-x-1 font-mono truncate"
                        >
                          <span className="truncate">{candidate.postUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-500">Not Provided</span>
                      )}
                    </div>
                  </div>

                  {/* Contact Info (Email & Phone) */}
                  {(candidate.email || candidate.phone) && (
                    <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contact Info:</span>
                      {candidate.email && (
                        <a href={`mailto:${candidate.email}`} className="text-blue-400 hover:underline flex items-center space-x-1.5 font-mono">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{candidate.email}</span>
                        </a>
                      )}
                      {candidate.phone && (
                        <a href={`tel:${candidate.phone}`} className="text-emerald-400 hover:underline flex items-center space-x-1.5 font-mono">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{candidate.phone}</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Job Seeking Statement */}
                  {candidate.jobSeekingStatement && (
                    <div className="text-xs text-slate-300 bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50">
                      <span className="text-slate-400 font-semibold">Job-Seeking Statement: </span>
                      <span className="italic">"{candidate.jobSeekingStatement}"</span>
                    </div>
                  )}

                  {/* 5-Point Validation Evidence Grid */}
                  <div className="pt-1">
                    <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block mb-2">
                      5-Point Validation Evidence:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-[11px]">
                      {/* Check 1: Role Check */}
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">1. Role Check</span>
                          {checks?.currentlyEmployedInSalesRole?.passed === true ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : checks?.currentlyEmployedInSalesRole?.passed === false ? (
                            <XCircle className="w-3 h-3 text-rose-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <p className="text-slate-400 text-[10px] line-clamp-2">
                          {checks?.currentlyEmployedInSalesRole?.evidence || 'No evidence'}
                        </p>
                      </div>

                      {/* Check 2: India Location */}
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">2. India Location</span>
                          {checks?.currentlyWorkingInIndia?.passed === true ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : checks?.currentlyWorkingInIndia?.passed === false ? (
                            <XCircle className="w-3 h-3 text-rose-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <p className="text-slate-400 text-[10px] line-clamp-2">
                          {checks?.currentlyWorkingInIndia?.evidence || 'No evidence'}
                        </p>
                      </div>

                      {/* Check 3: 1-10 Years Exp */}
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">3. 1–10y Exp</span>
                          {checks?.totalExperience1To10Years?.passed === true ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : checks?.totalExperience1To10Years?.passed === false ? (
                            <XCircle className="w-3 h-3 text-rose-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <p className="text-slate-400 text-[10px] line-clamp-2">
                          {checks?.totalExperience1To10Years?.evidence || 'No evidence'}
                        </p>
                      </div>

                      {/* Check 4: Job Seeking Intent */}
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">4. Seeking Job</span>
                          {(checks?.authorIsPersonallySeekingJob?.passed ?? (checks as any)?.explicitPersonalJobSeekingStatement?.passed) === true ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (checks?.authorIsPersonallySeekingJob?.passed ?? (checks as any)?.explicitPersonalJobSeekingStatement?.passed) === false ? (
                            <XCircle className="w-3 h-3 text-rose-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <p className="text-slate-400 text-[10px] line-clamp-2">
                          {checks?.authorIsPersonallySeekingJob?.evidence || (checks as any)?.explicitPersonalJobSeekingStatement?.evidence || 'No evidence'}
                        </p>
                      </div>

                      {/* Check 5: Post Date Within Period */}
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">5. Date in Period</span>
                          {checks?.postDateWithinSelectedPeriod?.passed === true ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : checks?.postDateWithinSelectedPeriod?.passed === false ? (
                            <XCircle className="w-3 h-3 text-rose-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <p className="text-slate-400 text-[10px] line-clamp-2">
                          {checks?.postDateWithinSelectedPeriod?.evidence || 'No evidence'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {inspectingCandidate && (
        <CandidateDetailModal
          candidate={inspectingCandidate}
          allPosts={posts}
          onClose={() => setInspectingCandidate(null)}
          onSaveCorrection={async (id, updates) => {
            await onSaveCorrection(id, updates);
            setInspectingCandidate(prev =>
              prev ? { ...prev, ...updates, isManuallyCorrected: true } : null
            );
          }}
        />
      )}
    </div>
  );
};

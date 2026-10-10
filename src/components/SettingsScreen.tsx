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
} from 'lucide-react';
import { AppDatabase, CriteriaFilters, ScheduleSettings } from '../types/index.ts';

interface SettingsScreenProps {
  data: AppDatabase;
  mode: 'demo' | 'live';
  onUpdateSettings: (updates: {
    criteria?: Partial<CriteriaFilters>;
    schedule?: Partial<ScheduleSettings>;
    connections?: any;
  }) => Promise<void>;
  geminiConfigured: boolean;
  apifyConfigured?: boolean;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  data,
  mode,
  onUpdateSettings,
  geminiConfigured,
  apifyConfigured,
}) => {
  const { criteria, schedule, connections } = data;

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

  const [isSaving, setIsSaving] = useState(false);
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
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const currentOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-dev-y4kj63tf3c3olzwwtdavrt-753012129268.asia-southeast1.run.app';

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
            Configure Apify harvesting, India sales qualification rules, and automated scan schedules.
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
          <span>Settings successfully updated across database and background processors.</span>
        </div>
      )}

      {/* Grid of Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Candidate Qualification Filters */}
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
              <label className="text-slate-300 font-semibold block mb-1">
                Target Work Country
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={targetCountry}
                  onChange={e => setTargetCountry(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Candidate must currently be employed and working in India.
              </p>
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
              <p className="text-[11px] text-slate-500 mt-1">
                Default: 1–10 years inclusive. Unstated experience duration is tagged "Needs Review".
              </p>
            </div>

            {/* Match Across Any Role Policy */}
            <div className="flex items-start justify-between p-3 rounded-xl bg-slate-800/50 border border-blue-800/40">
              <div>
                <span className="text-xs font-semibold text-blue-300 block flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Match Candidates Across Any Role (Sales & Non-Sales)</span>
                </span>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Expanded search: Matches eligible job seekers in ANY functional role (Engineering/Tech, Product, Operations, Finance, Marketing, Sales, HR, Customer Support, etc.) having 1–10 years experience.
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
                  Matches eligible job-seeking candidates across any industry domain (Wealthtech, FMCG, Automotive, NBFC, BFSI, Pharma, Tech, Paints, Manufacturing, Logistics, etc.) having 1–10 years experience.
                </p>
              </div>
              <input
                type="checkbox"
                checked={matchAnySector}
                onChange={e => setMatchAnySector(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-0 mt-1 cursor-pointer"
              />
            </div>

            {/* Industry Policy: Banking Allowed */}
            <div className="flex items-start justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/60">
              <div>
                <span className="text-xs font-semibold text-white block">
                  Allow Any Company & Industry (Including Banking)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Allows sales professionals from any sector, including retail banking, fintech, and commercial financial institutions.
                </p>
              </div>
              <input
                type="checkbox"
                checked={allowBanking}
                onChange={e => setAllowBanking(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0 mt-1"
              />
            </div>

            {/* Exclude Senior Leadership Toggle */}
            <div className="flex items-start justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/60">
              <div>
                <span className="text-xs font-semibold text-white block">
                  Exclude Clear Senior Leadership Roles
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Filters out VP, C-Level (CEO, CRO, CCO), Director, and Head of roles into "Outside Target".
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
                Target Role Keywords (Sales & Business Development)
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

        {/* Section 2: Apify harvestapi/linkedin-post-search & Schedule */}
        <div className="space-y-6">
          {/* Apify Actor Integration Info Card */}
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
                    : 'bg-amber-950 text-amber-300 border-amber-800'
                }`}
              >
                {apifyConfigured ? 'Connected' : 'Setup Required'}
              </span>
            </div>

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
                  <span className="text-slate-400">Storage Location:</span>
                  <span className="text-emerald-400">Server-side environment only (Never in frontend)</span>
                </div>
              </div>

              {/* Instructions on Where to Add Token */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5 text-[11px] leading-relaxed">
                <span className="font-bold text-white block">Where to Add Your Apify Token:</span>
                <p className="text-slate-300">
                  1. In Google AI Studio, click on the <strong className="text-white">Settings</strong> menu in the upper sidebar and select <strong className="text-white">Secrets</strong>.
                </p>
                <p className="text-slate-300">
                  2. Add a new secret with Key: <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono">APIFY_API_TOKEN</code> and Value: your Apify API token (starts with <code className="text-slate-400">apify_api_...</code>).
                </p>
                <p className="text-slate-300">
                  3. The backend will automatically inject this secret when executing live collection runs.
                </p>
              </div>

              {/* Documented Schema Note */}
              <div className="bg-slate-800/30 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                <strong className="text-slate-300">Verified Input Schema:</strong> Uses documented parameters <code className="text-indigo-300 font-mono">searchQueries</code>, <code className="text-indigo-300 font-mono">postedWithinHours</code> (24 or 168), <code className="text-indigo-300 font-mono">authorType: "person"</code>, <code className="text-indigo-300 font-mono">sortBy: "newest"</code>, and <code className="text-indigo-300 font-mono">limit</code> (10-50).
              </div>
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
                  <label className="text-slate-300 font-semibold block mb-1">
                    Scheduled Times (24h)
                  </label>
                  <input
                    type="text"
                    value={scheduledTimes.join(', ')}
                    onChange={e =>
                      setScheduledTimes(
                        e.target.value
                          .split(',')
                          .map(s => s.trim())
                          .filter(Boolean)
                      )
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Twice daily: 09:00, 18:00</span>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Timezone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                  <span className="text-[10px] text-slate-500">Asia/Kolkata</span>
                </div>
              </div>

              {/* Authenticated Endpoint */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Cloud Scheduler Backend Endpoint
                </label>
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
                    {copiedSchedulerCmd ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
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
      </div>
    </div>
  );
};

import React from 'react';
import {
  Users,
  Inbox,
  LayoutDashboard,
  Settings as SettingsIcon,
  Search,
  Sparkles,
  Radio,
  Loader2,
  AlertCircle,
  Trash2,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { ActiveCollectionRun, ApifyDiagnostics } from '../types/index.ts';

interface NavbarProps {
  currentTab: 'dashboard' | 'sources' | 'candidates' | 'outreach' | 'queries' | 'settings';
  setCurrentTab: (tab: 'dashboard' | 'sources' | 'candidates' | 'outreach' | 'queries' | 'settings') => void;
  geminiConfigured: boolean;
  apifyConfigured: boolean;
  apifyDiagnostics?: ApifyDiagnostics | null;
  gmailConnected?: boolean;
  onFindCandidates: () => void;
  onClearDatabase?: () => void;
  isScanning: boolean;
  activeRun: ActiveCollectionRun | null;
  totalCandidates: number;
  totalPosts: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  geminiConfigured,
  apifyConfigured,
  apifyDiagnostics,
  gmailConnected,
  onFindCandidates,
  onClearDatabase,
  isScanning,
  activeRun,
  totalCandidates,
  totalPosts,
}) => {
  const isBusy = isScanning || (activeRun && activeRun.status !== 'completed' && activeRun.status !== 'failed');

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Executive Brand */}
          <div className="flex items-center space-x-3.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-base tracking-tight text-white">
                  Recruitment Data Collector
                </span>
                <span className="text-[11px] font-medium tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Talent Intelligence
                </span>
              </div>
              <p className="text-xs text-slate-400">
                LinkedIn Post Sourcing &bull; Automated Gmail Outreach
              </p>
            </div>
          </div>

          {/* Status Indicators & Live Actions */}
          <div className="flex items-center space-x-3">
            {/* Live Environment Badge */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-950/60 border border-emerald-700/50 text-emerald-300">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>Live Production</span>
            </div>

            {/* Gmail Outreach Channel Status */}
            <div
              onClick={() => setCurrentTab('outreach')}
              className={`hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs border cursor-pointer transition ${
                gmailConnected
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
              title={gmailConnected ? 'Gmail automated outreach is active' : 'Click to configure Gmail'}
            >
              <Mail className={`w-3.5 h-3.5 ${gmailConnected ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{gmailConnected ? 'Gmail Active' : 'Gmail Standby'}</span>
            </div>

            {/* Apify Provider Status */}
            <div
              onClick={() => setCurrentTab('settings')}
              className={`hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs border cursor-pointer transition ${
                apifyConfigured
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
                  : 'bg-amber-950/50 border-amber-700/50 text-amber-300 hover:bg-amber-900/50'
              }`}
              title={
                apifyConfigured
                  ? 'LinkedIn search actor connected'
                  : apifyDiagnostics?.message || 'Apify setup required'
              }
            >
              {apifyConfigured ? (
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{apifyConfigured ? 'Apify Connected' : 'Apify Setup'}</span>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={onFindCandidates}
              disabled={Boolean(isBusy)}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium px-3.5 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Search LinkedIn via Apify for sales candidates"
            >
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Search className="w-3.5 h-3.5 text-white" />
              )}
              <span>{isBusy ? 'Collecting...' : 'Find Candidates'}</span>
            </button>

            {/* Clear Database button */}
            {onClearDatabase && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to clear stored collection runs and candidate records?')) {
                    onClearDatabase();
                  }
                }}
                className="hidden xl:flex items-center space-x-1 text-slate-400 hover:text-rose-300 hover:bg-slate-800 border border-slate-700 px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                title="Clear current candidate and post records"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Senior-Facing 5-Tab Navigation */}
        <nav className="flex space-x-1 py-1.5 overflow-x-auto border-t border-slate-800">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'dashboard'
                ? 'bg-slate-800 text-blue-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setCurrentTab('candidates')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'candidates'
                ? 'bg-slate-800 text-blue-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Candidates</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-800/80 text-[10px] text-slate-300 border border-slate-700">
              {totalCandidates}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('outreach')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'outreach'
                ? 'bg-slate-800 text-blue-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Gmail Outreach</span>
            {gmailConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>

          <button
            onClick={() => setCurrentTab('sources')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'sources'
                ? 'bg-slate-800 text-blue-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Sources</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-800/80 text-[10px] text-slate-300 border border-slate-700">
              {totalPosts}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'settings'
                ? 'bg-slate-800 text-blue-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </nav>
      </div>
    </header>
  );
};

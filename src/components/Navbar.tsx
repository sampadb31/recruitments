import React from 'react';
import {
  Users,
  Inbox,
  LayoutDashboard,
  Settings as SettingsIcon,
  Search,
  RotateCcw,
  Sparkles,
  Radio,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ActiveCollectionRun } from '../types/index.ts';

interface NavbarProps {
  currentTab: 'dashboard' | 'sources' | 'candidates' | 'queries' | 'settings';
  setCurrentTab: (tab: 'dashboard' | 'sources' | 'candidates' | 'queries' | 'settings') => void;
  mode: 'demo' | 'live';
  setMode: (mode: 'demo' | 'live') => void;
  geminiConfigured: boolean;
  apifyConfigured: boolean;
  onFindCandidates: () => void;
  onResetDemo: () => void;
  isScanning: boolean;
  activeRun: ActiveCollectionRun | null;
  totalCandidates: number;
  totalPosts: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  mode,
  setMode,
  geminiConfigured,
  apifyConfigured,
  onFindCandidates,
  onResetDemo,
  isScanning,
  activeRun,
  totalCandidates,
  totalPosts,
}) => {
  const isBusy = isScanning || (activeRun && activeRun.status !== 'completed' && activeRun.status !== 'failed');

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-inner">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">
                  Recruitment Data Collector
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50">
                  Sales India
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Apify harvestapi/linkedin-post-search • Gemini 5-Point Validation • Deduplication
              </p>
            </div>
          </div>

          {/* Mode Switcher & Quick Controls */}
          <div className="flex items-center space-x-3">
            {/* Environment Badge */}
            <div className="flex items-center bg-slate-800/90 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => setMode('demo')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  mode === 'demo'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Demo Mode: Contains 5-point validated fictional test candidates"
              >
                Demo Sandbox
              </button>
              <button
                onClick={() => setMode('live')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 ${
                  mode === 'live'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Live Mode: Apify LinkedIn post harvesting & persistent database"
              >
                <Radio className={`w-3 h-3 ${mode === 'live' ? 'animate-pulse text-emerald-200' : ''}`} />
                <span>Live Mode</span>
              </button>
            </div>

            {/* Apify Provider Status */}
            <div
              className={`hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs border ${
                apifyConfigured
                  ? 'bg-blue-950/60 border-blue-700/50 text-blue-300'
                  : 'bg-amber-950/50 border-amber-700/50 text-amber-300'
              }`}
              title={
                apifyConfigured
                  ? 'Apify actor harvestapi/linkedin-post-search ready'
                  : 'Setup Required: APIFY_API_TOKEN secret is not set in environment'
              }
            >
              {apifyConfigured ? (
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{apifyConfigured ? 'Apify Connected' : 'Apify: Setup Required'}</span>
            </div>

            {/* Primary "Find Candidates" Button */}
            <button
              onClick={onFindCandidates}
              disabled={Boolean(isBusy)}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition-all cursor-pointer"
              title="Search LinkedIn via Apify for sales job-seekers in India"
            >
              {isBusy ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Search className="w-4 h-4 text-white" />
              )}
              <span>{isBusy ? 'Searching...' : 'Find Candidates'}</span>
            </button>

            {/* Reset Demo button */}
            {mode === 'demo' && (
              <button
                onClick={onResetDemo}
                className="hidden xl:flex items-center space-x-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                title="Reset Demo Data back to the original fictional candidates"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-2 py-2 overflow-x-auto border-t border-slate-800/80">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentTab === 'dashboard'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setCurrentTab('candidates')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentTab === 'candidates'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Candidate Database</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {totalCandidates}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('sources')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentTab === 'sources'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Sources & Intake</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {totalPosts}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('queries')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentTab === 'queries'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Query Catalogue</span>
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentTab === 'settings'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Settings & Integration</span>
          </button>
        </nav>
      </div>
    </header>
  );
};

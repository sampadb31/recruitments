/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { DashboardScreen } from './components/DashboardScreen.tsx';
import { SourcesScreen } from './components/SourcesScreen.tsx';
import { CandidatesScreen } from './components/CandidatesScreen.tsx';
import { SettingsScreen } from './components/SettingsScreen.tsx';
import { QueryCatalogueScreen } from './components/QueryCatalogueScreen.tsx';
import { OutreachScreen } from './components/OutreachScreen.tsx';
import { AppDatabase, Candidate, ExtractionResult, SourcePost, ActiveCollectionRun, TimeWindow, ApifyDiagnostics } from './types/index.ts';
import { getInitialDemoDatabase } from './server/sampleData.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'sources' | 'candidates' | 'outreach' | 'queries' | 'settings'>('dashboard');
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [dbData, setDbData] = useState<AppDatabase>(getInitialDemoDatabase());
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(true);
  const [apifyConfigured, setApifyConfigured] = useState(false);
  const [apifyDiagnostics, setApifyDiagnostics] = useState<ApifyDiagnostics | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveCollectionRun | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const activePollingRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  // Fetch status and data
  const fetchData = useCallback(async (selectedMode: 'demo' | 'live') => {
    try {
      const [statusRes, dataRes] = await Promise.all([
        fetch(`/api/status?mode=${selectedMode}`).then(r => r.json()),
        fetch(`/api/data?mode=${selectedMode}`).then(r => r.json()),
      ]);

      setGeminiConfigured(Boolean(statusRes.geminiConfigured));
      setApifyConfigured(Boolean(statusRes.apifyConfigured));
      if (statusRes.apifyDiagnostics) {
        setApifyDiagnostics(statusRes.apifyDiagnostics);
      }
      // Only set activeRun if it matches the selected mode, or null
      if (statusRes.activeRun && statusRes.activeRun.mode === selectedMode) {
        setActiveRun(statusRes.activeRun);
      } else {
        setActiveRun(null);
      }

      if (dataRes && dataRes.candidates && dataRes.posts) {
        setDbData(dataRes);
      }
    } catch (err) {
      console.error('Failed to fetch backend data, using local state:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(mode);
  }, [mode, fetchData]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (activePollingRef.current) {
        clearInterval(activePollingRef.current);
      }
    };
  }, []);

  // Poll active run progress
  const startProgressPolling = (runId: string) => {
    if (activePollingRef.current) {
      clearInterval(activePollingRef.current);
    }

    activePollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/status`);
        if (!res.ok) return;
        const run: ActiveCollectionRun = await res.json();
        setActiveRun(run);

        if (run.status === 'completed') {
          if (activePollingRef.current) clearInterval(activePollingRef.current);
          setIsScanning(false);
          await fetchData(mode);
          showToast(
            run.mode === 'demo'
              ? `[Demo Sandbox] Simulated candidate evaluation completed: ${run.fetchedPostsCount} sample posts processed, ${run.analyzedCandidatesCount} candidates validated.`
              : `[Live Mode] Apify collection completed: ${run.fetchedPostsCount} posts harvested, ${run.analyzedCandidatesCount} candidates validated, ${run.duplicatesCount} duplicates prevented.`,
            'success'
          );
        } else if (run.status === 'failed') {
          if (activePollingRef.current) clearInterval(activePollingRef.current);
          setIsScanning(false);
          await fetchData(mode);
          showToast(
            run.mode === 'demo'
              ? `[Demo Sandbox] Evaluation run failed: ${run.error || 'Unknown error'}`
              : `[Live Mode] Apify collection run failed: ${run.error || 'Unknown error'}`,
            'error'
          );
        }
      } catch (err) {
        console.warn('Polling error', err);
      }
    }, 2000);
  };

  // Find Candidates Trigger
  const handleFindCandidates = async (
    timeWindow: TimeWindow = '7d',
    limit: number = 20,
    useSmallTestQuery: boolean = false
  ) => {
    // If live mode and apify is not configured, inform user clearly
    if (mode === 'live' && !apifyConfigured) {
      if (apifyDiagnostics?.isPlaceholder) {
        showToast(
          `Setup Required: APIFY_API_TOKEN is set to placeholder value "${apifyDiagnostics.maskedSample}". Go to AI Studio Settings > Secrets and replace it with your personal Apify token (starts with "apify_api_").`,
          'error'
        );
      } else {
        showToast(
          apifyDiagnostics?.message ||
            'Setup Required: APIFY_API_TOKEN secret is not set in Secrets. Add it in AI Studio Settings > Secrets.',
          'error'
        );
      }
      return;
    }

    setIsScanning(true);
    try {
      const res = await fetch('/api/runs/find-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, timeWindow, limit, useSmallTestQuery }),
      });

      const body = await res.json();
      if (!res.ok) {
        if (body.setupRequired) {
          showToast(body.error || 'Setup Required: Missing Apify token.', 'error');
        } else {
          showToast(body.error || 'Failed to start candidate collection run.', 'error');
        }
        setIsScanning(false);
        return;
      }

      if (mode === 'demo') {
        showToast(
          `[Demo Sandbox] Started candidate evaluation (${timeWindow}, limit: ${limit}). Processing sample posts...`,
          'info'
        );
      } else {
        showToast(
          `[Live Mode] Started collection run (${timeWindow}, limit: ${limit}${
            useSmallTestQuery ? ', 5-Post Verification Test' : ''
          }). Harvesting via Apify...`,
          'info'
        );
      }

      if (body.runId) {
        startProgressPolling(body.runId);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error starting collection run', 'error');
      setIsScanning(false);
    }
  };

  // Run Collection / Batch Extraction on unextracted posts
  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/runs/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, triggerType: 'manual' }),
      });
      const run = await res.json();
      await fetchData(mode);
      showToast(
        run.message ||
          `Scan completed: ${run.extractedCandidatesCount || 0} candidates extracted, ${run.duplicatesFoundCount || 0} duplicates merged.`,
        'success'
      );
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Scan execution failed', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // Reset Demo Database
  const handleResetDemo = async () => {
    if (mode !== 'demo') return;
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      const body = await res.json();
      if (body.data) {
        setDbData(body.data);
      } else {
        await fetchData('demo');
      }
      showToast('Demo sandbox reset to initial 5-point validated fictional candidate posts.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Failed to reset demo data', 'error');
    }
  };

  // Clear Database (candidates, posts, scan runs)
  const handleClearDatabase = async () => {
    try {
      const res = await fetch('/api/database/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json();
      if (body.data) {
        setDbData(body.data);
      } else {
        await fetchData(mode);
      }
      showToast('Database cleared successfully. All records removed.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Failed to clear database', 'error');
    }
  };

  // Import posts
  const handleImportPosts = async (
    postsToImport: Array<Partial<SourcePost> & { content: string }>
  ) => {
    const res = await fetch('/api/posts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, posts: postsToImport }),
    });
    const result = await res.json();
    await fetchData(mode);
    return result;
  };

  // Ad-hoc single post extraction preview
  const handleExtractAdHoc = async (
    content: string,
    metadata?: any
  ): Promise<ExtractionResult> => {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, content, metadata }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Extraction failed');
    }
    return res.json();
  };

  // Save manual field correction
  const handleSaveCorrection = async (id: string, updates: Partial<Candidate>) => {
    const res = await fetch(`/api/candidates/${id}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, updates }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Correction failed');
    }
    await fetchData(mode);
    showToast('Candidate record manually corrected. Field values are protected from scan overwrite.', 'success');
  };

  // Resolve duplicate
  const handleResolveDuplicate = async (
    primaryId: string,
    secondaryId: string,
    action: 'merge' | 'dismiss'
  ) => {
    const res = await fetch('/api/candidates/resolve-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, primaryId, secondaryId, action }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Resolution failed');
    }
    await fetchData(mode);
    showToast(
      action === 'merge' ? 'Candidates merged into single record.' : 'Candidates marked as distinct individuals.',
      'success'
    );
  };

  // Reprocess existing collected posts with strict rules
  const handleReprocessPosts = async () => {
    try {
      const doFetch = async () => {
        const res = await fetch('/api/posts/reprocess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Reprocessing failed');
        }
        return res.json();
      };

      let result;
      try {
        result = await doFetch();
      } catch (firstErr: any) {
        // Single automatic retry in case dev server was briefly busy or warming up
        await new Promise(resolve => setTimeout(resolve, 800));
        result = await doFetch();
      }

      await fetchData(mode);
      showToast(
        `Reprocess complete: ${result.retrievedCount} retrieved, ${result.rejectedCount} rejected, ${result.needingReviewCount} review, ${result.matchedCount} matched.`,
        'success'
      );
      return result;
    } catch (err: any) {
      console.error('Reprocess failed:', err);
      showToast(
        `Reprocess failed: ${err.message || 'Connection to server interrupted. Please try again.'}`,
        'error'
      );
      throw err;
    }
  };

  // Update Settings
  const handleUpdateSettings = async (updates: any) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...updates }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update settings');
    }
    await fetchData(mode);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header Navbar */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        mode={mode}
        setMode={newMode => {
          setMode(newMode);
          setIsLoading(true);
        }}
        geminiConfigured={geminiConfigured}
        apifyConfigured={apifyConfigured}
        apifyDiagnostics={apifyDiagnostics}
        gmailConnected={Boolean(dbData.outreachSettings?.gmailConnected)}
        onFindCandidates={() => handleFindCandidates('7d', 20)}
        onResetDemo={handleResetDemo}
        onClearDatabase={handleClearDatabase}
        isScanning={isScanning}
        activeRun={activeRun}
        totalCandidates={dbData.candidates.length}
        totalPosts={dbData.posts.length}
      />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce duration-300">
          <div
            className={`px-4 py-3 rounded-xl shadow-xl text-xs font-semibold flex items-center space-x-2 border ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : toastMessage.type === 'error'
                ? 'bg-rose-950 text-rose-300 border-rose-800'
                : 'bg-blue-950 text-blue-300 border-blue-800'
            }`}
          >
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading Recruitment Data Collector records...</p>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <DashboardScreen
                data={dbData}
                mode={mode}
                onFindCandidates={handleFindCandidates}
                onNavigateTab={setCurrentTab}
                isScanning={isScanning}
                activeRun={activeRun}
                geminiConfigured={geminiConfigured}
                apifyConfigured={apifyConfigured}
                apifyDiagnostics={apifyDiagnostics}
                onSaveCorrection={handleSaveCorrection}
              />
            )}

            {currentTab === 'sources' && (
              <SourcesScreen
                data={dbData}
                mode={mode}
                onImportPosts={handleImportPosts}
                onExtractAdHoc={handleExtractAdHoc}
                onTriggerScan={handleRunScan}
                geminiConfigured={geminiConfigured}
              />
            )}

            {currentTab === 'candidates' && (
              <CandidatesScreen
                candidates={dbData.candidates}
                allPosts={dbData.posts}
                mode={mode}
                onSaveCorrection={handleSaveCorrection}
                onResolveDuplicate={handleResolveDuplicate}
                onReprocessPosts={handleReprocessPosts}
              />
            )}

            {currentTab === 'outreach' && (
              <OutreachScreen
                data={dbData}
                mode={mode}
                onRefresh={() => fetchData(mode)}
                onNavigateToSettings={() => setCurrentTab('settings')}
                showToast={showToast}
              />
            )}

            {currentTab === 'queries' && (
              <QueryCatalogueScreen mode={mode} />
            )}

            {currentTab === 'settings' && (
              <SettingsScreen
                data={dbData}
                mode={mode}
                onUpdateSettings={handleUpdateSettings}
                geminiConfigured={geminiConfigured}
                apifyConfigured={apifyConfigured}
                apifyDiagnostics={apifyDiagnostics}
                onRefreshStatus={() => fetchData(mode)}
                showToast={showToast}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

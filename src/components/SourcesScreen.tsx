import React, { useState } from 'react';
import {
  Inbox,
  FileSpreadsheet,
  PlusCircle,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Send,
  Linkedin,
  Radio,
  Download,
  Upload,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import {
  AppDatabase,
  CollectionMethod,
  ExtractionResult,
  PlatformType,
  SourcePost,
} from '../types/index.ts';

interface SourcesScreenProps {
  data: AppDatabase;
  mode: 'demo' | 'live';
  onImportPosts: (
    posts: Array<Partial<SourcePost> & { content: string }>
  ) => Promise<{ addedCount: number; duplicatesCount: number }>;
  onExtractAdHoc: (
    content: string,
    metadata?: any
  ) => Promise<ExtractionResult>;
  onTriggerScan: () => void;
  geminiConfigured: boolean;
}

export const SourcesScreen: React.FC<SourcesScreenProps> = ({
  data,
  mode,
  onImportPosts,
  onExtractAdHoc,
  onTriggerScan,
  geminiConfigured,
}) => {
  const { posts, connections } = data;

  const [activeTab, setActiveTab] = useState<'paste' | 'csv' | 'connections' | 'all-posts'>('paste');

  // Paste single post form state
  const [pasteContent, setPasteContent] = useState('');
  const [pastePlatform, setPastePlatform] = useState<PlatformType>('LinkedIn');
  const [pasteMethod, setPasteMethod] = useState<CollectionMethod>('Manual');
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteAuthor, setPasteAuthor] = useState('');
  const [pasteExternalId, setPasteExternalId] = useState('');
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [previewResult, setPreviewResult] = useState<ExtractionResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // CSV import state
  const [csvText, setCsvText] = useState('');
  const [parsedCsvRows, setParsedCsvRows] = useState<Array<Partial<SourcePost> & { content: string }>>([]);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);

  // Posts table filter
  const [searchFilter, setSearchFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | PlatformType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Copy helper
  const [copiedKey, setCopiedKey] = useState(false);

  // Handle live AI test preview
  const handleTestExtraction = async () => {
    if (!pasteContent.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Please enter post content before testing extraction.' });
      return;
    }
    setIsTestingAi(true);
    setPreviewResult(null);
    setFeedbackMessage(null);
    try {
      const result = await onExtractAdHoc(pasteContent, {
        platform: pastePlatform,
        sourceUrl: pasteUrl || undefined,
        authorIdentifier: pasteAuthor || undefined,
      });
      setPreviewResult(result);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'AI extraction failed.' });
    } finally {
      setIsTestingAi(false);
    }
  };

  // Handle single post submission
  const handleSaveSinglePost = async (shouldAutoScan: boolean = false) => {
    if (!pasteContent.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Post content cannot be empty.' });
      return;
    }
    setIsSubmitting(true);
    setFeedbackMessage(null);

    try {
      const res = await onImportPosts([
        {
          platform: pastePlatform,
          collectionMethod: pasteMethod,
          content: pasteContent,
          sourceUrl: pasteUrl.trim() || null,
          authorIdentifier: pasteAuthor.trim() || null,
          externalId: pasteExternalId.trim() || null,
        },
      ]);

      if (res.duplicatesCount > 0) {
        setFeedbackMessage({
          type: 'error',
          text: 'This post is already in the database! Duplicate prevented by platform ID / URL / Content shield.',
        });
      } else {
        setFeedbackMessage({
          type: 'success',
          text: `Post saved successfully (${res.addedCount} new post queued).`,
        });
        setPasteContent('');
        setPasteUrl('');
        setPasteAuthor('');
        setPasteExternalId('');
        setPreviewResult(null);

        if (shouldAutoScan) {
          onTriggerScan();
        }
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to save post.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Parse CSV
  const handleParseCsv = (raw: string) => {
    setCsvText(raw);
    setCsvParseError(null);
    if (!raw.trim()) {
      setParsedCsvRows([]);
      return;
    }

    try {
      const lines = raw.trim().split(/\r?\n/);
      if (lines.length < 2) {
        setCsvParseError('CSV must contain a header row and at least one data row.');
        return;
      }

      // Simple CSV parser supporting quotes
      function parseCsvLine(line: string): string[] {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
          } else {
            cur += char;
          }
        }
        result.push(cur.trim());
        return result;
      }

      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
      const contentIdx = headers.findIndex(h => h.includes('content') || h.includes('post') || h.includes('text'));
      const platformIdx = headers.findIndex(h => h.includes('platform'));
      const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('link'));
      const authorIdx = headers.findIndex(h => h.includes('author') || h.includes('user') || h.includes('name'));

      if (contentIdx === -1) {
        setCsvParseError('CSV must include a column named "content", "post", or "text".');
        return;
      }

      const parsed: Array<Partial<SourcePost> & { content: string }> = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = parseCsvLine(lines[i]);
        const content = cols[contentIdx];
        if (!content) continue;

        let plat: PlatformType = 'LinkedIn';
        if (platformIdx !== -1 && cols[platformIdx]) {
          const p = cols[platformIdx].toLowerCase();
          if (p.includes('telegram')) plat = 'Telegram';
          else if (p.includes('demo')) plat = 'Demo';
        }

        parsed.push({
          platform: plat,
          collectionMethod: 'Manual',
          content,
          sourceUrl: urlIdx !== -1 ? cols[urlIdx] : undefined,
          authorIdentifier: authorIdx !== -1 ? cols[authorIdx] : undefined,
        });
      }

      setParsedCsvRows(parsed);
    } catch (e: any) {
      setCsvParseError(e.message || 'Failed to parse CSV format.');
    }
  };

  const handleImportParsedCsv = async () => {
    if (parsedCsvRows.length === 0) return;
    setIsSubmitting(true);
    try {
      const res = await onImportPosts(parsedCsvRows);
      setFeedbackMessage({
        type: 'success',
        text: `CSV import completed: ${res.addedCount} new posts added, ${res.duplicatesCount} duplicate posts skipped.`,
      });
      setParsedCsvRows([]);
      setCsvText('');
      setActiveTab('all-posts');
    } catch (e: any) {
      setFeedbackMessage({ type: 'error', text: e.message || 'CSV import failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadSampleCsv = () => {
    const sample = `platform,author,url,content
LinkedIn,Karan Kapoor,https://linkedin.com/in/karan-kapoor,"After 3 rewarding years in SaaS account growth at HyperTech, I'm actively looking for a B2B Sales Executive position. Exceeded 110% quota. Contact: karan.sales@sample.org"
Telegram,@vikram_biz,https://t.me/sales_jobs/102,"Looking for Business Development Manager role in industrial packaging. 7 years experience in client management. Available in 15 days. Telegram @vikram_biz"
LinkedIn,Anita Desai,https://linkedin.com/in/anita-desai,"Looking for senior sales management roles in retail banking and commercial wealth. 9 years experience at MetroBank."`;
    handleParseCsv(sample);
  };

  // Filtered posts
  const filteredPosts = posts.filter(p => {
    if (platformFilter !== 'all' && p.platform !== platformFilter) return false;
    if (statusFilter !== 'all' && p.extractionState !== statusFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        p.content.toLowerCase().includes(q) ||
        (p.authorName && p.authorName.toLowerCase().includes(q)) ||
        (p.authorIdentifier && p.authorIdentifier.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header and Source Status Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <Inbox className="w-5 h-5 text-blue-400" />
              <span>Source Intake & Channel Adapters</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              LinkedIn & Telegram ingestion. Keep sources accurately tagged as Manual or Connected.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('paste')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'paste'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Paste Post
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'csv'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              CSV Bulk Import
            </button>
            <button
              onClick={() => setActiveTab('connections')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'connections'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Channel Config
            </button>
            <button
              onClick={() => setActiveTab('all-posts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'all-posts'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Post Repository ({posts.length})
            </button>
          </div>
        </div>

        {/* Live Channel Connection Health Badges */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* LinkedIn Status */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-blue-900/40 text-blue-400 border border-blue-700/40">
                <Linkedin className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-white">LinkedIn Ingestion</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                    Setup Required for Auto-Scan
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  No scraping without consent: Direct manual pasting and CSV imports are{' '}
                  <strong className="text-emerald-400 font-medium">100% active</strong>. Live
                  retrieval requires authorised provider API credentials.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('connections')}
              className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap ml-2"
            >
              Configure
            </button>
          </div>

          {/* Telegram Status */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-sky-900/40 text-sky-400 border border-sky-700/40">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-white">Telegram Bot & Webhook</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/60">
                    Webhook Listener Ready
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Connects to authorised groups where the bot is added. Incoming posts are saved
                  immediately to the extraction backlog.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('connections')}
              className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap ml-2"
            >
              View Webhook
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center space-x-2 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950 border border-rose-800 text-rose-300'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Tab 1: Paste Post Screen */}
      {activeTab === 'paste' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Input Form Column */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <PlusCircle className="w-4 h-4 text-blue-400" />
              <span>Paste Post Text for Intake</span>
            </h2>
            <p className="text-xs text-slate-400">
              Paste the text of a job-seeking candidate post from LinkedIn or Telegram. You can test
              extraction before committing it to storage.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Source Platform
                </label>
                <select
                  value={pastePlatform}
                  onChange={e => setPastePlatform(e.target.value as PlatformType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Telegram">Telegram</option>
                  <option value="Demo">Demo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Collection Method
                </label>
                <select
                  value={pasteMethod}
                  onChange={e => setPasteMethod(e.target.value as CollectionMethod)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Manual">Manual Entry</option>
                  <option value="Connected">Connected Adapter</option>
                  <option value="Demo">Demo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Source / Profile URL (Optional)
                </label>
                <input
                  type="text"
                  placeholder="https://linkedin.com/in/... or post link"
                  value={pasteUrl}
                  onChange={e => setPasteUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Author Identifier / Telegram Handle
                </label>
                <input
                  type="text"
                  placeholder="@telegram_handle or author name"
                  value={pasteAuthor}
                  onChange={e => setPasteAuthor(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Raw Post Content *
                </label>
                <span className="text-[11px] text-slate-500">{pasteContent.length} chars</span>
              </div>
              <textarea
                rows={6}
                placeholder="Paste the full post text here. For example: 'After 4 years driving B2B sales in retail distribution, I'm seeking my next Senior Account Manager opportunity...'"
                value={pasteContent}
                onChange={e => setPasteContent(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
              />
            </div>

            {/* Quick Test Fillers */}
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="text-slate-400 self-center">Try Sample:</span>
              <button
                type="button"
                onClick={() => {
                  setPastePlatform('LinkedIn');
                  setPasteAuthor('Rohan Mehta');
                  setPasteUrl('https://linkedin.com/in/rohan-sales-b2b');
                  setPasteContent(
                    `After 5 great years closing enterprise software deals in industrial supply chain at LogiSys, I am on the market for an Enterprise Account Executive or Sales Lead role! Based in Bengaluru, open to remote. Proven record exceeding $1.2M quota. Reach out: rohan.mehta.sales@techmail.org`
                  );
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700"
              >
                5y SaaS Sales (Match)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPastePlatform('LinkedIn');
                  setPasteAuthor('Aditi Roy');
                  setPasteUrl('https://linkedin.com/in/aditi-roy');
                  setPasteContent(
                    `Excited to seek new sales opportunities in consumer wellness! Experienced in direct client acquisition. #OpenToWork`
                  );
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700"
              >
                No Years Stated (Needs Review)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPastePlatform('Telegram');
                  setPasteAuthor('@recruitment_daily');
                  setPasteContent(
                    `🚨 WE ARE HIRING: Looking for 10 Sales Representatives for leading insurance company. CTC 6 LPA. Send CV to hr@speedhire.com or message @recruiter_bot.`
                  );
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700"
              >
                Recruiter Ad (Filtered Out)
              </button>
            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestExtraction}
                disabled={isTestingAi || !pasteContent.trim()}
                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 border border-indigo-700/60 transition flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isTestingAi ? 'animate-spin' : ''}`} />
                <span>{isTestingAi ? 'Analyzing Post...' : 'Test AI Extraction Preview'}</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleSaveSinglePost(false)}
                  disabled={isSubmitting || !pasteContent.trim()}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
                >
                  Save to Queue
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSinglePost(true)}
                  disabled={isSubmitting || !pasteContent.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition disabled:opacity-50"
                >
                  Save & Extract Now
                </button>
              </div>
            </div>
          </div>

          {/* AI Extraction Preview Column */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>AI Extraction Preview</span>
              </h2>
              {previewResult && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    previewResult.sourceTypeUsed === 'gemini'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border-amber-800'
                  }`}
                >
                  {previewResult.sourceTypeUsed === 'gemini'
                    ? 'Gemini 3.8 Flash'
                    : 'Simulated AI Fallback'}
                </span>
              )}
            </div>

            {!previewResult ? (
              <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-slate-600 stroke-1" />
                <p className="text-xs font-medium text-slate-400">No Preview Generated Yet</p>
                <p className="text-[11px] max-w-xs mx-auto">
                  Click "Test AI Extraction Preview" to inspect how candidate fields and criteria
                  scoring are extracted from the raw post text.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {/* Result Tag Badge */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    previewResult.isRecruiterAd
                      ? 'bg-purple-950/60 border-purple-800 text-purple-300'
                      : previewResult.criteriaTag === 'Matches Criteria'
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                      : previewResult.criteriaTag === 'Needs Review'
                      ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                      : 'bg-rose-950/60 border-rose-800 text-rose-300'
                  }`}
                >
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-75">
                      {previewResult.isRecruiterAd ? 'Recruiter Ad Filter' : 'Criteria Evaluation'}
                    </span>
                    <p className="text-sm font-bold mt-0.5">
                      {previewResult.isRecruiterAd
                        ? 'Recruiter Vacancy Ad (Rejected)'
                        : previewResult.criteriaTag}
                    </p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 opacity-80" />
                </div>

                {/* Explanation */}
                <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 text-slate-300">
                  <span className="font-semibold text-slate-200">Matching Explanation:</span>{' '}
                  {previewResult.matchingExplanation}
                </div>

                {/* Extracted Fields Table */}
                <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800 space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                    <span className="text-slate-400">Candidate Name:</span>
                    <span className="font-medium text-white">
                      {previewResult.candidateName || <em className="text-slate-500">Not Provided</em>}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                    <span className="text-slate-400">Role:</span>
                    <span className="font-medium text-white text-right max-w-[200px]">
                      {previewResult.currentOrPreviousRole || <em className="text-slate-500">Not Provided</em>}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                    <span className="text-slate-400">Company:</span>
                    <span className="font-medium text-white">
                      {previewResult.employer || <em className="text-slate-500">Not Provided</em>}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                    <span className="text-slate-400">Industry:</span>
                    <span className="font-medium text-white">
                      {previewResult.industry || <em className="text-slate-500">Not Provided</em>}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                    <span className="text-slate-400">Total Experience:</span>
                    <span className="font-medium text-emerald-400">
                      {previewResult.totalExperienceYears !== null
                        ? `${previewResult.totalExperienceYears} years`
                        : <em className="text-slate-500">Not Stated</em>}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                    <span className="text-slate-400">Email:</span>
                    <span className="font-mono text-blue-300">
                      {previewResult.email || <em className="text-slate-500">Not Provided</em>}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-300">
                      {previewResult.phone || <em className="text-slate-500">Not Provided</em>}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-slate-300">
                    <span className="text-slate-400">Telegram / Profile:</span>
                    <span className="font-mono text-sky-300">
                      {previewResult.profileUrlOrTelegramId || <em className="text-slate-500">Not Provided</em>}
                    </span>
                  </div>
                </div>

                {/* Evidence quotes */}
                {previewResult.evidence && Object.keys(previewResult.evidence).length > 0 && (
                  <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-800 text-[11px] space-y-1">
                    <span className="text-slate-400 font-semibold block mb-1">
                      Supporting Post Evidence:
                    </span>
                    {Object.entries(previewResult.evidence).map(([k, v]) => (
                      <div key={k} className="text-slate-300 truncate">
                        <span className="text-indigo-400 font-mono capitalize">{k}:</span> "{v}"
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: CSV Bulk Import */}
      {activeTab === 'csv' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>CSV Bulk Post Import</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload or paste CSV rows containing candidate posts. Requires at least a "content" or "post" column.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={loadSampleCsv}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 transition"
              >
                Load Sample CSV
              </button>
            </div>
          </div>

          <div>
            <textarea
              rows={6}
              placeholder="Paste raw CSV content here (including header row with 'platform,author,url,content')..."
              value={csvText}
              onChange={e => handleParseCsv(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
            />
          </div>

          {csvParseError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {csvParseError}
            </div>
          )}

          {parsedCsvRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Parsed {parsedCsvRows.length} Rows Ready for Intake
                </span>
                <button
                  onClick={handleImportParsedCsv}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                >
                  Confirm & Import {parsedCsvRows.length} Posts
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800 text-slate-400 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Platform</th>
                      <th className="py-2 px-3">Author</th>
                      <th className="py-2 px-3">Content Snippet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {parsedCsvRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold">{row.platform}</td>
                        <td className="py-2 px-3 text-slate-400">{row.authorIdentifier || '—'}</td>
                        <td className="py-2 px-3 text-slate-200 truncate max-w-md">{row.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Channel Adapters & Webhooks */}
      {activeTab === 'connections' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Telegram Ingestion Config */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-sky-900/40 text-sky-400 border border-sky-700/40">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Telegram Ingestion Adapter</h2>
                <p className="text-xs text-slate-400">
                  Bot-based webhook intake from permitted groups and channels.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Active Webhook Listener URL
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={connections.telegram.webhookUrl}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(connections.telegram.webhookUrl);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300"
                    title="Copy URL"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Permitted Group / Channel IDs
                </label>
                <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700 font-mono text-slate-300">
                  {connections.telegram.permittedChatIds.join(', ')}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Messages received from channels outside this list are dropped to avoid noise.
                </p>
              </div>

              <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Telegram Access Boundaries</span>
                </div>
                <p>
                  • Telegram bots cannot scrape older channel histories or search arbitrary groups.
                </p>
                <p>• The bot must be explicitly added as a member with read access.</p>
                <p>
                  • Incoming posts are saved durably into the pending database backlog, ready for
                  scheduled or manual batch extraction.
                </p>
              </div>
            </div>
          </div>

          {/* LinkedIn Retrieval Config */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-blue-900/40 text-blue-400 border border-blue-700/40">
                <Linkedin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">LinkedIn Ingestion Adapter</h2>
                <p className="text-xs text-slate-400">
                  Authorised retrieval provider status and manual fallback.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs">
                <div className="flex items-center space-x-1.5 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Setup Required for Automatic Collection</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed">
                  Direct scraping of LinkedIn is prohibited without authorization. Automatic retrieval
                  requires an authorised provider (e.g. RapidAPI / Proxycurl / Official Partner).
                </p>
              </div>

              <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>What is Active Today:</span>
                </div>
                <p>• <strong>Manual Paste:</strong> Paste any post text with optional profile URL.</p>
                <p>• <strong>CSV Import:</strong> Upload batches of candidate posts seamlessly.</p>
                <p>• <strong>Deduplication Shield:</strong> Repeated posts with same URL or content are blocked.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Post Repository Table */}
      {activeTab === 'all-posts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Inbox className="w-4 h-4 text-blue-400" />
                <span>Raw Source Post Repository</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                All ingested posts preserved with exact original text and extraction status.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Search raw post text..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <select
                value={platformFilter}
                onChange={e => setPlatformFilter(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="all">All Platforms</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Telegram">Telegram</option>
                <option value="Demo">Demo</option>
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="all">All States</option>
                <option value="pending">Pending Extraction</option>
                <option value="extracted">Extracted</option>
                <option value="recruiter_ad">Recruiter Ad</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {filteredPosts.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No source posts match your search filters.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Author</th>
                    <th className="py-2.5 px-3">Original Post Content</th>
                    <th className="py-2.5 px-3">Received At</th>
                    <th className="py-2.5 px-3">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {filteredPosts.map(post => (
                    <tr key={post.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-semibold text-white">{post.platform}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px]">
                          {post.collectionMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {post.authorName || post.authorIdentifier || '—'}
                      </td>
                      <td className="py-2.5 px-3 max-w-md">
                        <p className="truncate text-slate-200" title={post.content}>
                          {post.content}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                        {new Date(post.receivedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            post.extractionState === 'extracted'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : post.extractionState === 'recruiter_ad'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : post.extractionState === 'failed'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {post.extractionState}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

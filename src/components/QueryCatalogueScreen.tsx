import React, { useState, useEffect } from 'react';
import {
  Search,
  Sliders,
  RotateCw,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Edit2,
  Trash2,
  Save,
  Clock,
  Sparkles,
  Layers,
  RotateCcw,
  Check,
  TrendingUp,
  FileText,
  Tag,
  HelpCircle,
} from 'lucide-react';
import {
  QueryCatalogueItem,
  QueryCatalogueConfig,
  RoleFamilyCategory,
  TargetSector,
  TimeWindow,
} from '../types/index.ts';

interface QueryCatalogueScreenProps {
  mode: 'demo' | 'live';
}

const CATEGORY_LABELS: Record<RoleFamilyCategory, string> = {
  all_roles_india: 'All Roles & Job Seekers Across India (High Yield)',
  tech_engineering: 'Technology, Software & Engineering',
  general_sales: 'General Sales & Business Development',
  operations_hr_marketing: 'Operations, Marketing, HR & Finance',
  fmcg_manufacturing_paints: 'FMCG, Manufacturing & Paints',
  pharma_healthcare: 'Pharma & Healthcare Sales',
  technology_sales: 'Technology Sales (SaaS, SDR, BDR)',
  banking_nbfc_fintech: 'Banking, NBFC & Fintech Sales',
  insurance: 'Insurance Sales (Bancassurance, Agency)',
  hospitality: 'Hospitality Sales (Hotel, Banquet, MICE)',
};

const CATEGORY_COLORS: Record<RoleFamilyCategory, { bg: string; text: string; border: string }> = {
  all_roles_india: { bg: 'bg-emerald-950/60', text: 'text-emerald-300', border: 'border-emerald-800' },
  tech_engineering: { bg: 'bg-indigo-950/60', text: 'text-indigo-300', border: 'border-indigo-800' },
  general_sales: { bg: 'bg-blue-950/60', text: 'text-blue-300', border: 'border-blue-800' },
  operations_hr_marketing: { bg: 'bg-teal-950/60', text: 'text-teal-300', border: 'border-teal-800' },
  fmcg_manufacturing_paints: { bg: 'bg-amber-950/60', text: 'text-amber-300', border: 'border-amber-800' },
  pharma_healthcare: { bg: 'bg-emerald-950/60', text: 'text-emerald-300', border: 'border-emerald-800' },
  technology_sales: { bg: 'bg-purple-950/60', text: 'text-purple-300', border: 'border-purple-800' },
  banking_nbfc_fintech: { bg: 'bg-cyan-950/60', text: 'text-cyan-300', border: 'border-cyan-800' },
  insurance: { bg: 'bg-rose-950/60', text: 'text-rose-300', border: 'border-rose-800' },
  hospitality: { bg: 'bg-orange-950/60', text: 'text-orange-300', border: 'border-orange-800' },
};

const PHRASE_GROUPS = [
  {
    name: 'Explicit Job Search',
    phrases: ['open to work', 'open for work', 'looking for a job', 'actively looking for a job', 'actively seeking a new role', 'seeking employment'],
  },
  {
    name: 'Career Change',
    phrases: ['looking for a job change', 'looking for a change', 'seeking a new role', 'looking for my next role', 'ready for my next opportunity', 'seeking a career move'],
  },
  {
    name: 'Exploring Opportunities',
    phrases: ['exploring new opportunities', 'exploring career opportunities', 'open to new opportunities', 'open to suitable opportunities', 'seeking new opportunities'],
  },
  {
    name: 'Requests for Help',
    phrases: ['please refer me', 'looking for referrals', 'would appreciate a referral', 'please consider my profile', 'happy to share my resume'],
  },
  {
    name: 'Hashtags',
    phrases: ['#OpenToWork', '#LookingForJob', '#SeekingOpportunities', '#JobSearch', '#CareerChange'],
  },
];

export const QueryCatalogueScreen: React.FC<QueryCatalogueScreenProps> = ({ mode }) => {
  const [catalogue, setCatalogue] = useState<QueryCatalogueItem[]>([]);
  const [config, setConfig] = useState<QueryCatalogueConfig>({
    maxQueriesPerRun: 4,
    maxPostsPerQuery: 10,
    timeWindow: '7d',
    rotationIndex: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [editingItem, setEditingItem] = useState<QueryCatalogueItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New item form
  const [newCategory, setNewCategory] = useState<RoleFamilyCategory>('general_sales');
  const [newSector, setNewSector] = useState<TargetSector | 'all'>('all');
  const [newRoleTerms, setNewRoleTerms] = useState('');
  const [newPhraseTerms, setNewPhraseTerms] = useState('');
  const [newCompiledQuery, setNewCompiledQuery] = useState('');

  const fetchQueries = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/queries?mode=${mode}`);
      const data = await res.json();
      if (data.catalogue) {
        setCatalogue(data.catalogue);
      }
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err: any) {
      console.error('Failed to load query catalogue:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueries();
  }, [mode]);

  const countBooleanOperators = (query: string): number => {
    const matches = query.match(/\b(AND|OR|NOT)\b/gi);
    return matches ? matches.length : 0;
  };

  const handleSaveCatalogue = async (updatedItems: QueryCatalogueItem[], updatedConfig?: Partial<QueryCatalogueConfig>) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/queries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          catalogue: updatedItems,
          config: updatedConfig ? { ...config, ...updatedConfig } : config,
        }),
      });
      const data = await res.json();
      if (data.catalogue) setCatalogue(data.catalogue);
      if (data.config) setConfig(data.config);
      setFeedback({ type: 'success', text: 'Query catalogue updated successfully.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save query catalogue.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = (id: string) => {
    const updated = catalogue.map(q => (q.id === id ? { ...q, enabled: !q.enabled } : q));
    setCatalogue(updated);
    handleSaveCatalogue(updated);
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Reset query catalogue to standard 7-family canonical queries?')) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/queries/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.catalogue) setCatalogue(data.catalogue);
      if (data.config) setConfig(data.config);
      setFeedback({ type: 'success', text: 'Catalogue reset to default configuration.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to reset catalogue.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    const updated = catalogue.map(q => (q.id === editingItem.id ? editingItem : q));
    setCatalogue(updated);
    handleSaveCatalogue(updated);
    setEditingItem(null);
  };

  const handleAddNewQuery = () => {
    if (!newCompiledQuery.trim()) {
      alert('Compiled query cannot be empty.');
      return;
    }
    const newItem: QueryCatalogueItem = {
      id: `q_custom_${Date.now()}`,
      category: newCategory,
      categoryLabel: CATEGORY_LABELS[newCategory],
      sectorTag: newSector,
      roleTerms: newRoleTerms.split(',').map(s => s.trim()).filter(Boolean),
      phraseTerms: newPhraseTerms.split(',').map(s => s.trim()).filter(Boolean),
      compiledQuery: newCompiledQuery.trim(),
      enabled: true,
      stats: {
        runsCount: 0,
        retrievedCount: 0,
        duplicatesCount: 0,
        matchedCount: 0,
        rejectedCount: 0,
      },
    };

    const updated = [...catalogue, newItem];
    setCatalogue(updated);
    handleSaveCatalogue(updated);
    setShowAddModal(false);
    setNewRoleTerms('');
    setNewPhraseTerms('');
    setNewCompiledQuery('');
  };

  const handleDeleteQuery = (id: string) => {
    if (!window.confirm('Delete this query from the catalogue?')) return;
    const updated = catalogue.filter(q => q.id !== id);
    setCatalogue(updated);
    handleSaveCatalogue(updated);
  };

  const handleRotateNow = () => {
    const enabled = catalogue.filter(q => q.enabled);
    if (enabled.length === 0) return;
    const batchSize = Math.max(1, Math.min(config.maxQueriesPerRun || 4, enabled.length));
    const nextIdx = ((config.rotationIndex || 0) + batchSize) % enabled.length;
    const updatedConfig = { ...config, rotationIndex: nextIdx, lastRotatedAt: new Date().toISOString() };
    setConfig(updatedConfig);
    handleSaveCatalogue(catalogue, updatedConfig);
  };

  // Filter items
  const filteredItems = catalogue.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const matchComp = item.compiledQuery.toLowerCase().includes(q);
      const matchLabel = item.categoryLabel.toLowerCase().includes(q);
      const matchRoles = item.roleTerms.some(r => r.toLowerCase().includes(q));
      const matchPhrases = item.phraseTerms.some(p => p.toLowerCase().includes(q));
      return matchComp || matchLabel || matchRoles || matchPhrases;
    }
    return true;
  });

  const totalRuns = catalogue.reduce((acc, q) => acc + (q.stats?.runsCount || 0), 0);
  const totalRetrieved = catalogue.reduce((acc, q) => acc + (q.stats?.retrievedCount || 0), 0);
  const totalMatches = catalogue.reduce((acc, q) => acc + (q.stats?.matchedCount || 0), 0);
  const totalRejected = catalogue.reduce((acc, q) => acc + (q.stats?.rejectedCount || 0), 0);

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white flex items-center space-x-2">
                <Search className="w-5 h-5 text-blue-400" />
                <span>Editable Query Catalogue & Rotation</span>
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800">
                7 Role Families
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Maintains focused role-based queries paired with personal job-seeking phrases. Limits Boolean complexity (≤ 5 operators, &lt; 500 chars) and rotates across runs to retain coverage across all eligible sectors.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Query</span>
            </button>

            <button
              onClick={handleRotateNow}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
              title="Advance rotation index to next batch of queries"
            >
              <RotateCw className="w-3.5 h-3.5 text-blue-400" />
              <span>Rotate Batch (Index: {config.rotationIndex})</span>
            </button>

            <button
              onClick={handleResetDefaults}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
              title="Restore standard queries for Pharma, FMCG, Tech, Banking, Insurance, Hospitality"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs border flex items-center space-x-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/80 border-rose-800 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Aggregate Query Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Catalogue Queries</span>
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">{catalogue.length}</span>
            <span className="text-xs text-emerald-400 font-medium">
              ({catalogue.filter(q => q.enabled).length} active)
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Posts Retrieved</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-white">{totalRetrieved}</span>
            <span className="text-[11px] text-slate-500 ml-2">across {totalRuns} runs</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Confirmed Matches</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-emerald-400">{totalMatches}</span>
            <span className="text-[11px] text-slate-500 ml-2">
              {totalRetrieved > 0 ? `${Math.round((totalMatches / totalRetrieved) * 100)}% yield` : '0%'}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Posts Rejected</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-rose-400">{totalRejected}</span>
            <span className="text-[11px] text-slate-500 ml-2">filtered before storage</span>
          </div>
        </div>
      </div>

      {/* Rotation & Limits Settings Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Queries Per Run</label>
            <input
              type="number"
              min="1"
              max="20"
              value={config.maxQueriesPerRun}
              onChange={e => {
                const val = parseInt(e.target.value, 10) || 4;
                const next = { ...config, maxQueriesPerRun: val };
                setConfig(next);
                handleSaveCatalogue(catalogue, next);
              }}
              className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">
              Max Posts per Query
              <span className="text-[10px] text-slate-500 ml-1">(Provider limit applies per query)</span>
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={config.maxPostsPerQuery}
              onChange={e => {
                const val = parseInt(e.target.value, 10) || 10;
                const next = { ...config, maxPostsPerQuery: val };
                setConfig(next);
                handleSaveCatalogue(catalogue, next);
              }}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Default Time Window</label>
            <select
              value={config.timeWindow}
              onChange={e => {
                const val = e.target.value as TimeWindow;
                const next = { ...config, timeWindow: val };
                setConfig(next);
                handleSaveCatalogue(catalogue, next);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
            >
              <option value="24h">24 Hours (postedLimit: "24h")</option>
              <option value="7d">7 Days (Default, postedLimit: "week")</option>
              <option value="30d">30 Days (Rolling 30-day cutoff)</option>
            </select>
          </div>
        </div>

        <div className="text-right text-xs text-slate-400 space-y-0.5">
          <div className="font-mono text-indigo-300">
            Current Rotation Index: <strong>{config.rotationIndex}</strong> / {catalogue.filter(q => q.enabled).length} active
          </div>
          <div className="text-[11px] text-slate-500">
            Next scan will execute next {config.maxQueriesPerRun} enabled queries.
          </div>
        </div>
      </div>

      {/* Category Filter Pills & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All Categories ({catalogue.length})
            </button>
            {(Object.keys(CATEGORY_LABELS) as RoleFamilyCategory[]).map(cat => {
              const count = catalogue.filter(q => q.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {CATEGORY_LABELS[cat].split('(')[0].trim()} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search query text or roles..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Query Catalogue List */}
      <div className="space-y-3">
        {filteredItems.map((item, idx) => {
          const colors = CATEGORY_COLORS[item.category] || {
            bg: 'bg-slate-800',
            text: 'text-slate-300',
            border: 'border-slate-700',
          };
          const opCount = countBooleanOperators(item.compiledQuery);
          const charLen = item.compiledQuery.length;
          const isTooComplex = opCount > 5 || charLen > 500;

          return (
            <div
              key={item.id}
              className={`bg-slate-900 border rounded-2xl p-4 transition-all ${
                item.enabled ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-60'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}
                    >
                      {item.categoryLabel}
                    </span>

                    {item.sectorTag !== 'all' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        Sector: {item.sectorTag}
                      </span>
                    )}

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isTooComplex
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                      title="Provider limit: <= 5 Boolean operators, < 500 characters"
                    >
                      {opCount} Operators • {charLen} Chars
                    </span>
                  </div>

                  {/* Compiled Boolean Query Box */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-xs text-emerald-300 select-all break-all">
                    {item.compiledQuery}
                  </div>

                  {/* Role terms and Phrase terms */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <div>
                      <strong className="text-slate-300">Roles:</strong>{' '}
                      {item.roleTerms.length > 0 ? item.roleTerms.join(', ') : 'Custom'}
                    </div>
                    <div>
                      <strong className="text-slate-300">Phrases:</strong>{' '}
                      {item.phraseTerms.length > 0 ? item.phraseTerms.join(', ') : 'Standard'}
                    </div>
                  </div>
                </div>

                {/* Right Column: Performance Stats & Actions */}
                <div className="flex flex-row lg:flex-col lg:items-end justify-between gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                  <div className="flex items-center space-x-3 text-xs">
                    <div className="text-center" title="Total Posts Retrieved">
                      <span className="block text-[10px] text-slate-500 uppercase font-semibold">Posts</span>
                      <span className="font-bold text-white">{item.stats?.retrievedCount || 0}</span>
                    </div>
                    <div className="text-center" title="Confirmed Matches">
                      <span className="block text-[10px] text-slate-500 uppercase font-semibold">Matches</span>
                      <span className="font-bold text-emerald-400">{item.stats?.matchedCount || 0}</span>
                    </div>
                    <div className="text-center" title="Filtered/Rejected Posts">
                      <span className="block text-[10px] text-slate-500 uppercase font-semibold">Rejected</span>
                      <span className="font-bold text-rose-400">{item.stats?.rejectedCount || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleToggleEnabled(item.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        item.enabled
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {item.enabled ? 'Enabled' : 'Disabled'}
                    </button>

                    <button
                      onClick={() => setEditingItem({ ...item })}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                      title="Edit query terms or Boolean expression"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteQuery(item.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 border border-slate-700 transition cursor-pointer"
                      title="Delete this query"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
            No queries match the selected filters.
          </div>
        )}
      </div>

      {/* Edit Query Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <span>Edit Query Configuration</span>
              </h2>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Role Family Category</label>
                <select
                  value={editingItem.category}
                  onChange={e =>
                    setEditingItem({
                      ...editingItem,
                      category: e.target.value as RoleFamilyCategory,
                      categoryLabel: CATEGORY_LABELS[e.target.value as RoleFamilyCategory],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  {(Object.keys(CATEGORY_LABELS) as RoleFamilyCategory[]).map(cat => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Compiled Boolean Query
                  <span className="text-[10px] text-slate-500 ml-1.5">
                    ({countBooleanOperators(editingItem.compiledQuery)} operators, {editingItem.compiledQuery.length} chars)
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={editingItem.compiledQuery}
                  onChange={e => setEditingItem({ ...editingItem, compiledQuery: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 font-mono text-xs text-emerald-300"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Role Terms (comma-separated)</label>
                <input
                  type="text"
                  value={editingItem.roleTerms.join(', ')}
                  onChange={e =>
                    setEditingItem({
                      ...editingItem,
                      roleTerms: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Job-Seeking Phrases (comma-separated)</label>
                <input
                  type="text"
                  value={editingItem.phraseTerms.join(', ')}
                  onChange={e =>
                    setEditingItem({
                      ...editingItem,
                      phraseTerms: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm"
              >
                Save Query
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Query Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <PlusCircle className="w-4 h-4 text-blue-400" />
                <span>Add Focused Query to Catalogue</span>
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Role Family Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value as RoleFamilyCategory)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  {(Object.keys(CATEGORY_LABELS) as RoleFamilyCategory[]).map(cat => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Target Sector</label>
                <select
                  value={newSector}
                  onChange={e => setNewSector(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="all">All Eligible Sectors</option>
                  <option value="pharma">Pharma</option>
                  <option value="FMCG">FMCG</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="paints">Paints</option>
                  <option value="hospitality">Hospitality</option>
                  <option value="technology sales">Technology Sales</option>
                  <option value="fintech">Fintech</option>
                  <option value="NBFC">NBFC</option>
                  <option value="banking">Banking</option>
                  <option value="insurance">Insurance</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Compiled Boolean Query (e.g. ("medical representative" OR "MR pharma") AND ("open to work" OR "looking for a change"))
                </label>
                <textarea
                  rows={3}
                  placeholder='("sales executive" OR "sales officer") AND ("open to work" OR "seeking a new role")'
                  value={newCompiledQuery}
                  onChange={e => setNewCompiledQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 font-mono text-xs text-emerald-300"
                />
              </div>

              {/* Phrase helper tags to click and copy/append */}
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
                <span className="font-semibold text-slate-300 block">Quick Phrase Helpers (Click to copy to clipboard):</span>
                <div className="flex flex-wrap gap-1.5">
                  {PHRASE_GROUPS.flatMap(g => g.phrases).slice(0, 8).map(phrase => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => navigator.clipboard.writeText(`"${phrase}"`)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-blue-300 border border-slate-700 cursor-pointer"
                    >
                      +{phrase}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNewQuery}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm cursor-pointer"
              >
                Add Query
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

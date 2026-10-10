import React, { useState } from 'react';
import {
  Users,
  Search,
  Download,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
  Linkedin,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  MapPin,
  Calendar,
  Briefcase,
  FileCheck2,
  FileX2,
  Layers,
  HelpCircle,
  Clock,
  Eye,
  Mail,
  Phone,
  Copy,
  Check,
} from 'lucide-react';
import { Candidate, CriteriaTag, SourcePost, AuthorIntent } from '../types/index.ts';
import { CandidateDetailModal } from './CandidateDetailModal.tsx';
import { UncertainDuplicatesModal } from './UncertainDuplicatesModal.tsx';

interface CandidatesScreenProps {
  candidates: Candidate[];
  allPosts: SourcePost[];
  mode: 'demo' | 'live';
  onSaveCorrection: (id: string, updates: Partial<Candidate>) => Promise<void>;
  onResolveDuplicate: (
    primaryId: string,
    secondaryId: string,
    action: 'merge' | 'dismiss'
  ) => Promise<void>;
  onReprocessPosts?: () => Promise<{
    retrievedCount: number;
    rejectedCount: number;
    outsideTargetCount: number;
    needingReviewCount: number;
    matchedCount: number;
    details: any[];
  }>;
}

export const CandidatesScreen: React.FC<CandidatesScreenProps> = ({
  candidates,
  allPosts,
  mode,
  onSaveCorrection,
  onResolveDuplicate,
  onReprocessPosts,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  // Show "Matches Criteria" by default as strictly required by prompt
  const [activeTab, setActiveTab] = useState<'Matches Criteria' | 'Needs Review' | 'Outside Target' | 'Rejected Posts' | 'all'>('Matches Criteria');
  const [selectedExpFilter, setSelectedExpFilter] = useState<'all' | '1-3' | '4-7' | '8-10' | '10+' | 'unstated'>('all');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('all');
  const [selectedCorrectionFilter, setSelectedCorrectionFilter] = useState<'all' | 'corrected' | 'original'>('all');

  const [inspectingCandidate, setInspectingCandidate] = useState<Candidate | null>(null);
  const [duplicatePair, setDuplicatePair] = useState<{ primaryId: string; secondaryId: string } | null>(null);

  // Reprocess state & modal
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessSummary, setReprocessSummary] = useState<{
    retrievedCount: number;
    rejectedCount: number;
    outsideTargetCount: number;
    needingReviewCount: number;
    matchedCount: number;
  } | null>(null);

  // Canonical Verification state & modal
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationData, setVerificationData] = useState<any | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [copiedContact, setCopiedContact] = useState<string | null>(null);

  // Counts across the dataset
  const retrievedPostsCount = allPosts.length;
  const matchesCount = candidates.filter(c => c.criteriaTag === 'Matches Criteria').length;
  const reviewCount = candidates.filter(c => c.criteriaTag === 'Needs Review').length;
  const outsideCount = candidates.filter(c => c.criteriaTag === 'Outside Target').length;
  const rejectedPosts = allPosts.filter(
    p =>
      p.extractionState === 'recruiter_ad' ||
      p.extractionState === 'rejected_post' ||
      (p.authorIntent && p.authorIntent !== 'SELF_JOB_SEEKING')
  );
  const rejectedPostsCount = rejectedPosts.length;

  // Filter candidates for candidate views
  const filteredCandidates = candidates.filter(cand => {
    // Tab filter
    if (activeTab === 'Matches Criteria' && cand.criteriaTag !== 'Matches Criteria') return false;
    if (activeTab === 'Needs Review' && cand.criteriaTag !== 'Needs Review') return false;
    if (activeTab === 'Outside Target' && cand.criteriaTag !== 'Outside Target') return false;
    if (activeTab === 'Rejected Posts') return false; // Handled separately below

    // Experience filter
    if (selectedExpFilter !== 'all') {
      if (selectedExpFilter === 'unstated' && cand.totalExperienceYears !== null) return false;
      if (
        selectedExpFilter === '1-3' &&
        (cand.totalExperienceYears === null || cand.totalExperienceYears < 1 || cand.totalExperienceYears > 3)
      )
        return false;
      if (
        selectedExpFilter === '4-7' &&
        (cand.totalExperienceYears === null || cand.totalExperienceYears < 4 || cand.totalExperienceYears > 7)
      )
        return false;
      if (
        selectedExpFilter === '8-10' &&
        (cand.totalExperienceYears === null || cand.totalExperienceYears < 8 || cand.totalExperienceYears > 10)
      )
        return false;
      if (selectedExpFilter === '10+' && (cand.totalExperienceYears === null || cand.totalExperienceYears <= 10))
        return false;
    }

    // Sector filter
    if (selectedSectorFilter !== 'all') {
      const candSector = (cand.sector || cand.industry || '').toLowerCase();
      if (!candSector.includes(selectedSectorFilter.toLowerCase())) return false;
    }

    // Manual correction filter
    if (selectedCorrectionFilter === 'corrected' && !cand.isManuallyCorrected) return false;
    if (selectedCorrectionFilter === 'original' && cand.isManuallyCorrected) return false;

    // Search query
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = cand.name ? cand.name.toLowerCase().includes(q) : false;
      const matchRole = cand.currentOrPreviousRole ? cand.currentOrPreviousRole.toLowerCase().includes(q) : false;
      const matchCompany = cand.employer ? cand.employer.toLowerCase().includes(q) : false;
      const matchIndustry = cand.industry ? cand.industry.toLowerCase().includes(q) : false;
      const matchEmail = cand.email ? cand.email.toLowerCase().includes(q) : false;
      const matchPhone = cand.phone ? cand.phone.toLowerCase().includes(q) : false;
      const matchHandle = cand.profileUrlOrTelegramId ? cand.profileUrlOrTelegramId.toLowerCase().includes(q) : false;
      const matchExplanation = cand.matchingExplanation.toLowerCase().includes(q);
      const matchLocation =
        (cand.currentWorkLocation || '').toLowerCase().includes(q) ||
        (cand.preferredLocation || '').toLowerCase().includes(q);

      return (
        matchName ||
        matchRole ||
        matchCompany ||
        matchIndustry ||
        matchEmail ||
        matchPhone ||
        matchHandle ||
        matchExplanation ||
        matchLocation
      );
    }

    return true;
  });

  // Filter rejected posts for the "Rejected Posts" view
  const filteredRejectedPosts = rejectedPosts.filter(post => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const matchContent = post.content.toLowerCase().includes(q);
    const matchAuthor = (post.authorName || '').toLowerCase().includes(q);
    const matchReason = (post.rejectionReason || '').toLowerCase().includes(q);
    return matchContent || matchAuthor || matchReason;
  });

  const handleExportCsv = () => {
    const tagParam = activeTab === 'all' || activeTab === 'Rejected Posts' ? '' : `&tag=${encodeURIComponent(activeTab)}`;
    const url = `/api/candidates/export.csv?mode=${mode}${tagParam}`;
    window.location.href = url;
  };

  const handleTriggerReprocess = async () => {
    setIsReprocessing(true);
    try {
      if (onReprocessPosts) {
        const res = await onReprocessPosts();
        setReprocessSummary(res);
      } else {
        const res = await fetch('/api/posts/reprocess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        const body = await res.json();
        setReprocessSummary(body);
      }
    } catch (err: any) {
      console.error('Reprocess failed:', err);
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleRunCanonicalVerification = async () => {
    setIsVerifying(true);
    setShowVerifyModal(true);
    try {
      const res = await fetch('/api/verify/canonical');
      const data = await res.json();
      setVerificationData(data);
    } catch (err: any) {
      console.error('Verification failed:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span>Candidate Database & Review</span>
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-950 text-blue-300 border border-blue-800">
                Two-Stage Evidence Validation
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Stage 1 classifies author intent (only <strong>SELF_JOB_SEEKING</strong> authors proceed). Stage 2 validates sales role, India location, 1–10y experience, eligible sector, and post date window.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunCanonicalVerification}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/50 transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
              title="Verify 7 canonical test scenarios (recruiter ad, pharma sales, unrelated FMCG, hiring managers mention, etc.)"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Verify 7 Test Cases</span>
            </button>

            <button
              onClick={handleTriggerReprocess}
              disabled={isReprocessing}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              title="Reprocess existing collected posts before making additional paid API calls"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin' : ''}`} />
              <span>{isReprocessing ? 'Reprocessing...' : 'Reprocess Collected Posts'}</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
              title="Download CSV matching stored candidate records and 6-point evidence"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Counts Summary Bar (Clear separation: Retrieved vs Matches vs Review vs Outside vs Rejected) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-800/80">
          {/* Retrieved Posts */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
            <span className="text-[11px] font-semibold text-slate-400 block">Retrieved Posts</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-xl font-bold text-white">{retrievedPostsCount}</span>
              <span className="text-[10px] text-slate-500">total ingested</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">
              Not counted as matched candidates.
            </p>
          </div>

          {/* Matches Criteria */}
          <button
            onClick={() => setActiveTab('Matches Criteria')}
            className={`text-left rounded-xl p-3 border transition cursor-pointer ${
              activeTab === 'Matches Criteria'
                ? 'bg-emerald-950/70 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30'
                : 'bg-emerald-950/20 border-emerald-900/50 hover:bg-emerald-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-300">Matches Criteria</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-xl font-bold text-emerald-400">{matchesCount}</span>
              <span className="text-[10px] text-emerald-300/80 font-medium">Default view</span>
            </div>
            <p className="text-[10px] text-emerald-300/70 mt-1 leading-tight">
              All 6 checks verified with evidence.
            </p>
          </button>

          {/* Needs Review */}
          <button
            onClick={() => setActiveTab('Needs Review')}
            className={`text-left rounded-xl p-3 border transition cursor-pointer ${
              activeTab === 'Needs Review'
                ? 'bg-amber-950/70 border-amber-500 shadow-sm ring-1 ring-amber-500/30'
                : 'bg-amber-950/20 border-amber-900/50 hover:bg-amber-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-300">Needs Review</span>
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-xl font-bold text-amber-400">{reviewCount}</span>
              <span className="text-[10px] text-amber-300/80">Separate view</span>
            </div>
            <p className="text-[10px] text-amber-300/70 mt-1 leading-tight">
              Seeking intent plausible, facts unconfirmed.
            </p>
          </button>

          {/* Outside Target */}
          <button
            onClick={() => setActiveTab('Outside Target')}
            className={`text-left rounded-xl p-3 border transition cursor-pointer ${
              activeTab === 'Outside Target'
                ? 'bg-rose-950/70 border-rose-500 shadow-sm ring-1 ring-rose-500/30'
                : 'bg-rose-950/20 border-rose-900/50 hover:bg-rose-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-300">Outside Target</span>
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-xl font-bold text-rose-400">{outsideCount}</span>
              <span className="text-[10px] text-rose-300/80">Separate view</span>
            </div>
            <p className="text-[10px] text-rose-300/70 mt-1 leading-tight">
              Fails sales role, &gt;10y, outside India, etc.
            </p>
          </button>

          {/* Rejected Posts */}
          <button
            onClick={() => setActiveTab('Rejected Posts')}
            className={`text-left rounded-xl p-3 border transition cursor-pointer ${
              activeTab === 'Rejected Posts'
                ? 'bg-purple-950/70 border-purple-500 shadow-sm ring-1 ring-purple-500/30'
                : 'bg-purple-950/20 border-purple-900/50 hover:bg-purple-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-300">Rejected Posts</span>
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-xl font-bold text-purple-400">{rejectedPostsCount}</span>
              <span className="text-[10px] text-purple-300/80">Separate view</span>
            </div>
            <p className="text-[10px] text-purple-300/70 mt-1 leading-tight">
              Recruiter ads, 3rd party, unrelated content.
            </p>
          </button>
        </div>

        {/* View Switcher Tabs & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
          {/* Main Sub-view Selector Tabs */}
          <div className="flex items-center space-x-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('Matches Criteria')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'Matches Criteria'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Matches Criteria ({matchesCount})
            </button>
            <button
              onClick={() => setActiveTab('Needs Review')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'Needs Review'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Needs Review ({reviewCount})
            </button>
            <button
              onClick={() => setActiveTab('Outside Target')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'Outside Target'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Outside Target ({outsideCount})
            </button>
            <button
              onClick={() => setActiveTab('Rejected Posts')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'Rejected Posts'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Rejected Posts ({rejectedPostsCount})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              All Candidates ({candidates.length})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={
                activeTab === 'Rejected Posts'
                  ? 'Search rejected posts or reason...'
                  : 'Search name, role, company, sector...'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Additional Filters row for candidates views */}
        {activeTab !== 'Rejected Posts' && (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Experience:</span>
              <select
                value={selectedExpFilter}
                onChange={e => setSelectedExpFilter(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Any Duration</option>
                <option value="1-3">1 – 3 Years</option>
                <option value="4-7">4 – 7 Years</option>
                <option value="8-10">8 – 10 Years</option>
                <option value="10+">&gt; 10 Years (Outside)</option>
                <option value="unstated">Unstated in Post</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Sector:</span>
              <select
                value={selectedSectorFilter}
                onChange={e => setSelectedSectorFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Any Sector</option>
                <option value="wealthtech">Wealthtech</option>
                <option value="fmcg">FMCG</option>
                <option value="automotive">Automotive</option>
                <option value="nbfc">NBFC</option>
                <option value="fintech">Fintech / BFSI</option>
                <option value="pharma">Pharma</option>
                <option value="technology sales">Technology Sales</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="paints">Paints</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Data Record:</span>
              <select
                value={selectedCorrectionFilter}
                onChange={e => setSelectedCorrectionFilter(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Records</option>
                <option value="corrected">Manually Corrected</option>
                <option value="original">Original AI</option>
              </select>
            </div>
          </div>
        )}

        {/* Matches Criteria Banner */}
        {activeTab === 'Matches Criteria' && (
          <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-200">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Expanded Target Criteria:</strong> Candidates actively looking out for jobs having <strong>1–10 years experience across ANY role (Sales or Non-Sales) & ANY sector</strong>.
              </span>
            </div>
            <span className="text-[11px] text-emerald-300 font-mono bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/60 shrink-0">
              Tech • Sales • Operations • Finance • Marketing • HR • Pharma • BFSI & more
            </span>
          </div>
        )}
      </div>

      {/* Main Content: Rejected Posts View vs Candidates View */}
      {activeTab === 'Rejected Posts' ? (
        <div className="space-y-4">
          <div className="bg-purple-950/20 border border-purple-900/50 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShieldAlert className="w-5 h-5 text-purple-400" />
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Rejected Non-Candidate Posts View
                </h3>
                <p className="text-xs text-slate-300">
                  Posts classified as recruiter advertisements, third-party searches, or unrelated content. Kept in a separate view and strictly never counted as matched candidates.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-purple-300 font-semibold">
              {filteredRejectedPosts.length} posts
            </span>
          </div>

          {filteredRejectedPosts.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-2">
              <FileX2 className="w-10 h-10 mx-auto text-slate-600 stroke-1" />
              <p className="text-sm font-semibold text-slate-400">No Rejected Posts Found</p>
              <p className="text-xs">All current posts matched or are pending extraction.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRejectedPosts.map(post => (
                <div
                  key={post.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                      <ShieldAlert className="w-3 h-3 text-purple-400" />
                      <span>{post.authorIntent || (post.extractionState === 'recruiter_ad' ? 'RECRUITER_OR_EMPLOYER_HIRING' : 'UNRELATED')}</span>
                    </span>

                    <span className="text-[10px] text-slate-500 font-mono">
                      {post.postedAt ? new Date(post.postedAt).toLocaleDateString() : 'Date N/A'}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {post.authorName || 'Author Not Provided'}
                    </h4>
                    {post.authorHeadline && (
                      <p className="text-xs text-slate-400 line-clamp-1">{post.authorHeadline}</p>
                    )}
                    {post.authorLocation && (
                      <p className="text-[11px] text-slate-500">{post.authorLocation}</p>
                    )}
                  </div>

                  {/* Rejection Reason Banner */}
                  <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-2.5 text-xs text-rose-300">
                    <span className="font-semibold text-rose-400 block text-[11px] uppercase tracking-wider mb-0.5">
                      Rejection Reason:
                    </span>
                    <p className="italic">"{post.rejectionReason || 'Non-candidate post rejected in Stage 1 intent classification.'}"</p>
                  </div>

                  {/* Original Post Snippet */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 font-sans line-clamp-3">
                    "{post.content}"
                  </div>

                  {post.intentEvidence && (
                    <p className="text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">Intent Evidence:</span> {post.intentEvidence}
                    </p>
                  )}

                  {post.sourceUrl && (
                    <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                      <a
                        href={post.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                      >
                        <span>View Source Post</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Candidates View */
        <>
          {filteredCandidates.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-3">
              <Users className="w-10 h-10 mx-auto text-slate-600 stroke-1" />
              <p className="text-sm font-semibold text-slate-400">
                No Candidates in "{activeTab}" View
              </p>
              <p className="text-xs max-w-sm mx-auto">
                Try switching to "Matches Criteria" or "Needs Review", or click "Reprocess Collected Posts" to re-evaluate evidence.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCandidates.map(candidate => {
                const checks = candidate.validationChecks;
                const hasLinkedIn = Boolean(candidate.profileUrl || candidate.postUrl);

                return (
                  <div
                    key={candidate.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-sm transition flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Top Bar: Tag & Sector */}
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            candidate.criteriaTag === 'Matches Criteria'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : candidate.criteriaTag === 'Needs Review'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {candidate.criteriaTag === 'Matches Criteria' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : candidate.criteriaTag === 'Needs Review' ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          <span>{candidate.criteriaTag}</span>
                        </span>

                        <div className="flex items-center space-x-1.5">
                          {candidate.sector && (
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[10px] font-bold uppercase tracking-wider">
                              {candidate.sector}
                            </span>
                          )}
                          {hasLinkedIn && (
                            <span
                              className="p-1 rounded bg-blue-900/40 text-blue-400 border border-blue-800/40"
                              title="LinkedIn Verified"
                            >
                              <Linkedin className="w-3 h-3" />
                            </span>
                          )}
                          {candidate.isManuallyCorrected && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-bold"
                              title="Manually edited by recruiter"
                            >
                              EDITED
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Candidate Identity */}
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition truncate">
                          {candidate.name || <em className="text-slate-500 font-normal">Name Not Provided</em>}
                        </h3>
                        <p className="text-xs text-slate-300 font-medium truncate mt-0.5">
                          {candidate.currentOrPreviousRole || <em className="text-slate-500">Role Not Provided</em>}
                          {candidate.employer && (
                            <span className="text-slate-400 font-normal"> at {candidate.employer}</span>
                          )}
                        </p>
                        {candidate.currentWorkLocation && (
                          <p className="text-[11px] text-emerald-400 flex items-center space-x-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            <span>{candidate.currentWorkLocation}</span>
                          </p>
                        )}
                      </div>

                      {/* Experience and Industry Badges */}
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-semibold border border-slate-700/80">
                          {candidate.totalExperienceYears !== null
                            ? `${candidate.totalExperienceYears}y exp (${candidate.experienceType || 'stated'})`
                            : 'Exp Unstated (Needs Review)'}
                        </span>
                        {candidate.industry && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/80 truncate max-w-[180px]">
                            {candidate.industry}
                          </span>
                        )}
                      </div>

                      {/* Factual Tag Explanation */}
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {candidate.matchingExplanation}
                      </p>

                      {/* Contact Details (Email & Phone) */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                          <span className="uppercase tracking-wider font-semibold">Contact Details</span>
                          {candidate.email || candidate.phone ? (
                            <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                              <Check className="w-3 h-3" />
                              <span>Extracted</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">Not in post</span>
                          )}
                        </div>

                        {candidate.email && (
                          <div className="flex items-center justify-between gap-1 text-xs text-blue-300 bg-slate-900/90 px-2 py-1 rounded border border-slate-800">
                            <a
                              href={`mailto:${candidate.email}`}
                              className="hover:underline flex items-center space-x-1.5 truncate"
                              title="Send email"
                            >
                              <Mail className="w-3 h-3 text-blue-400 shrink-0" />
                              <span className="truncate font-mono text-[11px]">{candidate.email}</span>
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(candidate.email!);
                                setCopiedContact(candidate.email!);
                                setTimeout(() => setCopiedContact(null), 2000);
                              }}
                              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
                              title="Copy email"
                            >
                              {copiedContact === candidate.email ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        )}

                        {candidate.phone && (
                          <div className="flex items-center justify-between gap-1 text-xs text-emerald-300 bg-slate-900/90 px-2 py-1 rounded border border-slate-800">
                            <a
                              href={`tel:${candidate.phone}`}
                              className="hover:underline flex items-center space-x-1.5 truncate"
                              title="Call phone"
                            >
                              <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="truncate font-mono text-[11px]">{candidate.phone}</span>
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(candidate.phone!);
                                setCopiedContact(candidate.phone!);
                                setTimeout(() => setCopiedContact(null), 2000);
                              }}
                              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
                              title="Copy phone"
                            >
                              {copiedContact === candidate.phone ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 6-Point Validation Summary Pills */}
                      {checks && (
                        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-1 text-[10px]">
                          <span
                            className={`px-1.5 py-0.5 rounded truncate text-center ${
                              (checks.authorIsPersonallySeekingJob?.passed ?? (checks as any).explicitPersonalJobSeekingStatement?.passed) === true
                                ? 'text-emerald-400 bg-emerald-950/60'
                                : 'text-rose-400 bg-rose-950/60'
                            }`}
                            title="Seeking intent check"
                          >
                            Seeking: {(checks.authorIsPersonallySeekingJob?.passed ?? (checks as any).explicitPersonalJobSeekingStatement?.passed) === true ? '✓' : '✗'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded truncate text-center ${
                              checks.currentlyEmployedInSalesRole.passed === true
                                ? 'text-emerald-400 bg-emerald-950/60'
                                : checks.currentlyEmployedInSalesRole.passed === false
                                ? 'text-rose-400 bg-rose-950/60'
                                : 'text-amber-400 bg-amber-950/60'
                            }`}
                            title={`Role: ${checks.currentlyEmployedInSalesRole.evidence}`}
                          >
                            Role: {checks.currentlyEmployedInSalesRole.passed === true ? '✓' : checks.currentlyEmployedInSalesRole.passed === false ? '✗' : '?'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded truncate text-center ${
                              checks.currentlyWorkingInIndia.passed === true
                                ? 'text-emerald-400 bg-emerald-950/60'
                                : checks.currentlyWorkingInIndia.passed === false
                                ? 'text-rose-400 bg-rose-950/60'
                                : 'text-amber-400 bg-amber-950/60'
                            }`}
                            title={`India: ${checks.currentlyWorkingInIndia.evidence}`}
                          >
                            India: {checks.currentlyWorkingInIndia.passed === true ? '✓' : checks.currentlyWorkingInIndia.passed === false ? '✗' : '?'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded truncate text-center ${
                              checks.totalExperience1To10Years.passed === true
                                ? 'text-emerald-400 bg-emerald-950/60'
                                : checks.totalExperience1To10Years.passed === false
                                ? 'text-rose-400 bg-rose-950/60'
                                : 'text-amber-400 bg-amber-950/60'
                            }`}
                            title={`1-10y Exp: ${checks.totalExperience1To10Years.evidence}`}
                          >
                            1-10y: {checks.totalExperience1To10Years.passed === true ? '✓' : checks.totalExperience1To10Years.passed === false ? '✗' : '?'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded truncate text-center ${
                              checks.currentEmployerInTargetSector?.passed === true
                                ? 'text-emerald-400 bg-emerald-950/60'
                                : checks.currentEmployerInTargetSector?.passed === false
                                ? 'text-rose-400 bg-rose-950/60'
                                : 'text-amber-400 bg-amber-950/60'
                            }`}
                            title={`Sector: ${checks.currentEmployerInTargetSector?.evidence || candidate.sector}`}
                          >
                            Sector: {checks.currentEmployerInTargetSector?.passed === true ? '✓' : checks.currentEmployerInTargetSector?.passed === false ? '✗' : '?'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded truncate text-center ${
                              checks.postDateWithinSelectedPeriod.passed === true
                                ? 'text-emerald-400 bg-emerald-950/60'
                                : checks.postDateWithinSelectedPeriod.passed === false
                                ? 'text-rose-400 bg-rose-950/60'
                                : 'text-amber-400 bg-amber-950/60'
                            }`}
                            title={`Date: ${checks.postDateWithinSelectedPeriod.evidence}`}
                          >
                            Date: {checks.postDateWithinSelectedPeriod.passed === true ? '✓' : checks.postDateWithinSelectedPeriod.passed === false ? '✗' : '?'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Actions */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      {candidate.originalPostDate ? (
                        <span className="text-slate-500 text-[11px]">
                          {new Date(candidate.originalPostDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Post Date N/A</span>
                      )}

                      <button
                        onClick={() => setInspectingCandidate(candidate)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 text-xs font-medium transition flex items-center space-x-1 cursor-pointer"
                      >
                        <span>Inspect Evidence</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Detail & Evidence Modal */}
      {inspectingCandidate && (
        <CandidateDetailModal
          candidate={inspectingCandidate}
          allPosts={allPosts}
          onClose={() => setInspectingCandidate(null)}
          onSaveCorrection={async (id, updates) => {
            await onSaveCorrection(id, updates);
            setInspectingCandidate(prev => (prev ? { ...prev, ...updates, isManuallyCorrected: true } : null));
          }}
          onOpenDuplicateComparison={secondaryId => {
            setDuplicatePair({ primaryId: inspectingCandidate.id, secondaryId });
            setInspectingCandidate(null);
          }}
        />
      )}

      {/* Uncertain Duplicates Resolution Modal */}
      {duplicatePair && (
        <UncertainDuplicatesModal
          primaryCandidate={candidates.find(c => c.id === duplicatePair.primaryId)!}
          secondaryCandidate={candidates.find(c => c.id === duplicatePair.secondaryId)!}
          allPosts={allPosts}
          onClose={() => setDuplicatePair(null)}
          onResolve={async action => {
            await onResolveDuplicate(duplicatePair.primaryId, duplicatePair.secondaryId, action);
            setDuplicatePair(null);
          }}
        />
      )}

      {/* Reprocess Results Summary Modal */}
      {reprocessSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Reprocess Completed</span>
              </h3>
              <button
                onClick={() => setReprocessSummary(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300">
              All existing collected posts were re-evaluated under strict two-stage evidence criteria without making extra paid API calls. Recruiter manual edits were preserved.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <span className="text-slate-400 block font-medium">Retrieved Posts</span>
                <span className="text-lg font-bold text-white">{reprocessSummary.retrievedCount}</span>
              </div>
              <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/60">
                <span className="text-emerald-300 block font-medium">Matched Candidates</span>
                <span className="text-lg font-bold text-emerald-400">{reprocessSummary.matchedCount}</span>
              </div>
              <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-800/60">
                <span className="text-amber-300 block font-medium">Needs Review</span>
                <span className="text-lg font-bold text-amber-400">{reprocessSummary.needingReviewCount}</span>
              </div>
              <div className="bg-purple-950/40 p-3 rounded-xl border border-purple-800/60">
                <span className="text-purple-300 block font-medium">Rejected Posts</span>
                <span className="text-lg font-bold text-purple-400">{reprocessSummary.rejectedCount}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setReprocessSummary(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canonical Verification Suite Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <FileCheck2 className="w-5 h-5 text-indigo-400" />
                  <span>Canonical Test Cases Verification Suite</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Validates all 7 mandatory verification scenarios from prompt against two-stage classification and 6 criteria.
                </p>
              </div>
              <button
                onClick={() => setShowVerifyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {isVerifying ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-300 font-medium">Executing two-stage verification on all 7 test cases...</p>
              </div>
            ) : verificationData ? (
              <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
                {/* Summary Banner */}
                <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Retrieved Scenarios</span>
                    <span className="text-base font-bold text-white">{verificationData.retrievedCount}</span>
                  </div>
                  <div>
                    <span className="text-emerald-400 block font-semibold">Matched Candidates</span>
                    <span className="text-base font-bold text-emerald-400">{verificationData.matchedCount}</span>
                  </div>
                  <div>
                    <span className="text-amber-400 block font-semibold">Needs Review</span>
                    <span className="text-base font-bold text-amber-400">{verificationData.needingReviewCount}</span>
                  </div>
                  <div>
                    <span className="text-rose-400 block font-semibold">Outside Target</span>
                    <span className="text-base font-bold text-rose-400">{verificationData.outsideTargetCount}</span>
                  </div>
                  <div>
                    <span className="text-purple-400 block font-semibold">Rejected Posts</span>
                    <span className="text-base font-bold text-purple-400">{verificationData.rejectedCount}</span>
                  </div>
                </div>

                {/* Per-Scenario Results */}
                <div className="space-y-2.5">
                  {verificationData.results?.map((res: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-300 font-mono">
                            {idx + 1}
                          </span>
                          <span>{res.scenarioName}</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            res.passed
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {res.passed ? 'PASSED EXPECTED' : 'FAILED EXPECTED'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-slate-400">
                          Intent: <strong className="text-blue-300 font-mono">{res.authorIntent}</strong>
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400">
                          Outcome: <strong className="text-white font-mono">{res.actualOutcome}</strong>
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 italic bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                        {res.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Covers recruiter ad, pharma sales, unrelated FMCG, unknown exp, tech engineer, outside India, hiring managers mention.
              </span>
              <button
                onClick={() => setShowVerifyModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close Suite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

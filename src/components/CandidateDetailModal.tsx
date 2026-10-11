import React, { useState } from 'react';
import {
  X,
  Edit3,
  Save,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
  Linkedin,
  Send,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Users,
  Copy,
  Check,
  Layers,
  MapPin,
  Calendar,
  Briefcase,
  Clock,
  Mail,
  Phone,
} from 'lucide-react';
import { Candidate, CriteriaTag, SourcePost } from '../types/index.ts';

interface CandidateDetailModalProps {
  candidate: Candidate;
  allPosts: SourcePost[];
  onClose: () => void;
  onSaveCorrection: (id: string, updates: Partial<Candidate>) => Promise<void>;
  onOpenDuplicateComparison?: (secondaryId: string) => void;
}

export const CandidateDetailModal: React.FC<CandidateDetailModalProps> = ({
  candidate,
  allPosts,
  onClose,
  onSaveCorrection,
  onOpenDuplicateComparison,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states for manual correction
  const [editName, setEditName] = useState(candidate.name || '');
  const [editRole, setEditRole] = useState(candidate.currentOrPreviousRole || '');
  const [editEmployer, setEditEmployer] = useState(candidate.employer || '');
  const [editWorkLocation, setEditWorkLocation] = useState(candidate.currentWorkLocation || '');
  const [editIndustry, setEditIndustry] = useState(candidate.industry || '');
  const [editExpYears, setEditExpYears] = useState<string>(
    candidate.totalExperienceYears !== null ? String(candidate.totalExperienceYears) : ''
  );
  const [editJobSeekingStatement, setEditJobSeekingStatement] = useState(candidate.jobSeekingStatement || '');
  const [editOriginalPostDate, setEditOriginalPostDate] = useState(candidate.originalPostDate || '');
  const [editProfileUrl, setEditProfileUrl] = useState(candidate.profileUrl || candidate.profileUrlOrTelegramId || '');
  const [editPostUrl, setEditPostUrl] = useState(candidate.postUrl || '');
  const [editEmail, setEditEmail] = useState(candidate.email || '');
  const [editPhone, setEditPhone] = useState(candidate.phone || '');
  const [editTag, setEditTag] = useState<CriteriaTag>(candidate.criteriaTag);
  const [editNotes, setEditNotes] = useState(candidate.recruiterNotes || '');
  const [editExplanation, setEditExplanation] = useState(candidate.matchingExplanation);
  const [copiedInfo, setCopiedInfo] = useState<string | null>(null);

  const linkedPosts = allPosts.filter(p => candidate.sourcePostIds.includes(p.id));
  const checks = candidate.validationChecks;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates: Partial<Candidate> = {
        name: editName.trim() || null,
        currentOrPreviousRole: editRole.trim() || null,
        employer: editEmployer.trim() || null,
        currentWorkLocation: editWorkLocation.trim() || null,
        industry: editIndustry.trim() || null,
        totalExperienceYears: editExpYears.trim() ? parseFloat(editExpYears) : null,
        jobSeekingStatement: editJobSeekingStatement.trim() || null,
        originalPostDate: editOriginalPostDate.trim() || null,
        profileUrl: editProfileUrl.trim() || null,
        postUrl: editPostUrl.trim() || null,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        criteriaTag: editTag,
        matchingExplanation: editExplanation.trim(),
        recruiterNotes: editNotes.trim(),
      };

      await onSaveCorrection(candidate.id, updates);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save correction', err);
    } finally {
      setIsSaving(false);
    }
  };

  const renderCheckBadge = (passed: boolean | null | undefined) => {
    if (passed === true) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Passed</span>
        </span>
      );
    }
    if (passed === false) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
          <span>Failed</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        <span>Needs Review</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-base">
              {candidate.name ? candidate.name.charAt(0) : '?'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">
                  {candidate.name || <em className="text-slate-400">Name Not Provided</em>}
                </h2>
                {candidate.isManuallyCorrected && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                    Manually Corrected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center space-x-2 mt-0.5">
                <span>{candidate.currentOrPreviousRole || 'Sales Candidate'}</span>
                {candidate.employer && <span>• {candidate.employer}</span>}
                {candidate.currentWorkLocation && (
                  <span className="flex items-center space-x-1 text-slate-300">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    <span>{candidate.currentWorkLocation}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Correct Fields</span>
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Corrections'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: 5-Point Validation Checks & Candidate Fields (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Overall Tag & Matching Explanation */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Candidate Qualification Status
                </span>
                {!isEditing ? (
                  <span
                    className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      candidate.criteriaTag === 'Matches Criteria'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : candidate.criteriaTag === 'Needs Review'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {candidate.criteriaTag === 'Matches Criteria' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : candidate.criteriaTag === 'Needs Review' ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    <span>{candidate.criteriaTag}</span>
                  </span>
                ) : (
                  <select
                    value={editTag}
                    onChange={e => setEditTag(e.target.value as CriteriaTag)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                  >
                    <option value="Matches Criteria">Matches Criteria</option>
                    <option value="Needs Review">Needs Review</option>
                    <option value="Outside Target">Outside Target</option>
                  </select>
                )}
              </div>

              {!isEditing ? (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {candidate.matchingExplanation}
                </p>
              ) : (
                <textarea
                  rows={2}
                  value={editExplanation}
                  onChange={e => setEditExplanation(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                />
              )}
            </div>

            {/* 6-Point Criteria Validation Checks */}
            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center space-x-2">
                  <Sparkles className="w-4 h-4" />
                  <span>6-Point Evidence Validation Checks</span>
                </h3>
                <span className="text-[11px] text-slate-400">
                  Intent: <span className="font-semibold text-blue-300">{candidate.authorIntent || 'SELF_JOB_SEEKING'}</span>
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* 1. Author is Personally Seeking Job */}
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      1. Author is Personally Seeking a New Job
                    </span>
                    {renderCheckBadge(
                      checks?.authorIsPersonallySeekingJob
                        ? checks.authorIsPersonallySeekingJob.passed
                        : (checks as any)?.explicitPersonalJobSeekingStatement?.passed
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 italic">
                    Evidence: "{checks?.authorIsPersonallySeekingJob?.evidence || (checks as any)?.explicitPersonalJobSeekingStatement?.evidence || candidate.intentEvidence || candidate.jobSeekingStatement || 'No personal job seeking intent statement found.'}"
                  </p>
                </div>

                {/* 2. Professional Role */}
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      2. Role & Function Check (Any Role: Sales or Non-Sales)
                    </span>
                    {renderCheckBadge(checks?.currentlyEmployedInSalesRole?.passed)}
                  </div>
                  <p className="text-[11px] text-slate-300 italic">
                    Evidence: "{checks?.currentlyEmployedInSalesRole?.evidence || 'No employment evidence stated.'}"
                  </p>
                </div>

                {/* 3. India Location */}
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      3. Currently Working in India
                    </span>
                    {renderCheckBadge(checks?.currentlyWorkingInIndia?.passed)}
                  </div>
                  <p className="text-[11px] text-slate-300 italic">
                    Evidence: "{checks?.currentlyWorkingInIndia?.evidence || 'No India location evidence stated.'}"
                  </p>
                </div>

                {/* 4. 1-10 Years Experience */}
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      4. Total Experience 1–10 Years (Stated or Calculated: {candidate.experienceType || (checks?.totalExperience1To10Years as any)?.experienceType || 'unknown'})
                    </span>
                    {renderCheckBadge(checks?.totalExperience1To10Years?.passed)}
                  </div>
                  <p className="text-[11px] text-slate-300 italic">
                    Evidence: "{checks?.totalExperience1To10Years?.evidence || 'Total experience duration not stated.'}"
                  </p>
                </div>

                {/* 5. Target Sector Check */}
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      5. Employer Sector (Any Commercial or Industry Sector)
                    </span>
                    {renderCheckBadge(checks?.currentEmployerInTargetSector?.passed)}
                  </div>
                  <p className="text-[11px] text-slate-300 italic">
                    Evidence: "{checks?.currentEmployerInTargetSector?.evidence || (candidate.sector ? `Sector detected: ${candidate.sector}` : 'Employer operates in an eligible sector.')}"
                  </p>
                </div>

                {/* 6. Original Post Date Within Period */}
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      6. Original Post Date Within Selected Period
                    </span>
                    {renderCheckBadge(checks?.postDateWithinSelectedPeriod?.passed)}
                  </div>
                  <p className="text-[11px] text-slate-300 italic">
                    Evidence: "{checks?.postDateWithinSelectedPeriod?.evidence || 'Original post date not verified.'}"
                  </p>
                </div>
              </div>
            </div>

            {/* Candidate Details Form / View */}
            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Candidate Profile Data
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Name */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Full Name</label>
                  {!isEditing ? (
                    <p className="text-white font-semibold">
                      {candidate.name || <em className="text-slate-500 font-normal">Not Provided</em>}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  )}
                </div>

                {/* Role */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Current Professional Role</label>
                  {!isEditing ? (
                    <p className="text-white font-medium">
                      {candidate.currentOrPreviousRole || <em className="text-slate-500 font-normal">Not Provided</em>}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editRole}
                      onChange={e => setEditRole(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  )}
                </div>

                {/* Employer */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Employer / Company</label>
                  {!isEditing ? (
                    <p className="text-white font-medium">
                      {candidate.employer || <em className="text-slate-500 font-normal">Not Provided</em>}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editEmployer}
                      onChange={e => setEditEmployer(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  )}
                </div>

                {/* Current Work Location */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Current Work Location</label>
                  {!isEditing ? (
                    <p className="text-emerald-400 font-medium">
                      {candidate.currentWorkLocation || <em className="text-slate-500 font-normal">Not Provided</em>}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editWorkLocation}
                      onChange={e => setEditWorkLocation(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  )}
                </div>

                {/* Experience */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Reported Experience (Years)</label>
                  {!isEditing ? (
                    <p className="text-emerald-400 font-bold">
                      {candidate.totalExperienceYears !== null
                        ? `${candidate.totalExperienceYears} years`
                        : <em className="text-slate-500 font-normal">Not Stated</em>}
                    </p>
                  ) : (
                    <input
                      type="number"
                      step="0.5"
                      value={editExpYears}
                      onChange={e => setEditExpYears(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  )}
                </div>

                {/* Original Post Date */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Original Post Date</label>
                  {!isEditing ? (
                    <p className="text-slate-200">
                      {candidate.originalPostDate
                        ? new Date(candidate.originalPostDate).toLocaleDateString()
                        : <em className="text-slate-500 font-normal">Not Stated</em>}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editOriginalPostDate}
                      onChange={e => setEditOriginalPostDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  )}
                </div>

                {/* Job Seeking Statement */}
                <div className="col-span-2">
                  <label className="text-slate-400 font-medium block mb-1">Job Seeking Statement</label>
                  {!isEditing ? (
                    <p className="text-slate-200 italic bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                      {candidate.jobSeekingStatement || <em className="text-slate-500 not-italic">Not Provided</em>}
                    </p>
                  ) : (
                    <textarea
                      rows={2}
                      value={editJobSeekingStatement}
                      onChange={e => setEditJobSeekingStatement(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    />
                  )}
                </div>

                {/* Profile Link */}
                <div className="col-span-2">
                  <label className="text-slate-400 font-medium block mb-1">LinkedIn Profile Link</label>
                  {!isEditing ? (
                    <p className="text-blue-400 font-mono truncate">
                      {candidate.profileUrl || candidate.profileUrlOrTelegramId ? (
                        <a
                          href={candidate.profileUrl || candidate.profileUrlOrTelegramId!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center space-x-1"
                        >
                          <span className="truncate">{candidate.profileUrl || candidate.profileUrlOrTelegramId}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <em className="text-slate-500 font-normal">Not Provided</em>
                      )}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editProfileUrl}
                      onChange={e => setEditProfileUrl(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  )}
                </div>

                {/* Post Link */}
                <div className="col-span-2">
                  <label className="text-slate-400 font-medium block mb-1">LinkedIn Post Link</label>
                  {!isEditing ? (
                    <p className="text-sky-400 font-mono truncate">
                      {candidate.postUrl ? (
                        <a
                          href={candidate.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center space-x-1"
                        >
                          <span className="truncate">{candidate.postUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <em className="text-slate-500 font-normal">Not Provided</em>
                      )}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editPostUrl}
                      onChange={e => setEditPostUrl(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Email Address</label>
                  {!isEditing ? (
                    candidate.email ? (
                      <div className="flex items-center justify-between text-blue-400 font-mono bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <a href={`mailto:${candidate.email}`} className="hover:underline flex items-center space-x-1.5 truncate">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{candidate.email}</span>
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(candidate.email!);
                            setCopiedInfo(candidate.email!);
                            setTimeout(() => setCopiedInfo(null), 2000);
                          }}
                          className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0 ml-1"
                          title="Copy email"
                        >
                          {copiedInfo === candidate.email ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic py-1">Not in post</p>
                    )
                  ) : (
                    <input
                      type="email"
                      placeholder="e.g. name@example.com"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Phone / WhatsApp</label>
                  {!isEditing ? (
                    candidate.phone ? (
                      <div className="flex items-center justify-between text-emerald-400 font-mono bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <a href={`tel:${candidate.phone}`} className="hover:underline flex items-center space-x-1.5 truncate">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{candidate.phone}</span>
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(candidate.phone!);
                            setCopiedInfo(candidate.phone!);
                            setTimeout(() => setCopiedInfo(null), 2000);
                          }}
                          className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0 ml-1"
                          title="Copy phone"
                        >
                          {copiedInfo === candidate.phone ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic py-1">Not in post</p>
                    )
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. +91 98765 43210"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  )}
                </div>
              </div>

              {/* Recruiter Notes */}
              <div className="pt-2 border-t border-slate-800">
                <label className="text-slate-400 font-medium block mb-1 text-xs">
                  Recruiter Review Notes
                </label>
                {!isEditing ? (
                  <p className="text-xs text-slate-300 italic">
                    {candidate.recruiterNotes || 'No recruiter notes recorded.'}
                  </p>
                ) : (
                  <textarea
                    rows={2}
                    placeholder="Add verification notes..."
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  />
                )}
              </div>

              {/* Outreach & Gmail Status */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 font-medium block text-xs">
                    Gmail Outreach Status
                  </label>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      candidate.outreachStatus === 'Sent'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : candidate.outreachStatus === 'Approved'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : candidate.outreachStatus === 'Failed'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : candidate.outreachStatus === 'Applied'
                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                        : candidate.outreachStatus === 'Responded'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {candidate.outreachStatus || 'Draft'}
                  </span>
                </div>
                {candidate.draftEmail && (
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1">
                    <span className="font-semibold text-white block truncate">
                      Personalized Subject: {candidate.draftEmail.subject}
                    </span>
                    <p className="text-slate-400 line-clamp-2 italic text-[10px]">
                      "{candidate.draftEmail.body.slice(0, 150)}..."
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Original Source Posts (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>Original Source Posts ({linkedPosts.length})</span>
              </h3>
              <span className="text-[10px] text-slate-400">Preserved original text</span>
            </div>

            {linkedPosts.length === 0 ? (
              <div className="p-6 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                No linked source posts found.
              </div>
            ) : (
              <div className="space-y-4">
                {linkedPosts.map((post, idx) => (
                  <div
                    key={post.id}
                    className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5">
                        <Linkedin className="w-4 h-4 text-blue-400" />
                        <span className="font-bold text-white">{post.platform} Post #{idx + 1}</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        {post.postedAt
                          ? new Date(post.postedAt).toLocaleDateString()
                          : new Date(post.receivedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {post.authorName && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          Author: {post.authorName}
                        </span>
                      )}
                      {post.authorLocation && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                          {post.authorLocation}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Method: {post.collectionMethod}
                      </span>
                    </div>

                    {/* Author Headline */}
                    {post.authorHeadline && (
                      <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800">
                        <strong className="text-slate-300">Headline:</strong> {post.authorHeadline}
                      </div>
                    )}

                    {/* Full Raw Content */}
                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap select-text">
                      {post.content}
                    </div>

                    {/* Source link */}
                    {post.sourceUrl && (
                      <div className="pt-1 flex items-center justify-between text-[11px]">
                        <a
                          href={post.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center space-x-1 truncate max-w-xs"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{post.sourceUrl}</span>
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs text-slate-400">
          <div>
            <span>First seen: {new Date(candidate.firstSeenAt).toLocaleString()}</span>
            {candidate.isManuallyCorrected && (
              <span className="ml-3 text-amber-400 font-medium">
                Protected from scan overwrite ({candidate.manuallyCorrectedFields.length} fields corrected)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

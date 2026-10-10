import React, { useState } from 'react';
import {
  X,
  GitMerge,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { Candidate, SourcePost } from '../types/index.ts';

interface UncertainDuplicatesModalProps {
  primaryCandidate: Candidate;
  secondaryCandidate: Candidate;
  allPosts: SourcePost[];
  onClose: () => void;
  onResolve: (action: 'merge' | 'dismiss') => Promise<void>;
}

export const UncertainDuplicatesModal: React.FC<UncertainDuplicatesModalProps> = ({
  primaryCandidate,
  secondaryCandidate,
  allPosts,
  onClose,
  onResolve,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!primaryCandidate || !secondaryCandidate) return null;

  const primaryPosts = allPosts.filter(p => primaryCandidate.sourcePostIds.includes(p.id));
  const secondaryPosts = allPosts.filter(p => secondaryCandidate.sourcePostIds.includes(p.id));

  const handleAction = async (action: 'merge' | 'dismiss') => {
    setIsProcessing(true);
    try {
      await onResolve(action);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-950/80 text-amber-400 border border-amber-800">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Uncertain Duplicate Candidate Review
              </h2>
              <p className="text-xs text-slate-400">
                Both profiles share similar names, but contact identifiers were not identical.
                Compare details before choosing to merge.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Candidate A */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  Candidate Profile A
                </span>
                <span className="font-mono text-[11px] text-slate-400">{primaryCandidate.id}</span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Name:</span>
                  <span className="font-bold text-white text-sm">
                    {primaryCandidate.name || 'Not Provided'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Role & Company:</span>
                  <span className="text-slate-200">
                    {primaryCandidate.currentOrPreviousRole || 'Not Provided'}
                    {primaryCandidate.employer && ` at ${primaryCandidate.employer}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Industry & Experience:</span>
                  <span className="text-emerald-400 font-semibold">
                    {primaryCandidate.totalExperienceYears !== null
                      ? `${primaryCandidate.totalExperienceYears} yrs`
                      : 'Unstated'}{' '}
                    • {primaryCandidate.industry || 'Not Provided'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Contact Identifiers:</span>
                  <div className="text-slate-300 font-mono text-[11px]">
                    {primaryCandidate.email && <div>Email: {primaryCandidate.email}</div>}
                    {primaryCandidate.phone && <div>Phone: {primaryCandidate.phone}</div>}
                    {primaryCandidate.profileUrlOrTelegramId && (
                      <div>Handle/Link: {primaryCandidate.profileUrlOrTelegramId}</div>
                    )}
                    {!primaryCandidate.email &&
                      !primaryCandidate.phone &&
                      !primaryCandidate.profileUrlOrTelegramId && (
                        <em className="text-slate-500 font-sans">No contact details</em>
                      )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700">
                  <span className="text-slate-400 block text-[11px] mb-1">
                    Source Post Content ({primaryPosts.length}):
                  </span>
                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 max-h-36 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                    {primaryPosts[0]?.content || 'No post text'}
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate B */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Candidate Profile B
                </span>
                <span className="font-mono text-[11px] text-slate-400">{secondaryCandidate.id}</span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Name:</span>
                  <span className="font-bold text-white text-sm">
                    {secondaryCandidate.name || 'Not Provided'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Role & Company:</span>
                  <span className="text-slate-200">
                    {secondaryCandidate.currentOrPreviousRole || 'Not Provided'}
                    {secondaryCandidate.employer && ` at ${secondaryCandidate.employer}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Industry & Experience:</span>
                  <span className="text-emerald-400 font-semibold">
                    {secondaryCandidate.totalExperienceYears !== null
                      ? `${secondaryCandidate.totalExperienceYears} yrs`
                      : 'Unstated'}{' '}
                    • {secondaryCandidate.industry || 'Not Provided'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Contact Identifiers:</span>
                  <div className="text-slate-300 font-mono text-[11px]">
                    {secondaryCandidate.email && <div>Email: {secondaryCandidate.email}</div>}
                    {secondaryCandidate.phone && <div>Phone: {secondaryCandidate.phone}</div>}
                    {secondaryCandidate.profileUrlOrTelegramId && (
                      <div>Handle/Link: {secondaryCandidate.profileUrlOrTelegramId}</div>
                    )}
                    {!secondaryCandidate.email &&
                      !secondaryCandidate.phone &&
                      !secondaryCandidate.profileUrlOrTelegramId && (
                        <em className="text-slate-500 font-sans">No contact details</em>
                      )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700">
                  <span className="text-slate-400 block text-[11px] mb-1">
                    Source Post Content ({secondaryPosts.length}):
                  </span>
                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 max-h-36 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                    {secondaryPosts[0]?.content || 'No post text'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800 text-xs text-slate-300 space-y-1">
            <span className="font-semibold text-slate-200">Merge Rule Policy:</span>
            <p>
              Merging combines both records into Profile A and links all original source posts
              permanently. Dismissing will separate them as distinct individuals and clear the
              uncertain duplicate warning.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            onClick={() => handleAction('dismiss')}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Keep as Separate Candidates
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction('merge')}
              disabled={isProcessing}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center space-x-1.5"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Merging...' : 'Merge into Single Candidate'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

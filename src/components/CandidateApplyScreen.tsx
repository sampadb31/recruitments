import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  Send,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Clock,
  IndianRupee,
  Linkedin,
  ShieldCheck,
  AlertCircle,
  Loader2,
  FileCheck2,
} from 'lucide-react';
import { FormSubmissionData } from '../types/index.ts';

interface CandidateApplyScreenProps {
  onBackToApp?: () => void;
}

export const CandidateApplyScreen: React.FC<CandidateApplyScreenProps> = ({ onBackToApp }) => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token') || '';
  const initialEmail = urlParams.get('email') || '';

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [mobile, setMobile] = useState('');
  const [currentCityState, setCurrentCityState] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');
  const [roleFunctionOfInterest, setRoleFunctionOfInterest] = useState('Commercial Sales & Branch Banking');
  const [totalWorkExperience, setTotalWorkExperience] = useState('1 - 3 years');
  const [currentEmployerDesignation, setCurrentEmployerDesignation] = useState('');
  const [bankingExperience, setBankingExperience] = useState('Yes, in banking/financial services');
  const [noticePeriod, setNoticePeriod] = useState('Immediate / Less than 15 days');
  const [expectedCtc, setExpectedCtc] = useState('₹8,00,000 - ₹12,00,000 INR');
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [consentGiven, setConsentGiven] = useState(true);

  // Pre-load candidate info if token/email provided
  useEffect(() => {
    async function loadCandidate() {
      try {
        if (token || initialEmail) {
          const res = await fetch(
            `/api/candidate/form-info?token=${encodeURIComponent(token)}&email=${encodeURIComponent(initialEmail)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.candidate) {
              if (data.candidate.name) setFullName(data.candidate.name);
              if (data.candidate.email) setEmail(data.candidate.email);
              if (data.candidate.phone) setMobile(data.candidate.phone);
              if (data.candidate.currentRole || data.candidate.employer) {
                setCurrentEmployerDesignation(
                  [data.candidate.currentRole, data.candidate.employer].filter(Boolean).join(' at ')
                );
              }
              if (data.candidate.location) {
                setCurrentCityState(data.candidate.location);
                setPreferredLocations(data.candidate.location);
              }
              if (data.candidate.linkedInProfileUrl) setLinkedInUrl(data.candidate.linkedInProfileUrl);
              if (data.candidate.totalExperienceYears !== null) {
                setTotalWorkExperience(`${data.candidate.totalExperienceYears} years`);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not load prefilled candidate info', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadCandidate();
  }, [token, initialEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setErrorMessage('Please provide your Full Name and Email Address.');
      return;
    }
    if (!consentGiven) {
      setErrorMessage('Please accept the recruitment privacy and consent declaration to proceed.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const submissionData: FormSubmissionData = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      mobile: mobile.trim() || undefined,
      currentCityState: currentCityState.trim() || 'India',
      preferredLocations: preferredLocations.trim() || currentCityState.trim() || 'Flexible / Major Metros',
      roleFunctionOfInterest,
      totalWorkExperience,
      currentEmployerDesignation: currentEmployerDesignation.trim() || undefined,
      bankingFinancialServicesExperience: bankingExperience,
      noticePeriodAvailability: noticePeriod,
      expectedAnnualCtc: expectedCtc.trim() || undefined,
      linkedInProfileUrl: linkedInUrl.trim() || undefined,
      consentGiven: true,
      consentWordingVersion: 'v2.0-2026',
      consentTimestamp: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/candidate/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: email.trim(),
          fields: submissionData,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to submit expression of interest.');
      }

      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-300">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
        <p className="text-sm">Loading Registration Portal...</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200">
        <div className="max-w-md w-full bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 text-center shadow-2xl space-y-4">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Application Received!</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Thank you, <strong className="text-white">{fullName}</strong>. Your details have been securely logged in the{' '}
            <strong className="text-indigo-400">BFSITalentHub</strong> recruitment discovery network.
          </p>
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-left text-[11px] text-slate-400 space-y-1">
            <div>• Registered Email: <span className="text-slate-200 font-mono">{email}</span></div>
            <div>• Preferred Role: <span className="text-slate-200">{roleFunctionOfInterest}</span></div>
            <div>• Outreach Origin: <span className="text-emerald-300 font-mono">bfsitalenthub@gmail.com</span></div>
          </div>
          <p className="text-[11px] text-slate-400">
            Our talent advisors review submissions continuously and will contact you directly when matching banking and commercial vacancies open.
          </p>
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl transition"
            >
              Return to Recruiter Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-8 px-4 sm:px-6">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        {/* Header Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">BFSITalentHub</h1>
              <span className="text-[11px] text-indigo-400 font-semibold uppercase tracking-wider">
                Banking & Financial Services Talent Network
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Career Expression of Interest: Connect with leading private banks, NBFCs, and fintech institutions across India.
            Please submit your professional profile below.
          </p>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Outreach & correspondence handled via: <strong className="text-slate-200">bfsitalenthub@gmail.com</strong></span>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-rose-950/60 border border-rose-800 text-rose-300 p-3.5 rounded-xl text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <FileCheck2 className="w-4 h-4 text-indigo-400" />
              <span>Candidate Registration Details</span>
            </h2>
            <span className="text-[10px] text-slate-400">* Required fields</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Full Name */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Full Name *
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Priya Sharma"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="e.g. priya.sharma@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Mobile / WhatsApp Number
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Current City / State */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Current Work Location (City, State)
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="e.g. Mumbai, Maharashtra"
                  value={currentCityState}
                  onChange={e => setCurrentCityState(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Current Employer & Designation */}
            <div className="sm:col-span-2">
              <label className="text-slate-300 font-semibold block mb-1">
                Current / Most Recent Employer & Designation
              </label>
              <div className="relative">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="e.g. Senior Sales Officer at HDFC Bank"
                  value={currentEmployerDesignation}
                  onChange={e => setCurrentEmployerDesignation(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Role / Function of Interest */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Role / Function of Interest
              </label>
              <select
                value={roleFunctionOfInterest}
                onChange={e => setRoleFunctionOfInterest(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Commercial Sales & Branch Banking">Commercial Sales & Branch Banking</option>
                <option value="Loan Officer & Retail Lending">Loan Officer & Retail Lending</option>
                <option value="B2B Corporate Account Executive">B2B Corporate Account Executive</option>
                <option value="Wealth Management & Relationship Manager">Wealth Management & Relationship Manager</option>
                <option value="Territory Sales & Regional Operations">Territory Sales & Regional Operations</option>
                <option value="Collections & Credit Operations">Collections & Credit Operations</option>
                <option value="Other Commercial / Operations">Other Commercial / Operations</option>
              </select>
            </div>

            {/* Total Work Experience */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Total Work Experience
              </label>
              <select
                value={totalWorkExperience}
                onChange={e => setTotalWorkExperience(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="1 - 2 years">1 - 2 years</option>
                <option value="2 - 4 years">2 - 4 years</option>
                <option value="4 - 7 years">4 - 7 years</option>
                <option value="7 - 10 years">7 - 10 years</option>
                <option value="10+ years">10+ years</option>
              </select>
            </div>

            {/* Banking / Financial Experience */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Prior BFSI / Banking Experience?
              </label>
              <select
                value={bankingExperience}
                onChange={e => setBankingExperience(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Yes, in banking/financial services">Yes, in banking/financial services</option>
                <option value="Yes, in NBFC / Fintech lending">Yes, in NBFC / Fintech lending</option>
                <option value="No, but interested in transitioning into BFSI">No, transitioning into BFSI from FMCG/Pharma/Other</option>
              </select>
            </div>

            {/* Notice Period */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Notice Period / Availability
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <select
                  value={noticePeriod}
                  onChange={e => setNoticePeriod(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Immediate / Less than 15 days">Immediate / Less than 15 days</option>
                  <option value="30 days notice">30 days notice</option>
                  <option value="60 days notice">60 days notice</option>
                  <option value="Serving notice period">Serving notice period</option>
                </select>
              </div>
            </div>

            {/* Expected Annual CTC */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Expected Annual CTC (INR)
              </label>
              <div className="relative">
                <IndianRupee className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="e.g. ₹9,00,000 INR"
                  value={expectedCtc}
                  onChange={e => setExpectedCtc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* LinkedIn Profile URL */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                LinkedIn Profile URL
              </label>
              <div className="relative">
                <Linkedin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="url"
                  placeholder="https://www.linkedin.com/in/username"
                  value={linkedInUrl}
                  onChange={e => setLinkedInUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Consent Checkbox */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <label className="flex items-start space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={e => setConsentGiven(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-[11px] text-slate-300 leading-relaxed">
                I authorize <strong>BFSITalentHub</strong> to process my details for evaluating relevant banking,
                financial services, and sales career opportunities and contacting me with matching job openings.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-xs rounded-xl transition flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
            <span>{isSubmitting ? 'Submitting Details...' : 'Submit Expression of Interest'}</span>
          </button>
        </form>
      </div>

      <footer className="text-center text-[11px] text-slate-500 mt-8">
        © 2026 BFSITalentHub Discovery Network • Contact: bfsitalenthub@gmail.com
      </footer>
    </div>
  );
};

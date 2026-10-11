/**
 * Data Normalizer, Experience Merging & Intent Extraction Engine
 * 
 * Implements strict rules:
 * 1. Normalized Location:
 *    Supports author.location.countryCode, linkedinText, parsed.countryCode, parsed.country,
 *    parsed.state, parsed.city, parsed.text, and string formats.
 *    Never produces "[object Object]".
 *    Keeps current city, state, country separate from preferred job location.
 * 2. Normalized Post Date:
 *    Handles ISO strings, timestamps (seconds vs ms), date objects.
 *    Missing or invalid dates remain null/unknown (never substituted with today).
 * 3. Employment History & Experience:
 *    Merges overlapping employment intervals without double-counting.
 *    Marks incomplete histories as partial/uncertain.
 * 4. Intent & Quote Verification:
 *    5-class intent classification.
 *    Requires verified verbatim quote from post text for positive intent.
 * 5. Criteria-Controlled Eligibility:
 *    Unified calculation driven by active CriteriaFilters (roleScope, sectorScope, experience range, location, recency).
 */

import {
  AuthorIntent,
  CandidateCheckResult,
  CandidateSixPointCheck,
  CriteriaFilters,
  CriteriaTag,
  TargetSector,
  TimeWindow,
} from '../types/index.ts';

// Indian States and Union Territories mapping
export const INDIAN_STATES_AND_UTS: Record<string, string> = {
  maharashtra: 'Maharashtra',
  karnataka: 'Karnataka',
  delhi: 'Delhi',
  'new delhi': 'Delhi',
  'delhi ncr': 'Delhi NCR',
  'ncr': 'Delhi NCR',
  'tamil nadu': 'Tamil Nadu',
  telangana: 'Telangana',
  'west bengal': 'West Bengal',
  gujarat: 'Gujarat',
  'uttar pradesh': 'Uttar Pradesh',
  'up': 'Uttar Pradesh',
  rajasthan: 'Rajasthan',
  kerala: 'Kerala',
  punjab: 'Punjab',
  haryana: 'Haryana',
  'madhya pradesh': 'Madhya Pradesh',
  'mp': 'Madhya Pradesh',
  bihar: 'Bihar',
  'andhra pradesh': 'Andhra Pradesh',
  odisha: 'Odisha',
  jharkhand: 'Jharkhand',
  assam: 'Assam',
  chhattisgarh: 'Chhattisgarh',
  uttarakhand: 'Uttarakhand',
  goa: 'Goa',
  'himachal pradesh': 'Himachal Pradesh',
  chandigarh: 'Chandigarh',
  puducherry: 'Puducherry',
  'jammu and kashmir': 'Jammu & Kashmir',
  ladakh: 'Ladakh',
};

// Major Indian cities mapping
export const INDIAN_CITIES_TO_STATE: Record<string, { city: string; state: string }> = {
  mumbai: { city: 'Mumbai', state: 'Maharashtra' },
  pune: { city: 'Pune', state: 'Maharashtra' },
  nagpur: { city: 'Nagpur', state: 'Maharashtra' },
  nashik: { city: 'Nashik', state: 'Maharashtra' },
  thane: { city: 'Thane', state: 'Maharashtra' },
  'navi mumbai': { city: 'Navi Mumbai', state: 'Maharashtra' },
  bengaluru: { city: 'Bengaluru', state: 'Karnataka' },
  bangalore: { city: 'Bengaluru', state: 'Karnataka' },
  mysuru: { city: 'Mysuru', state: 'Karnataka' },
  mysore: { city: 'Mysuru', state: 'Karnataka' },
  mangalore: { city: 'Mangalore', state: 'Karnataka' },
  hubli: { city: 'Hubli', state: 'Karnataka' },
  delhi: { city: 'Delhi', state: 'Delhi' },
  'new delhi': { city: 'New Delhi', state: 'Delhi' },
  gurgaon: { city: 'Gurgaon', state: 'Haryana' },
  gurugram: { city: 'Gurugram', state: 'Haryana' },
  noida: { city: 'Noida', state: 'Uttar Pradesh' },
  'greater noida': { city: 'Greater Noida', state: 'Uttar Pradesh' },
  faridabad: { city: 'Faridabad', state: 'Haryana' },
  ghaziabad: { city: 'Ghaziabad', state: 'Uttar Pradesh' },
  hyderabad: { city: 'Hyderabad', state: 'Telangana' },
  secunderabad: { city: 'Secunderabad', state: 'Telangana' },
  chennai: { city: 'Chennai', state: 'Tamil Nadu' },
  coimbatore: { city: 'Coimbatore', state: 'Tamil Nadu' },
  madurai: { city: 'Madurai', state: 'Tamil Nadu' },
  tiruchirappalli: { city: 'Tiruchirappalli', state: 'Tamil Nadu' },
  kolkata: { city: 'Kolkata', state: 'West Bengal' },
  howrah: { city: 'Howrah', state: 'West Bengal' },
  ahmedabad: { city: 'Ahmedabad', state: 'Gujarat' },
  surat: { city: 'Surat', state: 'Gujarat' },
  vadodara: { city: 'Vadodara', state: 'Gujarat' },
  rajkot: { city: 'Rajkot', state: 'Gujarat' },
  jaipur: { city: 'Jaipur', state: 'Rajasthan' },
  jodhpur: { city: 'Jodhpur', state: 'Rajasthan' },
  udaipur: { city: 'Udaipur', state: 'Rajasthan' },
  lucknow: { city: 'Lucknow', state: 'Uttar Pradesh' },
  kanpur: { city: 'Kanpur', state: 'Uttar Pradesh' },
  varanasi: { city: 'Varanasi', state: 'Uttar Pradesh' },
  agra: { city: 'Agra', state: 'Uttar Pradesh' },
  indore: { city: 'Indore', state: 'Madhya Pradesh' },
  bhopal: { city: 'Bhopal', state: 'Madhya Pradesh' },
  chandigarh: { city: 'Chandigarh', state: 'Chandigarh' },
  kochi: { city: 'Kochi', state: 'Kerala' },
  cochin: { city: 'Kochi', state: 'Kerala' },
  thiruvananthapuram: { city: 'Thiruvananthapuram', state: 'Kerala' },
  trivandrum: { city: 'Thiruvananthapuram', state: 'Kerala' },
  calicut: { city: 'Kozhikode', state: 'Kerala' },
  patna: { city: 'Patna', state: 'Bihar' },
  bhubaneswar: { city: 'Bhubaneswar', state: 'Odisha' },
  ranchi: { city: 'Ranchi', state: 'Jharkhand' },
  raipur: { city: 'Raipur', state: 'Chhattisgarh' },
  dehradun: { city: 'Dehradun', state: 'Uttarakhand' },
  guwahati: { city: 'Guwahati', state: 'Assam' },
};

// Explicit foreign countries / cities
export const INTERNATIONAL_KEYWORDS: string[] = [
  'dubai', 'uae', 'united arab emirates', 'abu dhabi', 'sharjah', 'qatar', 'doha',
  'saudi arabia', 'riyadh', 'jeddah', 'kuwait', 'bahrain', 'oman', 'muscat',
  'singapore', 'malaysia', 'kuala lumpur', 'thailand', 'bangkok', 'philippines', 'manila',
  'usa', 'united states', 'america', 'california', 'new york', 'texas', 'florida',
  'chicago', 'san francisco', 'seattle', 'uk', 'united kingdom', 'london', 'manchester',
  'canada', 'toronto', 'vancouver', 'australia', 'sydney', 'melbourne', 'germany',
  'berlin', 'france', 'paris', 'netherlands', 'amsterdam', 'ireland', 'dublin', 'europe'
];

export interface NormalizedLocationResult {
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
  formattedLocation: string | null;
  isIndia: boolean | 'unknown';
  evidence: string;
}

/**
 * 1. Normalized Location Parser
 * Supports:
 * - author.location.countryCode
 * - author.location.linkedinText
 * - author.location.parsed.countryCode
 * - author.location.parsed.country
 * - author.location.parsed.state
 * - author.location.parsed.city
 * - author.location.parsed.text
 * - string-based locations
 * Never converts objects to "[object Object]".
 */
export function normalizeAuthorLocation(
  authorLocationRaw: any,
  authorGeographicAreaRaw?: any,
  authorLocationsArray?: any[]
): NormalizedLocationResult {
  const rawLocs = [
    authorLocationRaw,
    authorGeographicAreaRaw,
    ...(Array.isArray(authorLocationsArray) ? authorLocationsArray : []),
  ];

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;
  let countryCode: string | null = null;
  let rawText: string | null = null;

  for (const loc of rawLocs) {
    if (!loc) continue;
    if (typeof loc === 'string') {
      const clean = loc.trim();
      if (clean && clean !== '[object Object]') {
        if (!rawText) rawText = clean;
      }
      continue;
    }

    if (typeof loc === 'object') {
      if (loc.countryCode && typeof loc.countryCode === 'string') {
        countryCode = countryCode || loc.countryCode.trim().toUpperCase();
      }
      if (loc.linkedinText && typeof loc.linkedinText === 'string') {
        rawText = rawText || loc.linkedinText.trim();
      }
      if (loc.name && typeof loc.name === 'string') {
        rawText = rawText || loc.name.trim();
      }
      if (loc.text && typeof loc.text === 'string') {
        rawText = rawText || loc.text.trim();
      }
      if (loc.city && typeof loc.city === 'string') {
        city = city || loc.city.trim();
      }
      if (loc.state && typeof loc.state === 'string') {
        state = state || loc.state.trim();
      }
      if (loc.country && typeof loc.country === 'string') {
        country = country || loc.country.trim();
      }

      // Check parsed sub-object
      if (loc.parsed && typeof loc.parsed === 'object') {
        if (loc.parsed.countryCode && typeof loc.parsed.countryCode === 'string') {
          countryCode = countryCode || loc.parsed.countryCode.trim().toUpperCase();
        }
        if (loc.parsed.country && typeof loc.parsed.country === 'string') {
          country = country || loc.parsed.country.trim();
        }
        if (loc.parsed.state && typeof loc.parsed.state === 'string') {
          state = state || loc.parsed.state.trim();
        }
        if (loc.parsed.city && typeof loc.parsed.city === 'string') {
          city = city || loc.parsed.city.trim();
        }
        if (loc.parsed.text && typeof loc.parsed.text === 'string') {
          rawText = rawText || loc.parsed.text.trim();
        }
      }
    }
  }

  // 1. Check explicit Country Code
  if (countryCode) {
    if (countryCode === 'IN') {
      country = country || 'India';
    } else {
      // Confirmed foreign country code (e.g. SG, AE, US, GB)
      return {
        city,
        state,
        country: country || countryCode,
        countryCode,
        formattedLocation: rawText || `${city ? city + ', ' : ''}${country || countryCode}`,
        isIndia: false,
        evidence: `Structured profile location countryCode is "${countryCode}" (Outside India).`,
      };
    }
  }

  // 2. Check explicit Country string
  if (country) {
    const cLower = country.toLowerCase().trim();
    if (cLower === 'india' || cLower.includes('india')) {
      // Verified India
    } else {
      for (const intl of INTERNATIONAL_KEYWORDS) {
        if (cLower.includes(intl)) {
          return {
            city,
            state,
            country,
            countryCode,
            formattedLocation: rawText || `${city ? city + ', ' : ''}${country}`,
            isIndia: false,
            evidence: `Structured profile country indicates "${country}" (Outside India).`,
          };
        }
      }
    }
  }

  // 3. Scan raw text for foreign keywords
  const fullText = [rawText, city, state].filter(Boolean).join(', ');
  const fullLower = fullText.toLowerCase();

  for (const intl of INTERNATIONAL_KEYWORDS) {
    const regex = new RegExp(`\\b${intl}\\b`, 'i');
    if (regex.test(fullLower)) {
      return {
        city,
        state,
        country: country || intl,
        countryCode,
        formattedLocation: fullText || intl,
        isIndia: false,
        evidence: `Location text indicates residence in "${intl}" (Outside India).`,
      };
    }
  }

  // 4. Resolve Indian city & state if present
  if (city) {
    const cKey = city.toLowerCase().trim();
    if (INDIAN_CITIES_TO_STATE[cKey]) {
      city = INDIAN_CITIES_TO_STATE[cKey].city;
      state = state || INDIAN_CITIES_TO_STATE[cKey].state;
      country = 'India';
      return {
        city,
        state,
        country,
        countryCode: 'IN',
        formattedLocation: `${city}, ${state}, India`,
        isIndia: true,
        evidence: `Confirmed Indian city from profile: "${city}", State: "${state}", India.`,
      };
    }
  }

  // Check state
  if (state) {
    const sKey = state.toLowerCase().trim();
    if (INDIAN_STATES_AND_UTS[sKey]) {
      state = INDIAN_STATES_AND_UTS[sKey];
      country = 'India';
      return {
        city,
        state,
        country,
        countryCode: 'IN',
        formattedLocation: city ? `${city}, ${state}, India` : `${state}, India`,
        isIndia: true,
        evidence: `Confirmed Indian State/UT from profile: "${state}", India.`,
      };
    }
  }

  // Check if rawText mentions Indian cities
  if (fullLower) {
    for (const [key, mapping] of Object.entries(INDIAN_CITIES_TO_STATE)) {
      const cityRegex = new RegExp(`\\b${key}\\b`, 'i');
      if (cityRegex.test(fullLower)) {
        city = city || mapping.city;
        state = state || mapping.state;
        country = 'India';
        return {
          city,
          state,
          country,
          countryCode: 'IN',
          formattedLocation: `${city}, ${state}, India`,
          isIndia: true,
          evidence: `Location text mentions Indian city: "${mapping.city}", State: "${mapping.state}".`,
        };
      }
    }

    for (const [key, stateName] of Object.entries(INDIAN_STATES_AND_UTS)) {
      const stateRegex = new RegExp(`\\b${key}\\b`, 'i');
      if (stateRegex.test(fullLower)) {
        state = state || stateName;
        country = 'India';
        return {
          city,
          state,
          country,
          countryCode: 'IN',
          formattedLocation: city ? `${city}, ${state}, India` : `${state}, India`,
          isIndia: true,
          evidence: `Location text mentions Indian state: "${stateName}".`,
        };
      }
    }

    if (/\bindia\b/i.test(fullLower)) {
      country = 'India';
      return {
        city,
        state,
        country,
        countryCode: 'IN',
        formattedLocation: fullText || 'India',
        isIndia: true,
        evidence: `Location explicitly mentions India: "${fullText}".`,
      };
    }
  }

  if (country === 'India' || countryCode === 'IN') {
    return {
      city,
      state,
      country: 'India',
      countryCode: 'IN',
      formattedLocation: fullText || 'India',
      isIndia: true,
      evidence: `Profile country confirmed as India.`,
    };
  }

  // Unknown / unstated
  return {
    city: null,
    state: null,
    country: null,
    countryCode: null,
    formattedLocation: fullText || null,
    isIndia: 'unknown',
    evidence: fullText
      ? `Profile location "${fullText}" does not confirm India residence.`
      : 'Location is unstated in profile.',
  };
}

/**
 * 2. Normalized Post Date Parser
 * Handles:
 * - ISO string ("2026-10-04T08:30:00.000Z")
 * - 10-digit unix seconds timestamp (multiplied by 1000)
 * - 13-digit unix ms timestamp
 * - Date object / sub-object ({ timestamp, date, iso })
 * Missing or invalid dates return null and isUnknown = true. NEVER substituted with today.
 */
export function normalizePostDate(rawDate: any): { dateIso: string | null; isUnknown: boolean } {
  if (rawDate === null || rawDate === undefined || rawDate === '') {
    return { dateIso: null, isUnknown: true };
  }

  let timestampMs: number | null = null;

  if (typeof rawDate === 'number') {
    if (rawDate <= 0 || isNaN(rawDate)) {
      return { dateIso: null, isUnknown: true };
    }
    // If less than 10 billion, it's seconds
    timestampMs = rawDate < 10_000_000_000 ? rawDate * 1000 : rawDate;
  } else if (typeof rawDate === 'object') {
    if (rawDate.timestamp) {
      const ts = Number(rawDate.timestamp);
      if (!isNaN(ts) && ts > 0) {
        timestampMs = ts < 10_000_000_000 ? ts * 1000 : ts;
      }
    } else if (rawDate.date || rawDate.iso) {
      const parsed = Date.parse(String(rawDate.date || rawDate.iso));
      if (!isNaN(parsed) && parsed > 0) timestampMs = parsed;
    }
  } else if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return { dateIso: null, isUnknown: true };
    }
    if (/^\d{10}$/.test(trimmed)) {
      timestampMs = parseInt(trimmed, 10) * 1000;
    } else if (/^\d{13}$/.test(trimmed)) {
      timestampMs = parseInt(trimmed, 10);
    } else {
      const parsed = Date.parse(trimmed);
      if (!isNaN(parsed) && parsed > 0) {
        timestampMs = parsed;
      }
    }
  }

  if (timestampMs === null || isNaN(timestampMs) || timestampMs <= 0) {
    return { dateIso: null, isUnknown: true };
  }

  const d = new Date(timestampMs);
  if (isNaN(d.getTime())) {
    return { dateIso: null, isUnknown: true };
  }

  return { dateIso: d.toISOString(), isUnknown: false };
}

/**
 * 3. Employment History & Experience Interval Merging
 * Merges overlapping employment intervals without double-counting.
 * Detects if history is incomplete or partial.
 */
export interface ExperienceCalculationResult {
  totalExperienceYears: number | null;
  experienceType: 'stated' | 'calculated' | 'unknown';
  experienceVerificationStatus: 'verified' | 'partial' | 'uncertain' | 'unstated';
  roleExperienceYears: number | null;
  currentEmployer: string | null;
  currentRole: string | null;
  hasOverlappingPositions: boolean;
  evidence: string;
}

export function calculateExperienceFromProfilePositions(
  positionsRaw?: any[] | null
): ExperienceCalculationResult {
  if (!Array.isArray(positionsRaw) || positionsRaw.length === 0) {
    return {
      totalExperienceYears: null,
      experienceType: 'unknown',
      experienceVerificationStatus: 'unstated',
      roleExperienceYears: null,
      currentEmployer: null,
      currentRole: null,
      hasOverlappingPositions: false,
      evidence: 'No structured positions found in profile.',
    };
  }

  interface MonthInterval {
    startMonth: number;
    endMonth: number;
    isSales: boolean;
    company: string | null;
    title: string | null;
    isCurrent: boolean;
  }

  const intervals: MonthInterval[] = [];
  const now = new Date();
  const currentMonthIndex = now.getFullYear() * 12 + now.getMonth();

  let hasMissingDates = false;
  let currentEmployer: string | null = null;
  let currentRole: string | null = null;

  for (const pos of positionsRaw) {
    if (!pos || typeof pos !== 'object') continue;

    const title = pos.title || pos.role || pos.position || null;
    const company = pos.companyName || pos.company || pos.employer || null;
    const isCurrent = Boolean(pos.isCurrent || pos.current || !pos.endDate);

    if (isCurrent && !currentEmployer && company) {
      currentEmployer = company;
    }
    if (isCurrent && !currentRole && title) {
      currentRole = title;
    }

    let startYear: number | null = null;
    let startMonth: number = 0; // Jan
    let endYear: number | null = null;
    let endMonth: number = 11; // Dec

    // Parse start
    if (pos.startDate) {
      if (typeof pos.startDate === 'object') {
        startYear = Number(pos.startDate.year) || null;
        startMonth = Math.max(0, Math.min(11, (Number(pos.startDate.month) || 1) - 1));
      } else if (typeof pos.startDate === 'string') {
        const p = Date.parse(pos.startDate);
        if (!isNaN(p)) {
          const d = new Date(p);
          startYear = d.getFullYear();
          startMonth = d.getMonth();
        }
      }
    }

    // Parse end
    if (isCurrent) {
      endYear = now.getFullYear();
      endMonth = now.getMonth();
    } else if (pos.endDate) {
      if (typeof pos.endDate === 'object') {
        endYear = Number(pos.endDate.year) || null;
        endMonth = Math.max(0, Math.min(11, (Number(pos.endDate.month) || 1) - 1));
      } else if (typeof pos.endDate === 'string') {
        const p = Date.parse(pos.endDate);
        if (!isNaN(p)) {
          const d = new Date(p);
          endYear = d.getFullYear();
          endMonth = d.getMonth();
        }
      }
    }

    if (startYear === null || (endYear === null && !isCurrent)) {
      hasMissingDates = true;
      continue;
    }

    const sIndex = startYear * 12 + startMonth;
    const eIndex = Math.min(currentMonthIndex, (endYear || now.getFullYear()) * 12 + endMonth);

    if (sIndex <= eIndex && sIndex > 2000 * 12) {
      const titleLower = String(title || '').toLowerCase();
      const isSales = /sales|account\s+executive|business\s+development|bde|bdm|relationship\s+manager/i.test(titleLower);
      intervals.push({
        startMonth: sIndex,
        endMonth: eIndex,
        isSales,
        company,
        title,
        isCurrent,
      });
    } else {
      hasMissingDates = true;
    }
  }

  if (intervals.length === 0) {
    return {
      totalExperienceYears: null,
      experienceType: 'unknown',
      experienceVerificationStatus: hasMissingDates ? 'partial' : 'unstated',
      roleExperienceYears: null,
      currentEmployer,
      currentRole,
      hasOverlappingPositions: false,
      evidence: hasMissingDates
        ? 'Employment positions found but missing complete start/end dates.'
        : 'No valid position intervals.',
    };
  }

  // Sort intervals by start
  intervals.sort((a, b) => a.startMonth - b.startMonth);

  // Merge overlapping intervals
  const merged: Array<{ startMonth: number; endMonth: number }> = [];
  let hasOverlaps = false;

  for (const curr of intervals) {
    if (merged.length === 0) {
      merged.push({ startMonth: curr.startMonth, endMonth: curr.endMonth });
    } else {
      const prev = merged[merged.length - 1];
      if (curr.startMonth <= prev.endMonth) {
        hasOverlaps = true;
        prev.endMonth = Math.max(prev.endMonth, curr.endMonth);
      } else {
        merged.push({ startMonth: curr.startMonth, endMonth: curr.endMonth });
      }
    }
  }

  // Calculate unique months
  let totalMonths = 0;
  for (const m of merged) {
    totalMonths += (m.endMonth - m.startMonth + 1);
  }

  const totalExperienceYears = Math.round((totalMonths / 12) * 10) / 10;

  return {
    totalExperienceYears,
    experienceType: 'calculated',
    experienceVerificationStatus: hasMissingDates ? 'partial' : 'verified',
    roleExperienceYears: null,
    currentEmployer,
    currentRole,
    hasOverlappingPositions: hasOverlaps,
    evidence: `Calculated ${totalExperienceYears}y experience from ${intervals.length} positions${
      hasOverlaps ? ' (overlapping employment merged without double-counting)' : ''
    }${hasMissingDates ? ' (some dates partial)' : ''}.`,
  };
}

/**
 * 4. Intent Classification and Quote Extraction Engine
 * Classifies whole post into 5 classes:
 * - SELF_JOB_SEEKING
 * - RECRUITER_OR_EMPLOYER_HIRING
 * - SEEKING_ON_BEHALF_OF_SOMEONE
 * - UNRELATED
 * - UNCLEAR
 * Requires exact quote verified in content for positive intent decisions.
 * #OpenToWork or "opportunity" alone does NOT establish personal job seeking.
 */
export interface IntentClassificationResult {
  authorIntent: AuthorIntent;
  author_seeking_job: boolean;
  exactIntentQuote: string | null;
  intentEvidence: string;
  isRecruiterAd: boolean;
  isSeekingForOthers: boolean;
  rejectionReason: string | null;
}

export function classifyIntentAndExtractQuote(
  postContent: string,
  headline?: string | null
): IntentClassificationResult {
  const content = String(postContent || '').trim();
  const lower = content.toLowerCase();
  const headlineLower = String(headline || '').toLowerCase();

  // Author profile / headline check for HR, Talent Acquisition, Recruiter, Staffing, Placement
  const isHrOrRecruiterAuthor =
    /\b(hr|human\s+resources|recruiter|recruitment|talent\s+acquisition|headhunter|staffing|hiring\s+manager|placement|sourcing\s+specialist|manpower)\b/i.test(headlineLower);

  // Special case: Genuine seeker mentioning hiring managers
  // E.g. "Please connect me with hiring managers; I am seeking a sales role" or "hiring managers please connect"
  const connectsHiringManagersForSelf =
    !isHrOrRecruiterAuthor &&
    /(?:connect\s+(?:me\s+)?with\s+hiring\s+managers|hiring\s+managers\s+please\s+(?:connect|reach|consider))/i.test(lower) &&
    /(?:i\s+(?:am|'m)\s+(?:seeking|looking|exploring|open)|for\s+myself)/i.test(lower);

  // 1. Recruiter or Employer Hiring Vacancy Triggers
  const recruiterTriggers = [
    'we are hiring', "we're hiring", 'were hiring', 'is hiring', 'are hiring',
    'i am hiring', "i'm hiring",
    'urgent hiring', 'urgently hiring', 'immediate hiring', 'urgent requirement for', 'urgent opening for',
    'hiring for our client', 'hiring for client', 'my client is hiring', 'clients are hiring',
    'our team is hiring', 'team is expanding', 'looking for candidates', 'looking for qualified',
    'looking for sales professionals', 'looking for relationship managers',
    'we are looking for sales', 'we are looking for candidates', 'we are looking for',
    'seeking candidates', 'opening in my team', 'openings in my team',
    'there is an opening', 'job vacancy', 'job vacancies', 'new sales vacancy',
    'send your cv', 'send updated cv', 'send resume', 'share your cv',
    'share your resume', 'drop your cv', 'drop cv', 'forward your cv', 'email your cv',
    'send cv to', 'to apply:', 'apply now:', 'apply here:', 'apply now', 'apply here',
    'referral drive for hiring', 'referral opening', 'walk-in drive', 'walk-in interview',
    'walk in interview', 'mega job drive', 'refer suitable resumes', 'refer resumes',
    'call now or refer', 'remote career opportunities', 'we are closing this position immediately',
    'closing this position immediately', 'hiring for multiple', 'hiring for multiple position',
    'potential vacancy', 'potential vacancies', 'vacancies available', 'vacancy available',
    'job openings available', 'share multiple roles', 'sharing multiple roles',
  ];

  // Specific vacancy mentions in posts (e.g. "potential vacancy", "vacancy available", "hiring for following")
  const vacancyMentionPatterns = [
    'potential vacancy',
    'potential vacancies',
    'vacancies available',
    'vacancy available',
    'job openings available',
    'opportunities for professionals',
    'career opportunities available',
    'share multiple roles',
    'sharing multiple roles',
    'i am hiring for',
    "i'm hiring for",
    'we have openings',
    'we have an opening',
    'opening in my team',
    'openings in my company',
    'openings in our team',
    'actively looking to acquire',
    'looking for direct advertiser',
    'vendor empanelment',
    'looking to expand your it staffing',
  ];

  const mentionsVacanciesForOthers =
    vacancyMentionPatterns.some(p => lower.includes(p)) ||
    (/hiring\s+for/i.test(lower) && !lower.includes('connect me with hiring')) ||
    (/\b(openings?|vacanc(?:y|ies))\b/i.test(lower) && /(?:we|our|client|company|team|organisation)\s+(?:have|has|announces?|with)/i.test(lower)) ||
    (/(?:share|sharing|refer)\s+(?:multiple\s+)?(?:roles|resumes?|cvs?|profiles?)/i.test(lower));

  const matchedRecruiter = recruiterTriggers.find(t => lower.includes(t));
  if ((matchedRecruiter || mentionsVacanciesForOthers || (isHrOrRecruiterAuthor && (lower.includes('hiring') || lower.includes('position') || lower.includes('opportunity') || lower.includes('opening') || lower.includes('vacancy')))) && !connectsHiringManagersForSelf) {
    // Find matched snippet
    const trigger = matchedRecruiter || 'Recruiter/vacancy mention';
    const idx = matchedRecruiter ? lower.indexOf(matchedRecruiter) : 0;
    const snippet = content.slice(Math.max(0, idx - 10), Math.min(content.length, idx + trigger.length + 20)).trim();
    return {
      authorIntent: 'RECRUITER_OR_EMPLOYER_HIRING',
      author_seeking_job: false,
      exactIntentQuote: null,
      intentEvidence: isHrOrRecruiterAuthor
        ? `Post by HR/Recruitment professional announcing vacancies/roles: "${snippet || headline}"`
        : `Recruiter/employer vacancy posting detected: "${snippet}"`,
      isRecruiterAd: true,
      isSeekingForOthers: false,
      rejectionReason: 'Rejected Post: Recruiter vacancy ad, HR post announcing opportunities, or employer hiring posting.',
    };
  }

  // 2. Third-Party Seeking (on behalf of someone else)
  const thirdPartyTriggers = [
    'my friend is looking for', 'my colleague is looking for', 'my brother is looking for',
    'helping a friend find', 'i can refer candidates', 'happy to refer candidates',
    'can refer interested', 'referring interested candidates', 'on behalf of my'
  ];

  const matchedThirdParty = thirdPartyTriggers.find(t => lower.includes(t));
  if (matchedThirdParty && !connectsHiringManagersForSelf) {
    return {
      authorIntent: 'SEEKING_ON_BEHALF_OF_SOMEONE',
      author_seeking_job: false,
      exactIntentQuote: null,
      intentEvidence: `Seeking on behalf of others / offering referrals: "${matchedThirdParty}"`,
      isRecruiterAd: false,
      isSeekingForOthers: true,
      rejectionReason: 'Rejected Post: Seeking on behalf of someone else or offering referrals.',
    };
  }

  // 3. First-Person Self Job Seeking Statements (Exact supporting quote extraction)
  const selfSeekingRegexes = [
    /(i\s+am\s+actively\s+seeking\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|position|opportunity))/i,
    /(i'm\s+actively\s+seeking\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|position|opportunity))/i,
    /(i\s+am\s+looking\s+for\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|position|opportunity))/i,
    /(i'm\s+looking\s+for\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|position|opportunity))/i,
    /(i\s+am\s+seeking\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|change|position|opportunity))/i,
    /(i'm\s+seeking\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|change|position|opportunity))/i,
    /(i\s+am\s+exploring\s+(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:opportunities|roles|positions))/i,
    /(i'm\s+exploring\s+(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:opportunities|roles|positions))/i,
    /(i\s+am\s+open\s+to\s+work)/i,
    /(i'm\s+open\s+to\s+work)/i,
    /(actively\s+seeking\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|opportunity))/i,
    /(actively\s+looking\s+for\s+(?:a\s+)?(?:new\s+)?(?:[a-zA-Z\s]{0,25})?(?:role|job|challenge|opportunity))/i,
    /(looking\s+for\s+my\s+next\s+(?:role|challenge|step|move))/i,
    /(seeking\s+my\s+next\s+(?:role|challenge|step|move))/i,
    /(seeking\s+a\s+(?:new\s+)?role\s+in\s+[a-zA-Z\s]+)/i,
    /(i'm\s+officially\s+on\s+the\s+market)/i,
    /(i\s+am\s+officially\s+on\s+the\s+market)/i,
    /(seeking\s+a\s+new\s+role)/i,
    /(looking\s+for\s+a\s+change)/i,
    /(exploring\s+new\s+(?:career\s+)?opportunities)/i,
    /(please\s+connect\s+me\s+with\s+hiring\s+managers)/i,
    /(immediate\s+joiner\s+seeking\s+[a-zA-Z\s]+(?:role|position|job))/i,
  ];

  let verifiedQuote: string | null = null;
  for (const regex of selfSeekingRegexes) {
    const match = content.match(regex);
    if (match && match[0]) {
      const q = match[0].trim();
      // Double check verbatim inclusion
      if (content.toLowerCase().includes(q.toLowerCase())) {
        verifiedQuote = q;
        break;
      }
    }
  }

  if (verifiedQuote) {
    return {
      authorIntent: 'SELF_JOB_SEEKING',
      author_seeking_job: true,
      exactIntentQuote: verifiedQuote,
      intentEvidence: `Author explicitly states personal job search: "${verifiedQuote}"`,
      isRecruiterAd: false,
      isSeekingForOthers: false,
      rejectionReason: null,
    };
  }

  // 4. Unrelated (Sales tips, thought leadership, commentary without personal job request)
  const unrelatedTriggers = [
    'five ways to', '5 ways to', 'how to close', 'sales tips', 'sales advice',
    'market analysis', 'excited to announce our new partnership', 'top 10 sales',
    'lessons learned', 'in my 10 years of sales leadership', 'key takeaways from',
    'leadership insights', 'read full article'
  ];

  if (unrelatedTriggers.some(t => lower.includes(t))) {
    return {
      authorIntent: 'UNRELATED',
      author_seeking_job: false,
      exactIntentQuote: null,
      intentEvidence: 'Post consists of sales tips, thought leadership, or industry commentary without personal job request.',
      isRecruiterAd: false,
      isSeekingForOthers: false,
      rejectionReason: 'Rejected Post: Unrelated sales advice or industry thought leadership.',
    };
  }

  // 5. Unclear (Mentions #OpenToWork or "opportunity" but without a full first-person statement)
  if (lower.includes('#opentowork') || lower.includes('opportunity') || lower.includes('job change')) {
    return {
      authorIntent: 'UNCLEAR',
      author_seeking_job: false,
      exactIntentQuote: null,
      intentEvidence: 'Post mentions keywords (#OpenToWork / opportunity) but lacks a verifiable first-person job-seeking statement.',
      isRecruiterAd: false,
      isSeekingForOthers: false,
      rejectionReason: 'Needs Review: Job seeking intent is unclear or lacks verifiable statement.',
    };
  }

  return {
    authorIntent: 'UNCLEAR',
    author_seeking_job: false,
    exactIntentQuote: null,
    intentEvidence: 'No explicit first-person job-seeking statement found in post text.',
    isRecruiterAd: false,
    isSeekingForOthers: false,
    rejectionReason: 'Rejected Post: Lacks personal first-person job seeking statement.',
  };
}

/**
 * 5. Criteria-Controlled Eligibility Calculator
 * Single source of truth evaluating extracted evidence against active shared CriteriaFilters.
 */
export interface EligibilityEvaluationResult {
  criteriaTag: CriteriaTag;
  validationChecks: CandidateSixPointCheck;
  matchingExplanation: string;
  rejectionReason: string | null;
  reviewReason: 'missing_details' | 'unclear_intent' | 'missing_experience' | 'unconfirmed_location' | 'outdated_post' | null;
  missingFields: string[];
}

export function evaluateEligibilityAgainstCriteria(
  evidence: {
    authorIntent: AuthorIntent;
    author_seeking_job: boolean;
    exactIntentQuote: string | null;
    author_based_in_india: boolean | 'unknown';
    location_evidence: string;
    currentCity: string | null;
    currentStateOrUT: string | null;
    preferredLocation: string | null;
    currentOrPreviousRole: string | null;
    employer: string | null;
    sector: TargetSector | string | null;
    totalExperienceYears: number | null;
    experienceVerificationStatus: 'verified' | 'partial' | 'uncertain' | 'unstated';
    originalPostDate: string | null;
  },
  criteria: CriteriaFilters,
  timeWindow: TimeWindow = '7d'
): EligibilityEvaluationResult {
  const missingFields: string[] = [];

  // 1. Author Personally Seeking Job Check
  let intentCheck: CandidateCheckResult;
  if (evidence.authorIntent === 'SELF_JOB_SEEKING' && evidence.exactIntentQuote) {
    intentCheck = {
      passed: true,
      evidence: `Verified quote: "${evidence.exactIntentQuote}"`,
    };
  } else if (evidence.authorIntent === 'UNCLEAR') {
    intentCheck = {
      passed: null,
      evidence: 'Author intent requires review (unclear statement).',
    };
    missingFields.push('jobSeekingStatement');
  } else {
    intentCheck = {
      passed: false,
      evidence: `Post classified as ${evidence.authorIntent}.`,
    };
  }

  // 2. Role Scope & Sales Qualification Gate
  let roleCheck: CandidateCheckResult;
  const roleText = String(evidence.currentOrPreviousRole || '').toLowerCase();

  const isSalesRole = /sales|account\s+executive|business\s+development|bde|bdm|relationship\s+manager|medical\s+rep|territory\s+sales|bancassurance|loan\s+sales|merchant\s+acq/i.test(roleText);

  if (criteria.roleScope === 'sales_only') {
    if (isSalesRole) {
      roleCheck = {
        passed: true,
        evidence: `Sales role confirmed: "${evidence.currentOrPreviousRole}"`,
      };
    } else if (evidence.currentOrPreviousRole) {
      roleCheck = {
        passed: false,
        evidence: `Role "${evidence.currentOrPreviousRole}" is outside configured Sales-only scope.`,
      };
    } else {
      roleCheck = {
        passed: null,
        evidence: 'Current role is unstated (Needs Review for Sales qualification).',
      };
      missingFields.push('currentOrPreviousRole');
    }
  } else if (criteria.roleScope === 'custom') {
    const matchesKeyword = criteria.requiredKeywords.some(kw => roleText.includes(kw.toLowerCase()));
    if (matchesKeyword) {
      roleCheck = {
        passed: true,
        evidence: `Role matches required keywords: "${evidence.currentOrPreviousRole}"`,
      };
    } else if (evidence.currentOrPreviousRole) {
      roleCheck = {
        passed: false,
        evidence: `Role "${evidence.currentOrPreviousRole}" does not match configured custom keywords.`,
      };
    } else {
      roleCheck = {
        passed: null,
        evidence: 'Role unstated.',
      };
      missingFields.push('currentOrPreviousRole');
    }
  } else {
    // all_roles
    roleCheck = {
      passed: true,
      evidence: evidence.currentOrPreviousRole ? `Role: "${evidence.currentOrPreviousRole}" (All roles accepted)` : 'All roles accepted per configuration.',
    };
  }

  // 3. India Location Gate
  let locationCheck: CandidateCheckResult;
  if (evidence.author_based_in_india === true) {
    locationCheck = {
      passed: true,
      evidence: evidence.location_evidence,
    };
  } else if (evidence.author_based_in_india === false) {
    locationCheck = {
      passed: false,
      evidence: evidence.location_evidence,
    };
  } else {
    locationCheck = {
      passed: null,
      evidence: evidence.location_evidence || 'Current residence in India cannot be verified (Needs Review).',
    };
    missingFields.push('currentWorkLocation');
  }

  // 4. Experience Range Gate (Configured Range, e.g. minExperienceYears to maxExperienceYears)
  let expCheck: CandidateCheckResult & { experienceType?: 'stated' | 'calculated' | 'unknown' };
  if (evidence.totalExperienceYears !== null && evidence.totalExperienceYears !== undefined) {
    const exp = evidence.totalExperienceYears;
    const min = criteria.minExperienceYears || 1;
    const max = criteria.maxExperienceYears || 10;
    if (exp >= min && exp <= max) {
      expCheck = {
        passed: true,
        evidence: `${exp}y experience is within configured range (${min}–${max} years). Status: ${evidence.experienceVerificationStatus}`,
        experienceType: 'stated',
      };
    } else {
      expCheck = {
        passed: false,
        evidence: `${exp}y experience is outside configured range (${min}–${max} years).`,
        experienceType: 'stated',
      };
    }
  } else {
    expCheck = {
      passed: null,
      evidence: 'Total experience duration not stated or uncertain (Needs Review).',
      experienceType: 'unknown',
    };
    missingFields.push('totalExperienceYears');
  }

  // 5. Sector Qualification Gate
  let sectorCheck: CandidateCheckResult & { detectedSector?: string | null };
  if (criteria.sectorScope === 'selected_sectors') {
    const candSector = String(evidence.sector || '').toLowerCase();
    const isTarget = criteria.targetSectors.some(ts => ts.toLowerCase() === candSector);
    if (isTarget) {
      sectorCheck = {
        passed: true,
        evidence: `Sector "${evidence.sector}" is in configured target sectors.`,
        detectedSector: evidence.sector,
      };
    } else if (evidence.sector) {
      sectorCheck = {
        passed: false,
        evidence: `Sector "${evidence.sector}" is outside configured target sectors.`,
        detectedSector: evidence.sector,
      };
    } else {
      sectorCheck = {
        passed: null,
        evidence: 'Employer sector unconfirmed.',
        detectedSector: null,
      };
      missingFields.push('sector');
    }
  } else {
    sectorCheck = {
      passed: true,
      evidence: evidence.sector ? `Sector: "${evidence.sector}" (All sectors accepted)` : 'All sectors accepted per configuration.',
      detectedSector: evidence.sector,
    };
  }

  // 6. Post Recency Gate
  let dateCheck: CandidateCheckResult;
  const hoursWindow = timeWindow === '24h' ? 24 : (timeWindow as string) === '30d' ? 720 : 168;
  const maxAgeMs = hoursWindow * 3600 * 1000;

  if (evidence.originalPostDate) {
    const postTime = new Date(evidence.originalPostDate).getTime();
    if (isNaN(postTime)) {
      dateCheck = {
        passed: null,
        evidence: 'Unverifiable post timestamp (Needs Review).',
      };
      missingFields.push('originalPostDate');
    } else {
      const ageMs = Date.now() - postTime;
      if (ageMs > maxAgeMs) {
        const daysOld = Math.round(ageMs / (24 * 3600 * 1000));
        dateCheck = {
          passed: false,
          evidence: `Post date (${evidence.originalPostDate}) is older than selected ${timeWindow} window (${daysOld} days old).`,
        };
      } else {
        dateCheck = {
          passed: true,
          evidence: `Post date (${evidence.originalPostDate}) is within selected ${timeWindow} window.`,
        };
      }
    }
  } else {
    dateCheck = {
      passed: null,
      evidence: 'Post timestamp is missing/unknown (Needs Review).',
    };
    missingFields.push('originalPostDate');
  }

  // Final Criteria Tag Determination
  let criteriaTag: CriteriaTag = 'Needs Review';
  let rejectionReason: string | null = null;
  let reviewReason: EligibilityEvaluationResult['reviewReason'] = null;
  let matchingExplanation = '';

  // Mandatory Criteria Evaluation per user instruction:
  // Only mandatory requirements to move to "Matches Criteria":
  // 1. Post from India (locationCheck.passed === true)
  // 2. Employee having 1–10 years experience (expCheck.passed === true)
  // 3. Individually seeking a job (intentCheck.passed === true)
  // Working in any role and sector is accepted.

  if (intentCheck.passed === false) {
    criteriaTag = 'Outside Target';
    rejectionReason = `Author is not personally seeking employment (${intentCheck.evidence})`;
    matchingExplanation = rejectionReason;
  } else if (locationCheck.passed === false) {
    criteriaTag = 'Outside Target';
    rejectionReason = `Fails India location criteria: ${locationCheck.evidence}`;
    matchingExplanation = rejectionReason;
  } else if (expCheck.passed === false) {
    criteriaTag = 'Outside Target';
    rejectionReason = `Fails experience criteria: ${expCheck.evidence}`;
    matchingExplanation = rejectionReason;
  } else if (intentCheck.passed === null) {
    criteriaTag = 'Needs Review';
    reviewReason = 'unclear_intent';
    matchingExplanation = 'Needs Review: Job seeking intent requires recruiter verification.';
  } else if (locationCheck.passed === null) {
    criteriaTag = 'Needs Review';
    reviewReason = 'unconfirmed_location';
    matchingExplanation = 'Needs Review: Current residence in India is unstated or requires confirmation.';
  } else if (expCheck.passed === null) {
    criteriaTag = 'Needs Review';
    reviewReason = 'missing_experience';
    matchingExplanation = `Needs Review: Total professional experience is unstated or uncertain (required 1–10 years).`;
  } else if (intentCheck.passed === true && locationCheck.passed === true && expCheck.passed === true) {
    // All mandatory criteria met
    criteriaTag = 'Matches Criteria';
    matchingExplanation = `Confirmed Match: Individual job seeker based in ${evidence.currentCity ? evidence.currentCity + ', ' : ''}${evidence.currentStateOrUT || 'India'} with ${evidence.totalExperienceYears}y experience (within 1–10 years). Working in any role and sector is accepted.`;
  } else {
    criteriaTag = 'Needs Review';
    reviewReason = 'missing_details';
    matchingExplanation = `Needs Review: Incomplete candidate verification (${missingFields.join(', ')}).`;
  }

  const validationChecks: CandidateSixPointCheck = {
    authorIsPersonallySeekingJob: intentCheck,
    currentlyEmployedInSalesRole: roleCheck,
    currentlyWorkingInIndia: locationCheck,
    totalExperience1To10Years: expCheck,
    currentEmployerInTargetSector: sectorCheck,
    postDateWithinSelectedPeriod: dateCheck,
    author_seeking_job: intentCheck.passed === true,
    author_based_in_india: locationCheck.passed === true ? true : locationCheck.passed === false ? false : 'unknown',
    intent_evidence: intentCheck.evidence,
    location_evidence: locationCheck.evidence,
    currentCity: evidence.currentCity,
    currentStateOrUT: evidence.currentStateOrUT,
    preferredLocation: evidence.preferredLocation,
    rejection_or_review_reason: rejectionReason || (criteriaTag === 'Needs Review' ? matchingExplanation : null),
  };

  return {
    criteriaTag,
    validationChecks,
    matchingExplanation,
    rejectionReason,
    reviewReason,
    missingFields,
  };
}

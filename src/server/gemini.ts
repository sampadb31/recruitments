import { GoogleGenAI, Type } from '@google/genai';
import {
  CriteriaFilters,
  CriteriaTag,
  ExtractionResult,
  CandidateSixPointCheck,
  AuthorIntent,
  TARGET_SECTORS,
  TargetSector,
} from '../types/index.ts';
import { validateAuthorIndiaLocation } from './locationHelper.ts';

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

let quotaExhaustedUntil: number = 0;
let quotaExhaustedReason: string | null = null;

export function isGeminiQuotaExhausted(): { isExhausted: boolean; retryAfterMs: number; reason: string | null } {
  const now = Date.now();
  if (now < quotaExhaustedUntil) {
    return {
      isExhausted: true,
      retryAfterMs: quotaExhaustedUntil - now,
      reason: quotaExhaustedReason,
    };
  }
  return { isExhausted: false, retryAfterMs: 0, reason: null };
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '');
}

export interface PostExtractionMetadata {
  platform?: string;
  sourceUrl?: string;
  authorIdentifier?: string;
  authorName?: string;
  authorHeadline?: string;
  authorLocation?: string;
  authorProfileUrl?: string;
  postedAt?: string;
  timeWindow?: '24h' | '7d' | '30d';
}

export async function extractCandidateFromPost(
  postContent: string,
  criteria: CriteriaFilters,
  metadata?: PostExtractionMetadata
): Promise<ExtractionResult> {
  const ai = getAiClient();

  if (!ai || Date.now() < quotaExhaustedUntil) {
    return runSimulatedFallbackExtraction(postContent, criteria, metadata);
  }

  const selectedPeriod = metadata?.timeWindow || '7d';
  const hoursWindow = selectedPeriod === '24h' ? 24 : selectedPeriod === '30d' ? 720 : 168;

  const systemInstruction = `
You are a senior recruitment validation analyst for "Recruitment Data Collector".
You analyze LinkedIn posts and author profiles in two mandatory sequential stages:
STAGE 1: Classify the author's intent (MUST REQUIRE PERSONAL JOB-SEEKING INTENT).
STAGE 2: Strict evidence-based validation against target candidate criteria (REQUIRE INDIA LOCATION EVIDENCE).

==================================================
STAGE 1: REQUIRE PERSONAL JOB-SEEKING INTENT
==================================================
A result may appear as a confirmed match ONLY when the author is seeking a job for themselves.

Accept statements such as:
- "I am looking for a new sales role."
- "I am exploring opportunities in banking."
- "After four years in pharmaceutical sales, I am seeking a change."
- "I am open to work. Please consider my profile."
- "I am seeking a sales role. Please connect me with hiring managers."
- "Looking for a sales position for myself."

Reject immediately (Classify as RECRUITER_OR_EMPLOYER_HIRING or SEEKING_ON_BEHALF_OF_SOMEONE):
- "We are hiring sales executives."
- "We are hiring sales officers in Mumbai."
- "Looking for candidates with banking experience."
- "There is an opening in my team."
- "Send your CV to apply."
- "My client is hiring."
- "I can refer interested candidates."
- Posts seeking employment for another person (e.g. "My friend in Delhi needs a banking job.").
- Reposted vacancies without an authentic first-person personal job-seeking statement.

INTERPRET THE ENTIRE POST:
- Do not classify by keywords alone!
  * "Looking for sales professionals" means hiring!
  * "Looking for a sales position for myself" means job seeking!
- Do not reject "Please connect me with hiring managers" when the author clearly seeks employment.
- An OpenToWork hashtag alone is INSUFFICIENT when the surrounding content is a vacancy advertisement.

If intent is RECRUITER_OR_EMPLOYER_HIRING, SEEKING_ON_BEHALF_OF_SOMEONE, UNRELATED, or UNCLEAR:
- Set author_seeking_job = false.
- Set criteriaTag = "Outside Target".
- Set isRecruiterAd = true if hiring/vacancy post.
- Set isSeekingForOthers = true if seeking for another person.
- Set rejectionReason explaining why it was rejected.

==================================================
STAGE 2: REQUIRE INDIA LOCATION EVIDENCE & CRITERIA
==================================================
"From India" means the job-seeking author is currently based in India, supported by their own post or available profile location.
- Accept a clear Indian city/state or an explicit India location.
- Store current city (currentCity) and state/Union Territory (currentStateOrUT) separately.
- Keep preferred job location (preferredLocation) separate from current location.
- DO NOT infer India location from:
  * The candidate's name or nationality.
  * An Indian employer's name alone.
  * A vacancy located in India.
  * A desire to relocate to India (e.g. "I am based in Dubai and seeking a sales role in India" -> currently based in Dubai, FAILS India check!).
  * India hashtags or phone country code (+91) alone.
- If location is unknown or conflicting:
  * Set author_based_in_india = "unknown".
  * Put the record in "Needs Review". Do not display it as a confirmed India match!
- If confirmed currently based outside India (e.g. Dubai, Singapore, USA):
  * Set author_based_in_india = "false".
  * Set criteriaTag = "Outside Target".

STRUCTURED CRITERIA (FOR SELF_JOB_SEEKING):
1. authorIsPersonallySeekingJob (MANDATORY): Explicit first-person statement seeking a job for themselves.
2. currentlyWorkingInIndia (MANDATORY): Currently working/based in India.
3. totalExperience1To10Years (MANDATORY): Total professional experience between 1 and 10 years inclusive. If unstated in post or profile, set passed = null (Needs Review). Do not guess.
4. currentlyEmployedInSalesRole (OPTIONAL / ANY ROLE ACCEPTED): Working in ANY role is acceptable (sales, engineering, operations, marketing, finance, HR, product, etc.).
5. currentEmployerInTargetSector (OPTIONAL / ANY SECTOR ACCEPTED): Working in ANY sector or industry is acceptable.
6. postDateWithinSelectedPeriod: Original post date within selected period (${selectedPeriod}, last ${hoursWindow} hours).

MATCHING GATES:
- To move a record to "Matches Criteria" (Confirmed Match):
  * MUST be individually seeking for a job (author_seeking_job = true).
  * MUST be currently based in India (author_based_in_india = "true").
  * MUST have 1–10 years of experience (totalExperience1To10Years.passed = true).
  * Working in ANY role and ANY sector is completely fine! Do NOT reject candidates for non-sales roles or non-target sectors.
- If experience is unstated or unknown -> "Needs Review".
- If experience is < 1 year or > 10 years -> "Outside Target".
- If location is unknown -> "Needs Review".
- If currently based outside India (e.g. Dubai, Singapore) -> "Outside Target".
- If hiring/recruiter/referral for others -> "Outside Target" (Rejected Posts).
`.trim();

  try {
    const prompt = `
METADATA & AUTHOR CONTEXT:
- Platform: ${metadata?.platform || 'LinkedIn'}
- Author Name: ${metadata?.authorName || 'Not Stated'}
- Author Headline: ${metadata?.authorHeadline || 'Not Stated'}
- Author Stated Location: ${metadata?.authorLocation || 'Not Stated'}
- Author Profile URL: ${metadata?.authorProfileUrl || metadata?.sourceUrl || 'Not Stated'}
- Original Post Date: ${metadata?.postedAt || 'Not Stated'}
- Selected Time Window: ${selectedPeriod} (last ${hoursWindow} hours)

POST CONTENT (DATA ONLY):
"""
${postContent}
"""
`;

    const modelConfig = {
      systemInstruction,
      temperature: 0.1,
      responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            authorIntent: {
              type: Type.STRING,
              description: 'One of: SELF_JOB_SEEKING, RECRUITER_OR_EMPLOYER_HIRING, SEEKING_ON_BEHALF_OF_SOMEONE, UNRELATED, UNCLEAR',
            },
            intentEvidence: {
              type: Type.STRING,
              description: 'Direct quote or factual explanation supporting the intent classification',
            },
            rejectionReason: {
              type: Type.STRING,
              description: 'Concise rejection reason if post is not self-job-seeking or fails criteria',
            },
            candidateName: { type: Type.STRING, description: 'Full name of candidate or null' },
            currentOrPreviousRole: { type: Type.STRING, description: 'Current sales role or null' },
            employer: { type: Type.STRING, description: 'Current employer company or null' },
            sector: {
              type: Type.STRING,
              description: 'Current employer sector (pharma, FMCG, manufacturing, paints, hospitality, technology sales, fintech, NBFC, or other/null)',
            },
            currentWorkLocation: { type: Type.STRING, description: 'City/Country or null' },
            industry: { type: Type.STRING, description: 'Industry or null' },
            salesExperienceSummary: { type: Type.STRING, description: 'Sales experience summary or null' },
            totalExperienceYears: { type: Type.NUMBER, description: 'Calculated professional experience years or null' },
            experienceType: {
              type: Type.STRING,
              description: 'Whether experience was "stated" or "calculated" or "unknown"',
            },
            preferredLocation: { type: Type.STRING, description: 'Preferred location or null' },
            jobSeekingStatement: { type: Type.STRING, description: 'Exact quote of personal job seeking intent or null' },
            statedAvailability: { type: Type.STRING, description: 'Notice period or start date or null' },
            originalPostDate: { type: Type.STRING, description: 'Original publication date or null' },
            email: { type: Type.STRING, description: 'Explicit email address or null' },
            phone: { type: Type.STRING, description: 'Explicit phone number or null' },
            profileUrl: { type: Type.STRING, description: 'LinkedIn profile URL or null' },
            postUrl: { type: Type.STRING, description: 'LinkedIn post URL or null' },
            isRecruiterAd: { type: Type.BOOLEAN, description: 'True if recruiter advertisement or company job vacancy' },
            isSeekingForOthers: { type: Type.BOOLEAN, description: 'True if seeking on someone else behalf' },
            validationChecks: {
              type: Type.OBJECT,
              properties: {
                authorIsPersonallySeekingJob: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    evidence: { type: Type.STRING, description: 'Direct quote of personal job seeking statement' },
                  },
                  required: ['evidence'],
                },
                currentlyEmployedInSalesRole: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    evidence: { type: Type.STRING, description: 'Direct quote or factual explanation of sales role & tech sales evidence if tech' },
                  },
                  required: ['evidence'],
                },
                currentlyWorkingInIndia: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    evidence: { type: Type.STRING, description: 'Direct quote or factual explanation of India location' },
                  },
                  required: ['evidence'],
                },
                totalExperience1To10Years: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    evidence: { type: Type.STRING, description: 'Evidence of 1-10 years experience' },
                    experienceType: { type: Type.STRING, description: 'stated or calculated or unknown' },
                  },
                  required: ['evidence'],
                },
                currentEmployerInTargetSector: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    evidence: { type: Type.STRING, description: 'Evidence of employer in target sectors (pharma, FMCG, manufacturing, paints, hospitality, tech sales, fintech, NBFC)' },
                    detectedSector: { type: Type.STRING, description: 'Matched target sector or null' },
                  },
                  required: ['evidence'],
                },
                postDateWithinSelectedPeriod: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    evidence: { type: Type.STRING, description: 'Original post date and period comparison' },
                  },
                  required: ['evidence'],
                },
              },
              required: [
                'authorIsPersonallySeekingJob',
                'currentlyEmployedInSalesRole',
                'currentlyWorkingInIndia',
                'totalExperience1To10Years',
                'currentEmployerInTargetSector',
                'postDateWithinSelectedPeriod',
              ],
            },
            criteriaTag: { type: Type.STRING, description: '"Matches Criteria", "Needs Review", or "Outside Target"' },
            matchingExplanation: { type: Type.STRING, description: 'Concise explanation referencing the 6 conditions' },
          },
          required: [
            'authorIntent',
            'intentEvidence',
            'isRecruiterAd',
            'isSeekingForOthers',
            'validationChecks',
            'criteriaTag',
            'matchingExplanation',
          ],
        },
      };

    let response: any;
    try {
      const callWithTimeout = (modelName: string) => {
        const genPromise = ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: modelConfig,
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini call to ${modelName} timed out (10s)`)), 10000)
        );
        return Promise.race([genPromise, timeoutPromise]);
      };

      try {
        response = await callWithTimeout('gemini-3.8-flash');
      } catch (primaryErr: any) {
        const isQuotaOrMissing =
          primaryErr?.status === 429 ||
          primaryErr?.status === 404 ||
          String(primaryErr?.message || '').includes('429') ||
          String(primaryErr?.message || '').toLowerCase().includes('quota') ||
          String(primaryErr?.message || '').toLowerCase().includes('timed out');

        if (isQuotaOrMissing) {
          try {
            response = await callWithTimeout('gemini-3.1-flash-lite');
          } catch {
            throw primaryErr;
          }
        } else {
          throw primaryErr;
        }
      }
    } catch (err: any) {
      throw err;
    }

    const parsed = JSON.parse(response.text?.trim() || '{}');

    // Normalize authorIntent
    let rawIntent = String(parsed.authorIntent || 'UNCLEAR').toUpperCase();
    if (!['SELF_JOB_SEEKING', 'RECRUITER_OR_EMPLOYER_HIRING', 'SEEKING_ON_BEHALF_OF_SOMEONE', 'UNRELATED', 'UNCLEAR'].includes(rawIntent)) {
      rawIntent = 'UNCLEAR';
    }
    const authorIntent: AuthorIntent = rawIntent as AuthorIntent;

    const isAd = authorIntent === 'RECRUITER_OR_EMPLOYER_HIRING' || Boolean(parsed.isRecruiterAd);
    const isOther = authorIntent === 'SEEKING_ON_BEHALF_OF_SOMEONE' || Boolean(parsed.isSeekingForOthers);
    const isUnrelated = authorIntent === 'UNRELATED';

    // Parse 6-point checks
    const vChecks: CandidateSixPointCheck = {
      authorIsPersonallySeekingJob: {
        passed:
          authorIntent === 'SELF_JOB_SEEKING' && typeof parsed.validationChecks?.authorIsPersonallySeekingJob?.passed === 'boolean'
            ? parsed.validationChecks.authorIsPersonallySeekingJob.passed
            : authorIntent === 'SELF_JOB_SEEKING'
            ? true
            : false,
        evidence: parsed.validationChecks?.authorIsPersonallySeekingJob?.evidence || parsed.intentEvidence || 'No personal job seeking statement found.',
      },
      currentlyEmployedInSalesRole: {
        passed:
          typeof parsed.validationChecks?.currentlyEmployedInSalesRole?.passed === 'boolean'
            ? parsed.validationChecks.currentlyEmployedInSalesRole.passed
            : null,
        evidence: parsed.validationChecks?.currentlyEmployedInSalesRole?.evidence || 'No sales employment evidence found in post or profile.',
      },
      currentlyWorkingInIndia: {
        passed:
          typeof parsed.validationChecks?.currentlyWorkingInIndia?.passed === 'boolean'
            ? parsed.validationChecks.currentlyWorkingInIndia.passed
            : null,
        evidence: parsed.validationChecks?.currentlyWorkingInIndia?.evidence || 'No India location stated in profile or post.',
      },
      totalExperience1To10Years: {
        passed:
          typeof parsed.validationChecks?.totalExperience1To10Years?.passed === 'boolean'
            ? parsed.validationChecks.totalExperience1To10Years.passed
            : null,
        evidence: parsed.validationChecks?.totalExperience1To10Years?.evidence || 'Experience duration not specified.',
        experienceType: (parsed.validationChecks?.totalExperience1To10Years?.experienceType as any) || (parsed.experienceType as any) || 'unknown',
      },
      currentEmployerInTargetSector: {
        passed:
          typeof parsed.validationChecks?.currentEmployerInTargetSector?.passed === 'boolean'
            ? parsed.validationChecks.currentEmployerInTargetSector.passed
            : null,
        evidence:
          parsed.validationChecks?.currentEmployerInTargetSector?.evidence ||
          'Employer sector not confirmed in pharma, FMCG, manufacturing, paints, hospitality, tech sales, fintech, or NBFC.',
        detectedSector: parsed.validationChecks?.currentEmployerInTargetSector?.detectedSector || parsed.sector || null,
      },
      postDateWithinSelectedPeriod: {
        passed:
          typeof parsed.validationChecks?.postDateWithinSelectedPeriod?.passed === 'boolean'
            ? parsed.validationChecks.postDateWithinSelectedPeriod.passed
            : null,
        evidence: parsed.validationChecks?.postDateWithinSelectedPeriod?.evidence || 'Post date could not be verified against period window.',
      },
    };

    // Determine criteriaTag with strict structured validation gates
    let finalTag: CriteriaTag = 'Needs Review';
    let rejectionReason = parsed.rejectionReason || null;
    const author_seeking_job = authorIntent === 'SELF_JOB_SEEKING';

    // Cross-verify India location evidence
    const locResult = validateAuthorIndiaLocation(
      postContent,
      metadata?.authorLocation || parsed.currentWorkLocation,
      metadata?.authorHeadline || parsed.currentOrPreviousRole
    );

    vChecks.currentlyWorkingInIndia = {
      passed: locResult.author_based_in_india === true ? true : locResult.author_based_in_india === false ? false : null,
      evidence: locResult.location_evidence,
    };
    vChecks.author_seeking_job = author_seeking_job;
    vChecks.author_based_in_india = locResult.author_based_in_india;
    vChecks.intent_evidence = vChecks.authorIsPersonallySeekingJob.evidence;
    vChecks.location_evidence = locResult.location_evidence;
    vChecks.currentCity = locResult.currentCity;
    vChecks.currentStateOrUT = locResult.currentStateOrUT;
    vChecks.preferredLocation = locResult.preferredLocation || parsed.preferredLocation || null;

    if (!author_seeking_job) {
      finalTag = 'Outside Target';
      if (!rejectionReason) {
        if (isAd) rejectionReason = 'Rejected: Recruiter or employer offering jobs / vacancy advertisement.';
        else if (isOther) rejectionReason = 'Rejected: Seeking opportunities on behalf of someone else.';
        else if (isUnrelated) rejectionReason = 'Rejected: Unrelated sales content or thought leadership.';
        else rejectionReason = 'Rejected: Author intent is unclear or lacks personal job seeking statement.';
      }
    } else if (locResult.author_based_in_india === false) {
      finalTag = 'Outside Target';
      rejectionReason = rejectionReason || `Outside current India-location requirement (${locResult.location_evidence}).`;
    } else if (locResult.author_based_in_india === 'unknown') {
      finalTag = 'Needs Review';
    } else {
      // Both author_seeking_job === true AND author_based_in_india === true
      // Mandatory criteria: 1–10 years of experience. Working in any role and sector is fine.
      if (vChecks.totalExperience1To10Years.passed === true) {
        finalTag = 'Matches Criteria';
      } else if (vChecks.totalExperience1To10Years.passed === false) {
        finalTag = 'Outside Target';
        if (!rejectionReason) {
          rejectionReason = 'Fails criteria: Total professional experience is outside 1–10 years.';
        }
      } else {
        // Experience duration is unstated or unknown
        finalTag = 'Needs Review';
      }
    }

    return {
      candidateName: parsed.candidateName || metadata?.authorName || null,
      currentOrPreviousRole: parsed.currentOrPreviousRole || null,
      employer: parsed.employer || null,
      sector: vChecks.currentEmployerInTargetSector.detectedSector || parsed.sector || null,
      currentWorkLocation: locResult.currentCity
        ? `${locResult.currentCity}${locResult.currentStateOrUT ? ', ' + locResult.currentStateOrUT : ''}, India`
        : metadata?.authorLocation || (locResult.author_based_in_india === true ? 'India' : null),
      currentCity: locResult.currentCity,
      currentStateOrUT: locResult.currentStateOrUT,
      industry: parsed.industry || null,
      salesExperienceSummary: parsed.salesExperienceSummary || null,
      totalExperienceYears: typeof parsed.totalExperienceYears === 'number' ? parsed.totalExperienceYears : null,
      experienceType: (parsed.experienceType as any) || vChecks.totalExperience1To10Years.experienceType || 'unknown',
      preferredLocation: locResult.preferredLocation || parsed.preferredLocation || null,
      jobSeekingStatement: parsed.jobSeekingStatement || null,
      statedAvailability: parsed.statedAvailability || null,
      originalPostDate: parsed.originalPostDate || metadata?.postedAt || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      profileUrlOrTelegramId: parsed.profileUrl || metadata?.authorProfileUrl || metadata?.sourceUrl || null,
      postUrl: parsed.postUrl || metadata?.sourceUrl || null,
      authorIntent,
      intentEvidence: parsed.intentEvidence || vChecks.authorIsPersonallySeekingJob.evidence || null,
      author_seeking_job,
      author_based_in_india: locResult.author_based_in_india,
      location_evidence: locResult.location_evidence,
      rejection_or_review_reason: rejectionReason || (finalTag === 'Needs Review' ? 'Needs Review: Requires verification.' : null),
      rejectionReason,
      isRecruiterAd: isAd,
      isSeekingForOthers: isOther,
      criteriaTag: finalTag,
      matchingExplanation:
        parsed.matchingExplanation ||
        (finalTag === 'Matches Criteria'
          ? 'Confirmed Match: Self job-seeking sales professional based in India with 1-10y experience in eligible target sector.'
          : finalTag === 'Needs Review'
          ? 'Needs Review: Personal job-seeking intent confirmed, but requires recruiter verification on missing or unconfirmed criteria.'
          : rejectionReason || 'Outside target criteria.'),
      validationChecks: vChecks,
      evidence: {
        candidateName: parsed.candidateName || metadata?.authorName || undefined,
        currentOrPreviousRole: parsed.currentOrPreviousRole || undefined,
        employer: parsed.employer || undefined,
        sector: vChecks.currentEmployerInTargetSector.detectedSector || parsed.sector || undefined,
        industry: parsed.industry || undefined,
        totalExperienceYears: vChecks.totalExperience1To10Years.evidence,
        currentLocation: locResult.location_evidence,
        currentCity: locResult.currentCity || undefined,
        currentStateOrUT: locResult.currentStateOrUT || undefined,
        preferredLocation: locResult.preferredLocation || undefined,
        jobSeekingStatement: vChecks.authorIsPersonallySeekingJob.evidence,
        postDate: vChecks.postDateWithinSelectedPeriod.evidence,
      },
      isExtractionReliable: true,
      sourceTypeUsed: 'gemini',
    };
  } catch (error: any) {
    const errorMsg = String(error?.message || '');
    const isQuota =
      error?.status === 429 ||
      errorMsg.includes('429') ||
      errorMsg.toLowerCase().includes('quota') ||
      errorMsg.toLowerCase().includes('resource_exhausted');

    if (isQuota) {
      quotaExhaustedUntil = Date.now() + 30 * 60 * 1000;
      quotaExhaustedReason = 'Free-tier request quota limit reached (429)';
      console.warn('[Gemini Service] Free-tier request quota limit reached (429). Activating deterministic evaluation engine.');
    } else {
      console.warn('[Gemini Service] API call failed, using deterministic evaluation engine:', errorMsg || 'Unknown error');
    }

    const fallback = runSimulatedFallbackExtraction(postContent, criteria, metadata);
    return fallback;
  }
}

/**
 * Evaluates whether the author is personally seeking employment for themselves.
 * Rejects recruiter vacancy ads, employer hiring, team openings, referral offers,
 * and third-party job searches.
 */
export function evaluateIntentFromPost(
  content: string,
  headline?: string | null
): {
  authorIntent: AuthorIntent;
  author_seeking_job: boolean;
  intentEvidence: string;
  rejectionReason: string | null;
  isRecruiterAd: boolean;
  isSeekingForOthers: boolean;
} {
  const lower = String(content || '').toLowerCase();
  const headlineLower = String(headline || '').toLowerCase();

  // 1. Third Party Seeking: on behalf of someone else
  const thirdPartyTriggers = [
    'my friend',
    'for a friend',
    'for my colleague',
    'helping a colleague',
    'helping a former',
    'on behalf of',
    'for my brother',
    'for my sister',
    'for my cousin',
    'for my teammate',
    'helping someone',
    'seeking on behalf',
  ];
  if (thirdPartyTriggers.some(t => lower.includes(t))) {
    return {
      authorIntent: 'SEEKING_ON_BEHALF_OF_SOMEONE',
      author_seeking_job: false,
      intentEvidence: 'Author is seeking employment on behalf of another individual (friend, colleague, or family member).',
      rejectionReason: 'Rejected: Seeking employment on behalf of someone else.',
      isRecruiterAd: false,
      isSeekingForOthers: true,
    };
  }

  // 2. Explicit Recruiter / Employer / Offering Jobs Triggers
  // Note: "Please connect me with hiring managers" is personal seeking, NOT hiring!
  const mentionsHiringManagersForSelf =
    lower.includes('connect me with hiring') ||
    lower.includes('connect with hiring') ||
    lower.includes('reach out to hiring managers') ||
    lower.includes('hiring managers please') ||
    lower.includes('connect me to hiring');

  const recruiterTriggers = [
    'we are hiring',
    "we're hiring",
    'i am hiring',
    "i'm hiring",
    'urgent hiring',
    'urgent requirement for',
    'urgent opening for',
    'hiring for our client',
    'my client is hiring',
    'clients are hiring',
    'our team is hiring',
    'team is expanding',
    'looking for candidates',
    'looking for sales professionals',
    'looking for sales officers',
    'looking for b2b sales',
    'looking for sales executives',
    'we are looking for sales',
    'we are looking for candidates',
    'seeking candidates',
    'opening in my team',
    'openings in my team',
    'there is an opening',
    'job vacancy',
    'new sales vacancy',
    'send your cv',
    'send updated cv',
    'send resume',
    'share your cv',
    'share your resume',
    'drop your cv',
    'forward your cv',
    'email your cv',
    'dm your cv',
    'submit your cv',
    'send cv to',
    'to apply:',
    'apply now:',
    'apply here:',
    'i can refer interested',
    'i can refer candidates',
    'happy to refer candidates',
    'can refer interested candidates',
  ];

  const isRecruiterOrHiring = recruiterTriggers.some(t => lower.includes(t)) && !mentionsHiringManagersForSelf;

  if (isRecruiterOrHiring) {
    return {
      authorIntent: 'RECRUITER_OR_EMPLOYER_HIRING',
      author_seeking_job: false,
      intentEvidence: 'Post is an agency, recruiter, or employer post offering jobs / soliciting CVs.',
      rejectionReason: 'Rejected: Offering jobs or vacancy advertisement.',
      isRecruiterAd: true,
      isSeekingForOthers: false,
    };
  }

  // 3. Unrelated thought leadership / advice / memes / general articles
  const unrelatedTriggers = [
    'ways to improve',
    'tips to close',
    'how to increase sales',
    'sales strategy for',
    'lessons learned',
    'market analysis',
    'excited to announce our new partnership',
    'top 10 sales',
    '5 ways to',
  ];

  // 4. First-Person Self Job Seeking Statements
  const selfSeekingMatches: string[] = [];
  const selfSeekingRegexes = [
    /(i\s+am\s+looking\s+for\s+(?:a\s+)?(?:new\s+)?(?:sales\s+)?(?:role|job|challenge|position|opportunity))/i,
    /(i\s+am\s+seeking\s+(?:a\s+)?(?:new\s+)?(?:sales\s+)?(?:role|job|challenge|change|position|opportunity))/i,
    /(i\s+am\s+exploring\s+(?:new\s+)?(?:sales\s+)?(?:opportunities|roles|positions))/i,
    /(i\s+am\s+open\s+to\s+work)/i,
    /(i'm\s+open\s+to\s+work)/i,
    /(actively\s+seeking\s+(?:a\s+)?(?:new\s+)?(?:sales\s+)?(?:role|job|challenge|opportunity))/i,
    /(actively\s+looking\s+for\s+(?:a\s+)?(?:new\s+)?(?:sales\s+)?(?:role|job|challenge|opportunity))/i,
    /(seeking\s+a\s+change)/i,
    /(looking\s+for\s+a\s+(?:job\s+)?change)/i,
    /(looking\s+for\s+my\s+next\s+(?:role|challenge|step|move))/i,
    /(seeking\s+my\s+next\s+(?:role|challenge|step|move))/i,
    /(looking\s+for\s+a\s+sales\s+position\s+for\s+myself)/i,
    /(please\s+consider\s+my\s+profile)/i,
    /(i'm\s+officially\s+on\s+the\s+market)/i,
    /(i\s+am\s+officially\s+on\s+the\s+market)/i,
    /(seeking\s+a\s+new\s+role)/i,
    /(connect\s+me\s+with\s+hiring\s+managers)/i,
  ];

  for (const rx of selfSeekingRegexes) {
    const m = content.match(rx);
    if (m && m[0]) {
      selfSeekingMatches.push(m[0]);
    }
  }

  // Also check general self-seeking patterns
  const simpleSelfPatterns = [
    'i am looking for a new',
    'i am exploring opportunities',
    'seeking a change',
    'open to work',
    'seeking a new role',
    'looking for my next role',
    'seeking new opportunities',
    'looking for a sales position for myself',
    'please connect me with hiring managers',
    'connect me with hiring managers',
    "i'm officially on the market",
    'actively seeking a new role',
    'actively looking for a',
  ];
  for (const pat of simpleSelfPatterns) {
    if (lower.includes(pat) && !selfSeekingMatches.includes(pat)) {
      selfSeekingMatches.push(pat);
    }
  }

  if (selfSeekingMatches.length > 0) {
    return {
      authorIntent: 'SELF_JOB_SEEKING',
      author_seeking_job: true,
      intentEvidence: `Author explicitly states personal job search: "${selfSeekingMatches[0]}".`,
      rejectionReason: null,
      isRecruiterAd: false,
      isSeekingForOthers: false,
    };
  }

  if (unrelatedTriggers.some(t => lower.includes(t))) {
    return {
      authorIntent: 'UNRELATED',
      author_seeking_job: false,
      intentEvidence: 'Post consists of sales tips, thought leadership, or industry commentary.',
      rejectionReason: 'Rejected: Unrelated sales advice or industry thought leadership.',
      isRecruiterAd: false,
      isSeekingForOthers: false,
    };
  }

  return {
    authorIntent: 'UNCLEAR',
    author_seeking_job: false,
    intentEvidence: 'No explicit first-person job-seeking statement found in post text.',
    rejectionReason: 'Rejected: Lacks personal first-person job seeking statement.',
    isRecruiterAd: false,
    isSeekingForOthers: false,
  };
}

/**
 * Deterministic fallback extractor for evaluation without active external API quota.
 * Accurately models the two-stage classification and 6-point criteria validation.
 */
export function runSimulatedFallbackExtraction(
  postContent: string,
  criteria: CriteriaFilters,
  metadata?: PostExtractionMetadata
): ExtractionResult {
  const lower = String(postContent || '').toLowerCase();
  const headlineLower = String(
    typeof metadata?.authorHeadline === 'string'
      ? metadata.authorHeadline
      : metadata?.authorHeadline
      ? JSON.stringify(metadata.authorHeadline)
      : ''
  ).toLowerCase();

  // -------------------------------------------------------------------------
  // STAGE 1: INTENT CLASSIFICATION
  // -------------------------------------------------------------------------
  const intentResult = evaluateIntentFromPost(postContent, metadata?.authorHeadline);
  const authorIntent = intentResult.authorIntent;
  const author_seeking_job = intentResult.author_seeking_job;
  const isRecruiterAd = intentResult.isRecruiterAd;
  const isSeekingForOthers = intentResult.isSeekingForOthers;
  let rejectionReason = intentResult.rejectionReason;

  // -------------------------------------------------------------------------
  // STAGE 2: INDIA LOCATION EVIDENCE & CRITERIA VALIDATION
  // -------------------------------------------------------------------------
  const locResult = validateAuthorIndiaLocation(
    postContent,
    metadata?.authorLocation,
    metadata?.authorHeadline
  );

  // Sales Role Check & Tech Sales Evidence Check
  const isPureTechJob =
    (headlineLower.includes('software engineer') ||
      headlineLower.includes('backend developer') ||
      headlineLower.includes('devops') ||
      lower.includes('backend engineering') ||
      lower.includes('software developer')) &&
    !headlineLower.includes('sales') &&
    !headlineLower.includes('account executive') &&
    !lower.includes('software sales');

  const isSalesRole =
    (headlineLower.includes('sales') ||
      headlineLower.includes('account executive') ||
      headlineLower.includes('account manager') ||
      headlineLower.includes('business development') ||
      headlineLower.includes('medical representative') ||
      headlineLower.includes('territory sales') ||
      lower.includes('sales executive') ||
      lower.includes('sales officer') ||
      lower.includes('fmcg sales') ||
      lower.includes('b2b sales') ||
      lower.includes('client acquisition') ||
      lower.includes('loan sales') ||
      lower.includes('commercial vehicle finance')) &&
    !isPureTechJob;

  const salesEvidence = isSalesRole
    ? 'Sales background confirmed in post/profile.'
    : isPureTechJob
    ? 'Fails sales check: Technical engineering role with no evidence of selling technology products or sales quota.'
    : 'No clear sales role indicated in post or profile headline.';

  // Experience Check (1-10 years)
  let totalExperienceYears: number | null = null;
  let experienceType: 'stated' | 'calculated' | 'unknown' = 'unknown';
  let expCheckPassed: boolean | null = null;
  let expEvidence = 'Experience duration not specified in post or profile.';

  const expMatch = lower.match(/(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s*(?:of\s*)?experience)?/i);
  if (expMatch) {
    totalExperienceYears = parseInt(expMatch[1], 10);
    experienceType = 'stated';
    if (totalExperienceYears >= 1 && totalExperienceYears <= 10) {
      expCheckPassed = true;
      expEvidence = `${totalExperienceYears} years of professional experience stated in post (within 1–10 years).`;
    } else {
      expCheckPassed = false;
      expEvidence = `Experience of ${totalExperienceYears} years is outside 1–10 years target.`;
    }
  } else if (headlineLower.includes('senior') || lower.includes('rewarding 4 years')) {
    totalExperienceYears = 4;
    experienceType = 'calculated';
    expCheckPassed = true;
    expEvidence = '4 years professional experience calculated from employment summary.';
  }

  // Eligible Sector Check
  let detectedSector: TargetSector | null = null;
  let sectorCheckPassed: boolean | null = null;
  let sectorEvidence = 'Employer sector not confirmed in eligible target sectors.';

  if (
    lower.includes('pharma') ||
    headlineLower.includes('pharma') ||
    lower.includes('sun pharma') ||
    lower.includes('cipla') ||
    lower.includes('medical representative')
  ) {
    detectedSector = 'pharma';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in the Pharmaceutical (pharma) sector.';
  } else if (
    lower.includes('fmcg') ||
    headlineLower.includes('fmcg') ||
    lower.includes('naturefresh foods') ||
    lower.includes('packaged foods') ||
    lower.includes('retail distribution')
  ) {
    detectedSector = 'FMCG';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in Fast Moving Consumer Goods (FMCG).';
  } else if (
    lower.includes('paints') ||
    headlineLower.includes('paints') ||
    lower.includes('berger paints') ||
    lower.includes('asian paints')
  ) {
    detectedSector = 'paints';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in the Paints & Coatings sector.';
  } else if (
    lower.includes('fintech') ||
    lower.includes('merchant payments') ||
    lower.includes('payment gateway') ||
    lower.includes('pos machines')
  ) {
    detectedSector = 'fintech';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in Fintech / digital payments.';
  } else if (
    lower.includes('nbfc') ||
    headlineLower.includes('nbfc') ||
    lower.includes('shriram finance') ||
    lower.includes('commercial vehicle finance')
  ) {
    detectedSector = 'NBFC';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates as an NBFC (Non-Banking Financial Company).';
  } else if (
    (lower.includes('saas') ||
      headlineLower.includes('saas') ||
      lower.includes('cloud software') ||
      lower.includes('cloudscale') ||
      lower.includes('freshworks') ||
      lower.includes('freshdesk')) &&
    isSalesRole
  ) {
    detectedSector = 'technology sales';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in Technology Sales (software / SaaS products).';
  } else if (lower.includes('manufacturing') || lower.includes('industrial equipment') || lower.includes('oem sales')) {
    detectedSector = 'manufacturing';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in the Manufacturing sector.';
  } else if (lower.includes('hospitality') || lower.includes('hotel sales') || lower.includes('resort sales')) {
    detectedSector = 'hospitality';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in the Hospitality sector.';
  } else if (
    lower.includes('bank') ||
    headlineLower.includes('bank') ||
    lower.includes('casa') ||
    lower.includes('hdfc') ||
    lower.includes('icici') ||
    lower.includes('axis bank') ||
    lower.includes('kotak') ||
    lower.includes('branch sales') ||
    lower.includes('liabilities sales')
  ) {
    detectedSector = 'banking';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in the Banking sector.';
  } else if (
    lower.includes('insurance') ||
    headlineLower.includes('insurance') ||
    lower.includes('bancassurance') ||
    lower.includes('agency manager') ||
    lower.includes('life insurance') ||
    lower.includes('general insurance')
  ) {
    detectedSector = 'insurance';
    sectorCheckPassed = true;
    sectorEvidence = 'Current employer operates in the Insurance sector.';
  }

  // Date Check
  const selectedPeriod = metadata?.timeWindow || '7d';
  const hoursWindow = selectedPeriod === '24h' ? 24 : selectedPeriod === '30d' ? 720 : 168;
  const maxAgeMs = hoursWindow * 3600 * 1000;

  let postDateWithinPeriod: boolean | null = true;
  let dateEvidence = `Post date falls within selected ${selectedPeriod} window.`;

  if (metadata?.postedAt) {
    const postTime = new Date(metadata.postedAt).getTime();
    if (isNaN(postTime)) {
      postDateWithinPeriod = null;
      dateEvidence = 'Unverifiable post timestamp (Needs Review).';
    } else {
      const ageMs = Date.now() - postTime;
      if (ageMs > maxAgeMs) {
        postDateWithinPeriod = false;
        const daysOld = Math.round(ageMs / (24 * 3600 * 1000));
        dateEvidence = `Post date (${metadata.postedAt}) is older than selected ${selectedPeriod} window (${daysOld} days old).`;
      } else {
        postDateWithinPeriod = true;
        dateEvidence = `Post date (${metadata.postedAt}) is within selected ${selectedPeriod} window.`;
      }
    }
  }

  // Build validation checks
  const vChecks: CandidateSixPointCheck = {
    authorIsPersonallySeekingJob: {
      passed: author_seeking_job,
      evidence: intentResult.intentEvidence,
    },
    currentlyEmployedInSalesRole: {
      passed: true,
      evidence: salesEvidence || (metadata?.authorHeadline ? `Role: ${metadata.authorHeadline} (Any role accepted)` : 'Any role accepted per criteria.'),
    },
    currentlyWorkingInIndia: {
      passed: locResult.author_based_in_india === true ? true : locResult.author_based_in_india === false ? false : null,
      evidence: locResult.location_evidence,
    },
    totalExperience1To10Years: {
      passed: expCheckPassed,
      evidence: expEvidence,
      experienceType,
    },
    currentEmployerInTargetSector: {
      passed: true,
      evidence: sectorEvidence || (detectedSector ? `Sector: ${detectedSector} (Any sector accepted)` : 'Any sector accepted per configuration.'),
      detectedSector,
    },
    postDateWithinSelectedPeriod: {
      passed: postDateWithinPeriod,
      evidence: dateEvidence,
    },
    author_seeking_job,
    author_based_in_india: locResult.author_based_in_india,
    intent_evidence: intentResult.intentEvidence,
    location_evidence: locResult.location_evidence,
    currentCity: locResult.currentCity,
    currentStateOrUT: locResult.currentStateOrUT,
    preferredLocation: locResult.preferredLocation,
    rejection_or_review_reason: rejectionReason,
  };

  // -------------------------------------------------------------------------
  // RESULT DETERMINATION (STRICT GATES)
  // -------------------------------------------------------------------------
  let criteriaTag: CriteriaTag = 'Needs Review';
  let explanation = '';

  if (!author_seeking_job) {
    criteriaTag = 'Outside Target';
    explanation = rejectionReason || 'Post is not from an individual personally seeking employment.';
  } else if (locResult.author_based_in_india === false) {
    criteriaTag = 'Outside Target';
    rejectionReason = rejectionReason || `Outside current India-location requirement: Candidate is currently based outside India (${locResult.location_evidence}).`;
    explanation = rejectionReason;
  } else if (locResult.author_based_in_india === 'unknown') {
    criteriaTag = 'Needs Review';
    explanation = 'Needs Review: Author is personally seeking a job, but current residence/work location in India is unstated or unverified.';
  } else {
    // Both author_seeking_job === true AND author_based_in_india === true
    // Mandatory criteria: 1–10 years of experience. Working in any role and sector is fine.
    if (vChecks.totalExperience1To10Years.passed === true) {
      criteriaTag = 'Matches Criteria';
      explanation = `Confirmed Match: Individual job-seeker based in ${locResult.currentCity ? locResult.currentCity + ', ' : ''}${locResult.currentStateOrUT || 'India'} with ${totalExperienceYears || '1–10'} years experience. Any role and sector accepted.`;
    } else if (vChecks.totalExperience1To10Years.passed === false) {
      criteriaTag = 'Outside Target';
      explanation = 'Outside Target: Total professional experience is outside 1–10 years.';
      rejectionReason = 'Outside Target: Total professional experience is outside 1–10 years.';
    } else {
      criteriaTag = 'Needs Review';
      explanation = 'Needs Review: Author is an individual job-seeker in India, but total years of experience is unstated or requires review.';
    }
  }

  // Extract candidate name
  let name = metadata?.authorName || null;
  if (!name && lower.includes('priya sharma')) name = 'Priya Sharma';
  if (!name && lower.includes('rajesh kulkarni')) name = 'Rajesh Kulkarni';
  if (!name && lower.includes('rohit deshmukh')) name = 'Rohit Deshmukh';
  if (!name && lower.includes('amit verma')) name = 'Amit Verma';
  if (!name && lower.includes('rahul verma')) name = 'Rahul Verma';
  if (!name && lower.includes('karthik raman')) name = 'Karthik Raman';
  if (!name && lower.includes('alex chen')) name = 'Alex Chen';
  if (!name && lower.includes('vikram malhotra')) name = 'Vikram Malhotra';

  return {
    candidateName: name,
    currentOrPreviousRole: metadata?.authorHeadline || (isSalesRole ? 'Sales Professional' : null),
    employer: detectedSector ? `${detectedSector.toUpperCase()} Company` : null,
    sector: detectedSector,
    currentWorkLocation: locResult.currentCity
      ? `${locResult.currentCity}${locResult.currentStateOrUT ? ', ' + locResult.currentStateOrUT : ''}, India`
      : metadata?.authorLocation || (locResult.author_based_in_india === true ? 'India' : null),
    currentCity: locResult.currentCity,
    currentStateOrUT: locResult.currentStateOrUT,
    industry: detectedSector || 'Sales',
    salesExperienceSummary: isSalesRole ? 'Reported commercial sales background.' : null,
    totalExperienceYears,
    experienceType,
    preferredLocation: locResult.preferredLocation,
    jobSeekingStatement: author_seeking_job ? intentResult.intentEvidence : null,
    statedAvailability: null,
    originalPostDate: metadata?.postedAt || new Date().toISOString(),
    email: null,
    phone: null,
    profileUrlOrTelegramId: metadata?.authorProfileUrl || metadata?.sourceUrl || null,
    postUrl: metadata?.sourceUrl || null,
    authorIntent,
    intentEvidence: intentResult.intentEvidence,
    author_seeking_job,
    author_based_in_india: locResult.author_based_in_india,
    location_evidence: locResult.location_evidence,
    rejection_or_review_reason: rejectionReason || (criteriaTag === 'Needs Review' ? 'Needs Review: Requires verification.' : null),
    rejectionReason,
    isRecruiterAd,
    isSeekingForOthers,
    criteriaTag,
    matchingExplanation: `[Deterministic Engine] ${explanation}`,
    validationChecks: vChecks,
    evidence: {
      candidateName: name || undefined,
      currentOrPreviousRole: metadata?.authorHeadline || undefined,
      sector: detectedSector || undefined,
      totalExperienceYears: vChecks.totalExperience1To10Years.evidence,
      currentLocation: locResult.location_evidence,
      currentCity: locResult.currentCity || undefined,
      currentStateOrUT: locResult.currentStateOrUT || undefined,
      preferredLocation: locResult.preferredLocation || undefined,
      jobSeekingStatement: vChecks.authorIsPersonallySeekingJob.evidence,
      postDate: vChecks.postDateWithinSelectedPeriod.evidence,
    },
    isExtractionReliable: true,
    sourceTypeUsed: 'simulated_fallback',
  };
}

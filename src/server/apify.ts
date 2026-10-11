/**
 * Apify Integration for harvestapi/linkedin-post-search Actor
 * 
 * Provider Input Schema:
 * - searchQueries: string[] (Required. Each query max 500 chars and <= 5 Boolean operators)
 * - postedLimit: "any" | "1h" | "24h" | "week" | "month" | "3months" | "6months" | "year"
 * - sortBy: "relevance" | "date"
 * - maxPosts: integer
 * - profileScraperMode: "main" | "full" | "none"
 * - scrapeComments: boolean
 * - scrapeReactions: boolean
 */

import { AppErrorDetails } from '../types/index.ts';

export interface ApifySearchParams {
  timeWindow?: '24h' | '7d' | string;
  limit?: number;
  useSmallTestQuery?: boolean;
  customQuery?: string;
  searchQueries?: string[];
}

export interface ApifyPostItem {
  id?: string;
  urn?: string;
  url?: string;
  linkedinUrl?: string;
  text?: string;
  content?: string;
  postedAt?: string;
  postedAtISO?: string;
  publishedAt?: string;
  author?: {
    id?: string;
    name?: string;
    headline?: string;
    tagline?: string;
    info?: string;
    linkedinUrl?: string;
    url?: string;
    location?: string;
    locations?: string[] | string;
    geographicArea?: string;
    currentPosition?: string;
    experience?: any[];
    education?: any[];
    skills?: any[];
  };
  [key: string]: any;
}

export class ApifyApiError extends Error {
  errorDetails: AppErrorDetails;
  constructor(details: AppErrorDetails) {
    super(details.message || 'Apify API Error');
    this.name = 'ApifyApiError';
    this.errorDetails = details;
  }
}

export interface ApifyDiagnostics {
  isConfigured: boolean;
  rawPresent: boolean;
  isPlaceholder: boolean;
  hasValidPrefix: boolean;
  keySource: string;
  maskedSample?: string;
  message: string;
  remedy: string;
}

export function getApifyToken(): string | null {
  const token =
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_TOKEN ||
    process.env.APIFY_API_KEY ||
    process.env.APIFY_KEY;

  if (!token) return null;
  const trimmed = token.trim();
  const placeholders = [
    'MY_APIFY_API_TOKEN',
    'MY_APIFY_TOKEN',
    'YOUR_APIFY_API_TOKEN',
    'YOUR_APIFY_TOKEN',
    'INSERT_APIFY_TOKEN_HERE',
    '<APIFY_API_TOKEN>',
    'apify_api_token_here',
  ];

  if (trimmed === '' || placeholders.includes(trimmed)) {
    return null;
  }
  return trimmed;
}

export function isApifyConfigured(): boolean {
  return Boolean(getApifyToken());
}

export function getApifyDiagnostics(): ApifyDiagnostics {
  const raw =
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_TOKEN ||
    process.env.APIFY_API_KEY ||
    process.env.APIFY_KEY ||
    '';

  const trimmed = raw.trim();
  const rawPresent = trimmed.length > 0;
  const isPlaceholder =
    trimmed === 'MY_APIFY_API_TOKEN' ||
    trimmed === 'MY_APIFY_TOKEN' ||
    trimmed === 'YOUR_APIFY_API_TOKEN' ||
    trimmed === 'YOUR_APIFY_TOKEN' ||
    trimmed === 'INSERT_APIFY_TOKEN_HERE' ||
    trimmed === '<APIFY_API_TOKEN>' ||
    trimmed === 'apify_api_token_here';

  const validToken = getApifyToken();
  const hasValidPrefix = Boolean(validToken && validToken.startsWith('apify_api_'));

  let keySource = 'process.env.APIFY_API_TOKEN';
  if (process.env.APIFY_TOKEN) keySource = 'process.env.APIFY_TOKEN';
  else if (process.env.APIFY_API_KEY) keySource = 'process.env.APIFY_API_KEY';
  else if (process.env.APIFY_KEY) keySource = 'process.env.APIFY_KEY';

  if (!rawPresent) {
    return {
      isConfigured: false,
      rawPresent: false,
      isPlaceholder: false,
      hasValidPrefix: false,
      keySource,
      message: 'APIFY_API_TOKEN secret is not set in AI Studio Secrets.',
      remedy:
        'In AI Studio, click on Settings > Secrets. Add a secret with Key: APIFY_API_TOKEN and Value: your personal Apify token from https://console.apify.com/account/integrations (starts with "apify_api_").',
    };
  }

  if (isPlaceholder) {
    return {
      isConfigured: false,
      rawPresent: true,
      isPlaceholder: true,
      hasValidPrefix: false,
      keySource,
      maskedSample: trimmed,
      message: `APIFY_API_TOKEN is currently set to placeholder value "${trimmed}".`,
      remedy:
        'The secret currently holds the placeholder string "MY_APIFY_API_TOKEN" rather than your real Apify API token. Go to AI Studio Settings > Secrets, edit APIFY_API_TOKEN, and replace "MY_APIFY_API_TOKEN" with your real token from https://console.apify.com/account/integrations (starts with "apify_api_...").',
    };
  }

  return {
    isConfigured: true,
    rawPresent: true,
    isPlaceholder: false,
    hasValidPrefix,
    keySource,
    maskedSample: `${trimmed.slice(0, 10)}...${trimmed.slice(-4)}`,
    message: hasValidPrefix
      ? 'Apify API token configured with valid format (starts with "apify_api_").'
      : 'Apify API token configured (custom format).',
    remedy: 'Token is active.',
  };
}

/**
 * Validates Apify token credentials against Apify user endpoint without consuming actor compute units
 */
export async function verifyApifyCredentials(): Promise<{
  success: boolean;
  username?: string;
  email?: string;
  plan?: string;
  error?: string;
  statusCode?: number;
}> {
  const token = getApifyToken();
  if (!token) {
    const diag = getApifyDiagnostics();
    return {
      success: false,
      error: diag.message,
      statusCode: 400,
    };
  }

  try {
    const res = await fetch('https://api.apify.com/v2/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed = errText;
      try {
        const json = JSON.parse(errText);
        parsed = json.error?.message || json.message || errText;
      } catch {}

      return {
        success: false,
        error: `Apify authentication error (HTTP ${res.status}): ${parsed}`,
        statusCode: res.status,
      };
    }

    const data = await res.json();
    return {
      success: true,
      username: data.data?.username,
      email: data.data?.email,
      plan: data.data?.plan?.id || data.data?.plan?.name || 'Active',
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error connecting to Apify: ${err.message}`,
      statusCode: 500,
    };
  }
}

/**
 * Maps UI time interval values to Apify harvestapi/linkedin-post-search allowed enum values:
 * "7d" -> "week"
 * "24h" -> "24h"
 * Never passes internal UI string values like "7d" directly to provider.
 */
export function mapTimeToPostedLimit(timeWindow?: string): '24h' | 'week' {
  if (!timeWindow) return 'week';
  const clean = String(timeWindow).trim().toLowerCase();
  if (clean === '24h' || clean === '1d' || clean === 'day' || clean === 'today' || clean === '24') {
    return '24h';
  }
  // All 7-day or week options strictly map to "week"
  return 'week';
}

export const DEFAULT_EXPANDED_SEARCH_QUERIES: string[] = [
  '("I am looking for" OR "currently exploring opportunities") AND "India"',
  '("actively looking for" OR "seeking new opportunities") AND "India"',
  '("open to work" OR "seeking my next role") AND ("years experience" OR "yrs exp")',
  '("looking for a new job" OR "exploring new roles") AND "India"',
  '("career opportunities" OR "immediate joiner") AND ("open to work" OR "resume")',
  '("sales" OR "operations" OR "developer" OR "marketing" OR "finance") AND "open to work"',
  '("open to work" OR "seeking opportunities") AND ("email" OR "phone" OR "mobile" OR "contact")',
];

export const DEFAULT_FOCUSED_SEARCH_QUERIES: string[] = DEFAULT_EXPANDED_SEARCH_QUERIES;

export async function fetchLinkedInPostsViaApify(
  params: ApifySearchParams,
  onProgress?: (message: string) => void
): Promise<ApifyPostItem[]> {
  const token = getApifyToken();

  if (!token) {
    const diag = getApifyDiagnostics();
    throw new Error(`SETUP_REQUIRED: ${diag.message} ${diag.remedy}`);
  }

  // 1. Map UI's timeWindow ("7d" -> "week", "24h" -> "24h")
  const postedLimit = mapTimeToPostedLimit(params.timeWindow);

  // 2. Ensure maxPosts is strictly an integer
  const maxPosts = Math.max(1, Math.min(Math.floor(Number(params.limit) || 20), 100));

  // 3. Search queries: Multiple focused searches combining sales roles with job-seeking phrases
  let searchQueries: string[];
  if (params.useSmallTestQuery) {
    // Verified small test request query as documented
    searchQueries = ['sales AND "open to work"'];
  } else if (params.searchQueries && params.searchQueries.length > 0) {
    searchQueries = params.searchQueries;
  } else if (params.customQuery && params.customQuery.trim()) {
    searchQueries = [params.customQuery.trim()];
  } else {
    searchQueries = DEFAULT_FOCUSED_SEARCH_QUERIES;
  }

  // Documented provider input schema
  const actorInput: Record<string, any> = {
    searchQueries,
    postedLimit,
    sortBy: 'date',
    maxPosts,
    profileScraperMode: 'main',
    scrapeComments: false,
    scrapeReactions: false,
  };

  onProgress?.(`Starting Apify harvestapi/linkedin-post-search (postedLimit: "${postedLimit}", maxPosts: ${maxPosts}, sortBy: "date")...`);

  // Start Actor Run via Apify REST API
  let startResponse: globalThis.Response;
  try {
    startResponse = await fetch(
      'https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/runs',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.trim()}`,
        },
        body: JSON.stringify(actorInput),
      }
    );
  } catch (netErr: any) {
    throw new Error(`Network failure connecting to Apify API: ${netErr.message}`);
  }

  if (!startResponse.ok) {
    let parsedBody: any;
    const rawText = await startResponse.text();
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }

    const msg = typeof parsedBody === 'object' ? parsedBody?.error?.message || parsedBody?.message || '' : String(parsedBody);
    let rejectedField: string | undefined;
    let remedy: string | undefined;

    if (msg.includes('Field input.postedLimit') || msg.includes('postedLimit')) {
      rejectedField = 'input.postedLimit';
      remedy = 'The provider only accepts "any", "1h", "24h", "week", "month", "3months", "6months", "year". UI value "7d" must be mapped to "week".';
    } else if (msg.includes('Field input.maxPosts') || msg.includes('maxPosts')) {
      rejectedField = 'input.maxPosts';
      remedy = 'Field input.maxPosts must be an integer, not a string or decimal.';
    } else if (msg.includes('Field input.searchQueries') || msg.includes('searchQueries')) {
      rejectedField = 'input.searchQueries';
      remedy = 'searchQueries must be an array of strings, max 500 chars and <= 5 Boolean operators per query.';
    }

    // Build expandable, sanitized error details (NO TOKEN EXPOSED)
    const errDetails: AppErrorDetails = {
      outgoingPayload: actorInput,
      httpStatus: startResponse.status,
      statusText: startResponse.statusText,
      responseBody: parsedBody,
      rejectedField,
      remedy,
      timestamp: new Date().toISOString(),
      message: `Apify harvestapi/linkedin-post-search failed with HTTP ${startResponse.status} (${startResponse.statusText}): ${
        typeof parsedBody === 'object' ? JSON.stringify(parsedBody) : parsedBody
      }`,
    };

    throw new ApifyApiError(errDetails);
  }

  const runData = await startResponse.json();
  const runId = runData.data?.id;
  const defaultDatasetId = runData.data?.defaultDatasetId;

  if (!runId || !defaultDatasetId) {
    throw new Error('Apify API response missing run ID or defaultDatasetId.');
  }

  onProgress?.(`Apify run started (Run ID: ${runId}). Scraping posts with enriched author profiles...`);

  // Poll for completion (up to 180s)
  const maxPolls = 60;
  const pollIntervalMs = 3000;
  let isFinished = false;
  let finalStatus = 'RUNNING';

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollIntervalMs));

    const pollResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}`,
      {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
        },
      }
    );

    if (!pollResponse.ok) {
      continue;
    }

    const pollData = await pollResponse.json();
    finalStatus = pollData.data?.status;

    if (finalStatus === 'SUCCEEDED') {
      isFinished = true;
      break;
    }

    if (finalStatus === 'FAILED' || finalStatus === 'ABORTED' || finalStatus === 'TIMED-OUT') {
      throw new Error(`Apify Actor execution ended with status: ${finalStatus}. Error: ${pollData.data?.statusMessage || 'Actor failed'}`);
    }

    onProgress?.(`Harvesting posts from LinkedIn via Apify... (${(i + 1) * 3}s elapsed, status: ${finalStatus})`);
  }

  if (!isFinished) {
    throw new Error('Apify Actor execution timed out after 180 seconds. Try reducing the maxPosts count.');
  }

  onProgress?.('Fetching parsed post items and author profiles from Apify dataset...');

  // Fetch dataset items
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?clean=true`,
    {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
      },
    }
  );

  if (!datasetResponse.ok) {
    throw new Error(`Failed to retrieve dataset items from Apify (HTTP ${datasetResponse.status})`);
  }

  const items = await datasetResponse.json();
  if (!Array.isArray(items)) {
    return [];
  }

  onProgress?.(`Successfully retrieved ${items.length} LinkedIn posts with author profiles.`);
  return items;
}

/**
 * Small 5-post verification test request
 */
export async function runApifySmallVerificationTest(
  onProgress?: (message: string) => void
): Promise<{ success: boolean; itemCount: number; samplePost: any; payloadSent: any }> {
  const items = await fetchLinkedInPostsViaApify(
    {
      timeWindow: '7d',
      limit: 5,
      useSmallTestQuery: true,
    },
    onProgress
  );

  return {
    success: true,
    itemCount: items.length,
    samplePost: items[0] || null,
    payloadSent: {
      searchQueries: ['sales AND "open to work"'],
      postedLimit: 'week',
      sortBy: 'date',
      maxPosts: 5,
      profileScraperMode: 'main',
      scrapeComments: false,
      scrapeReactions: false,
    },
  };
}

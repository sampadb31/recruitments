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
  timeWindow?: '24h' | '7d' | '30d' | string;
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

export function isApifyConfigured(): boolean {
  const token = process.env.APIFY_API_TOKEN;
  return Boolean(token && token !== 'MY_APIFY_API_TOKEN' && token.trim() !== '');
}

/**
 * Maps UI time interval values to Apify harvestapi/linkedin-post-search allowed enum values:
 * "7d" -> "week"
 * "24h" -> "24h"
 * "30d" -> "month"
 * Never passes internal UI string values directly to provider.
 */
export function mapTimeToPostedLimit(timeWindow?: string): '24h' | 'week' | 'month' {
  if (!timeWindow) return 'week';
  const clean = String(timeWindow).trim().toLowerCase();
  if (clean === '24h' || clean === '1d' || clean === 'day' || clean === 'today' || clean === '24') {
    return '24h';
  }
  if (clean === '30d' || clean === '30' || clean === 'month' || clean === '1m') {
    return 'month';
  }
  // All 7-day or week options strictly map to "week"
  return 'week';
}

export const DEFAULT_FOCUSED_SEARCH_QUERIES: string[] = [
  '"open to work" India',
  '"looking for new opportunities" India',
  '"immediate joiner" India',
  '"seeking my next role" India',
  '"actively looking for job" India',
  '"exploring new opportunities" India',
  '("open to work" OR "seeking job") AND ("Bangalore" OR "Mumbai" OR "Delhi" OR "Pune")',
  '("software engineer" OR "developer") AND "open to work" India',
  '("sales" OR "business development") AND "open to work" India',
  '("operations" OR "marketing" OR "finance") AND "open to work" India',
];

export async function fetchLinkedInPostsViaApify(
  params: ApifySearchParams,
  onProgress?: (message: string) => void
): Promise<ApifyPostItem[]> {
  const token = process.env.APIFY_API_TOKEN;

  if (!token || token === 'MY_APIFY_API_TOKEN' || token.trim() === '') {
    throw new Error('SETUP_REQUIRED: APIFY_API_TOKEN secret is not configured on the server. Please add your Apify API token in the AI Studio Secrets panel.');
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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  AppDatabase,
  Candidate,
  CriteriaTag,
  ScanRun,
  SourcePost,
  ExtractionResult,
  ActiveCollectionRun,
  QueryCatalogueItem,
  QueryCatalogueConfig,
} from '../types/index.ts';
import { getInitialDemoDatabase, initialSamplePosts } from './sampleData.ts';
import { extractCandidateFromPost } from './gemini.ts';
import { fetchLinkedInPostsViaApify, isApifyConfigured, mapTimeToPostedLimit } from './apify.ts';
import { DEFAULT_QUERY_CATALOGUE, INITIAL_QUERY_CONFIG } from './queryCatalogue.ts';
import { generateCandidateDraft, sendOutreachEmail, isValidEmailSyntax, normalizeEmail } from './outreachService.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEMO_FILE = path.join(DATA_DIR, 'demo_db.json');
const LIVE_FILE = path.join(DATA_DIR, 'live_db.json');

// In-memory active runs registry to prevent duplicate runs and allow progress polling
const activeRunsMap = new Map<string, ActiveCollectionRun>();
let currentRunningId: string | null = null;

function ensureFileExists(filepath: string, defaultData: () => AppDatabase) {
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, JSON.stringify(defaultData(), null, 2), 'utf-8');
  }
}

function getInitialLiveDatabase(): AppDatabase {
  const demo = getInitialDemoDatabase();
  return {
    candidates: [],
    posts: [],
    scanRuns: [],
    criteria: {
      ...demo.criteria,
      targetCountry: 'India',
      allowBankingIndustry: true,
      matchAnySector: true,
      matchAnyRole: true,
      excludedIndustries: [], // Allow any industry including banking as per prompt
    },
    schedule: demo.schedule,
    connections: {
      ...demo.connections,
      apify: {
        actorId: 'harvestapi/linkedin-post-search',
        isConfigured: isApifyConfigured(),
        lastRunAt: null,
        status: isApifyConfigured() ? 'connected' : 'setup_required',
        errorMessage: isApifyConfigured() ? undefined : 'APIFY_API_TOKEN secret is not set in environment.',
      },
    },
    outreachSettings: JSON.parse(JSON.stringify(demo.outreachSettings)),
    outreachMessages: [],
    candidateResponses: [],
    suppressionList: [],
  };
}

export function getDatabase(mode: 'demo' | 'live' = 'demo'): AppDatabase {
  const filepath = mode === 'live' ? LIVE_FILE : DEMO_FILE;
  const initialFn = mode === 'live' ? getInitialLiveDatabase : getInitialDemoDatabase;
  ensureFileExists(filepath, initialFn);

  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    const parsed: AppDatabase = JSON.parse(raw);
    // Keep apify status in sync with env var
    if (!parsed.connections.apify) {
      parsed.connections.apify = {
        actorId: 'harvestapi/linkedin-post-search',
        isConfigured: isApifyConfigured(),
        lastRunAt: null,
        status: isApifyConfigured() ? 'connected' : 'setup_required',
      };
    } else {
      parsed.connections.apify.isConfigured = isApifyConfigured();
      parsed.connections.apify.status = isApifyConfigured() ? 'connected' : 'setup_required';
    }

    // Ensure outreach collections exist
    if (!parsed.outreachSettings) {
      const demo = getInitialDemoDatabase();
      parsed.outreachSettings = JSON.parse(JSON.stringify(demo.outreachSettings));
    }
    if (!Array.isArray(parsed.outreachMessages)) {
      parsed.outreachMessages = [];
    }
    if (!Array.isArray(parsed.candidateResponses)) {
      parsed.candidateResponses = [];
    }
    if (!Array.isArray(parsed.suppressionList)) {
      parsed.suppressionList = [];
    }

    // Ensure candidates have formToken, outreachStatus, and draftEmail
    let modified = false;
    for (const c of parsed.candidates) {
      if (!c.formToken) {
        c.formToken = `tok_${c.id}_${crypto.randomBytes(8).toString('hex')}`;
        modified = true;
      }
      if (!c.outreachStatus) {
        if (c.candidateResponseId) {
          c.outreachStatus = 'Responded';
        } else if (c.outreachDeliveryStatus === 'sent') {
          c.outreachStatus = 'Sent';
        } else {
          c.outreachStatus = 'Draft';
        }
        modified = true;
      }
      if (!c.draftEmail && c.email) {
        c.draftEmail = generateCandidateDraft(c, parsed.outreachSettings);
        modified = true;
      }
    }
    if (modified) {
      saveDatabase(parsed, mode);
    }

    return parsed;
  } catch (err) {
    console.error(`Error reading ${filepath}, resetting to initial`, err);
    const initial = initialFn();
    fs.writeFileSync(filepath, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

export function saveDatabase(db: AppDatabase, mode: 'demo' | 'live' = 'demo') {
  const filepath = mode === 'live' ? LIVE_FILE : DEMO_FILE;
  // Security guarantee: NEVER write OAuth tokens or secrets to disk
  if (db.outreachSettings) {
    delete (db.outreachSettings as any).gmailAccessToken;
    delete (db.outreachSettings as any).accessToken;
    delete (db.outreachSettings as any).token;
  }
  fs.writeFileSync(filepath, JSON.stringify(db, null, 2), 'utf-8');
}

export function resetDemoDatabase(): AppDatabase {
  const fresh = getInitialDemoDatabase();
  fs.writeFileSync(DEMO_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
  return fresh;
}

export function clearDatabase(mode: 'demo' | 'live' | 'all' = 'all'): { demo?: AppDatabase; live?: AppDatabase } {
  const result: { demo?: AppDatabase; live?: AppDatabase } = {};

  if (mode === 'demo' || mode === 'all') {
    const db = getDatabase('demo');
    db.posts = [];
    db.candidates = [];
    db.scanRuns = [];
    db.outreachMessages = [];
    db.candidateResponses = [];
    saveDatabase(db, 'demo');
    result.demo = db;
  }

  if (mode === 'live' || mode === 'all') {
    const db = getDatabase('live');
    db.posts = [];
    db.candidates = [];
    db.scanRuns = [];
    db.outreachMessages = [];
    db.candidateResponses = [];
    saveDatabase(db, 'live');
    result.live = db;
  }

  return result;
}

export function getActiveRun(runId: string): ActiveCollectionRun | undefined {
  return activeRunsMap.get(runId);
}

export function getCurrentActiveRun(mode?: 'demo' | 'live'): ActiveCollectionRun | null {
  if (currentRunningId && activeRunsMap.has(currentRunningId)) {
    const run = activeRunsMap.get(currentRunningId)!;
    if (run.status !== 'completed' && run.status !== 'failed') {
      if (mode && run.mode !== mode) {
        return null;
      }
      return run;
    }
  }
  return null;
}

export function getLatestRunForMode(mode: 'demo' | 'live'): ActiveCollectionRun | null {
  // 1. Check in activeRunsMap in reverse order
  const allRuns = Array.from(activeRunsMap.values());
  for (let i = allRuns.length - 1; i >= 0; i--) {
    if (allRuns[i].mode === mode) {
      return allRuns[i];
    }
  }

  // 2. Check persisted scanRuns in db
  try {
    const db = getDatabase(mode);
    const latestScan = db.scanRuns[0];
    if (latestScan) {
      return {
        runId: latestScan.id,
        mode,
        status: latestScan.status === 'failed' ? 'failed' : 'completed',
        timeWindow: latestScan.queryConfig?.timeWindow || '7d',
        limit: latestScan.queryConfig?.limit || 20,
        useSmallTestQuery: latestScan.queryConfig?.useSmallTestQuery,
        fetchedPostsCount: latestScan.receivedPostsCount,
        analyzedCandidatesCount: latestScan.extractedCandidatesCount,
        duplicatesCount: latestScan.duplicatesFoundCount,
        failuresCount: latestScan.failuresCount,
        startedAt: latestScan.runAt,
        updatedAt: latestScan.runAt,
        completedAt: latestScan.runAt,
        error: latestScan.error,
        errorDetails: latestScan.errorDetails,
        logs: [latestScan.message],
      };
    }
  } catch (err) {
    console.error('Error fetching latest scan for mode:', mode, err);
  }

  return null;
}

/**
 * Start collection run with Apify harvestapi/linkedin-post-search actor
 * Prevents duplicate active runs.
 */
export async function startCandidateCollectionRun(
  options: {
    timeWindow: '24h' | '7d';
    limit: number;
    mode: 'demo' | 'live';
    useSmallTestQuery?: boolean;
    searchQueries?: string[];
  }
): Promise<{ runId: string }> {
  // Check if a run is already active
  const existingActive = getCurrentActiveRun();
  if (existingActive) {
    throw new Error(`A collection run (${existingActive.runId}) is already in progress. Please wait for it to finish.`);
  }

  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  currentRunningId = runId;

  const mode = options.mode === 'live' ? 'live' : 'demo';
  // Strict mapping: "7d" -> "week", "24h" -> "24h"
  const postedLimit = mapTimeToPostedLimit(options.timeWindow);
  const maxPosts = Math.max(1, Math.min(Math.floor(Number(options.limit) || 20), 100));

  const activeRun: ActiveCollectionRun = {
    runId,
    mode,
    status: 'starting',
    timeWindow: options.timeWindow,
    limit: maxPosts,
    useSmallTestQuery: Boolean(options.useSmallTestQuery),
    fetchedPostsCount: 0,
    analyzedCandidatesCount: 0,
    duplicatesCount: 0,
    failuresCount: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [
      `[${new Date().toLocaleTimeString()}] [${mode.toUpperCase()} MODE] Collection run initialized (Time Window: ${options.timeWindow} -> postedLimit: "${postedLimit}", Limit: ${maxPosts}).`,
    ],
  };

  activeRunsMap.set(runId, activeRun);

  // Run in background asynchronously so response returns runId immediately
  (async () => {
    const startTime = Date.now();
    const db = getDatabase(mode);

    try {
      let postsToProcess: Array<Partial<SourcePost> & { content: string }> = [];

      if (mode === 'demo') {
        // DEMO SANDBOX MODE: Use clearly labelled sample data, NEVER call Apify!
        activeRun.status = 'fetching_posts';
        activeRun.updatedAt = new Date().toISOString();
        activeRun.logs.push(
          `[${new Date().toLocaleTimeString()}] [DEMO SANDBOX] Loading simulated candidate posts for evaluation. (No external Apify calls are executed in Demo mode).`
        );

        // Simulated network delay for realistic feedback
        await new Promise(r => setTimeout(r, 1200));

        postsToProcess = initialSamplePosts.map((p, idx) => ({
          ...p,
          id: `post_demo_${Date.now()}_${idx}`,
          externalId: `urn:li:activity:demo_${Date.now()}_${idx}`,
          sourceUrl: p.sourceUrl || `https://www.linkedin.com/feed/update/urn:li:activity:demo_${Date.now()}_${idx}`,
          extractionState: 'pending' as const,
          extractedCandidateId: null,
        })).slice(0, maxPosts);

        activeRun.fetchedPostsCount = postsToProcess.length;
        activeRun.logs.push(
          `[${new Date().toLocaleTimeString()}] [DEMO SANDBOX] Ingested ${postsToProcess.length} canonical simulated posts covering mandatory validation scenarios.`
        );
      } else {
        // LIVE MODE: Call configured Apify Actor backend integration
        activeRun.status = 'fetching_posts';
        activeRun.updatedAt = new Date().toISOString();
        activeRun.logs.push(
          `[${new Date().toLocaleTimeString()}] [LIVE MODE] Querying LinkedIn via Apify harvestapi/linkedin-post-search (postedLimit: "${postedLimit}", maxPosts: ${maxPosts})...`
        );

        const rawApifyItems = await fetchLinkedInPostsViaApify(
          {
            timeWindow: options.timeWindow,
            limit: maxPosts,
            useSmallTestQuery: options.useSmallTestQuery,
            searchQueries: options.searchQueries,
          },
          msg => {
            activeRun.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
            activeRun.updatedAt = new Date().toISOString();
          }
        );

        activeRun.fetchedPostsCount = rawApifyItems.length;

        postsToProcess = rawApifyItems.map(item => {
          const text = item.text || item.content || '';
          const postUrl = item.url || item.linkedinUrl || null;
          const externalId = item.id || item.urn || (postUrl ? postUrl.split('?')[0] : null);
          const author = item.author || {};
          const authorProfileUrl = author.linkedinUrl || author.url || null;
          const authorName = author.name || null;
          const rawHeadline = author.headline || author.tagline || author.info || null;
          const authorHeadline = typeof rawHeadline === 'string' ? rawHeadline : (rawHeadline ? String(rawHeadline) : null);

          let rawLocation: any = author.location || author.geographicArea || null;
          if (typeof rawLocation === 'object' && rawLocation !== null) {
            rawLocation = rawLocation.name || rawLocation.city || rawLocation.country || rawLocation.text || null;
          }
          if (!rawLocation && Array.isArray(author.locations)) {
            rawLocation = author.locations
              .map((l: any) => (typeof l === 'string' ? l : l?.name || l?.city || l?.country || ''))
              .filter(Boolean)
              .join(', ');
          }
          const authorLocation = typeof rawLocation === 'string' ? rawLocation : null;

          let rawPostedAt: any = item.postedAtISO || item.postedAt || item.publishedAt || null;
          if (typeof rawPostedAt === 'object' && rawPostedAt !== null) {
            rawPostedAt = rawPostedAt.date || rawPostedAt.iso || (rawPostedAt.timestamp ? new Date(rawPostedAt.timestamp).toISOString() : null);
          }
          const postedAt = typeof rawPostedAt === 'string' ? rawPostedAt : null;

          return {
            platform: 'LinkedIn' as const,
            collectionMethod: 'Apify' as const,
            content: text,
            sourceUrl: postUrl,
            externalId,
            authorIdentifier: authorProfileUrl || authorName || null,
            authorName,
            authorHeadline,
            authorLocation,
            authorProfileUrl,
            postedAt,
            rawPayload: item,
          };
        });
      }

      activeRun.status = 'analyzing';
      activeRun.logs.push(
        `[${new Date().toLocaleTimeString()}] Deduplicating posts and running Gemini 5-point candidate validation...`
      );

      // Deduplicate posts
      const { added, duplicates } = deduplicateAndInsertPosts(postsToProcess, mode, db);
      activeRun.duplicatesCount += duplicates.length;

      // Analyze newly added posts
      for (const post of added) {
        try {
          activeRun.logs.push(
            `[${new Date().toLocaleTimeString()}] Validating candidate evidence for: ${
              post.authorName || post.authorIdentifier || 'Author'
            }...`
          );

          const extraction = await extractCandidateFromPost(post.content, db.criteria, {
            platform: post.platform,
            sourceUrl: post.sourceUrl || undefined,
            authorIdentifier: post.authorIdentifier || undefined,
            authorName: post.authorName || undefined,
            authorHeadline: post.authorHeadline || undefined,
            authorLocation: post.authorLocation || undefined,
            authorProfileUrl: post.authorProfileUrl || undefined,
            postedAt: post.postedAt || undefined,
            timeWindow: options.timeWindow,
          });

          if (extraction.isRecruiterAd || extraction.isSeekingForOthers) {
            post.extractionState = 'recruiter_ad';
          } else {
            post.extractionState = 'extracted';
            const mergeResult = mergeOrInsertCandidate(db, post, extraction);
            post.extractedCandidateId = mergeResult.candidateId;
            if (mergeResult.wasMerged) {
              activeRun.duplicatesCount++;
            } else {
              activeRun.analyzedCandidatesCount++;
            }
          }
        } catch (err: any) {
          activeRun.failuresCount++;
          post.extractionState = 'failed';
          post.extractionError = err.message || 'Validation error';
          activeRun.logs.push(
            `[${new Date().toLocaleTimeString()}] Error extracting post ${post.id}: ${err.message}`
          );
        }
        activeRun.updatedAt = new Date().toISOString();
      }

      // ---------------------------------------------------------
      // AUTOMATED 1ST OUTREACH PIPELINE (ZERO MANUAL INTERVENTION)
      // Any candidate under "Matches Criteria" having their email id
      // fetched automatically gets the 1st outreach mail sent from
      // bfsitalenthub@gmail.com immediately after data extraction.
      // ---------------------------------------------------------
      activeRun.logs.push(
        `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] Evaluating candidates for immediate automated 1st outreach (Sender: bfsitalenthub@gmail.com)...`
      );

      // Enforce sender email identity: bfsitalenthub@gmail.com whoever the user is
      db.outreachSettings.senderEmail = 'bfsitalenthub@gmail.com';
      db.outreachSettings.replyToEmail = 'bfsitalenthub@gmail.com';

      const eligibleForAutoOutreach = db.candidates.filter(c => {
        // 1. Must be under matched criteria
        if (c.criteriaTag !== 'Matches Criteria') return false;
        // 2. Must not be a recruiter vacancy ad or seeking for others
        if (c.isRecruiterAd || c.isSeekingForOthers) return false;
        // 3. Must have valid email fetched
        if (!c.email || !isValidEmailSyntax(c.email)) return false;
        // 4. Must not be on suppression list
        const norm = normalizeEmail(c.email);
        if (c.isUnsubscribed || db.suppressionList?.some(s => normalizeEmail(s.email) === norm)) return false;
        // 5. Must not already have received outreach
        if (c.outreachStatus === 'Sent' || c.outreachStatus === 'Applied' || c.outreachStatus === 'Responded' || c.outreachSentAt) return false;
        if (db.outreachMessages?.some(m => (m.candidateId === c.id || normalizeEmail(m.candidateEmail) === norm) && m.deliveryStatus === 'sent')) return false;

        return true;
      });

      let autoOutreachSentCount = 0;
      if (eligibleForAutoOutreach.length > 0) {
        activeRun.logs.push(
          `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] Found ${eligibleForAutoOutreach.length} candidate(s) under Matched Criteria with email fetched. Automatically dispatching 1st outreach mail from bfsitalenthub@gmail.com...`
        );

        for (const cand of eligibleForAutoOutreach) {
          activeRun.logs.push(
            `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] Sending 1st outreach email to ${cand.name || 'Candidate'} <${cand.email}> from bfsitalenthub@gmail.com...`
          );

          try {
            const sendResult = await sendOutreachEmail({
              candidate: cand,
              settings: db.outreachSettings,
              db,
              origin: 'http://localhost:3000',
            });

            if (sendResult.success) {
              autoOutreachSentCount++;
              activeRun.logs.push(
                `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] [DELIVERED] 1st outreach mail sent to ${cand.name || cand.email} from bfsitalenthub@gmail.com (Message ID: ${sendResult.messageId || 'auto_dispatched'}).`
              );
            } else {
              activeRun.logs.push(
                `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] [NOTICE] 1st outreach recorded for ${cand.name || cand.email}: ${sendResult.error || 'Saved in queue'}`
              );
            }
          } catch (autoErr: any) {
            activeRun.logs.push(
              `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] [ERROR] Failed to send outreach to ${cand.email}: ${autoErr.message}`
            );
          }
          activeRun.updatedAt = new Date().toISOString();
        }

        activeRun.logs.push(
          `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] Complete: ${autoOutreachSentCount} outreach email(s) dispatched from bfsitalenthub@gmail.com with zero manual intervention.`
        );
      } else {
        activeRun.logs.push(
          `[${new Date().toLocaleTimeString()}] [AUTO-OUTREACH] No new uncontacted candidates with email found under Matched Criteria in this run.`
        );
      }

      // Record ScanRun
      const durationMs = Date.now() - startTime;
      const scanRun: ScanRun = {
        id: runId,
        runAt: new Date().toISOString(),
        triggerType: 'find_candidates',
        mode,
        receivedPostsCount: activeRun.fetchedPostsCount,
        extractedCandidatesCount: activeRun.analyzedCandidatesCount,
        duplicatesFoundCount: activeRun.duplicatesCount,
        failuresCount: activeRun.failuresCount,
        durationMs,
        status:
          activeRun.failuresCount > 0
            ? activeRun.analyzedCandidatesCount > 0
              ? 'warning'
              : 'failed'
            : 'success',
        message:
          mode === 'demo'
            ? `[Demo Sandbox] Simulated collection completed: ${activeRun.fetchedPostsCount} sample posts processed, ${activeRun.analyzedCandidatesCount} candidates validated.`
            : `[Live Mode] Apify harvestapi/linkedin-post-search run completed: ${activeRun.fetchedPostsCount} posts retrieved, ${activeRun.analyzedCandidatesCount} candidates validated, ${activeRun.duplicatesCount} duplicates prevented.`,
        queryConfig: {
          timeWindow: options.timeWindow,
          limit: maxPosts,
          postedLimit,
          maxPosts,
          useSmallTestQuery: options.useSmallTestQuery,
        },
      };

      db.scanRuns.unshift(scanRun);
      if (db.scanRuns.length > 50) db.scanRuns = db.scanRuns.slice(0, 50);

      db.schedule.lastRunAt = scanRun.runAt;
      if (mode === 'live' && db.connections.apify) {
        db.connections.apify.lastRunAt = scanRun.runAt;
      }

      saveDatabase(db, mode);

      activeRun.status = 'completed';
      activeRun.completedAt = new Date().toISOString();
      activeRun.logs.push(
        `[${new Date().toLocaleTimeString()}] [${mode.toUpperCase()} MODE] Completed in ${(durationMs / 1000).toFixed(1)}s.`
      );
    } catch (err: any) {
      console.error('Candidate collection run error:', err);
      const durationMs = Date.now() - startTime;

      activeRun.status = 'failed';
      activeRun.error = err.message || 'Run failed';
      if (err.errorDetails) {
        activeRun.errorDetails = err.errorDetails;
      }
      activeRun.completedAt = new Date().toISOString();
      activeRun.logs.push(`[${new Date().toLocaleTimeString()}] FAILED: ${err.message}`);

      // Record failed run in db with errorDetails
      const scanRun: ScanRun = {
        id: runId,
        runAt: new Date().toISOString(),
        triggerType: 'find_candidates',
        mode,
        receivedPostsCount: activeRun.fetchedPostsCount,
        extractedCandidatesCount: activeRun.analyzedCandidatesCount,
        duplicatesFoundCount: activeRun.duplicatesCount,
        failuresCount: 1,
        durationMs,
        status: 'failed',
        message: `Run failed: ${err.message}`,
        error: err.message,
        errorDetails: err.errorDetails,
        queryConfig: {
          timeWindow: options.timeWindow,
          limit: maxPosts,
          postedLimit,
          maxPosts,
          useSmallTestQuery: options.useSmallTestQuery,
        },
      };
      db.scanRuns.unshift(scanRun);
      saveDatabase(db, mode);
    } finally {
      if (currentRunningId === runId) {
        currentRunningId = null;
      }
    }
  })();

  return { runId };
}

/**
 * Deduplicate incoming posts:
 * Deduplicate posts using platform + post/message ID or canonical URL.
 * Where those are unavailable, use source + author identifier + content hash together.
 */
export function deduplicateAndInsertPosts(
  rawPosts: Array<Partial<SourcePost> & { content: string }>,
  mode: 'demo' | 'live',
  existingDb?: AppDatabase
): { added: SourcePost[]; duplicates: SourcePost[] } {
  const db = existingDb || getDatabase(mode);
  const added: SourcePost[] = [];
  const duplicates: SourcePost[] = [];

  function getContentHash(str: string): string {
    return crypto.createHash('sha256').update(str.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 16);
  }

  for (const raw of rawPosts) {
    if (!raw.content || raw.content.trim() === '') continue;

    const platform = raw.platform || (mode === 'demo' ? 'Demo' : 'LinkedIn');
    const collectionMethod = raw.collectionMethod || (mode === 'demo' ? 'Demo' : 'Manual');
    const externalId = raw.externalId?.trim() || null;
    const sourceUrl = raw.sourceUrl?.trim() || null;
    const authorIdentifier = raw.authorIdentifier?.trim() || null;
    const contentHash = getContentHash(raw.content);

    // Check duplicate among existing posts
    const existing = db.posts.find(p => {
      // 1. Check externalId + platform
      if (externalId && p.externalId && p.externalId === externalId && p.platform === platform) {
        return true;
      }
      // 2. Check canonical sourceUrl
      if (sourceUrl && p.sourceUrl && p.sourceUrl === sourceUrl) {
        return true;
      }
      // 3. Fallback: platform + author + content
      const pHash = getContentHash(p.content);
      if (p.platform === platform && pHash === contentHash) {
        if (!authorIdentifier || !p.authorIdentifier || authorIdentifier === p.authorIdentifier) {
          return true;
        }
      }
      return false;
    });

    if (existing) {
      duplicates.push({
        id: `dup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        platform,
        collectionMethod,
        content: raw.content,
        sourceUrl,
        externalId,
        authorIdentifier,
        authorName: raw.authorName || null,
        authorHeadline: raw.authorHeadline || null,
        authorLocation: raw.authorLocation || null,
        authorProfileUrl: raw.authorProfileUrl || null,
        receivedAt: new Date().toISOString(),
        extractionState: existing.extractionState,
        duplicateOfPostId: existing.id,
      });
    } else {
      const newPost: SourcePost = {
        id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        platform,
        collectionMethod,
        content: raw.content,
        sourceUrl,
        externalId,
        authorIdentifier,
        authorName: raw.authorName || null,
        authorHeadline: raw.authorHeadline || null,
        authorLocation: raw.authorLocation || null,
        authorProfileUrl: raw.authorProfileUrl || null,
        postedAt: raw.postedAt || new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        extractionState: 'pending',
        rawPayload: raw.rawPayload,
      };
      db.posts.push(newPost);
      added.push(newPost);
    }
  }

  saveDatabase(db, mode);
  return { added, duplicates };
}

/**
 * Execute extraction on pending posts, deduplicate and merge candidates.
 */
export async function runExtractionProcess(
  mode: 'demo' | 'live',
  triggerType: 'manual' | 'scheduled' | 'webhook' | 'analysis' | 'find_candidates' = 'manual'
): Promise<ScanRun> {
  const startTime = Date.now();
  const db = getDatabase(mode);

  const pendingPosts = db.posts.filter(p => p.extractionState === 'pending');
  let extractedCandidatesCount = 0;
  let duplicatesFoundCount = 0;
  let failuresCount = 0;

  for (const post of pendingPosts) {
    try {
      const extraction = await extractCandidateFromPost(post.content, db.criteria, {
        platform: post.platform,
        sourceUrl: post.sourceUrl || undefined,
        authorIdentifier: post.authorIdentifier || undefined,
        authorName: post.authorName || undefined,
        authorHeadline: post.authorHeadline || undefined,
        authorLocation: post.authorLocation || undefined,
        authorProfileUrl: post.authorProfileUrl || undefined,
        postedAt: post.postedAt || undefined,
      });

      post.authorIntent = extraction.authorIntent;
      post.intentEvidence = extraction.intentEvidence;
      post.rejectionReason = extraction.rejectionReason;

      if (extraction.authorIntent !== 'SELF_JOB_SEEKING' || extraction.isRecruiterAd || extraction.isSeekingForOthers) {
        post.extractionState = extraction.isRecruiterAd ? 'recruiter_ad' : 'rejected_post';
        continue;
      }

      // Candidate matching and deduplication
      const mergeResult = mergeOrInsertCandidate(db, post, extraction);
      post.extractionState = 'extracted';
      post.extractedCandidateId = mergeResult.candidateId;

      if (mergeResult.wasMerged) {
        duplicatesFoundCount++;
      } else {
        extractedCandidatesCount++;
      }
    } catch (err: any) {
      console.error(`Extraction failed for post ${post.id}`, err);
      post.extractionState = 'failed';
      post.extractionError = err.message || 'Unknown extraction error';
      failuresCount++;
    }
  }

  const durationMs = Date.now() - startTime;
  const scanRun: ScanRun = {
    id: `run_${Date.now()}`,
    runAt: new Date().toISOString(),
    triggerType,
    receivedPostsCount: pendingPosts.length,
    extractedCandidatesCount,
    duplicatesFoundCount,
    failuresCount,
    durationMs,
    status: failuresCount > 0 ? (extractedCandidatesCount > 0 ? 'warning' : 'failed') : 'success',
    message: `${triggerType.toUpperCase()} scan completed: ${pendingPosts.length} posts processed, ${extractedCandidatesCount} candidates extracted, ${duplicatesFoundCount} merged duplicates, ${failuresCount} failures.`,
  };

  db.scanRuns.unshift(scanRun);
  if (db.scanRuns.length > 50) {
    db.scanRuns = db.scanRuns.slice(0, 50);
  }

  db.schedule.lastRunAt = scanRun.runAt;

  saveDatabase(db, mode);
  return scanRun;
}

/**
 * Merge candidate records ONLY when reliable identifiers match:
 * - same verified LinkedIn profile URL
 * - same email
 * - same Telegram user ID / handle
 * Do NOT merge solely because names match. Flag uncertain duplicates for review.
 */
function mergeOrInsertCandidate(
  db: AppDatabase,
  post: SourcePost,
  extracted: ExtractionResult
): { candidateId: string; wasMerged: boolean } {
  const normEmail = extracted.email?.trim().toLowerCase() || null;
  const normProfile =
    extracted.profileUrlOrTelegramId?.trim().toLowerCase() ||
    extracted.postUrl?.trim().toLowerCase() ||
    post.authorProfileUrl?.trim().toLowerCase() ||
    null;
  const normPhone = extracted.phone?.replace(/\D/g, '') || null;

  // 1. Look for definitive match by verified profile URL or email
  let matchedCandidate = db.candidates.find(c => {
    // Match by verified LinkedIn profile URL
    if (normProfile && c.profileUrl && c.profileUrl.trim().toLowerCase() === normProfile) {
      return true;
    }
    if (normProfile && c.profileUrlOrTelegramId && c.profileUrlOrTelegramId.trim().toLowerCase() === normProfile) {
      return true;
    }
    // Match by email
    if (normEmail && c.email && c.email.trim().toLowerCase() === normEmail) {
      return true;
    }
    // Match by phone
    if (normPhone && normPhone.length >= 9 && c.phone && c.phone.replace(/\D/g, '') === normPhone) {
      return true;
    }
    return false;
  });

  if (matchedCandidate) {
    // Merge into matchedCandidate
    if (!matchedCandidate.sourcePostIds.includes(post.id)) {
      matchedCandidate.sourcePostIds.push(post.id);
    }
    matchedCandidate.lastUpdatedAt = new Date().toISOString();

    // Respect manual corrections: DO NOT overwrite fields that were manually corrected!
    const correctedFields = matchedCandidate.manuallyCorrectedFields || [];

    if (!correctedFields.includes('name') && !matchedCandidate.name && extracted.candidateName) {
      matchedCandidate.name = extracted.candidateName;
    }
    if (!correctedFields.includes('currentOrPreviousRole') && !matchedCandidate.currentOrPreviousRole && extracted.currentOrPreviousRole) {
      matchedCandidate.currentOrPreviousRole = extracted.currentOrPreviousRole;
    }
    if (!correctedFields.includes('employer') && !matchedCandidate.employer && extracted.employer) {
      matchedCandidate.employer = extracted.employer;
    }
    if (!correctedFields.includes('currentWorkLocation') && !matchedCandidate.currentWorkLocation && extracted.currentWorkLocation) {
      matchedCandidate.currentWorkLocation = extracted.currentWorkLocation;
    }
    if (!correctedFields.includes('industry') && !matchedCandidate.industry && extracted.industry) {
      matchedCandidate.industry = extracted.industry;
    }
    if (!correctedFields.includes('totalExperienceYears') && matchedCandidate.totalExperienceYears === null && extracted.totalExperienceYears !== null) {
      matchedCandidate.totalExperienceYears = extracted.totalExperienceYears;
    }
    if (!correctedFields.includes('email') && !matchedCandidate.email && extracted.email) {
      matchedCandidate.email = extracted.email;
    }
    if (!correctedFields.includes('phone') && !matchedCandidate.phone && extracted.phone) {
      matchedCandidate.phone = extracted.phone;
    }
    if (!correctedFields.includes('jobSeekingStatement') && !matchedCandidate.jobSeekingStatement && extracted.jobSeekingStatement) {
      matchedCandidate.jobSeekingStatement = extracted.jobSeekingStatement;
    }
    if (!matchedCandidate.validationChecks && extracted.validationChecks) {
      matchedCandidate.validationChecks = extracted.validationChecks;
    }

    return { candidateId: matchedCandidate.id, wasMerged: true };
  }

  // 2. Check for uncertain duplicates (e.g. matching candidateName but without matching email or profile URL)
  const candidateId = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const uncertainMatches: string[] = [];

  if (extracted.candidateName && extracted.candidateName.length > 3) {
    const normName = extracted.candidateName.trim().toLowerCase();
    for (const existing of db.candidates) {
      if (existing.name && existing.name.trim().toLowerCase() === normName) {
        uncertainMatches.push(existing.id);
        if (!existing.uncertainDuplicateCandidateIds) {
          existing.uncertainDuplicateCandidateIds = [];
        }
        if (!existing.uncertainDuplicateCandidateIds.includes(candidateId)) {
          existing.uncertainDuplicateCandidateIds.push(candidateId);
        }
      }
    }
  }

  const newCandidate: Candidate = {
    id: candidateId,
    name: extracted.candidateName || post.authorName || null,
    currentOrPreviousRole: extracted.currentOrPreviousRole || post.authorHeadline || null,
    employer: extracted.employer,
    sector: extracted.sector || null,
    currentWorkLocation: extracted.currentWorkLocation || post.authorLocation || null,
    industry: extracted.industry,
    salesExperienceSummary: extracted.salesExperienceSummary,
    totalExperienceYears: extracted.totalExperienceYears,
    experienceType: extracted.experienceType || 'unknown',
    preferredLocation: extracted.preferredLocation,
    jobSeekingStatement: extracted.jobSeekingStatement,
    statedAvailability: extracted.statedAvailability,
    originalPostDate: extracted.originalPostDate || post.postedAt || null,
    postUrl: extracted.postUrl || post.sourceUrl || null,
    profileUrl: extracted.profileUrlOrTelegramId || post.authorProfileUrl || null,
    email: extracted.email,
    phone: extracted.phone,
    profileUrlOrTelegramId: extracted.profileUrlOrTelegramId || post.authorProfileUrl || post.authorIdentifier || null,
    authorIntent: extracted.authorIntent || 'SELF_JOB_SEEKING',
    intentEvidence: extracted.intentEvidence || null,
    criteriaTag: extracted.criteriaTag,
    matchingExplanation: extracted.matchingExplanation,
    isRecruiterAd: false,
    validationChecks: extracted.validationChecks,
    sourcePostIds: [post.id],
    firstSeenAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    isManuallyCorrected: false,
    manuallyCorrectedFields: [],
    uncertainDuplicateCandidateIds: uncertainMatches.length > 0 ? uncertainMatches : undefined,
    evidence: extracted.evidence,
  };

  db.candidates.unshift(newCandidate);
  return { candidateId: newCandidate.id, wasMerged: false };
}

/**
 * Recruiter manual correction: preserves original values and tracks corrected field names.
 */
export function correctCandidateField(
  candidateId: string,
  updates: Partial<Candidate>,
  mode: 'demo' | 'live'
): Candidate | null {
  const db = getDatabase(mode);
  const candidate = db.candidates.find(c => c.id === candidateId);
  if (!candidate) return null;

  if (!candidate.originalValuesBeforeCorrection) {
    candidate.originalValuesBeforeCorrection = {};
  }
  if (!candidate.manuallyCorrectedFields) {
    candidate.manuallyCorrectedFields = [];
  }

  const allowedCorrectionKeys: (keyof Candidate)[] = [
    'name',
    'currentOrPreviousRole',
    'employer',
    'currentWorkLocation',
    'industry',
    'salesExperienceSummary',
    'totalExperienceYears',
    'preferredLocation',
    'jobSeekingStatement',
    'statedAvailability',
    'originalPostDate',
    'email',
    'phone',
    'profileUrl',
    'postUrl',
    'criteriaTag',
    'matchingExplanation',
    'recruiterNotes',
  ];

  for (const key of allowedCorrectionKeys) {
    if (key in updates && updates[key] !== undefined) {
      if (!(key in candidate.originalValuesBeforeCorrection)) {
        candidate.originalValuesBeforeCorrection[key] = (candidate as any)[key];
      }
      (candidate as any)[key] = updates[key];
      if (!candidate.manuallyCorrectedFields.includes(key as string)) {
        candidate.manuallyCorrectedFields.push(key as string);
      }
    }
  }

  candidate.isManuallyCorrected = candidate.manuallyCorrectedFields.length > 0;
  candidate.lastUpdatedAt = new Date().toISOString();

  saveDatabase(db, mode);
  return candidate;
}

/**
 * Merge two candidates manually when recruiter resolves uncertain duplicate.
 */
export function resolveDuplicateCandidates(
  primaryCandidateId: string,
  secondaryCandidateId: string,
  action: 'merge' | 'dismiss',
  mode: 'demo' | 'live'
): boolean {
  const db = getDatabase(mode);
  const primary = db.candidates.find(c => c.id === primaryCandidateId);
  const secondary = db.candidates.find(c => c.id === secondaryCandidateId);
  if (!primary || !secondary) return false;

  if (action === 'merge') {
    // Link posts
    for (const postId of secondary.sourcePostIds) {
      if (!primary.sourcePostIds.includes(postId)) {
        primary.sourcePostIds.push(postId);
      }
      const post = db.posts.find(p => p.id === postId);
      if (post) {
        post.extractedCandidateId = primary.id;
      }
    }

    // Merge missing fields
    if (!primary.name && secondary.name) primary.name = secondary.name;
    if (!primary.email && secondary.email) primary.email = secondary.email;
    if (!primary.phone && secondary.phone) primary.phone = secondary.phone;
    if (!primary.profileUrl && secondary.profileUrl) primary.profileUrl = secondary.profileUrl;
    if (!primary.currentWorkLocation && secondary.currentWorkLocation) {
      primary.currentWorkLocation = secondary.currentWorkLocation;
    }
    if (primary.totalExperienceYears === null && secondary.totalExperienceYears !== null) {
      primary.totalExperienceYears = secondary.totalExperienceYears;
    }

    primary.lastUpdatedAt = new Date().toISOString();
    db.candidates = db.candidates.filter(c => c.id !== secondaryCandidateId);
  }

  // Remove uncertain pointers on both
  if (primary.uncertainDuplicateCandidateIds) {
    primary.uncertainDuplicateCandidateIds = primary.uncertainDuplicateCandidateIds.filter(id => id !== secondaryCandidateId);
  }
  if (secondary.uncertainDuplicateCandidateIds) {
    secondary.uncertainDuplicateCandidateIds = secondary.uncertainDuplicateCandidateIds.filter(id => id !== primaryCandidateId);
  }

  saveDatabase(db, mode);
  return true;
}

export interface ReprocessResult {
  retrievedCount: number;
  rejectedCount: number;
  outsideTargetCount: number;
  needingReviewCount: number;
  matchedCount: number;
  reprocessedAt: string;
  details: Array<{
    postId: string;
    authorName: string | null;
    authorIntent: string;
    criteriaTag: string;
    explanation: string;
    rejectionReason: string | null;
  }>;
}

/**
 * Reprocess existing collected posts with strict two-stage rules before making additional paid API calls.
 * Preserves recruiter manual corrections and reports accurate counts.
 */
export async function reprocessExistingPosts(mode: 'demo' | 'live' = 'demo'): Promise<ReprocessResult> {
  const db = getDatabase(mode);
  const posts = db.posts;

  let rejectedCount = 0;
  let outsideTargetCount = 0;
  let needingReviewCount = 0;
  let matchedCount = 0;
  const details: ReprocessResult['details'] = [];

  for (const post of posts) {
    try {
      const extraction = await extractCandidateFromPost(post.content, db.criteria, {
        platform: post.platform,
        sourceUrl: post.sourceUrl || undefined,
        authorIdentifier: post.authorIdentifier || undefined,
        authorName: post.authorName || undefined,
        authorHeadline: post.authorHeadline || undefined,
        authorLocation: post.authorLocation || undefined,
        authorProfileUrl: post.authorProfileUrl || undefined,
        postedAt: post.postedAt || undefined,
      });

      post.authorIntent = extraction.authorIntent;
      post.intentEvidence = extraction.intentEvidence;
      post.rejectionReason = extraction.rejectionReason;

      if (extraction.authorIntent !== 'SELF_JOB_SEEKING') {
        post.extractionState = extraction.isRecruiterAd ? 'recruiter_ad' : 'rejected_post';
        rejectedCount++;

        // If previously attached to an uncorrected candidate, unassign or clean up
        if (post.extractedCandidateId) {
          const candIdx = db.candidates.findIndex(c => c.id === post.extractedCandidateId);
          if (candIdx !== -1 && !db.candidates[candIdx].isManuallyCorrected) {
            db.candidates.splice(candIdx, 1);
          }
          post.extractedCandidateId = null;
        }
      } else {
        post.extractionState = 'extracted';
        const mergeResult = mergeOrInsertCandidate(db, post, extraction);
        post.extractedCandidateId = mergeResult.candidateId;

        // Ensure candidate tag, explanation, checks, and contact details reflect latest criteria
        const cand = db.candidates.find(c => c.id === mergeResult.candidateId);
        if (cand && !cand.isManuallyCorrected) {
          cand.criteriaTag = extraction.criteriaTag;
          cand.matchingExplanation = extraction.matchingExplanation;
          cand.validationChecks = extraction.validationChecks;
          if (extraction.email && (!cand.email || !cand.isManuallyCorrected)) cand.email = extraction.email;
          if (extraction.phone && (!cand.phone || !cand.isManuallyCorrected)) cand.phone = extraction.phone;
          cand.lastUpdatedAt = new Date().toISOString();
        }

        if (extraction.criteriaTag === 'Matches Criteria') {
          matchedCount++;
        } else if (extraction.criteriaTag === 'Needs Review') {
          needingReviewCount++;
        } else {
          outsideTargetCount++;
        }
      }

      details.push({
        postId: post.id,
        authorName: post.authorName ?? null,
        authorIntent: extraction.authorIntent,
        criteriaTag: extraction.criteriaTag,
        explanation: extraction.matchingExplanation,
        rejectionReason: extraction.rejectionReason ?? null,
      });
    } catch (err: any) {
      console.error(`Error reprocessing post ${post.id}:`, err);
    }
  }

  saveDatabase(db, mode);

  return {
    retrievedCount: posts.length,
    rejectedCount,
    outsideTargetCount,
    needingReviewCount,
    matchedCount,
    reprocessedAt: new Date().toISOString(),
    details,
  };
}

/**
 * Executes a deterministic verification test suite covering all 7 mandatory scenarios from user prompt:
 * 1. A recruiter advertising a sales vacancy.
 * 2. A qualifying pharma sales employee seeking a job.
 * 3. An unrelated FMCG post.
 * 4. A job seeker with unknown experience.
 * 5. A tech engineer with no sales responsibilities.
 * 6. A sales job seeker currently working outside India.
 * 7. A job seeker mentioning "hiring managers".
 */
export async function runCanonicalVerificationSuite(): Promise<{
  totalScenarios: number;
  retrievedCount: number;
  rejectedCount: number;
  needingReviewCount: number;
  outsideTargetCount: number;
  matchedCount: number;
  allPassedExpectedOutcomes: boolean;
  results: Array<{
    scenarioName: string;
    expectedOutcome: string;
    actualOutcome: string;
    authorIntent: string;
    passed: boolean;
    explanation: string;
    checks: Record<string, any>;
  }>;
}> {
  const db = getDatabase('demo');
  const scenarios = [
    {
      name: 'A recruiter advertising a sales vacancy',
      content: '🚨 WE ARE HIRING: Urgent requirement for 5 B2B Sales Executives for our corporate client in Pune. CTC 8-12 LPA. Send your CV to jobs@hragency.com.',
      metadata: {
        authorName: 'TalentSprint Recruitment',
        authorHeadline: 'Lead Recruiter | Pune, India',
        authorLocation: 'Pune, Maharashtra, India',
        postedAt: '2026-10-03T19:00:00.000Z',
      },
      expectedTag: 'Outside Target',
      expectedIntent: 'RECRUITER_OR_EMPLOYER_HIRING',
    },
    {
      name: 'A qualifying pharma sales employee seeking a job',
      content: 'I have 5 years in pharmaceutical sales as a Medical Representative and Area Sales Manager at Sun Pharma, and I am actively seeking a new role in Mumbai or Pune. Consistently exceeded sales targets by 115%. Contact: rohit.deshmukh@pharmamail.com',
      metadata: {
        authorName: 'Rohit Deshmukh',
        authorHeadline: 'Area Sales Manager at Sun Pharma | Medical Representative | Mumbai, India',
        authorLocation: 'Mumbai, Maharashtra, India',
        postedAt: '2026-10-03T14:30:00.000Z',
      },
      expectedTag: 'Matches Criteria',
      expectedIntent: 'SELF_JOB_SEEKING',
    },
    {
      name: 'An unrelated FMCG post',
      content: 'Five ways to improve FMCG sales distribution and supply chain logistics in rural tier-2 markets. 1. Incentivize distributors... Read full article on my blog.',
      metadata: {
        authorName: 'Vikram Malhotra',
        authorHeadline: 'FMCG Market Analyst & Consultant | Delhi, India',
        authorLocation: 'New Delhi, India',
        postedAt: '2026-10-02T11:00:00.000Z',
      },
      expectedTag: 'Outside Target',
      expectedIntent: 'UNRELATED',
    },
    {
      name: 'A job seeker with unknown experience',
      content: 'I am exploring new sales opportunities in the paints and decorative coatings sector across Delhi NCR. Open to work as Territory Sales Executive. Please connect or reach out at amit.verma@paintmail.com #OpenToWork',
      metadata: {
        authorName: 'Amit Verma',
        authorHeadline: 'Territory Sales Executive at Berger Paints | Delhi NCR, India',
        authorLocation: 'New Delhi, Delhi, India',
        postedAt: '2026-10-03T16:20:00.000Z',
      },
      expectedTag: 'Needs Review',
      expectedIntent: 'SELF_JOB_SEEKING',
    },
    {
      name: 'A tech engineer seeking a job (non-sales role, tech sector)',
      content: 'After 4 years building distributed backend systems in Go and Python at TechStack, I am open to work and seeking new software engineering opportunities in Bengaluru. Contact: rahul.tech@devmail.io | +91 98450 12345',
      metadata: {
        authorName: 'Rahul Verma',
        authorHeadline: 'Senior Backend Software Engineer at TechStack | Python & Go | Bengaluru, India',
        authorLocation: 'Bengaluru, Karnataka, India',
        postedAt: '2026-10-02T13:45:00.000Z',
      },
      expectedTag: 'Matches Criteria',
      expectedIntent: 'SELF_JOB_SEEKING',
    },
    {
      name: 'A sales job seeker currently working outside India',
      content: "I'm officially on the market! Over the past 6 years, I've worked in Enterprise B2B SaaS software sales at CloudScale. Seeking new sales opportunities based in Singapore. Feel free to connect or email alex.chen.sales@techmail.io",
      metadata: {
        authorName: 'Alex Chen',
        authorHeadline: 'Account Executive at CloudScale | SaaS | Singapore',
        authorLocation: 'Singapore',
        postedAt: '2026-10-03T10:45:00.000Z',
      },
      expectedTag: 'Outside Target',
      expectedIntent: 'SELF_JOB_SEEKING',
    },
    {
      name: 'A job seeker mentioning "hiring managers"',
      content: 'After a rewarding 4 years driving B2B sales in retail distribution at NatureFresh Foods, I am exploring new opportunities in Mumbai. Please connect me with hiring managers in the FMCG sector! Reach me at priya.sharma91@example.com',
      metadata: {
        authorName: 'Priya Sharma',
        authorHeadline: 'Senior Sales Executive at NatureFresh Foods | FMCG | Mumbai, India',
        authorLocation: 'Mumbai, Maharashtra, India',
        postedAt: '2026-10-03T09:15:00.000Z',
      },
      expectedTag: 'Matches Criteria',
      expectedIntent: 'SELF_JOB_SEEKING',
    },
  ];

  let rejectedCount = 0;
  let needingReviewCount = 0;
  let outsideTargetCount = 0;
  let matchedCount = 0;
  let allPassed = true;

  const results = [];

  for (const s of scenarios) {
    const ext = await extractCandidateFromPost(s.content, db.criteria, s.metadata);
    const passedIntent = ext.authorIntent === s.expectedIntent;
    const passedTag = ext.criteriaTag === s.expectedTag;
    const scenarioSuccess = passedIntent && passedTag;

    if (!scenarioSuccess) allPassed = false;

    if (ext.authorIntent !== 'SELF_JOB_SEEKING') {
      rejectedCount++;
    } else if (ext.criteriaTag === 'Matches Criteria') {
      matchedCount++;
    } else if (ext.criteriaTag === 'Needs Review') {
      needingReviewCount++;
    } else {
      outsideTargetCount++;
    }

    results.push({
      scenarioName: s.name,
      expectedOutcome: `${s.expectedIntent} -> ${s.expectedTag}`,
      actualOutcome: `${ext.authorIntent} -> ${ext.criteriaTag}`,
      authorIntent: ext.authorIntent,
      passed: scenarioSuccess,
      explanation: ext.matchingExplanation || ext.rejectionReason || '',
      checks: ext.validationChecks,
    });
  }

  return {
    totalScenarios: scenarios.length,
    retrievedCount: scenarios.length,
    rejectedCount,
    needingReviewCount,
    outsideTargetCount,
    matchedCount,
    allPassedExpectedOutcomes: allPassed,
    results,
  };
}

/**
 * CSV Export generator conforming to stored candidate fields.
 */
export function generateCandidatesCsv(candidates: Candidate[], posts: SourcePost[]): string {
  const headers = [
    'Candidate ID',
    'Candidate Name',
    'Match Status',
    'Author Intent',
    'Current Role',
    'Employer',
    'Sector',
    'Current Work Location',
    'Email',
    'Phone Number',
    'Experience (Years)',
    'Experience Type',
    'Job Seeking Statement',
    'Original Post Date',
    'Profile Link',
    'Post Link',
    'Author Personally Seeking Check',
    'Role & Function Check',
    'India Check',
    'Experience 1-10y Check',
    'Target Sector Check',
    'Date Within Period Check',
    'Matching Explanation',
    'Manually Corrected',
    'First Seen At',
  ];

  function escapeCsvCell(val: any): string {
    if (val === null || val === undefined) return 'Not Provided';
    const str = String(val).replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();
    return `"${str}"`;
  }

  const rows = candidates.map(c => {
    const checks = c.validationChecks;
    const seekingCheck = checks?.authorIsPersonallySeekingJob || (checks as any)?.explicitPersonalJobSeekingStatement;
    const sectorCheck = checks?.currentEmployerInTargetSector;
    return [
      escapeCsvCell(c.id),
      escapeCsvCell(c.name),
      escapeCsvCell(c.criteriaTag),
      escapeCsvCell(c.authorIntent || 'SELF_JOB_SEEKING'),
      escapeCsvCell(c.currentOrPreviousRole),
      escapeCsvCell(c.employer),
      escapeCsvCell(c.sector),
      escapeCsvCell(c.currentWorkLocation),
      escapeCsvCell(c.email),
      escapeCsvCell(c.phone),
      escapeCsvCell(c.totalExperienceYears !== null ? c.totalExperienceYears : 'Not Provided'),
      escapeCsvCell(c.experienceType || 'unknown'),
      escapeCsvCell(c.jobSeekingStatement),
      escapeCsvCell(c.originalPostDate),
      escapeCsvCell(c.profileUrl || c.profileUrlOrTelegramId),
      escapeCsvCell(c.postUrl),
      escapeCsvCell(seekingCheck ? `${seekingCheck.passed}: ${seekingCheck.evidence}` : 'N/A'),
      escapeCsvCell(checks?.currentlyEmployedInSalesRole ? `${checks.currentlyEmployedInSalesRole.passed}: ${checks.currentlyEmployedInSalesRole.evidence}` : 'N/A'),
      escapeCsvCell(checks?.currentlyWorkingInIndia ? `${checks.currentlyWorkingInIndia.passed}: ${checks.currentlyWorkingInIndia.evidence}` : 'N/A'),
      escapeCsvCell(checks?.totalExperience1To10Years ? `${checks.totalExperience1To10Years.passed}: ${checks.totalExperience1To10Years.evidence}` : 'N/A'),
      escapeCsvCell(sectorCheck ? `${sectorCheck.passed}: ${sectorCheck.evidence}` : 'N/A'),
      escapeCsvCell(checks?.postDateWithinSelectedPeriod ? `${checks.postDateWithinSelectedPeriod.passed}: ${checks.postDateWithinSelectedPeriod.evidence}` : 'N/A'),
      escapeCsvCell(c.matchingExplanation),
      escapeCsvCell(c.isManuallyCorrected ? `Yes (${c.manuallyCorrectedFields.join(', ')})` : 'No'),
      escapeCsvCell(c.firstSeenAt),
    ];
  });

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function getQueryCatalogue(mode: 'demo' | 'live' = 'demo'): { catalogue: QueryCatalogueItem[]; config: QueryCatalogueConfig } {
  const db = getDatabase(mode);
  if (!db.queryCatalogue || !Array.isArray(db.queryCatalogue) || db.queryCatalogue.length === 0) {
    db.queryCatalogue = JSON.parse(JSON.stringify(DEFAULT_QUERY_CATALOGUE));
  }
  if (!db.queryConfig) {
    db.queryConfig = JSON.parse(JSON.stringify(INITIAL_QUERY_CONFIG));
  }
  return { catalogue: db.queryCatalogue!, config: db.queryConfig! };
}

export function updateQueryCatalogue(
  mode: 'demo' | 'live' = 'demo',
  updates: { catalogue?: QueryCatalogueItem[]; config?: QueryCatalogueConfig }
): { catalogue: QueryCatalogueItem[]; config: QueryCatalogueConfig } {
  const db = getDatabase(mode);
  if (updates.catalogue && Array.isArray(updates.catalogue)) {
    db.queryCatalogue = updates.catalogue;
  }
  if (updates.config) {
    db.queryConfig = { ...(db.queryConfig || INITIAL_QUERY_CONFIG), ...updates.config };
  }
  saveDatabase(db, mode);
  return { catalogue: db.queryCatalogue || DEFAULT_QUERY_CATALOGUE, config: db.queryConfig || INITIAL_QUERY_CONFIG };
}

export function resetQueryCatalogue(mode: 'demo' | 'live' = 'demo'): { catalogue: QueryCatalogueItem[]; config: QueryCatalogueConfig } {
  const db = getDatabase(mode);
  db.queryCatalogue = JSON.parse(JSON.stringify(DEFAULT_QUERY_CATALOGUE));
  db.queryConfig = JSON.parse(JSON.stringify(INITIAL_QUERY_CONFIG));
  saveDatabase(db, mode);
  return { catalogue: db.queryCatalogue!, config: db.queryConfig! };
}

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  getDatabase,
  saveDatabase,
  resetDemoDatabase,
  clearDatabase,
  deduplicateAndInsertPosts,
  runExtractionProcess,
  correctCandidateField,
  resolveDuplicateCandidates,
  generateCandidatesCsv,
  startCandidateCollectionRun,
  getActiveRun,
  getCurrentActiveRun,
  getLatestRunForMode,
  reprocessExistingPosts,
  runCanonicalVerificationSuite,
  getQueryCatalogue,
  updateQueryCatalogue,
  resetQueryCatalogue,
} from './src/server/storage.ts';
import {
  extractCandidateFromPost,
  isGeminiConfigured,
  isGeminiQuotaExhausted,
} from './src/server/gemini.ts';
import { isApifyConfigured, runApifySmallVerificationTest, mapTimeToPostedLimit } from './src/server/apify.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 1. Health and Status (Scoped to selected mode to ensure Demo Sandbox never shows Live Apify logs)
app.get('/api/status', (req: Request, res: Response) => {
  const mode = (req.query.mode as string) === 'live' ? 'live' : 'demo';
  const currentRun = getCurrentActiveRun(mode);
  const latestRun = getLatestRunForMode(mode);
  const quota = isGeminiQuotaExhausted();

  res.json({
    status: 'ok',
    mode,
    geminiConfigured: isGeminiConfigured(),
    geminiQuotaExhausted: quota.isExhausted,
    geminiQuotaReason: quota.reason,
    apifyConfigured: isApifyConfigured(),
    activeRun: currentRun || latestRun,
    isCurrentlyRunning: Boolean(currentRun),
    timestamp: new Date().toISOString(),
    supportedPlatforms: ['LinkedIn', 'Telegram', 'Demo'],
    defaultTimezone: 'Asia/Kolkata',
  });
});

// 2. Full Data Retrieval
app.get('/api/data', (req: Request, res: Response) => {
  const mode = (req.query.mode as string) === 'live' ? 'live' : 'demo';
  const data = getDatabase(mode);
  res.json(data);
});

// 3. Reset Demo Database
app.post('/api/demo/reset', (req: Request, res: Response) => {
  const resetData = resetDemoDatabase();
  res.json({ message: 'Demo database reset to initial 5-point validated candidate posts.', data: resetData });
});

// Clear Database (candidates, posts, scan runs)
app.post('/api/database/clear', (req: Request, res: Response) => {
  const mode = (req.body?.mode as 'demo' | 'live' | 'all') || 'all';
  const cleared = clearDatabase(mode);
  res.json({
    success: true,
    message: `Database cleared successfully (${mode}). All candidates, posts, and run histories removed.`,
    data: mode === 'live' ? cleared.live : mode === 'demo' ? cleared.demo : cleared,
  });
});

// 4. Authenticated Endpoint: Start "Find Candidates" Collection Run
app.post('/api/runs/find-candidates', async (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'demo' ? 'demo' : 'live';
  const rawTime = req.body.timeWindow || req.body.postedLimit || '7d';
  const timeWindow: '24h' | '7d' = (rawTime === '24h' || rawTime === '1d' || rawTime === 'day') ? '24h' : '7d';
  const limit = Math.max(1, Math.min(parseInt(req.body.limit || '20', 10), 100));
  const useSmallTestQuery = Boolean(req.body.useSmallTestQuery);

  // Check credentials if live mode
  if (mode === 'live' && !isApifyConfigured()) {
    res.status(400).json({
      setupRequired: true,
      error: 'Setup Required: APIFY_API_TOKEN secret is not configured on the server. Please add your Apify API token in the AI Studio Secrets panel before running live collection.',
    });
    return;
  }

  // Prevent duplicate runs within same mode
  const running = getCurrentActiveRun(mode);
  if (running) {
    res.status(409).json({
      error: `A collection run (${running.runId}) is already in progress in ${mode.toUpperCase()} mode. Please wait for it to complete.`,
      activeRun: running,
    });
    return;
  }

  try {
    const { runId } = await startCandidateCollectionRun({
      timeWindow,
      limit,
      mode,
      useSmallTestQuery,
      searchQueries: Array.isArray(req.body.searchQueries) ? req.body.searchQueries : undefined,
    });

    res.json({
      success: true,
      runId,
      mode,
      status: 'started',
      message:
        mode === 'demo'
          ? `Started Demo Sandbox evaluation run ${runId} (Window: ${timeWindow}, Limit: ${limit}). Processing sample candidate data.`
          : `Started Live collection run ${runId} for sales candidates in India (Window: ${timeWindow}, Limit: ${limit}${useSmallTestQuery ? ', Small Verification Query' : ''}). Harvesting via Apify.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start collection run' });
  }
});

// 4b. Dedicated Quick Integration Test (Small 5-Post Request)
app.post('/api/runs/verify-apify-test', async (req: Request, res: Response) => {
  if (!isApifyConfigured()) {
    res.status(400).json({
      setupRequired: true,
      error: 'Setup Required: APIFY_API_TOKEN is not configured.',
    });
    return;
  }

  try {
    const result = await runApifySmallVerificationTest();
    res.json(result);
  } catch (err: any) {
    res.status(err.errorDetails?.httpStatus || 500).json({
      success: false,
      error: err.message,
      errorDetails: err.errorDetails,
    });
  }
});

// 5. Check Active Run Status & Progress
app.get('/api/runs/:runId/status', (req: Request, res: Response) => {
  const { runId } = req.params;
  const run = getActiveRun(runId);
  if (!run) {
    res.status(404).json({ error: `Run ${runId} not found.` });
    return;
  }
  res.json(run);
});

// 6. Check Current Active Run
app.get('/api/runs/active', (req: Request, res: Response) => {
  const running = getCurrentActiveRun();
  res.json({ activeRun: running });
});

// 7. Import / Paste Posts
app.post('/api/posts/import', (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const posts = Array.isArray(req.body.posts) ? req.body.posts : [req.body];

  if (!posts || posts.length === 0) {
    res.status(400).json({ error: 'No posts provided in payload' });
    return;
  }

  const result = deduplicateAndInsertPosts(posts, mode);
  res.json({
    addedCount: result.added.length,
    duplicatesCount: result.duplicates.length,
    added: result.added,
    duplicates: result.duplicates,
  });
});

// 8. Ad-hoc Post Extraction (preview test before saving)
app.post('/api/extract', async (req: Request, res: Response) => {
  try {
    const { content, criteria, metadata } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Field "content" is required.' });
      return;
    }

    const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
    const db = getDatabase(mode);
    const activeCriteria = criteria || db.criteria;

    const result = await extractCandidateFromPost(content, activeCriteria, metadata);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

// 9. Run Collection / Batch Extraction Process
app.post('/api/runs/execute', async (req: Request, res: Response) => {
  try {
    const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
    const triggerType = req.body.triggerType || 'manual';

    const scanRun = await runExtractionProcess(mode, triggerType);
    res.json(scanRun);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Scan execution failed' });
  }
});

// 10. Correct Candidate Fields (preserving manual corrections)
app.post('/api/candidates/:id/correct', (req: Request, res: Response) => {
  const { id } = req.params;
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const updates = req.body.updates;

  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'Field "updates" object required.' });
    return;
  }

  const updated = correctCandidateField(id, updates, mode);
  if (!updated) {
    res.status(404).json({ error: `Candidate ${id} not found.` });
    return;
  }

  res.json(updated);
});

// 11. Resolve Uncertain Duplicates
app.post('/api/candidates/resolve-duplicate', (req: Request, res: Response) => {
  const { primaryId, secondaryId, action, mode } = req.body;
  if (!primaryId || !secondaryId || !action) {
    res.status(400).json({ error: 'primaryId, secondaryId, and action ("merge" | "dismiss") are required.' });
    return;
  }

  const success = resolveDuplicateCandidates(primaryId, secondaryId, action, mode === 'live' ? 'live' : 'demo');
  if (!success) {
    res.status(404).json({ error: 'Could not resolve duplicate: candidates not found.' });
    return;
  }

  res.json({ success: true, message: `Duplicate ${action === 'merge' ? 'merged' : 'dismissed'} successfully.` });
});

// 12. Reprocess Existing Collected Posts
app.post('/api/posts/reprocess', async (req: Request, res: Response) => {
  try {
    const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
    const result = await reprocessExistingPosts(mode);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Reprocessing failed' });
  }
});

// 13. Canonical Test Verification Suite
app.get('/api/verify/canonical', async (_req: Request, res: Response) => {
  try {
    const result = await runCanonicalVerificationSuite();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Verification suite failed' });
  }
});

// 14. Query Catalogue Endpoints
app.get('/api/queries', (req: Request, res: Response) => {
  const mode = (req.query.mode as string) === 'live' ? 'live' : 'demo';
  const data = getQueryCatalogue(mode);
  res.json(data);
});

app.put('/api/queries', (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const { catalogue, config } = req.body;
  const data = updateQueryCatalogue(mode, { catalogue, config });
  res.json({ success: true, ...data });
});

app.post('/api/queries/reset', (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const data = resetQueryCatalogue(mode);
  res.json({ success: true, ...data });
});

// 15. Export CSV
app.get('/api/candidates/export.csv', (req: Request, res: Response) => {
  const mode = (req.query.mode as string) === 'live' ? 'live' : 'demo';
  const tag = req.query.tag as string;
  const db = getDatabase(mode);

  let list = db.candidates;
  if (tag && tag !== 'all') {
    list = list.filter(c => c.criteriaTag.toLowerCase() === tag.toLowerCase());
  }

  const csv = generateCandidatesCsv(list, db.posts);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="recruitment_candidates_${mode}_${Date.now()}.csv"`);
  res.send(csv);
});

// 13. Update Settings
app.post('/api/settings', (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const db = getDatabase(mode);

  if (req.body.criteria) {
    db.criteria = { ...db.criteria, ...req.body.criteria };
  }
  if (req.body.schedule) {
    db.schedule = { ...db.schedule, ...req.body.schedule };
  }
  if (req.body.connections) {
    db.connections = { ...db.connections, ...req.body.connections };
  }

  saveDatabase(db, mode);
  res.json({ message: 'Settings updated successfully.', criteria: db.criteria, schedule: db.schedule, connections: db.connections });
});

// 14. Scheduled Cloud Scheduler Endpoint
app.post('/api/jobs/scheduled-scan', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const cronKeyHeader = req.headers['x-cron-key'];
  const db = getDatabase('live');

  const expectedSecret = db.schedule.cronSecret;
  const isAuthorized =
    (authHeader && authHeader === `Bearer ${expectedSecret}`) ||
    (cronKeyHeader && cronKeyHeader === expectedSecret) ||
    process.env.SCHEDULE_SECRET === expectedSecret;

  if (!isAuthorized) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing cron secret' });
    return;
  }

  if (db.schedule.isPaused) {
    res.json({ status: 'skipped', message: 'Scheduled scanning is currently paused in settings.' });
    return;
  }

  try {
    const scanRun = await runExtractionProcess('live', 'scheduled');
    res.json({ status: 'success', scanRun });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Scheduled scan failed' });
  }
});

// 15. Telegram Webhook Receiver
app.post('/api/telegram/webhook', (req: Request, res: Response) => {
  const db = getDatabase('live');
  const body = req.body;
  const message = body?.message || body?.channel_post;

  if (!message || !message.text) {
    res.status(200).json({ ok: true, note: 'No text content in telegram update' });
    return;
  }

  const chatId = String(message.chat?.id || '');
  const permitted = db.connections.telegram.permittedChatIds;

  if (permitted.length > 0 && !permitted.includes(chatId) && !permitted.includes(`@${message.chat?.username}`)) {
    res.status(200).json({ ok: true, note: `Chat ID ${chatId} not in permitted channels list` });
    return;
  }

  const newPost = {
    platform: 'Telegram' as const,
    collectionMethod: 'Connected' as const,
    content: message.text,
    externalId: `tg_${message.message_id}`,
    sourceUrl: message.chat?.username ? `https://t.me/${message.chat.username}/${message.message_id}` : null,
    authorIdentifier: message.from?.username ? `@${message.from.username}` : `id_${message.from?.id || 'unknown'}`,
    authorName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || null,
    postedAt: message.date ? new Date(message.date * 1000).toISOString() : null,
  };

  const { added, duplicates } = deduplicateAndInsertPosts([newPost], 'live');

  res.status(200).json({
    ok: true,
    added: added.length,
    duplicates: duplicates.length,
    status: added.length > 0 ? 'saved_for_scheduled_extraction' : 'duplicate_ignored',
  });
});

// Set up Vite in development or static serving in production
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Recruitment Data Collector running on http://0.0.0.0:${PORT} in ${isProduction ? 'production' : 'development'} mode`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});

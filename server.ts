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
import {
  isApifyConfigured,
  runApifySmallVerificationTest,
  mapTimeToPostedLimit,
  getApifyDiagnostics,
  verifyApifyCredentials,
} from './src/server/apify.ts';
import {
  getGmailSessionStatus,
  setGmailSession,
  clearGmailSession,
  sendEmailViaGmailApi,
} from './src/server/gmailService.ts';
import {
  sendOutreachEmail,
  buildPersonalizedEmail,
  generateCandidateDraft,
  handleCandidateOptOut,
  DEFAULT_OUTREACH_SETTINGS,
  setServerOrigin,
} from './src/server/outreachService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Dynamically capture public host for emails and links
app.use((req: Request, _res: Response, next) => {
  const host = req.get('host');
  if (host && !host.includes('localhost:3000')) {
    setServerOrigin(`${req.protocol}://${host}`);
  }
  next();
});

// 1. Health and Status (Scoped to selected mode to ensure Demo Sandbox never shows Live Apify logs)
app.get('/api/status', (req: Request, res: Response) => {
  const mode = (req.query.mode as string) === 'live' ? 'live' : 'demo';
  const currentRun = getCurrentActiveRun(mode);
  const latestRun = getLatestRunForMode(mode);
  const quota = isGeminiQuotaExhausted();
  const gmailSession = getGmailSessionStatus();
  const apifyDiagnostics = getApifyDiagnostics();

  res.json({
    status: 'ok',
    mode,
    geminiConfigured: isGeminiConfigured(),
    geminiQuotaExhausted: quota.isExhausted,
    geminiQuotaReason: quota.reason,
    apifyConfigured: isApifyConfigured(),
    apifyDiagnostics,
    gmailSession,
    gmailConnected: gmailSession.isConnected,
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
  const session = getGmailSessionStatus();
  if (data.outreachSettings) {
    data.outreachSettings.gmailConnected = session.isConnected;
    if (!session.isConnected) {
      data.outreachSettings.gmailConnectedAt = null;
    }
  }
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
    const diag = getApifyDiagnostics();
    res.status(400).json({
      setupRequired: true,
      error: diag.message,
      remedy: diag.remedy,
      diagnostics: diag,
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
    const diag = getApifyDiagnostics();
    res.status(400).json({
      setupRequired: true,
      error: diag.message,
      remedy: diag.remedy,
      diagnostics: diag,
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

// 4c. Lightweight Apify Token Validation (Auth test without starting actor)
app.get('/api/apify/verify', async (_req: Request, res: Response) => {
  const diag = getApifyDiagnostics();
  if (!diag.isConfigured) {
    res.json({
      configured: false,
      diagnostics: diag,
      user: null,
      error: diag.message,
    });
    return;
  }

  const result = await verifyApifyCredentials();
  res.json({
    configured: result.success,
    diagnostics: diag,
    user: result.success
      ? {
          username: result.username,
          email: result.email,
          plan: result.plan,
        }
      : null,
    error: result.error,
  });
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
  if (req.body.outreachSettings) {
    db.outreachSettings = { ...db.outreachSettings, ...req.body.outreachSettings };
  }

  saveDatabase(db, mode);
  res.json({
    message: 'Settings updated successfully.',
    criteria: db.criteria,
    schedule: db.schedule,
    connections: db.connections,
    outreachSettings: db.outreachSettings,
  });
});

// ==========================================
// GMAIL & OUTREACH WORKFLOW ENDPOINTS
// ==========================================

// Check Gmail OAuth Session Status
app.get('/api/gmail/status', (_req: Request, res: Response) => {
  const session = getGmailSessionStatus();
  res.json(session);
});

// Connect Recruiter Gmail Account via OAuth
app.post('/api/gmail/connect', async (req: Request, res: Response) => {
  const { accessToken, email, displayName } = req.body;
  if (!accessToken) {
    res.status(400).json({ error: 'OAuth accessToken is required.' });
    return;
  }

  const result = await setGmailSession(accessToken, email, displayName);
  if (!result.success) {
    res.status(400).json({ error: result.error || 'Failed to authenticate Gmail session.' });
    return;
  }

  // Update outreachSettings across modes to reflect connection without saving access token!
  const modes: ('demo' | 'live')[] = ['demo', 'live'];
  for (const m of modes) {
    const db = getDatabase(m);
    if (!db.outreachSettings) {
      db.outreachSettings = { ...DEFAULT_OUTREACH_SETTINGS };
    }
    db.outreachSettings.gmailConnected = true;
    db.outreachSettings.gmailConnectedEmail = result.email;
    db.outreachSettings.gmailConnectedAt = new Date().toISOString();
    // Outreach happens from bfsitalenthub@gmail.com whoever the user is
    db.outreachSettings.senderEmail = 'bfsitalenthub@gmail.com';
    db.outreachSettings.replyToEmail = 'bfsitalenthub@gmail.com';
    saveDatabase(db, m);
  }

  res.json({
    success: true,
    email: result.email,
    message: `Gmail account ${result.email} successfully connected with gmail.send permission.`,
  });
});

// Disconnect Gmail Account
app.post('/api/gmail/disconnect', (_req: Request, res: Response) => {
  clearGmailSession();
  const modes: ('demo' | 'live')[] = ['demo', 'live'];
  for (const m of modes) {
    const db = getDatabase(m);
    if (db.outreachSettings) {
      db.outreachSettings.gmailConnected = false;
      db.outreachSettings.gmailConnectedAt = null;
    }
    saveDatabase(db, m);
  }
  res.json({ success: true, message: 'Gmail session cleared.' });
});

// Send Verification Test Email via Gmail API
app.post('/api/gmail/test', async (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const db = getDatabase(mode);
  const session = getGmailSessionStatus();

  if (!session.isConnected) {
    res.status(400).json({
      success: false,
      error: 'Gmail account is not connected. Click "Connect Gmail" to authorize your recruiter account.',
    });
    return;
  }

  const targetEmail = (req.body.toEmail || session.email || 'bfsitalenthub@gmail.com').trim();
  const testSubject = `[Verification Test] BFSITalentHub Recruitment Gmail API Integration`;
  const formUrl = db.outreachSettings.googleFormUrl || 'https://forms.gle/bfsitalenthub';
  const testBody = `Hello,\n\nThis is a verified test email sent directly from your connected Gmail account (${session.email}) via the Google Gmail API (users.messages.send with permission: https://www.googleapis.com/auth/gmail.send).\n\nIntegration Status: ACTIVE & VERIFIED\nSender Name: ${db.outreachSettings.senderName || 'BFSITalentHub'}\nRegistration Link: ${formUrl}\nTimestamp: ${new Date().toISOString()}\n\nCandidate outreach emails are ready to be sent using your Gmail address.`;

  const result = await sendEmailViaGmailApi({
    to: targetEmail,
    subject: testSubject,
    bodyText: testBody,
    senderName: db.outreachSettings.senderName || 'BFSITalentHub Recruitment',
    replyTo: db.outreachSettings.replyToEmail || session.email || undefined,
  });

  // Record test results in database
  db.outreachSettings.lastTestedAt = new Date().toISOString();
  db.outreachSettings.lastTestStatus = result.success ? 'success' : 'failed';
  db.outreachSettings.lastTestRecipient = targetEmail;
  db.outreachSettings.lastTestMessage = result.success
    ? `Verified: Email sent successfully via Gmail API (Message ID: ${result.messageId}).`
    : result.error || 'Test email failed.';
  saveDatabase(db, mode);

  if (result.success) {
    res.json({
      success: true,
      messageId: result.messageId,
      recipient: targetEmail,
      message: `Test email successfully sent to ${targetEmail} via Gmail API.`,
    });
  } else {
    res.status(result.statusCode || 500).json({
      success: false,
      error: result.error,
      recipient: targetEmail,
    });
  }
});

// Send Verification Test Email via Gmail SMTP / App Password
app.post('/api/smtp/test', async (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const db = getDatabase(mode);
  const targetEmail = (req.body.toEmail || db.outreachSettings.senderEmail || 'bfsitalenthub@gmail.com').trim();
  const host = (req.body.host || db.outreachSettings.smtpConfig?.host || 'smtp.gmail.com').trim();
  const port = Number(req.body.port || db.outreachSettings.smtpConfig?.port || 465);
  const user = (req.body.user || db.outreachSettings.smtpConfig?.auth?.user || db.outreachSettings.senderEmail || 'bfsitalenthub@gmail.com').trim();
  const pass = (req.body.pass || db.outreachSettings.smtpConfig?.auth?.pass || '').replace(/\s+/g, '');

  if (!pass) {
    res.status(400).json({
      success: false,
      error: 'Google App Password is required. Please enter your 16-character App Password to test Gmail SMTP.',
    });
    return;
  }

  try {
    const nm: any = await import('nodemailer');
    const createTransport = nm.default?.createTransport || nm.createTransport;
    const transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });

    const testSubject = `[Verification Test] BFSITalentHub Gmail SMTP Verification`;
    const formUrl = `${req.protocol}://${req.get('host')}/apply`;
    const testBody = `Hello,\n\nThis is a real verified test email sent directly from bfsitalenthub@gmail.com using Gmail SMTP & Google App Password authentication.\n\nIntegration Status: ACTIVE & VERIFIED ON GOOGLE SERVERS\nSender Name: ${db.outreachSettings.senderName || 'BFSITalentHub'}\nCandidate Application Portal: ${formUrl}\nTimestamp: ${new Date().toISOString()}\n\nCandidate recruitment emails are ready to dispatch directly to inboxes.`;

    const info = await transporter.sendMail({
      from: `"${db.outreachSettings.senderName || 'BFSITalentHub'}" <${user}>`,
      to: targetEmail,
      replyTo: db.outreachSettings.replyToEmail || user,
      subject: testSubject,
      text: testBody,
    });

    // Save successful SMTP config to database
    if (!db.outreachSettings.smtpConfig) {
      db.outreachSettings.smtpConfig = { host, port, secure: port === 465, auth: { user, pass } };
    } else {
      db.outreachSettings.smtpConfig.host = host;
      db.outreachSettings.smtpConfig.port = port;
      db.outreachSettings.smtpConfig.secure = port === 465;
      db.outreachSettings.smtpConfig.auth = { user, pass };
    }
    db.outreachSettings.provider = 'smtp';
    db.outreachSettings.lastTestedAt = new Date().toISOString();
    db.outreachSettings.lastTestStatus = 'success';
    db.outreachSettings.lastTestRecipient = targetEmail;
    db.outreachSettings.lastTestMessage = `Verified: Test email delivered via Gmail SMTP (Message ID: ${info.messageId}).`;
    saveDatabase(db, mode);

    res.json({
      success: true,
      messageId: info.messageId,
      recipient: targetEmail,
      message: `Verified: Real test email delivered to ${targetEmail} via Gmail SMTP! Check your Sent folder and inbox.`,
    });
  } catch (err: any) {
    db.outreachSettings.lastTestedAt = new Date().toISOString();
    db.outreachSettings.lastTestStatus = 'failed';
    db.outreachSettings.lastTestRecipient = targetEmail;
    db.outreachSettings.lastTestMessage = `SMTP failed: ${err.message}`;
    saveDatabase(db, mode);

    res.status(400).json({
      success: false,
      error: `Gmail SMTP authentication failed: ${err.message}. If using Gmail, make sure you generated a 16-character Google App Password from myaccount.google.com/apppasswords.`,
    });
  }
});

// Reset Simulated Sends back to "Approved" so real emails can be dispatched
app.post('/api/outreach/reset-simulated-sends', (req: Request, res: Response) => {
  const mode = (req.body.mode as string) === 'live' ? 'live' : 'demo';
  const db = getDatabase(mode);

  let resetCount = 0;
  for (const c of db.candidates) {
    // Check if candidate is marked Sent but was sent via test/simulated mode
    if (c.outreachStatus === 'Sent') {
      const msg = db.outreachMessages.find(m => m.candidateId === c.id);
      if (!msg || msg.isTestModeSend || msg.providerMessageId?.startsWith('talenthub_') || msg.providerMessageId?.startsWith('test_sim_') || msg.providerMessageId?.startsWith('gmail_sim_')) {
        c.outreachStatus = 'Approved';
        c.outreachDeliveryStatus = undefined;
        c.outreachSentAt = null;
        resetCount++;
      }
    }
  }

  // Filter out the simulated messages so the message log is clean
  db.outreachMessages = db.outreachMessages.filter(
    m => !m.isTestModeSend && !m.providerMessageId?.startsWith('talenthub_') && !m.providerMessageId?.startsWith('test_sim_') && !m.providerMessageId?.startsWith('gmail_sim_')
  );

  saveDatabase(db, mode);

  res.json({
    success: true,
    resetCount,
    message: `Successfully reset ${resetCount} simulated candidate records back to "Approved" status. You can now send real emails using Batch Send.`,
  });
});

// Approve Candidate Draft Email
app.post('/api/outreach/approve-candidate', (req: Request, res: Response) => {
  const { candidateId, mode } = req.body;
  const db = getDatabase(mode === 'live' ? 'live' : 'demo');
  const candidate = db.candidates.find(c => c.id === candidateId);

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }

  candidate.outreachStatus = 'Approved';
  saveDatabase(db, mode === 'live' ? 'live' : 'demo');

  res.json({
    success: true,
    candidateId,
    outreachStatus: candidate.outreachStatus,
    message: `Outreach draft for ${candidate.name || 'Candidate'} approved by recruiter.`,
  });
});

// Update Candidate Outreach Status (Draft, Approved, Sent, Failed, Responded, Applied)
app.post('/api/outreach/update-status', (req: Request, res: Response) => {
  const { candidateId, status, mode } = req.body;
  const validStatuses = ['Draft', 'Approved', 'Sent', 'Failed', 'Responded', 'Applied'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  const db = getDatabase(mode === 'live' ? 'live' : 'demo');
  const candidate = db.candidates.find(c => c.id === candidateId);

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }

  candidate.outreachStatus = status;
  if (status === 'Sent' && !candidate.outreachSentAt) {
    candidate.outreachSentAt = new Date().toISOString();
  }
  saveDatabase(db, mode === 'live' ? 'live' : 'demo');

  res.json({
    success: true,
    candidateId,
    outreachStatus: candidate.outreachStatus,
    message: `Status updated to ${status}.`,
  });
});

// Generate / Regenerate Personalized Draft for Candidate
app.post('/api/outreach/generate-draft', (req: Request, res: Response) => {
  const { candidateId, mode } = req.body;
  const db = getDatabase(mode === 'live' ? 'live' : 'demo');
  const candidate = db.candidates.find(c => c.id === candidateId);

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }

  const origin = `${req.protocol}://${req.get('host')}`;
  candidate.draftEmail = generateCandidateDraft(candidate, db.outreachSettings, origin);
  saveDatabase(db, mode === 'live' ? 'live' : 'demo');

  res.json({
    success: true,
    draft: candidate.draftEmail,
  });
});

// Send Single Candidate Outreach Email
app.post('/api/outreach/send-single', async (req: Request, res: Response) => {
  const { candidateId, mode, subject, body } = req.body;
  const db = getDatabase(mode === 'live' ? 'live' : 'demo');
  const candidate = db.candidates.find(c => c.id === candidateId);

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }

  const origin = `${req.protocol}://${req.get('host')}`;
  const sendResult = await sendOutreachEmail({
    candidate,
    settings: db.outreachSettings,
    db,
    subjectOverride: subject,
    bodyOverride: body,
    origin,
  });

  saveDatabase(db, mode === 'live' ? 'live' : 'demo');

  if (sendResult.success) {
    res.json({
      success: true,
      messageId: sendResult.messageId,
      candidateId,
      outreachStatus: candidate.outreachStatus,
      message: `Email successfully sent to ${candidate.email} via Gmail API.`,
    });
  } else {
    res.status(400).json({
      success: false,
      error: sendResult.error || 'Failed to send outreach email.',
      candidateId,
      outreachStatus: candidate.outreachStatus,
    });
  }
});

// Batch Send Approved Outreach Emails
app.post('/api/outreach/batch-send', async (req: Request, res: Response) => {
  const { mode } = req.body;
  const db = getDatabase(mode === 'live' ? 'live' : 'demo');
  const origin = `${req.protocol}://${req.get('host')}`;

  // If in require_approval mode: only send 'Approved' candidates.
  // If in auto_send mode: can send 'Approved' and eligible 'Draft' candidates.
  const isAuto = db.outreachSettings.sendingMode === 'auto_send';
  const targetCandidates = db.candidates.filter(c => {
    if (c.outreachStatus === 'Sent' || c.outreachStatus === 'Applied' || c.outreachStatus === 'Responded') return false;
    if (c.isUnsubscribed) return false;
    if (!c.email) return false;
    if (isAuto) {
      return c.outreachStatus === 'Approved' || c.outreachStatus === 'Draft';
    }
    return c.outreachStatus === 'Approved';
  });

  if (targetCandidates.length === 0) {
    res.json({
      success: true,
      sentCount: 0,
      failedCount: 0,
      message: isAuto
        ? 'No eligible pending candidate drafts available for sending.'
        : 'No candidates in "Approved" status. Please review and approve candidate drafts first.',
    });
    return;
  }

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const cand of targetCandidates) {
    const result = await sendOutreachEmail({
      candidate: cand,
      settings: db.outreachSettings,
      db,
      origin,
    });

    if (result.success) {
      sentCount++;
    } else {
      failedCount++;
      if (result.error) errors.push(`${cand.name || cand.email}: ${result.error}`);
    }

    // Delay between sends to respect rate limits
    if (db.outreachSettings.delayBetweenEmailsSeconds > 0) {
      await new Promise(r => setTimeout(r, Math.min(db.outreachSettings.delayBetweenEmailsSeconds, 3) * 1000));
    }
  }

  saveDatabase(db, mode === 'live' ? 'live' : 'demo');

  res.json({
    success: true,
    sentCount,
    failedCount,
    errors,
    message: `Batch send finished: ${sentCount} emails sent successfully, ${failedCount} failed.`,
  });
});

// Candidate Unsubscribe / Opt-out Endpoint
app.get('/api/outreach/unsubscribe', (req: Request, res: Response) => {
  const { email, token } = req.query as { email?: string; token?: string };
  if (!email && !token) {
    res.status(400).send('Invalid unsubscribe link.');
    return;
  }

  const modes: ('demo' | 'live')[] = ['demo', 'live'];
  for (const m of modes) {
    const db = getDatabase(m);
    handleCandidateOptOut(email || '', token || '', db);
    saveDatabase(db, m);
  }

  res.send(`
    <html>
      <head><title>Unsubscribed</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc;">
        <h2 style="color: #38bdf8;">You Have Been Unsubscribed</h2>
        <p>Your email address has been removed from BFSITalentHub recruitment outreach.</p>
        <p style="color: #94a3b8; font-size: 13px;">No further recruitment invitations will be sent to this address.</p>
      </body>
    </html>
  `);
});

// Candidate Registration Form Info Endpoint
app.get('/api/candidate/form-info', (req: Request, res: Response) => {
  const { token, email, mode = 'live' } = req.query as { token?: string; email?: string; mode?: string };
  const targetMode = mode === 'demo' ? 'demo' : 'live';
  const db = getDatabase(targetMode);

  let candidate = db.candidates.find(
    c => (token && c.formToken === token) || (email && c.email && c.email.toLowerCase() === email.toLowerCase())
  );

  // If not found in target mode, try alternate mode
  if (!candidate) {
    const altDb = getDatabase(targetMode === 'live' ? 'demo' : 'live');
    candidate = altDb.candidates.find(
      c => (token && c.formToken === token) || (email && c.email && c.email.toLowerCase() === email.toLowerCase())
    );
  }

  res.json({
    success: true,
    candidate: candidate
      ? {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          currentRole: candidate.currentOrPreviousRole,
          employer: candidate.employer,
          location: candidate.currentWorkLocation,
          totalExperienceYears: candidate.totalExperienceYears,
          linkedInProfileUrl: candidate.profileUrl,
          sector: candidate.sector,
          outreachStatus: candidate.outreachStatus,
        }
      : null,
    outreachSettings: {
      organizationDescription: db.outreachSettings.organizationDescription,
      rolesBeingSourced: db.outreachSettings.rolesBeingSourced,
      senderName: db.outreachSettings.senderName,
      googleFormUrl: db.outreachSettings.googleFormUrl,
    },
  });
});

// Candidate Form Submission Endpoint
app.post('/api/candidate/submit-form', (req: Request, res: Response) => {
  const { token, email, fields, mode = 'live' } = req.body;
  if (!fields || !fields.fullName || !fields.email) {
    res.status(400).json({ error: 'Full name and email are required fields.' });
    return;
  }

  const modes: ('demo' | 'live')[] = [mode === 'demo' ? 'demo' : 'live', mode === 'demo' ? 'live' : 'demo'];
  let matchedCandidate = null;
  let targetDb = null;
  let activeMode: 'demo' | 'live' = 'live';

  for (const m of modes) {
    const db = getDatabase(m);
    const cand = db.candidates.find(
      c => (token && c.formToken === token) || (email && c.email && c.email.toLowerCase() === email.toLowerCase())
    );
    if (cand) {
      matchedCandidate = cand;
      targetDb = db;
      activeMode = m;
      break;
    }
  }

  if (!matchedCandidate || !targetDb) {
    // If not found in existing candidates, still accept submission into current db
    targetDb = getDatabase(mode === 'demo' ? 'demo' : 'live');
    activeMode = mode === 'demo' ? 'demo' : 'live';
  }

  const responseId = `resp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const submissionRecord = {
    id: responseId,
    candidateId: matchedCandidate ? matchedCandidate.id : `cand_external_${Date.now()}`,
    token: token || `tok_${Date.now()}`,
    submittedAt: new Date().toISOString(),
    submissionIp: req.ip,
    fields,
    sourcePlatform: matchedCandidate?.sourcePostIds?.length ? ('LinkedIn' as const) : ('Demo' as const),
    sourcePostUrl: matchedCandidate?.postUrl || null,
    recruiterNotes: 'Candidate submitted Expression of Interest registration form.',
  };

  if (!Array.isArray(targetDb.candidateResponses)) {
    targetDb.candidateResponses = [];
  }
  targetDb.candidateResponses.unshift(submissionRecord);

  if (matchedCandidate) {
    matchedCandidate.outreachStatus = 'Applied';
    matchedCandidate.candidateResponseId = responseId;
    matchedCandidate.formSubmittedAt = new Date().toISOString();
    matchedCandidate.engagementStatus = 'New Response';
    if (fields.mobile && !matchedCandidate.phone) matchedCandidate.phone = fields.mobile;
    if (fields.currentEmployerDesignation && !matchedCandidate.currentOrPreviousRole) {
      matchedCandidate.currentOrPreviousRole = fields.currentEmployerDesignation;
    }
    if (fields.currentCityState && !matchedCandidate.currentWorkLocation) {
      matchedCandidate.currentWorkLocation = fields.currentCityState;
    }
  }

  saveDatabase(targetDb, activeMode);

  res.json({
    success: true,
    message: 'Your expression of interest has been successfully submitted to BFSITalentHub.',
    responseId,
  });
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

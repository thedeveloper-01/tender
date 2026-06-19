import express from 'express';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { runPipeline } from '../pipeline/run.js';
import { clear as clearCache } from '../cache.js';

const router = express.Router();

let runInProgress = false;

router.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

/** POST /api/refresh — kick off the pipeline asynchronously */
router.post('/refresh', (_req, res) => {
  if (runInProgress) {
    return res.status(202).json({ started: false, message: 'A pipeline run is already in progress' });
  }
  runInProgress = true;
  runPipeline()
    .catch((e) => console.error('[admin] manual pipeline run failed:', e))
    .finally(() => {
      runInProgress = false;
    });
  res.status(202).json({ started: true, message: 'Pipeline run started. Check /api/fetch-logs for status.' });
});

/** POST /api/clear-cache — clear Express in-memory cache */
router.post('/clear-cache', (_req, res) => {
  try {
    clearCache();
    res.json({ success: true, message: 'Express cache cleared' });
  } catch (e) {
    console.error('[api] POST /clear-cache error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/fetch-logs — most recent N FetchLog rows, newest first */
router.get('/fetch-logs', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const logs = await prisma.fetchLog.findMany({
      orderBy: { runAt: 'desc' },
      take: limit,
    });
    res.json({ logs });
  } catch (e) {
    console.error('[api] GET /fetch-logs error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

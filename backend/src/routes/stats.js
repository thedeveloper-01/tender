import express from 'express';
import { prisma } from '../db.js';
import { get as cacheGet, set as cacheSet } from '../cache.js';

const router = express.Router();

/** GET /api/stats — totals, sums, breakdowns, last fetch time */
router.get('/', async (_req, res) => {
  try {
    const cached = cacheGet('stats');
    if (cached) {
      return res.json(cached);
    }

    const openWhere = { status: 'open' };

    const [totalOpen, valueAgg, bySource, byCategoryRaw, lastLog] = await Promise.all([
      prisma.tender.count({ where: openWhere }),
      prisma.tender.aggregate({ where: openWhere, _sum: { bidValue: true } }),
      prisma.tender.groupBy({ by: ['source'], where: openWhere, _count: { _all: true } }),
      prisma.tender.findMany({ where: openWhere, select: { category: true } }),
      prisma.fetchLog.findFirst({ orderBy: { runAt: 'desc' } }),
    ]);

    const categoryCounts = {};
    for (const { category } of byCategoryRaw) {
      for (const c of category || []) {
        categoryCounts[c] = (categoryCounts[c] || 0) + 1;
      }
    }

    const result = {
      totalOpenTenders: totalOpen,
      totalEstimatedValue: valueAgg._sum.bidValue || 0,
      bySource: Object.fromEntries(bySource.map((s) => [s.source, s._count._all])),
      byCategory: categoryCounts,
      lastFetchAt: lastLog?.runAt || null,
    };

    cacheSet('stats', result, 3600000); // 1 hour

    res.json(result);
  } catch (e) {
    console.error('[api] GET /stats error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

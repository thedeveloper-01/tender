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

    const openWhere = {
      status: 'open',
      OR: [
        { endDate: { gte: new Date() } },
        { endDate: null }
      ]
    };

    const now = new Date();
    const [totalOpen, valueAgg, bySource, categoriesRaw, lastLog] = await Promise.all([
      prisma.tender.count({ where: openWhere }),
      prisma.tender.aggregate({ where: openWhere, _sum: { bidValue: true } }),
      prisma.tender.groupBy({ by: ['source'], where: openWhere, _count: { _all: true } }),
      prisma.tender.aggregateRaw({
        pipeline: [
          {
            $match: {
              status: 'open',
              $or: [
                { endDate: { $gte: { $date: now.toISOString() } } },
                { endDate: null }
              ]
            }
          },
          { $unwind: '$category' },
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ]
      }),
      prisma.fetchLog.findFirst({ orderBy: { runAt: 'desc' } }),
    ]);

    const categoryCounts = {};
    if (Array.isArray(categoriesRaw)) {
      for (const item of categoriesRaw) {
        if (item && item._id) {
          let count = 0;
          if (typeof item.count === 'number') {
            count = item.count;
          } else if (item.count && item.count.$numberLong) {
            count = parseInt(item.count.$numberLong, 10);
          } else if (item.count && item.count.$numberInt) {
            count = parseInt(item.count.$numberInt, 10);
          } else if (item.count) {
            count = parseInt(String(item.count), 10) || 0;
          }
          categoryCounts[item._id] = count;
        }
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

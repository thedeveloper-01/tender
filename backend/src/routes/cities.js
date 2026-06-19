import express from 'express';
import { prisma } from '../db.js';
import { CG_CITIES } from '../config.js';
import { get as cacheGet, set as cacheSet } from '../cache.js';

const router = express.Router();

/** GET /api/cities — 33 CG districts + open-tender counts, plus "Unspecified" */
router.get('/', async (_req, res) => {
  try {
    const cached = cacheGet('cities');
    if (cached) {
      return res.json(cached);
    }

    const grouped = await prisma.tender.groupBy({
      by: ['locationCity'],
      where: { status: 'open' },
      _count: { _all: true },
    });

    const countMap = Object.fromEntries(grouped.map((g) => [g.locationCity, g._count._all]));

    const cities = CG_CITIES.map((name) => ({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      openCount: countMap[name] || 0,
    }));

    cities.push({
      name: 'Unspecified',
      slug: 'unspecified',
      openCount: countMap['Unspecified'] || 0,
    });

    const result = { cities };
    cacheSet('cities', result, 43200000); // 12 hours

    res.json(result);
  } catch (e) {
    console.error('[api] GET /cities error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import express from 'express';
import fs from 'fs';
import { prisma } from '../db.js';
import { get as cacheGet, set as cacheSet } from '../cache.js';

const router = express.Router();

const SORT_MAP = {
  endDate_asc: { endDate: 'asc' },
  endDate_desc: { endDate: 'desc' },
  bidValue_asc: { bidValue: 'asc' },
  bidValue_desc: { bidValue: 'desc' },
  emdAmount_asc: { emdAmount: 'asc' },
  emdAmount_desc: { emdAmount: 'desc' },
  fetchedAt_desc: { fetchedAt: 'desc' },
};

/**
 * GET /api/tenders
 * Filters: city, q, category, status (open|closed|all, default open),
 * minValue, maxValue, minEmd, maxEmd, source (GEM|CSPGCL|all),
 * sort (default endDate_asc), page (default 1), limit (default 20, max 100)
 */
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'tenders:' + JSON.stringify(req.query);
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const {
      city,
      q,
      category,
      status = 'open',
      minValue,
      maxValue,
      minEmd,
      maxEmd,
      source,
      sort = 'endDate_asc',
      page = '1',
      limit = '20',
    } = req.query;

    const where = {};

    if (city && city !== 'all') where.locationCity = city;
    if (source && source !== 'all') where.source = source.toUpperCase();
    if (status && status !== 'all') where.status = status;

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { organization: { contains: q, mode: 'insensitive' } },
        { bidNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (category) {
      const cats = Array.isArray(category) ? category : String(category).split(',');
      where.category = { hasSome: cats };
    }

    if (minValue || maxValue) {
      where.bidValue = {};
      if (minValue) where.bidValue.gte = Number(minValue);
      if (maxValue) where.bidValue.lte = Number(maxValue);
    }

    if (minEmd || maxEmd) {
      where.emdAmount = {};
      if (minEmd) where.emdAmount.gte = Number(minEmd);
      if (maxEmd) where.emdAmount.lte = Number(maxEmd);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    let orderBy = SORT_MAP[sort] || SORT_MAP.endDate_asc;

    // For endDate_asc (default), push nulls last by querying non-null first,
    // then padding with null-endDate tenders if needed.
    let tenders, total;
    if (sort === 'endDate_asc' || !sort) {
      const whereWithDate = { ...where, endDate: { not: null } };
      const whereNullDate = { ...where, endDate: null };

      total = await prisma.tender.count({ where });
      const withDate = await prisma.tender.findMany({
        where: whereWithDate,
        orderBy: { endDate: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      let remaining = limitNum - withDate.length;
      let nullDateItems = [];
      if (remaining > 0) {
        const dateCount = await prisma.tender.count({ where: whereWithDate });
        const skipNull = Math.max(0, (pageNum - 1) * limitNum - dateCount);
        nullDateItems = await prisma.tender.findMany({
          where: whereNullDate,
          orderBy: { fetchedAt: 'desc' },
          skip: skipNull,
          take: remaining,
        });
      }
      tenders = [...withDate, ...nullDateItems];
    } else {
      total = await prisma.tender.count({ where });
      tenders = await prisma.tender.findMany({
        where,
        orderBy,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });
    }

    const result = { tenders, total, page: pageNum, limit: limitNum };
    cacheSet(cacheKey, result, 3600000); // 1 hour

    res.json(result);
  } catch (e) {
    console.error('[api] GET /tenders error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/tenders/:source/:bidNumber — single tender detail (full record) */
router.get('/:source/:bidNumber', async (req, res) => {
  try {
    const { source, bidNumber } = req.params;
    const tender = await prisma.tender.findUnique({
      where: { source_bidNumber: { source: source.toUpperCase(), bidNumber } },
    });
    if (!tender) return res.status(404).json({ error: 'Tender not found' });
    res.json(tender);
  } catch (e) {
    console.error('[api] GET /tenders/:source/:bidNumber error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/tenders/:source/:bidNumber/document — stream saved PDF */
router.get('/:source/:bidNumber/document', async (req, res) => {
  try {
    const { source, bidNumber } = req.params;
    const tender = await prisma.tender.findUnique({
      where: { source_bidNumber: { source: source.toUpperCase(), bidNumber } },
    });
    if (!tender || !tender.pdfPath || !fs.existsSync(tender.pdfPath)) {
      return res.status(404).json({ error: 'Document not available' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${source}-${bidNumber}.pdf"`);
    fs.createReadStream(tender.pdfPath).pipe(res);
  } catch (e) {
    console.error('[api] GET /tenders/:source/:bidNumber/document error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

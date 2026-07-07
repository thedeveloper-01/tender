import express from 'express';
import fs from 'fs';
import { prisma } from '../db.js';
import { get as cacheGet, set as cacheSet } from '../cache.js';
import { aiExtractTender } from '../pipeline/aiExtract.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const router = express.Router();

const SORT_MAP = {
  endDate_asc:    { endDate: 'asc' },
  endDate_desc:   { endDate: 'desc' },
  bidValue_asc:   { bidValue: 'asc' },
  bidValue_desc:  { bidValue: 'desc' },
  emdAmount_asc:  { emdAmount: 'asc' },
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
      mseStartupOnly,
      zeroExperienceOnly,
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

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const isJsonFiltering = mseStartupOnly === 'true' || zeroExperienceOnly === 'true';
    let tenders, total;

    if (isJsonFiltering) {
      // 1. Fetch all matching candidates from the database (unpaginated)
      let candidates = await prisma.tender.findMany({
        where,
      });

      // Helpers to safely read both standard aiExtract and legacy pdfExtract structures
      const getMseExempt = (tender) => {
        const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
        if (eligibility && eligibility.mseExemption !== undefined) return eligibility.mseExemption;
        const fields = tender.sourceMeta?.pdfExtract?.fields;
        if (fields && fields.mseExemption) return fields.mseExemption.value;
        return null;
      };

      const getStartupExempt = (tender) => {
        const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
        if (eligibility && eligibility.startupExemption !== undefined) return eligibility.startupExemption;
        const fields = tender.sourceMeta?.pdfExtract?.fields;
        if (fields && fields.startupExemption) return fields.startupExemption.value;
        return null;
      };

      const getYearsOfExperience = (tender) => {
        const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
        if (eligibility && eligibility.yearsOfExperience !== undefined) return eligibility.yearsOfExperience;
        const fields = tender.sourceMeta?.pdfExtract?.fields;
        if (fields && fields.experienceCriteria) return fields.experienceCriteria.value;
        return null;
      };

      // 2. Perform Javascript filtering in memory
      if (mseStartupOnly === 'true') {
        candidates = candidates.filter(t => {
          const mseVal = getMseExempt(t);
          const startupVal = getStartupExempt(t);
          const isMseExempt = mseVal?.toLowerCase().startsWith('yes') || mseVal?.toLowerCase().startsWith('exempt');
          const isStartupExempt = startupVal?.toLowerCase().startsWith('yes') || startupVal?.toLowerCase().startsWith('exempt');
          return isMseExempt || isStartupExempt;
        });
      }

      if (zeroExperienceOnly === 'true') {
        candidates = candidates.filter(t => {
          const exp = getYearsOfExperience(t)?.toLowerCase();
          const hasExp = exp && exp !== 'not specified' && !exp.includes('0') && !exp.includes('no') && !exp.includes('not required') && !exp.includes('nil') && !exp.includes('exempt');
          return !hasExp;
        });
      }

      total = candidates.length;

      // 3. Sort (matching standard sorting rules)
      if (sort === 'endDate_asc' || !sort) {
        // Sort ascending, placing null endDates at the end
        candidates.sort((a, b) => {
          if (a.endDate && b.endDate) return new Date(a.endDate) - new Date(b.endDate);
          if (a.endDate) return -1;
          if (b.endDate) return 1;
          return new Date(b.fetchedAt) - new Date(a.fetchedAt);
        });
      } else {
        const orderBy = SORT_MAP[sort] || SORT_MAP.endDate_asc;
        const key = Object.keys(orderBy)[0];
        const dir = orderBy[key];
        candidates.sort((a, b) => {
          const valA = a[key];
          const valB = b[key];
          if (valA == null && valB == null) return 0;
          if (valA == null) return 1;
          if (valB == null) return -1;
          if (typeof valA === 'string') {
            return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          return dir === 'asc' ? valA - valB : valB - valA;
        });
      }

      // 4. Skip & Take pagination slice
      tenders = candidates.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    } else {
      // Standard database pagination query (highly optimized, unchanged)
      let orderBy = SORT_MAP[sort] || SORT_MAP.endDate_asc;

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
          const skipNull  = Math.max(0, (pageNum - 1) * limitNum - dateCount);
          nullDateItems = await prisma.tender.findMany({
            where: whereNullDate,
            orderBy: { fetchedAt: 'desc' },
            skip: skipNull,
            take: remaining,
          });
        }
        tenders = [...withDate, ...nullDateItems];
      } else {
        total   = await prisma.tender.count({ where });
        tenders = await prisma.tender.findMany({
          where,
          orderBy,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        });
      }
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

/**
 * GET /api/tenders/:source/:bidNumber/ai-extract
 *
 * Returns the AI-structured extraction (consignees, eligibility, atc) for a GEM tender.
 *
 * Strategy (Option C — eager pipeline + on-demand fallback):
 *   1. If sourceMeta.aiExtract already stored in DB → return instantly.
 *   2. If the tender has a saved PDF but no aiExtract → run AI live,
 *      persist to DB, then return.
 *   3. No PDF and no stored data → 404 with explanation.
 *
 * Only available for GEM tenders (CSPGCL uses the built-in regex parser).
 */
router.get('/:source/:bidNumber/ai-extract', async (req, res) => {
  try {
    const { source, bidNumber } = req.params;

    if (source.toUpperCase() !== 'GEM') {
      return res.status(400).json({
        error: 'AI extraction is only available for GEM tenders',
        hint: 'CSPGCL tenders use the built-in table parser',
      });
    }

    const tender = await prisma.tender.findUnique({
      where: { source_bidNumber: { source: 'GEM', bidNumber } },
    });
    if (!tender) return res.status(404).json({ error: 'Tender not found' });

    // ── 1. Serve stored DB result (set by pipeline) ─────────────────────────
    const stored = tender.sourceMeta?.aiExtract;
    if (stored && stored.extractedAt) {
      return res.json({
        source:    'db_cache',
        bidNumber,
        title:     tender.title,
        ...stored,
      });
    }

    // ── 2. On-demand: run AI if PDF is present ──────────────────────────────
    if (!tender.pdfPath || !fs.existsSync(tender.pdfPath)) {
      return res.status(404).json({
        error:  'AI extract not yet available',
        reason: 'No PDF downloaded for this tender yet. Wait for the next pipeline run.',
      });
    }

    console.log(`[api] on-demand AI extraction for ${bidNumber}...`);

    let rawText = '';
    try {
      const buf  = fs.readFileSync(tender.pdfPath);
      const data = await pdfParse(buf);
      rawText    = data.text || '';
    } catch (e) {
      console.error('[api] pdf-parse failed for on-demand extract:', e.message);
      return res.status(500).json({ error: 'Failed to parse PDF', detail: e.message });
    }

    const aiResult = await aiExtractTender(rawText);
    if (!aiResult) {
      return res.status(503).json({
        error:  'AI extraction failed',
        reason: 'OpenRouter call failed or AI_EXTRACT_ENABLED=false. Check server logs.',
      });
    }

    // Persist to DB so next request is instant (no repeat AI call)
    const updatedSourceMeta = {
      ...(tender.sourceMeta || {}),
      aiExtract: aiResult,
    };
    await prisma.tender.update({
      where: { id: tender.id },
      data:  { sourceMeta: updatedSourceMeta },
    });

    console.log(`[api] ✓ on-demand AI extract stored to DB for ${bidNumber}`);

    return res.json({
      source:    'live',
      bidNumber,
      title:     tender.title,
      ...aiResult,
    });
  } catch (e) {
    console.error('[api] GET /tenders/:source/:bidNumber/ai-extract error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

/**
 * pipeline/extract.js
 *
 * Unified PDF extraction entry-point for the pipeline.
 *
 * GEM tenders  → extractor/parser.js (fully offline, deterministic — no API, no AI)
 * CSPGCL tenders → extractCspgclPdf() (dedicated regex parser, unchanged)
 *
 * Return shape:
 * {
 *   bidValue:              number | null,
 *   emdAmount:             number | null,
 *   status:                'extracted' | 'not_found' | 'not_attempted' | 'failed_download' | 'scanned',
 *   extractedText:         string | null,
 *   aiExtract:             object | null,   // stored in sourceMeta.aiExtract (same DB key)
 *   rows:                  array,           // CSPGCL only
 * }
 */

import fs from 'fs';
import { extractCspgclPdf } from './cspgcl_extract.js';
import { extractGemPdf as _extractGemPdfOffline } from '../extractor/parser.js';

// ── GEM extraction ────────────────────────────────────────────────────────────
// Fully offline — pdftotext -layout (poppler) → pdf-parse fallback → deterministic parser.
// No API calls, no AI models, no cost. See extractor/parser.js for full pipeline.
async function extractGemPdf(pdfPath) {
  return _extractGemPdfOffline(pdfPath);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * extractValueAndEmd(tender, pdfPath) → extract result
 *
 * Dispatcher:
 *   - CSPGCL → dedicated regex table-parser (extractCspgclPdf)
 *   - GEM    → AI extraction via OpenRouter (extractGemPdf)
 *
 * If pdfPath is missing/non-existent, returns a minimal result immediately.
 */
export async function extractValueAndEmd(tender, pdfPath) {
  // ── No PDF available ───────────────────────────────────────────────────────
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    const bidValue  = tender.bidValue  ?? null;
    const emdAmount = tender.emdAmount ?? null;
    return {
      bidValue,
      emdAmount,
      status: (bidValue != null || emdAmount != null) ? 'extracted' : 'not_attempted',
      extractedText: null,
      aiExtract: null,
      rows: [],
    };
  }

  // ── CSPGCL — dedicated parser (regex-based, unchanged) ────────────────────
  if (tender.source === 'CSPGCL') {
    try {
      const result = await extractCspgclPdf(pdfPath);
      return {
        bidValue:      result.bidValue  ?? tender.bidValue  ?? null,
        emdAmount:     result.emdAmount ?? tender.emdAmount ?? null,
        status:        result.status,
        extractedText: result.rawText ?? null,
        aiExtract:     null,   // CSPGCL uses its own parser, no AI pass
        rows:          result.rows ?? [],
      };
    } catch (e) {
      console.error('[extract] CSPGCL pdf-parse failed:', e.message);
      return {
        bidValue: tender.bidValue ?? null,
        emdAmount: tender.emdAmount ?? null,
        status: 'not_found',
        extractedText: null,
        aiExtract: null,
        rows: [],
      };
    }
  }

  // ── GEM — AI extraction ────────────────────────────────────────────────────
  return extractGemPdf(pdfPath);
}

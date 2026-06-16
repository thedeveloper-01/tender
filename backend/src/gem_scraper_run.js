/**
 * gem_scraper_run.js
 *
 * Standalone GEM portal scraper script.
 *
 * Run with:
 *   node backend/src/gem_scraper_run.js
 *
 * Or via the companion  gem-scrape-now.bat  in the project root.
 *
 * What it does
 * ─────────────
 * 1. Launches Playwright Chromium (headless) to scrape GeM bidplus.gem.gov.in
 *    — bypasses bot-detection that blocks raw fetch() / axios calls.
 * 2. Iterates all paginated results for state=CHHATTISGARH.
 * 3. Normalises raw Solr docs → unified Tender shape (normalizeGem).
 * 4. Runs the shared rule-based analysis engine (categorize, viabilityScore,
 *    identifyRisks).
 * 5. Upserts each tender keyed on [source, bidNumber] — new records are
 *    INSERTed, existing ones UPDATEd. Schema is never altered.
 * 6. Downloads tender PDFs (if available) and extracts bidValue / emdAmount.
 * 7. Bulk-corrects open/closed status based on endDate.
 * 8. Writes a FetchLog row.
 * 9. Prints a clean summary and exits with code 0 on success, 1 on failure.
 *
 * All DB writes use the existing Prisma client and schema — no overrides.
 */

import 'dotenv/config';
import path from 'path';
import fs   from 'fs';
import os   from 'os';

// ── Re-use ALL existing pipeline modules ─────────────────────────────────────
import { prisma }            from './db.js';
import { config }            from './config.js';
import { normalizeGem }      from './pipeline/normalize.js';
import { resolveCityForGem } from './pipeline/locationResolve.js';
import { analyzeTender }     from './pipeline/analysis.js';
import { downloadPdf }       from './pipeline/pdf.js';
import { extractValueAndEmd } from './pipeline/extract.js';
import { runCleanup }        from './pipeline/cleanup.js';

// ── Browser-based fetcher (new – bypasses bot-detection) ────────────────────
import { fetchGemTendersBrowser } from './fetchers/gem_browser.js';

// ─────────────────────────────────────────────────────────────────────────────

// Lock file — prevents two instances running simultaneously (locally or on Render).
// Stored in OS temp dir so it works cross-platform and survives cwd changes.
const LOCK_FILE = path.join(os.tmpdir(), 'gem_scraper.lock');

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    const pid = Number(raw);
    // Check if the PID written in the lock file is still an active process
    let alive = false;
    try {
      process.kill(pid, 0); // signal 0 = existence check only, no actual signal
      alive = true;
    } catch (_) {
      // ESRCH = no such process → stale lock
    }
    if (alive) {
      console.log(`[lock] Another instance is already running (PID ${pid}). Exiting.`);
      process.exit(0); // exit 0 — not an error, just a skip
    }
    // Stale lock — remove it and continue
    console.log(`[lock] Removing stale lock file (PID ${pid} is not running).`);
    fs.unlinkSync(LOCK_FILE);
  }
  // Write our own PID
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch (_) { /* ignore */ }
}

// Always clean up the lock file on exit (normal, uncaught error, SIGINT, SIGTERM)
process.on('exit',    releaseLock);
process.on('SIGINT',  () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); })

const SCRIPT_NAME = 'gem_scraper_run';

async function main() {
  // ── Guard: exit immediately if another instance is running ───────────────
  acquireLock();
  console.log(`[lock] Lock acquired (PID ${process.pid}). Starting...`);

  banner('GEM Portal Scraper (browser mode)');

  const runAt  = new Date();
  const errors = [];

  let found          = 0;
  let newCount       = 0;
  let updatedCount   = 0;
  let pdfsDownloaded = 0;
  let extractionOk   = 0;
  let extractionFail = 0;
  let cleanedRecords = 0;
  let cleanedFiles   = 0;

  // ── 1. Fetch via Playwright ───────────────────────────────────────────────
  log('STEP 1/7 — Fetching GEM tenders via headless browser...');
  let gemRaw = [];
  try {
    gemRaw = await fetchGemTendersBrowser();
    found  = gemRaw.length;
    log(`Fetched ${found} raw records from GeM portal`);
  } catch (e) {
    const msg = `GEM browser-fetch failed: ${e.message}`;
    log(`ERROR: ${msg}`);
    errors.push(msg);
    // Abort early — nothing to process
    await writeLog(runAt, found, newCount, updatedCount, pdfsDownloaded,
                   extractionOk, extractionFail, cleanedRecords, cleanedFiles, errors);
    process.exit(1);
  }

  // ── 2. Normalise ──────────────────────────────────────────────────────────
  log(`STEP 2/7 — Normalising ${found} records...`);
  const normalized = [];
  for (const raw of gemRaw) {
    try {
      normalized.push(normalizeGem(raw));
    } catch (e) {
      const msg = `Normalize error (${raw?.bidNumber}): ${e.message}`;
      log(`  WARN: ${msg}`);
      errors.push(msg);
    }
  }
  log(`Normalised: ${normalized.length}/${found}`);

  // ── 3. Analyse + Upsert ───────────────────────────────────────────────────
  // Deduplicate normalized array by bidNumber to avoid duplicate processing
  const uniqueNormalizedMap = new Map();
  for (const tender of normalized) {
    if (tender && tender.bidNumber) {
      uniqueNormalizedMap.set(tender.bidNumber, tender);
    }
  }
  const uniqueNormalized = Array.from(uniqueNormalizedMap.values());
  log(`STEP 3/7 — Analysing & upserting ${uniqueNormalized.length} unique tenders (from ${normalized.length} total)...`);
  const changedTenders = []; // needs PDF / extract pass

  for (let i = 0; i < uniqueNormalized.length; i++) {
    const tender = uniqueNormalized[i];
    if ((i + 1) % 50 === 0 || i === uniqueNormalized.length - 1) {
      log(`  upsert progress: ${i + 1}/${uniqueNormalized.length}`);
    }
    try {
      const analyzed = analyzeTender(tender);
      const data     = { ...tender, ...analyzed };

      const existing = await prisma.tender.findUnique({
        where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
      });

      const saved = await prisma.tender.upsert({
        where:  { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
        create: data,
        update: data,
      });

      if (!existing) {
        newCount++;
        changedTenders.push(saved);
      } else {
        updatedCount++;
        const needsPdf =
          existing.valueExtractionStatus === 'not_attempted' ||
          !existing.valueExtractionStatus ||
          existing.endDate?.getTime() !== data.endDate?.getTime();
        if (needsPdf) changedTenders.push(saved);
      }
    } catch (e) {
      const msg = `Upsert error (${tender.source}/${tender.bidNumber}): ${e.message}`;
      log(`  WARN: ${msg}`);
      errors.push(msg);
    }
  }
  log(`Upsert done. New: ${newCount}  Updated: ${updatedCount}  PDF queue: ${changedTenders.length}`);

  // ── 4. PDF download + value/EMD extraction ────────────────────────────────
  log(`STEP 4/7 — PDF download + extraction for ${changedTenders.length} tenders...`);
  for (let i = 0; i < changedTenders.length; i++) {
    const tender = changedTenders[i];
    const idx    = `[${i + 1}/${changedTenders.length}]`;
    try {
      const pdfPath = await downloadPdf(tender);
      if (pdfPath) {
        pdfsDownloaded++;
        log(`  ${idx} PDF saved: ${path.basename(pdfPath)}`);
      } else {
        log(`  ${idx} PDF not available for ${tender.bidNumber}`);
      }

      const result = await extractValueAndEmd(tender, pdfPath);
      if (!pdfPath && result.status !== 'extracted') result.status = 'failed_download';

      if (result.status === 'extracted')                      extractionOk++;
      else if (['not_found','failed_download'].includes(result.status)) extractionFail++;

      let updatedCity = tender.locationCity;
      if (!updatedCity || updatedCity === 'Unspecified') {
        const addressText = result.extractedFields?.consigneeAddress?.value || '';
        const fullText = result.extractedText || '';
        const resolved = resolveCityForGem(`${addressText} ${fullText}`);
        if (resolved && resolved !== 'Unspecified') {
          updatedCity = resolved;
          log(`  [location] resolved city to "${resolved}" for ${tender.bidNumber}`);
        }
      }

      const sourceMeta = {
        ...(tender.sourceMeta || {}),
        pdfExtract: { text: result.extractedText, fields: result.extractedFields },
      };

      await prisma.tender.update({
        where: { id: tender.id },
        data: {
          pdfPath:              pdfPath || tender.pdfPath,
          bidValue:             result.bidValue,
          emdAmount:            result.emdAmount,
          valueExtractionStatus: result.status,
          locationCity:         updatedCity,
          sourceMeta,
        },
      });
    } catch (e) {
      const msg = `PDF/extract error (${tender.source}/${tender.bidNumber}): ${e.message}`;
      log(`  WARN: ${msg}`);
      errors.push(msg);
      extractionFail++;
      // Still mark as failed_download in DB so the tender is visible and
      // won't be re-queued for PDF retry on every future run.
      try {
        await prisma.tender.update({
          where: { id: tender.id },
          data: { valueExtractionStatus: 'failed_download' },
        });
      } catch (_) { /* ignore secondary DB error */ }
    }
  }
  log(`PDF pass done. Downloaded: ${pdfsDownloaded}  OK: ${extractionOk}  Fail: ${extractionFail}`);

  // ── 5. Bulk status correction (open / closed) ─────────────────────────────
  log('STEP 5/7 — Bulk status update...');
  const now = new Date();
  try {
    const closed = await prisma.tender.updateMany({
      where: { source: 'GEM', status: 'open',   endDate: { lt: now } },
      data:  { status: 'closed' },
    });
    const opened = await prisma.tender.updateMany({
      where: { source: 'GEM', status: 'closed', endDate: { gte: now } },
      data:  { status: 'open' },
    });
    log(`Status update: ${closed.count} → closed, ${opened.count} → open`);
  } catch (e) {
    const msg = `Status update error: ${e.message}`;
    log(`  WARN: ${msg}`);
    errors.push(msg);
  }

  // ── 6. Cleanup / archive ──────────────────────────────────────────────────
  log('STEP 6/7 — Cleanup & archiving...');
  try {
    const cleanup = await runCleanup(prisma);
    cleanedRecords = cleanup.cleanedRecords;
    cleanedFiles   = cleanup.cleanedFiles;
    log(`Cleanup done: ${cleanedRecords} records, ${cleanedFiles} files`);
  } catch (e) {
    const msg = `Cleanup error: ${e.message}`;
    log(`  WARN: ${msg}`);
    errors.push(msg);
  }

  // ── 7. Write FetchLog ─────────────────────────────────────────────────────
  log('STEP 7/7 — Writing FetchLog to DB...');
  const fetchLog = await writeLog(
    runAt, found, newCount, updatedCount, pdfsDownloaded,
    extractionOk, extractionFail, cleanedRecords, cleanedFiles, errors,
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  GEM SCRAPE COMPLETE');
  console.log('══════════════════════════════════════════════');
  console.log(`  Run ID         : ${fetchLog.id}`);
  console.log(`  Total found    : ${found}`);
  console.log(`  New tenders    : ${newCount}`);
  console.log(`  Updated        : ${updatedCount}`);
  console.log(`  PDFs downloaded: ${pdfsDownloaded}`);
  console.log(`  Extracted OK   : ${extractionOk}`);
  console.log(`  Extract failed : ${extractionFail}`);
  console.log(`  Archived       : ${cleanedRecords}`);
  console.log(`  Errors         : ${errors.length}`);
  if (errors.length > 0) {
    console.log('');
    console.log('  Error details:');
    errors.forEach((e) => console.log(`    - ${e}`));
  }
  console.log('══════════════════════════════════════════════');

  process.exit(errors.length > 0 ? 1 : 0);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
  console.log(`[${ts}] ${msg}`);
}

function banner(title) {
  const line = '═'.repeat(title.length + 4);
  console.log(line);
  console.log(`  ${title}`);
  console.log(line);
  console.log('');
}

async function writeLog(
  runAt, found, newCount, updatedCount,
  pdfsDownloaded, extractionOk, extractionFail,
  cleanedRecords, cleanedFiles, errors,
) {
  try {
    return await prisma.fetchLog.create({
      data: {
        runAt,
        source:        'GEM',
        found,
        newCount,
        updatedCount,
        pdfsDownloaded,
        extractionOk,
        extractionFail,
        cleanedRecords,
        cleanedFiles,
        errors,
      },
    });
  } catch (e) {
    console.error('[fetchlog] Failed to write FetchLog:', e.message);
    // Return a dummy object so the caller doesn't crash
    return { id: 'N/A' };
  }
}

// ─── entry ────────────────────────────────────────────────────────────────────

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});

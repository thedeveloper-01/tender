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
 * Iterates EVERY Indian state/UT (see fetchers/gem.js#GEM_STATES) ONE AT A
 * TIME, fully finishing each state before moving to the next:
 *   For each state:
 *     1. Launches Playwright Chromium (headless) to scrape GeM
 *        bidplus.gem.gov.in for that state only — bypasses bot-detection
 *        that blocks raw fetch()/axios calls, and works around GeM's state
 *        dropdown needing a live browser session.
 *     2. Normalises raw Solr docs → unified Tender shape (normalizeGem),
 *        tagging each record with the state it was fetched under.
 *     3. Runs the shared rule-based analysis engine (categorize,
 *        viabilityScore, identifyRisks) and upserts each tender keyed on
 *        [source, bidNumber]. Schema is never altered.
 *     4. Downloads tender PDFs into a state-scoped folder
 *        (documents/GEM/<STATE>/...) and extracts bidValue/emdAmount +
 *        resolves the tender's city against THAT state's own district
 *        list (GeM PDFs don't reliably carry location data on their own,
 *        so processing one state fully before starting the next is what
 *        keeps folder + city attribution correct).
 * After all states are done:
 *   5. Bulk-corrects open/closed status based on endDate.
 *   6. Runs cleanup/archiving.
 *   7. Writes a single aggregated FetchLog row.
 *   8. Prints a clean summary and exits with code 0 on success, 1 on failure.
 *
 * All DB writes use the existing Prisma client and schema — no overrides.
 */

import 'dotenv/config';
import path    from 'path';
import fs      from 'fs';
import os      from 'os';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
// Project root is two levels above backend/src/
const PROJECT_ROOT     = path.resolve(__dirname, '../../');
const SCRAPE_LOG_PATH  = path.join(PROJECT_ROOT, 'scrape_log.jsonl');
const GEM_DATA_PATH    = path.join(PROJECT_ROOT, 'gem_tenders.json');

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
import { fetchGemTendersForState } from './fetchers/gem_browser.js';
import { GEM_STATES } from './fetchers/gem.js';

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

  // Full-run tender list (across all states) — kept only for the data-log dump.
  const allNormalizedTenders = [];

  // ── 1-4. Fetch + normalise + upsert + PDF/extract — ONE STATE AT A TIME ───
  // We deliberately finish everything for state N (fetch -> normalize ->
  // upsert -> download PDFs into documents/GEM/<STATE>/ -> extract value/EMD
  // -> resolve city against THAT state's own district list) before ever
  // touching state N+1. GeM's PDFs don't reliably carry location data, so
  // the state used for this session/folder is the only trustworthy signal —
  // interleaving states would risk mixing up which folder/city a PDF belongs to.
  log(`STEP 1-4 — Processing ${GEM_STATES.length} states sequentially (fetch → DB → PDFs → extraction per state)...`);

  for (let si = 0; si < GEM_STATES.length; si++) {
    const stateName = GEM_STATES[si];
    const sIdx = `[state ${si + 1}/${GEM_STATES.length}]`;
    banner(`${stateName}  ${sIdx}`);

    // ── 1. Fetch this state via Playwright ──────────────────────────────────
    log(`${sIdx} STEP 1/4 — Fetching GEM tenders for ${stateName} via headless browser...`);
    let gemRaw = [];
    try {
      gemRaw = await fetchGemTendersForState(stateName);
      found += gemRaw.length;
      log(`${sIdx} Fetched ${gemRaw.length} raw records for ${stateName}`);
    } catch (e) {
      const msg = `GEM browser-fetch failed for ${stateName}: ${e.message}`;
      log(`${sIdx} ERROR: ${msg}`);
      errors.push(msg);
      // Skip this state entirely, move on to the next one.
      continue;
    }

    if (gemRaw.length === 0) {
      log(`${sIdx} No tenders found for ${stateName} — skipping to next state`);
      continue;
    }

    // ── 2. Normalise ─────────────────────────────────────────────────────────
    log(`${sIdx} STEP 2/4 — Normalising ${gemRaw.length} records for ${stateName}...`);
    const normalized = [];
    for (const raw of gemRaw) {
      try {
        normalized.push(normalizeGem(raw));
      } catch (e) {
        const msg = `Normalize error (${stateName}/${raw?.bidNumber}): ${e.message}`;
        log(`  WARN: ${msg}`);
        errors.push(msg);
      }
    }
    log(`${sIdx} Normalised: ${normalized.length}/${gemRaw.length}`);

    // Dedup within this state's page results (pagination overlap safety)
    const uniqueNormalizedMap = new Map();
    for (const tender of normalized) {
      if (tender && tender.bidNumber) {
        uniqueNormalizedMap.set(tender.bidNumber, tender);
      }
    }
    const uniqueNormalized = Array.from(uniqueNormalizedMap.values());
    if (normalized.length !== uniqueNormalized.length) {
      log(`${sIdx}  ⚠ ${normalized.length - uniqueNormalized.length} pagination duplicates collapsed`);
    }
    allNormalizedTenders.push(...uniqueNormalized);

    // ── 3. Analyse + Upsert ───────────────────────────────────────────────────
    log(`${sIdx} STEP 3/4 — Analysing & upserting ${uniqueNormalized.length} unique tenders for ${stateName}...`);
    const changedTenders = []; // needs PDF / extract pass, this state only

    for (let i = 0; i < uniqueNormalized.length; i++) {
      const tender = uniqueNormalized[i];
      if ((i + 1) % 50 === 0 || i === uniqueNormalized.length - 1) {
        log(`${sIdx}  upsert progress: ${i + 1}/${uniqueNormalized.length}`);
      }
      try {
        const analyzed = analyzeTender(tender);
        const data     = { ...tender, ...analyzed };

        const existing = await prisma.tender.findUnique({
          where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
        });

        const updateData = { ...data };
        if (existing) {
          if (existing.valueExtractionStatus && existing.valueExtractionStatus !== 'not_attempted' && data.valueExtractionStatus === 'not_attempted') {
            delete updateData.valueExtractionStatus;
            delete updateData.bidValue;
            delete updateData.emdAmount;
            delete updateData.pdfPath;
          }
        }

        const saved = await prisma.tender.upsert({
          where:  { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
          create: data,
          update: updateData,
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
    log(`${sIdx} Upsert done. New: ${newCount}  Updated: ${updatedCount}  PDF queue for ${stateName}: ${changedTenders.length}`);

    // ── 4. PDF download + value/EMD extraction — this state only ─────────────
    // downloadPdf() (pipeline/pdf.js) saves into documents/GEM/<STATE>/,
    // keyed off tender.locationState (== this loop's stateName), so every
    // PDF downloaded here lands in the correct per-state folder before we
    // ever move on to the next state.
    log(`${sIdx} STEP 4/4 — PDF download + extraction for ${changedTenders.length} tenders in ${stateName}...`);
    for (let i = 0; i < changedTenders.length; i++) {
      const tender = changedTenders[i];
      const idx    = `${sIdx} [${i + 1}/${changedTenders.length}]`;
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

        // City resolution is scoped to THIS state's own district/city list —
        // see pipeline/locationResolve.js#resolveCityForGem — since GeM PDFs
        // don't reliably carry location data on their own.
        let updatedCity = tender.locationCity;
        if (!updatedCity || updatedCity === 'Unspecified') {
          const addressText = result.aiExtract?.consignees?.[0]?.address || '';
          const fullText = result.extractedText || '';
          const resolved = resolveCityForGem(`${addressText} ${fullText}`, tender.locationState || stateName);
          if (resolved && resolved !== 'Unspecified') {
            updatedCity = resolved;
            log(`  [location] resolved city to "${resolved}" for ${tender.bidNumber} (${stateName})`);
          }
        }

        const sourceMeta = {
          ...(tender.sourceMeta || {}),
          pdfExtract:  { text: result.extractedText },
          aiExtract:   result.aiExtract ?? null,   // full AI-structured payload (consignees, eligibility, atc)
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
    log(`${sIdx} PDF pass done for ${stateName}. Total so far — Downloaded: ${pdfsDownloaded}  OK: ${extractionOk}  Fail: ${extractionFail}`);

    // Polite pause before moving to the next state's fresh browser session.
    if (si < GEM_STATES.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  log(`ALL STATES DONE — found=${found} new=${newCount} updated=${updatedCount} pdfs=${pdfsDownloaded} extractedOk=${extractionOk} extractFail=${extractionFail}`);

  // ── 5. Bulk status correction (open / closed) ─────────────────────────────
  log('STEP 5/6 — Bulk status update...');
  const now = new Date();
  try {
    const closed = await prisma.tender.updateMany({
      where: { status: 'open',   endDate: { lt: now } },
      data:  { status: 'closed' },
    });
    const opened = await prisma.tender.updateMany({
      where: { status: 'closed', endDate: { gte: now } },
      data:  { status: 'open' },
    });
    log(`Status update: ${closed.count} → closed, ${opened.count} → open`);
  } catch (e) {
    const msg = `Status update error: ${e.message}`;
    log(`  WARN: ${msg}`);
    errors.push(msg);
  }

  // ── 6. Cleanup / archive ──────────────────────────────────────────────────
  log('STEP 6/6 — Cleanup & archiving...');
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
  log('STEP 7 — Writing FetchLog to DB...');
  const fetchLog = await writeLog(
    runAt, found, newCount, updatedCount, pdfsDownloaded,
    extractionOk, extractionFail, cleanedRecords, cleanedFiles, errors,
  );

  // Trigger cache clear on Render server
  await triggerRemoteCacheClear();

  // ── 8. Write data log + full tender data to project root ────────────────
  writeDataLog(
    {
      runId:          fetchLog.id,
      runAt:          runAt.toISOString(),
      source:         'GEM',
      rawFetched:     found,
      uniqueUpserted: newCount + updatedCount,
      newTenders:     newCount,
      updated:        updatedCount,
      pdfsDownloaded,
      extractionOk,
      extractionFail,
      archived:       cleanedRecords,
      errorCount:     errors.length,
      errors,
    },
    allNormalizedTenders,
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

async function triggerRemoteCacheClear() {
  const adminToken = config.adminToken;
  
  // 1. Clear backend cache
  const backendBase = process.env.BACKEND_URL || 'https://cgtenders-com.onrender.com';
  const url = `${backendBase.replace(/\/$/, '')}/api/clear-cache`;
  log(`[cache] Triggering remote backend cache clear at ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      log(`[cache] Remote backend cache clear success: ${JSON.stringify(data)}`);
    } else {
      log(`[cache] Failed to clear remote backend cache. Status: ${res.status}`);
    }
  } catch (e) {
    log(`[cache] Error triggering remote backend cache clear: ${e.message}`);
  }

  // 2. Clear frontend KV cache
  const frontendBase = process.env.FRONTEND_URL || 'https://cgtenders.com';
  const frontendUrl = `${frontendBase.replace(/\/$/, '')}/api/clear-cache`;
  log(`[cache] Triggering remote frontend cache clear at ${frontendUrl}...`);
  try {
    const res = await fetch(frontendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      log(`[cache] Remote frontend cache clear success: ${JSON.stringify(data)}`);
    } else {
      log(`[cache] Failed to clear remote frontend cache. Status: ${res.status}`);
    }
  } catch (e) {
    log(`[cache] Error triggering remote frontend cache clear: ${e.message}`);
  }
}

/**
 * 1. Appends one JSON stats line to scrape_log.jsonl (run history).
 * 2. Overwrites gem_tenders.json with the full latest tender dataset.
 * Never throws — log failure must not crash the scraper.
 */
function writeDataLog(entry, tenders = []) {
  // ── run-stats history log (append) ──────────────────────────────────────
  try {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(SCRAPE_LOG_PATH, line, 'utf8');
    log(`Run stats appended → ${SCRAPE_LOG_PATH}`);
  } catch (e) {
    console.warn('[data-log] Failed to write scrape_log.jsonl:', e.message);
  }

  // ── full tender data (overwrite each run) ────────────────────────────────
  try {
    // Strip heavy rawJson field to keep file lean
    const lean = tenders.map(({ rawJson, ...rest }) => rest);
    const payload = JSON.stringify(
      { generatedAt: entry.runAt, runId: entry.runId, count: lean.length, tenders: lean },
      null,
      2,
    );
    fs.writeFileSync(GEM_DATA_PATH, payload, 'utf8');
    log(`Full data written  → ${GEM_DATA_PATH} (${lean.length} tenders)`);
  } catch (e) {
    console.warn('[data-log] Failed to write gem_tenders.json:', e.message);
  }
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

import { prisma } from '../db.js';
import { config } from '../config.js';
import { fetchGemTenders } from '../fetchers/gem.js';
import { fetchCspgclTenders } from '../fetchers/cspgcl.js';
import { normalizeGem, normalizeCspgcl } from './normalize.js';
import { analyzeTender } from './analysis.js';
import { downloadPdf } from './pdf.js';
import { extractValueAndEmd } from './extract.js';
import { runCleanup } from './cleanup.js';

/**
 * runPipeline() -> FetchLog row
 *
 * 1. Fetch raw records from both sources (independent try/catch so one
 *    source's failure doesn't abort the other).
 * 2. Normalize -> resolve locations -> run analysis engine.
 * 3. Upsert each tender keyed on [source, bidNumber].
 * 4. For new/changed tenders, download PDF + extract value/EMD/details.
 * 5. Bulk-update status for all tenders based on endDate vs now.
 * 6. Run cleanup/archive.
 * 7. Write a FetchLog row.
 *
 * Frontend regenerates sitemap.xml separately after this completes.
 */
export async function runPipeline() {
  const runAt = new Date();
  const errors = [];
  let found = 0;
  let newCount = 0;
  let updatedCount = 0;
  let pdfsDownloaded = 0;
  let extractionOk = 0;
  let extractionFail = 0;

  // --- 1. Fetch ---------------------------------------------------------
  let gemRaw = [];
  let cspgclRaw = [];

  // GEM is scraped locally via gem_scraper_run.js — never run on the server.
  // Set SKIP_GEM=true in Render env vars to enforce this.
  if (!config.skipGem) {
    try {
      gemRaw = await fetchGemTenders();
    } catch (e) {
      const detail = e.cause ? `${e.message} (cause: ${e.cause.message || e.cause})` : e.stack || e.message;
      console.error('[pipeline] GeM fetch failed:', detail);
      errors.push(`GEM fetch error: ${detail}`);
    }
  } else {
    console.log('[pipeline] skipping GEM fetch stage (SKIP_GEM=true) — handled by local scraper');
  }

  if (!config.skipCspgcl) {
    try {
      cspgclRaw = await fetchCspgclTenders();
    } catch (e) {
      const detail = e.cause ? `${e.message} (cause: ${e.cause.message || e.cause})` : e.stack || e.message;
      console.error('[pipeline] CSPGCL fetch failed:', detail);
      errors.push(`CSPGCL fetch error: ${detail}`);
    }
  } else {
    console.log('[pipeline] skipping CSPGCL fetch stage (SKIP_CSPGCL=true)');
  }

  found = gemRaw.length + cspgclRaw.length;

  // --- 2 & 3. Normalize, analyze, upsert ---------------------------------
  console.log(`[pipeline] normalizing ${gemRaw.length} GeM and ${cspgclRaw.length} CSPGCL records...`);
  const normalized = [
    ...gemRaw.map((r) => {
      try {
        return normalizeGem(r);
      } catch (e) {
        console.warn(`[pipeline] GeM normalization failed for bidNumber=${r?.bidNumber}:`, e.message);
        errors.push(`GEM normalize error (${r?.bidNumber}): ${e.message}`);
        return null;
      }
    }),
    ...cspgclRaw.map((r) => {
      try {
        return normalizeCspgcl(r);
      } catch (e) {
        console.warn(`[pipeline] CSPGCL normalization failed for tenderNoticeNo=${r?.tenderNoticeNo}:`, e.message);
        errors.push(`CSPGCL normalize error (${r?.tenderNoticeNo}): ${e.message}`);
        return null;
      }
    }),
  ].filter(Boolean);
  console.log(`[pipeline] normalization complete. ${normalized.length}/${found} records successfully normalized.`);

  const changedTenders = []; // tenders needing PDF/extract pass

  console.log(`[pipeline] starting database upsert for ${normalized.length} tenders...`);
  let upsertCount = 0;
  let skipCount = 0;
  for (const tender of normalized) {
    try {
      upsertCount++;
      if (upsertCount % 100 === 0 || upsertCount === normalized.length) {
        console.log(`[pipeline] database upsert progress: ${upsertCount}/${normalized.length}`);
      }
      const analyzed = analyzeTender(tender);
      const data = { ...tender, ...analyzed };

      const existing = await prisma.tender.findUnique({
        where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
      });

      const saved = await prisma.tender.upsert({
        where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
        create: data,
        update: data,
      });

      if (!existing) {
        newCount += 1;
        changedTenders.push(saved);
      } else {
        updatedCount += 1;
        // Re-run PDF/extract pass if no PDF yet, or core fields changed
        const changed =
          (!existing.pdfPath && existing.valueExtractionStatus === 'not_attempted') ||
          existing.bidValue !== data.bidValue ||
          existing.emdAmount !== data.emdAmount ||
          existing.endDate?.getTime() !== data.endDate?.getTime();
        if (changed) {
          changedTenders.push(saved);
        } else {
          skipCount++;
        }
      }
    } catch (e) {
      console.error(`[pipeline] upsert error for ${tender.source}/${tender.bidNumber}:`, e.message);
      errors.push(`Upsert error (${tender.source}/${tender.bidNumber}): ${e.message}`);
    }
  }
  console.log(`[pipeline] database upsert complete. New: ${newCount}, Updated: ${updatedCount} (PDF extraction skipped for ${skipCount} unchanged existing tenders)`);

  // --- 4. PDF download + value/EMD extraction ----------------------------
  console.log(`[pipeline] processing PDF download and extraction for ${changedTenders.length} tenders...`);
  let pdfCount = 0;
  let successPdfCount = 0;
  let failedPdfCount = 0;
  for (const tender of changedTenders) {
    try {
      pdfCount++;
      console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] processing PDF for ${tender.source}/${tender.bidNumber}...`);
      const pdfPath = await downloadPdf(tender);
      if (pdfPath) {
        console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] downloaded PDF successfully: ${pdfPath}`);
        pdfsDownloaded += 1;
        successPdfCount++;
      } else {
        console.warn(`[pipeline] [${pdfCount}/${changedTenders.length}] PDF download failed / not available`);
        failedPdfCount++;
      }

      console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] running value/EMD extraction...`);
      const result = await extractValueAndEmd(tender, pdfPath);
      if (!pdfPath) {
        result.status = result.status === 'extracted' ? 'extracted' : 'failed_download';
      }
      console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] extraction complete. status=${result.status}, bidValue=${result.bidValue}, emdAmount=${result.emdAmount}`);

      if (result.status === 'extracted') extractionOk += 1;
      else if (result.status === 'not_found' || result.status === 'failed_download') extractionFail += 1;

      const sourceMeta = {
        ...(tender.sourceMeta || {}),
        pdfExtract: {
          text: result.extractedText,
          fields: result.extractedFields,
        },
      };

      await prisma.tender.update({
        where: { id: tender.id },
        data: {
          pdfPath: pdfPath || tender.pdfPath,
          bidValue: result.bidValue,
          emdAmount: result.emdAmount,
          valueExtractionStatus: result.status,
          sourceMeta,
        },
      });
    } catch (e) {
      console.error(`[pipeline] [${pdfCount}/${changedTenders.length}] pdf/extract error for ${tender.source}/${tender.bidNumber}:`, e.message);
      errors.push(`PDF/extract error (${tender.source}/${tender.bidNumber}): ${e.message}`);
      extractionFail += 1;
    }
  }
  console.log(`[pipeline] PDF processing complete. Total attempted: ${changedTenders.length}, Succeeded: ${successPdfCount}, Failed: ${failedPdfCount}`);

  // --- 5. Bulk status update ----------------------------------------------
  console.log(`[pipeline] running bulk status update...`);
  const now = new Date();
  try {
    const closedCount = await prisma.tender.updateMany({
      where: { status: 'open', endDate: { lt: now } },
      data: { status: 'closed' },
    });
    const openedCount = await prisma.tender.updateMany({
      where: { status: 'closed', endDate: { gte: now } },
      data: { status: 'open' },
    });
    console.log(`[pipeline] bulk status update complete. Marked ${closedCount.count} open tenders as closed, and ${openedCount.count} closed tenders as open.`);
  } catch (e) {
    console.error(`[pipeline] bulk status update failed:`, e.message);
    errors.push(`Status update error: ${e.message}`);
  }

  // --- 6. Cleanup / archive ------------------------------------------------
  console.log(`[pipeline] running cleanup and archiving...`);
  let cleanedRecords = 0;
  let cleanedFiles = 0;
  try {
    const result = await runCleanup(prisma);
    cleanedRecords = result.cleanedRecords;
    cleanedFiles = result.cleanedFiles;
    console.log(`[pipeline] cleanup complete. Cleaned ${cleanedRecords} database records and ${cleanedFiles} PDF files.`);
  } catch (e) {
    console.error(`[pipeline] cleanup failed:`, e.message);
    errors.push(`Cleanup error: ${e.message}`);
  }

  // --- 7. Log ---------------------------------------------------------------
  console.log(`[pipeline] creating fetch log entry in database...`);
  const log = await prisma.fetchLog.create({
    data: {
      runAt,
      source: 'ALL',
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

  // TODO: trigger frontend sitemap regeneration (e.g. webhook to Astro
  // frontend, or a deploy hook) once this run completes.

  console.log(
    `[pipeline] run complete: found=${found} new=${newCount} updated=${updatedCount} pdfs=${pdfsDownloaded} ` +
    `extractedOk=${extractionOk} extractFail=${extractionFail} cleaned=${cleanedRecords} errors=${errors.length}`
  );

  return log;
}

import { prisma } from '../db.js';
import { config } from '../config.js';
import { fetchGemTenders } from '../fetchers/gem.js';
import { fetchCspgclTenders } from '../fetchers/cspgcl.js';
import { normalizeGem, normalizeCspgcl } from './normalize.js';
import { resolveCityForGem, resolveCityForCspgcl } from './locationResolve.js';
import { analyzeTender } from './analysis.js';
import { downloadPdf } from './pdf.js';
import { extractValueAndEmd } from './extract.js';
import { runCleanup } from './cleanup.js';
import { clear as clearCache } from '../cache.js';

/**
 * runPipeline() → FetchLog row
 *
 * 1. Fetch raw records from both sources (independent try/catch so one
 *    source's failure doesn't abort the other).
 * 2. Normalize → resolve locations → run analysis engine.
 * 3. Upsert each tender keyed on [source, bidNumber].
 * 4. For new/changed tenders, download PDF → AI extract (GEM) / regex (CSPGCL).
 * 5. Push all extracted fields — including aiExtract structured JSON — to DB.
 * 6. Bulk-update status for all tenders based on endDate vs now.
 * 7. Run cleanup/archive.
 * 8. Write a FetchLog row.
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

  // ── 1. Fetch ───────────────────────────────────────────────────────────────
  let gemRaw = [];
  let cspgclRaw = [];

  // GEM is scraped locally via gem_scraper_run.js — never run on the server.
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

  // ── 2 & 3. Normalize, analyze, upsert ─────────────────────────────────────
  console.log(`[pipeline] normalizing ${gemRaw.length} GeM and ${cspgclRaw.length} CSPGCL records...`);
  const normalized = [
    ...gemRaw.map((r) => {
      try { return normalizeGem(r); }
      catch (e) {
        console.warn(`[pipeline] GeM normalization failed for bidNumber=${r?.bidNumber}:`, e.message);
        errors.push(`GEM normalize error (${r?.bidNumber}): ${e.message}`);
        return null;
      }
    }),
    ...cspgclRaw.map((r) => {
      try { return normalizeCspgcl(r); }
      catch (e) {
        console.warn(`[pipeline] CSPGCL normalization failed for tenderNoticeNo=${r?.tenderNoticeNo}:`, e.message);
        errors.push(`CSPGCL normalize error (${r?.tenderNoticeNo}): ${e.message}`);
        return null;
      }
    }),
  ].filter(Boolean);
  console.log(`[pipeline] normalization complete. ${normalized.length}/${found} records successfully normalized.`);

  const changedTenders = [];

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
        where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
        create: data,
        update: updateData,
      });

      if (!existing) {
        newCount += 1;
        if (data.source === 'GEM') changedTenders.push(saved);
      } else {
        updatedCount += 1;
        if (data.source === 'GEM') {
          const changed =
            existing.valueExtractionStatus === 'not_attempted' ||
            !existing.valueExtractionStatus ||
            existing.endDate?.getTime() !== data.endDate?.getTime();
          if (changed) changedTenders.push(saved);
          else skipCount++;
        } else {
          skipCount++;
        }
      }
    } catch (e) {
      console.error(`[pipeline] upsert error for ${tender.source}/${tender.bidNumber}:`, e.message);
      errors.push(`Upsert error (${tender.source}/${tender.bidNumber}): ${e.message}`);
    }
  }
  console.log(
    `[pipeline] database upsert complete. New: ${newCount}, Updated: ${updatedCount} ` +
    `(PDF extraction skipped for ${skipCount} unchanged existing tenders)`
  );

  // ── 4. PDF download + AI extraction + DB sync ──────────────────────────────
  console.log(`[pipeline] processing PDF download and extraction for ${changedTenders.length} tenders...`);
  let pdfCount = 0;
  let successPdfCount = 0;
  let failedPdfCount = 0;

  for (const tender of changedTenders) {
    try {
      pdfCount++;
      console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] processing PDF for ${tender.source}/${tender.bidNumber}...`);

      // ── Download PDF ───────────────────────────────────────────────────────
      const pdfPath = await downloadPdf(tender);
      if (pdfPath) {
        console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] PDF downloaded: ${pdfPath}`);
        pdfsDownloaded += 1;
        successPdfCount++;
      } else {
        console.warn(`[pipeline] [${pdfCount}/${changedTenders.length}] PDF download failed / not available`);
        failedPdfCount++;
      }

      // ── Extract (AI for GEM, regex for CSPGCL) ────────────────────────────
      console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] running extraction (AI=${tender.source === 'GEM'})...`);
      const result = await extractValueAndEmd(tender, pdfPath);
      if (!pdfPath) {
        result.status = result.status === 'extracted' ? 'extracted' : 'failed_download';
      }
      console.log(
        `[pipeline] [${pdfCount}/${changedTenders.length}] extraction complete. ` +
        `status=${result.status} bidValue=${result.bidValue} emdAmount=${result.emdAmount} ` +
        `aiExtract=${result.aiExtract ? '✓' : '✗'}`
      );

      if (result.status === 'extracted') extractionOk += 1;
      else if (result.status === 'not_found' || result.status === 'failed_download') extractionFail += 1;

      // ── CSPGCL multi-row handling ──────────────────────────────────────────
      if (tender.source === 'CSPGCL' && result.rows && result.rows.length > 0) {
        console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] ${result.rows.length} sub-tender(s) in CSPGCL PDF`);

        // Row 0 — update the parent tender itself
        const firstRow = result.rows[0];
        let updatedCity = tender.locationCity;
        if (!updatedCity || updatedCity === 'Unspecified') {
          const resolved = resolveCityForCspgcl({ scopeRaw: firstRow.scope });
          if (resolved && resolved !== 'Unspecified') {
            updatedCity = resolved;
            console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] city resolved → "${resolved}"`);
          }
        }

        const firstSubTender = {
          ...tender,
          title:    firstRow.scope  || tender.title,
          bidValue: firstRow.nitValueRs ?? tender.bidValue,
          emdAmount: firstRow.emdAmount ?? tender.emdAmount,
          locationCity: updatedCity,
          sourceMeta: {
            ...(tender.sourceMeta || {}),
            subTenderSpecNo:  firstRow.tenderSpecNo || null,
            subTenderRfxNos:  firstRow.rfxNos       || [],
            pdfExtract: { text: result.extractedText },
          },
        };
        const firstAnalyzed = analyzeTender(firstSubTender);

        await prisma.tender.update({
          where: { id: tender.id },
          data: {
            title:                firstSubTender.title,
            bidValue:             firstSubTender.bidValue,
            emdAmount:            firstSubTender.emdAmount,
            valueExtractionStatus: result.status,
            locationCity:         firstSubTender.locationCity,
            category:             firstAnalyzed.category,
            viabilityScore:       firstAnalyzed.viabilityScore,
            risks:                firstAnalyzed.risks,
            pdfPath:              pdfPath || tender.pdfPath,
            sourceMeta:           firstSubTender.sourceMeta,
          },
        });
        console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] updated parent CSPGCL tender ${tender.bidNumber}`);

        // Rows 1+ — upsert as independent tenders
        for (let rIdx = 1; rIdx < result.rows.length; rIdx++) {
          const row = result.rows[rIdx];
          const subBidNumber = (row.rfxNos && row.rfxNos[0]) || row.tenderSpecNo || `${tender.bidNumber}-sub-${rIdx}`;

          let subCity = tender.locationCity;
          if (!subCity || subCity === 'Unspecified') {
            const resolved = resolveCityForCspgcl({ scopeRaw: row.scope });
            if (resolved && resolved !== 'Unspecified') subCity = resolved;
          }

          const subTender = {
            source:               'CSPGCL',
            bidNumber:            subBidNumber,
            title:                row.scope || tender.title,
            department:           tender.department,
            organization:         tender.organization,
            category:             [],
            locationState:        tender.locationState,
            locationCity:         subCity,
            startDate:            tender.startDate,
            endDate:              tender.endDate,
            quantity:             null,
            bidValue:             row.nitValueRs ?? null,
            emdAmount:            row.emdAmount  ?? null,
            valueExtractionStatus: (row.nitValueRs != null || row.emdAmount != null) ? 'extracted' : 'not_found',
            viabilityScore:       null,
            risks:                [],
            pdfPath:              pdfPath || tender.pdfPath,
            bidLink:              tender.bidLink,
            status:               tender.status,
            fetchedAt:            new Date(),
            sourceMeta: {
              ...tender.sourceMeta,
              parentNoticeNo:    tender.bidNumber,
              subTenderSpecNo:   row.tenderSpecNo || null,
              subTenderRfxNos:   row.rfxNos       || [],
            },
          };

          const analyzedSub = analyzeTender(subTender);
          const subData = { ...subTender, ...analyzedSub };

          try {
            await prisma.tender.upsert({
              where: { source_bidNumber: { source: 'CSPGCL', bidNumber: subData.bidNumber } },
              create: subData,
              update: subData,
            });
            console.log(`[pipeline] upserted CSPGCL sub-tender ${subData.bidNumber}: value=${subData.bidValue} emd=${subData.emdAmount}`);
          } catch (err) {
            console.error(`[pipeline] failed to upsert sub-tender ${subData.bidNumber}:`, err.message);
          }
        }

      // ── GEM — AI extraction result → DB sync ──────────────────────────────
      } else {
        let updatedCity = tender.locationCity;
        if (!updatedCity || updatedCity === 'Unspecified') {
          // Use address from AI consignees or raw text for city resolution
          const addressText = result.aiExtract?.consignees?.[0]?.address || '';
          const fullText    = result.extractedText || '';
          const resolved    = resolveCityForGem(`${addressText} ${fullText}`, tender.locationState);
          if (resolved && resolved !== 'Unspecified') {
            updatedCity = resolved;
            console.log(`[pipeline] [${pdfCount}/${changedTenders.length}] city resolved → "${resolved}"`);
          }
        }

        // Build sourceMeta — aiExtract replaces old pdfExtract.fields
        const sourceMeta = {
          ...(tender.sourceMeta || {}),
          pdfExtract: {
            text: result.extractedText,   // raw text excerpt (unchanged)
          },
          // Full AI-structured payload: consignees, eligibility, atc
          aiExtract: result.aiExtract ?? null,
        };

        // Re-analyze with updated bidValue/emdAmount from AI
        const reanalyzed = analyzeTender({
          ...tender,
          bidValue:  result.bidValue,
          emdAmount: result.emdAmount,
        });

        await prisma.tender.update({
          where: { id: tender.id },
          data: {
            pdfPath:              pdfPath || tender.pdfPath,
            bidValue:             result.bidValue,
            emdAmount:            result.emdAmount,
            valueExtractionStatus: result.status,
            locationCity:         updatedCity,
            viabilityScore:       reanalyzed.viabilityScore,
            risks:                reanalyzed.risks,
            sourceMeta,
          },
        });

        if (result.aiExtract) {
          console.log(
            `[pipeline] [${pdfCount}/${changedTenders.length}] ✓ AI data synced to DB for ${tender.bidNumber}: ` +
            `${result.aiExtract.consignees.length} consignees, ${result.aiExtract.atc.length} ATC clauses`
          );
        }
      }
    } catch (e) {
      console.error(`[pipeline] pdf/extract error for ${tender.source}/${tender.bidNumber}:`, e.message);
      errors.push(`PDF/extract error (${tender.source}/${tender.bidNumber}): ${e.message}`);
      extractionFail += 1;
      try {
        await prisma.tender.update({
          where: { id: tender.id },
          data: { valueExtractionStatus: 'failed_download' },
        });
      } catch (_) { /* ignore secondary DB error */ }
    }
  }
  console.log(
    `[pipeline] PDF processing complete. ` +
    `Attempted: ${changedTenders.length} | Downloaded: ${successPdfCount} | Failed: ${failedPdfCount}`
  );

  // ── 5. Bulk status update ──────────────────────────────────────────────────
  console.log(`[pipeline] running bulk status update...`);
  const now = new Date();
  try {
    const closedCount = await prisma.tender.updateMany({
      where: { status: 'open',   endDate: { lt: now } },
      data:  { status: 'closed' },
    });
    const openedCount = await prisma.tender.updateMany({
      where: { status: 'closed', endDate: { gte: now } },
      data:  { status: 'open' },
    });
    console.log(
      `[pipeline] status update: ${closedCount.count} → closed, ${openedCount.count} → open`
    );
  } catch (e) {
    console.error(`[pipeline] bulk status update failed:`, e.message);
    errors.push(`Status update error: ${e.message}`);
  }

  // ── 6. Cleanup / archive ───────────────────────────────────────────────────
  console.log(`[pipeline] running cleanup and archiving...`);
  let cleanedRecords = 0;
  let cleanedFiles = 0;
  try {
    const result = await runCleanup(prisma);
    cleanedRecords = result.cleanedRecords;
    cleanedFiles   = result.cleanedFiles;
    console.log(`[pipeline] cleanup: ${cleanedRecords} DB records, ${cleanedFiles} PDF files removed`);
  } catch (e) {
    console.error(`[pipeline] cleanup failed:`, e.message);
    errors.push(`Cleanup error: ${e.message}`);
  }

  // ── 7. Log ─────────────────────────────────────────────────────────────────
  console.log(`[pipeline] writing fetch log...`);
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

  // ── 8. Clear caches ────────────────────────────────────────────────────────
  clearCache();

  try {
    const adminToken  = config.adminToken;
    const frontendBase = process.env.FRONTEND_URL || 'https://cgtenders.com';
    const frontendUrl  = `${frontendBase.replace(/\/$/, '')}/api/clear-cache`;
    console.log(`[pipeline] clearing remote frontend cache at ${frontendUrl}...`);
    const res = await fetch(frontendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[pipeline] frontend cache cleared:`, data);
    } else {
      console.warn(`[pipeline] frontend cache clear failed. Status: ${res.status}`);
    }
  } catch (e) {
    console.warn(`[pipeline] error clearing frontend cache:`, e.message);
  }

  console.log(
    `[pipeline] ✓ run complete: found=${found} new=${newCount} updated=${updatedCount} ` +
    `pdfs=${pdfsDownloaded} extractedOk=${extractionOk} extractFail=${extractionFail} ` +
    `cleaned=${cleanedRecords} errors=${errors.length}`
  );

  return log;
}

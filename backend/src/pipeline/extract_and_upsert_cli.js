import 'dotenv/config';
import { prisma } from '../db.js';
import { extractValueAndEmd } from './extract.js';
import { analyzeTender } from './analysis.js';
import { resolveCityForGem, resolveCityForCspgcl } from './locationResolve.js';

// Resolve mseExemption / startupExemption string values → Boolean | null
function resolveExemptionFlag(val) {
  if (val === true || val === false) return val;
  if (val == null) return null;
  const s = String(val).toLowerCase().trim();
  if (s.startsWith('yes') || s === 'applicable' || s.startsWith('exempt')) return true;
  if (s === 'no' || s === 'not specified' || s === 'not applicable' || s === 'na') return false;
  return null;
}

// Resolve yearsOfExperience → Boolean (true = zero/not required)
function resolveYearsZero(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val === 0;
  if (typeof val === 'string') {
    const s = val.toLowerCase().trim();
    if (s === 'not specified' || s === 'not required' || s === 'nil' || s === 'no' ||
        s === '0' || s.includes('0 year') || s === 'exempt') return true;
    const match = s.match(/(\d+)/);
    if (match) return parseInt(match[1], 10) === 0;
    return null;
  }
  return null;
}

async function processTender(tender) {
  const pdfPath = tender.pdfPath;
  if (!pdfPath) {
    console.warn(`[cli-extractor] Tender ${tender.source}/${tender.bidNumber} has no pdfPath, skipping.`);
    return;
  }

  console.log(`[cli-extractor] Extracting ${tender.source}/${tender.bidNumber} using file ${pdfPath}...`);
  const result = await extractValueAndEmd(tender, pdfPath);
  
  if (tender.source === 'CSPGCL' && result.rows && result.rows.length > 0) {
    console.log(`[cli-extractor] ${result.rows.length} sub-tender(s) found in CSPGCL PDF`);
    // Row 0 - update parent
    const firstRow = result.rows[0];
    let updatedCity = tender.locationCity;
    if (!updatedCity || updatedCity === 'Unspecified') {
      const resolved = resolveCityForCspgcl({ scopeRaw: firstRow.scope });
      if (resolved && resolved !== 'Unspecified') {
        updatedCity = resolved;
      }
    }

    const firstSubTender = {
      ...tender,
      title: firstRow.scope || tender.title,
      bidValue: firstRow.nitValueRs ?? tender.bidValue,
      emdAmount: firstRow.emdAmount ?? tender.emdAmount,
      locationCity: updatedCity,
      sourceMeta: {
        ...(tender.sourceMeta || {}),
        subTenderSpecNo: firstRow.tenderSpecNo || null,
        subTenderRfxNos: firstRow.rfxNos || [],
        pdfExtract: { text: result.extractedText },
      },
    };
    const firstAnalyzed = analyzeTender(firstSubTender);

    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        title: firstSubTender.title,
        bidValue: firstSubTender.bidValue,
        emdAmount: firstSubTender.emdAmount,
        valueExtractionStatus: result.status,
        locationCity: firstSubTender.locationCity,
        category: firstAnalyzed.category,
        viabilityScore: firstAnalyzed.viabilityScore,
        risks: firstAnalyzed.risks,
        sourceMeta: firstSubTender.sourceMeta,
      },
    });

    // Rows 1+ - upsert as sub-tenders
    for (let rIdx = 1; rIdx < result.rows.length; rIdx++) {
      const row = result.rows[rIdx];
      const subBidNumber = (row.rfxNos && row.rfxNos[0]) || row.tenderSpecNo || `${tender.bidNumber}-sub-${rIdx}`;

      let subCity = tender.locationCity;
      if (!subCity || subCity === 'Unspecified') {
        const resolved = resolveCityForCspgcl({ scopeRaw: row.scope });
        if (resolved && resolved !== 'Unspecified') subCity = resolved;
      }

      const subTender = {
        source: 'CSPGCL',
        bidNumber: subBidNumber,
        title: row.scope || tender.title,
        department: tender.department,
        organization: tender.organization,
        category: [],
        locationState: tender.locationState,
        locationCity: subCity,
        startDate: tender.startDate,
        endDate: tender.endDate,
        quantity: null,
        bidValue: row.nitValueRs ?? null,
        emdAmount: row.emdAmount ?? null,
        valueExtractionStatus: (row.nitValueRs != null || row.emdAmount != null) ? 'extracted' : 'not_found',
        viabilityScore: null,
        risks: [],
        pdfPath: pdfPath,
        bidLink: tender.bidLink,
        status: tender.status,
        fetchedAt: new Date(),
        plantId: tender.plantId || null,
        sourceMeta: {
          ...tender.sourceMeta,
          parentNoticeNo: tender.bidNumber,
          subTenderSpecNo: row.tenderSpecNo || null,
          subTenderRfxNos: row.rfxNos || [],
        },
      };

      const analyzedSub = analyzeTender(subTender);
      const subData = { ...subTender, ...analyzedSub };

      await prisma.tender.upsert({
        where: { source_bidNumber: { source: 'CSPGCL', bidNumber: subData.bidNumber } },
        create: subData,
        update: subData,
      });
    }
  } else {
    // GEM / other
    let updatedCity = tender.locationCity;
    if (!updatedCity || updatedCity === 'Unspecified') {
      const addressText = result.aiExtract?.consignees?.[0]?.address || '';
      const fullText = result.extractedText || '';
      const resolved = resolveCityForGem(`${addressText} ${fullText}`);
      if (resolved && resolved !== 'Unspecified') {
        updatedCity = resolved;
      }
    }

    const sourceMeta = {
      ...(tender.sourceMeta || {}),
      pdfExtract: { text: result.extractedText },
      aiExtract: result.aiExtract ?? null,
    };

    const reanalyzed = analyzeTender({
      ...tender,
      bidValue: result.bidValue,
      emdAmount: result.emdAmount,
    });

    const elig = result.aiExtract?.eligibility ?? {};
    const mseFlag = resolveExemptionFlag(elig.mseExemption);
    const startupFlag = resolveExemptionFlag(elig.startupExemption);
    const yearsZero = resolveYearsZero(elig.yearsOfExperience);

    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        bidValue: result.bidValue,
        emdAmount: result.emdAmount,
        valueExtractionStatus: result.status,
        locationCity: updatedCity,
        viabilityScore: reanalyzed.viabilityScore,
        risks: reanalyzed.risks,
        sourceMeta,
        ...(mseFlag !== null && { mseExemption: mseFlag }),
        ...(startupFlag !== null && { startupExemption: startupFlag }),
        ...(yearsZero !== null && { yearsOfExperienceZero: yearsZero }),
      },
    });
  }
  console.log(`[cli-extractor] Finished extracting for ${tender.bidNumber}`);
}

async function main() {
  const args = process.argv.slice(2);
  const bidNumIdx = args.indexOf('--bidNumber');
  
  if (bidNumIdx !== -1 && args[bidNumIdx + 1]) {
    const bidNumber = args[bidNumIdx + 1];
    const tender = await prisma.tender.findFirst({
      where: { bidNumber },
    });
    if (!tender) {
      console.error(`[cli-extractor] Tender with bidNumber ${bidNumber} not found.`);
      process.exit(1);
    }
    await processTender(tender);
  } else {
    // Process all pending GEM tenders where pdfPath is set but valueExtractionStatus is 'not_attempted'
    const pendingTenders = await prisma.tender.findMany({
      where: {
        source: 'GEM',
        pdfPath: { not: null },
        valueExtractionStatus: 'not_attempted',
      },
    });
    console.log(`[cli-extractor] Found ${pendingTenders.length} pending tenders to extract.`);
    for (const tender of pendingTenders) {
      try {
        await processTender(tender);
      } catch (err) {
        console.error(`[cli-extractor] Error extracting tender ${tender.bidNumber}:`, err.message);
      }
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

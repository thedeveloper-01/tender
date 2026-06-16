import { fetchCspgclTenders } from '../src/fetchers/cspgcl.js';
import { normalizeCspgcl } from '../src/pipeline/normalize.js';
import { analyzeTender } from '../src/pipeline/analysis.js';
import { downloadPdf } from '../src/pipeline/pdf.js';
import { extractValueAndEmd } from '../src/pipeline/extract.js';
import { prisma } from '../src/db.js';

async function main() {
  console.log('Fetching CSPGCL tenders...');
  const rawTenders = await fetchCspgclTenders();
  console.log(`Fetched ${rawTenders.length} tenders.`);

  const sampleRaw = rawTenders.slice(0, 5);
  for (const raw of sampleRaw) {
    console.log(`\n--- Processing ${raw.tenderNoticeNo || 'unnamed'} ---`);
    let normalized;
    try {
      normalized = normalizeCspgcl(raw);
      console.log('Normalized OK. bidNumber:', normalized.bidNumber);
    } catch (e) {
      console.error('Normalization failed:', e.message);
      continue;
    }

    let analyzed;
    try {
      analyzed = analyzeTender(normalized);
      console.log('Analyzed OK. viabilityScore:', analyzed.viabilityScore);
    } catch (e) {
      console.error('Analysis failed:', e.message);
      continue;
    }

    const data = { ...normalized, ...analyzed };

    let saved;
    try {
      saved = await prisma.tender.upsert({
        where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
        create: data,
        update: data,
      });
      console.log('Upserted OK. ID:', saved.id);
    } catch (e) {
      console.error('Upsert failed:', e.message);
      continue;
    }

    console.log('Downloading PDF...');
    const pdfPath = await downloadPdf(saved);
    console.log('PDF Path:', pdfPath);

    console.log('Extracting value/EMD...');
    const result = await extractValueAndEmd(saved, pdfPath);
    console.log('Extraction Result status:', result.status);
    console.log('Extraction Result bidValue:', result.bidValue);
    console.log('Extraction Result emdAmount:', result.emdAmount);
  }
}

main().finally(() => prisma.$disconnect());

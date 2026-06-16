import { fetchCspgclTenders } from '../src/fetchers/cspgcl.js';
import { downloadPdf } from '../src/pipeline/pdf.js';
import { extractCspgclPdf } from '../src/pipeline/cspgcl_extract.js';
import { normalizeCspgcl } from '../src/pipeline/normalize.js';
import { analyzeTender } from '../src/pipeline/analysis.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Fetching CSPGCL tenders...');
  const tenders = await fetchCspgclTenders();
  console.log(`Fetched ${tenders.length} tenders.`);
  
  // Find a tender that has a PDF and is not ebidding or has a docEventTarget
  const candidate = tenders.find(t => t.docEventTarget);
  if (!candidate) {
    console.log('No tender with docEventTarget found.');
    return;
  }

  console.log('Testing with candidate tender:', JSON.stringify(candidate, null, 2));

  const normalized = normalizeCspgcl(candidate);
  const analyzed = analyzeTender(normalized);
  const tender = { ...normalized, ...analyzed };

  console.log('Downloading PDF...');
  const pdfPath = await downloadPdf(tender);
  console.log('PDF Path:', pdfPath);

  if (pdfPath && fs.existsSync(pdfPath)) {
    console.log('Running extractCspgclPdf...');
    const result = await extractCspgclPdf(pdfPath);
    console.log('Extraction Result status:', result.status);
    console.log('Extraction Result bidValue:', result.bidValue);
    console.log('Extraction Result emdAmount:', result.emdAmount);
    console.log('Extraction Result rows count:', result.rows ? result.rows.length : 0);
    if (result.rows && result.rows.length > 0) {
      console.log('Sample Row 1:', JSON.stringify(result.rows[0], null, 2));
    }
  } else {
    console.log('Failed to download PDF.');
  }
}

main().catch(e => console.error(e));

import { extractCspgclPdf } from '../src/pipeline/cspgcl_extract.js';

async function main() {
  const filePath = 'documents/CSPGCL-TN-18_26-27__Tender_No_-_CP-24_26-27_.pdf';
  console.log(`Parsing ${filePath}...`);
  const result = await extractCspgclPdf(filePath);
  console.log('Extraction Result status:', result.status);
  console.log('Extraction Result bidValue:', result.bidValue);
  console.log('Extraction Result emdAmount:', result.emdAmount);
  console.log('Extraction Result rows count:', result.rows ? result.rows.length : 0);
  if (result.rows && result.rows.length > 0) {
    console.log('Sample Row 1:', JSON.stringify(result.rows[0], null, 2));
  }
}

main().catch(e => console.error(e));

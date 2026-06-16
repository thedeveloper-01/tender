import { extractCspgclPdf } from '../src/pipeline/cspgcl_extract.js';

async function main() {
  const filePath = 'documents/CSPGCL-E_E__Civil__Dn_-II_AU_PC_1x500MW_2026-27-25__2026-27-26___2026-27-27.pdf';
  console.log(`Parsing ${filePath}...`);
  const result = await extractCspgclPdf(filePath);
  console.log('Extraction Result status:', result.status);
  console.log('Extraction Result bidValue:', result.bidValue);
  console.log('Extraction Result emdAmount:', result.emdAmount);
  console.log('Extraction Result rows count:', result.rows ? result.rows.length : 0);
  if (result.rows && result.rows.length > 0) {
    console.log('Rows:', JSON.stringify(result.rows, null, 2));
  }
}

main().catch(e => console.error(e));

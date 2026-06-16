import fs from 'fs';
import path from 'path';
import { extractCspgclPdf } from '../src/pipeline/cspgcl_extract.js';

async function main() {
  const dir = 'documents';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('CSPGCL-') && f.endsWith('.pdf'));
  console.log(`Found ${files.length} CSPGCL PDFs.`);

  let emptyCount = 0;
  let textCount = 0;
  let multiTenderCount = 0;

  for (const f of files) {
    const filePath = path.join(dir, f);
    const result = await extractCspgclPdf(filePath);
    
    if (result.status === 'parse_error' || !result.rawText || result.rawText.trim().length === 0) {
      emptyCount++;
      console.log(`[Scanned/Empty] ${f} - Status: ${result.status}`);
    } else {
      textCount++;
      const rows = result.rows || [];
      console.log(`[Text] ${f} - Rows parsed: ${rows.length} - EMD: ${result.emdAmount} - Value: ${result.bidValue}`);
      if (rows.length > 1) {
        multiTenderCount++;
        console.log('  -> SUB-TENDERS DETECTED:');
        rows.forEach((r, idx) => {
          console.log(`     Row #${idx+1}: Spec: ${r.tenderSpecNo} | EMD: ${r.emdAmount} | Value: ${r.nitValueRs}`);
        });
      }
    }
  }

  console.log('\n--- SUMMARY ---');
  console.log(`Total checked: ${files.length}`);
  console.log(`Scanned/Empty (No text): ${emptyCount}`);
  console.log(`Text-based: ${textCount}`);
  console.log(`Multi-tender documents: ${multiTenderCount}`);
}

main().catch(e => console.error(e));

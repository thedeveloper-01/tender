import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

async function main() {
  const filePath = 'documents/CSPGCL-TN-38_2026-27__Tender_No__SHW-48_2026-27_.pdf';
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  
  console.log('--- RAW TEXT ---');
  console.log(text.slice(0, 10000));
  console.log('--- END RAW TEXT ---');
}

main().catch(e => console.error(e));

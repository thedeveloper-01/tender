import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const files = [
  'CSPGCL-04-04_W_422072_303.pdf',
  'CSPGCL-04-04_W_464784_512.pdf',
  'CSPGCL-CEC_AU_PC_DSPM-KE_W_2026_13.pdf',
  'CSPGCL-CEC_AU_PC_HTPS-KW_W_2026_15.pdf',
  'CSPGCL-No_04-02__I_467843_2026_date_15_06_2026.pdf'
];

async function main() {
  for (const file of files) {
    const filePath = `documents/${file}`;
    if (!fs.existsSync(filePath)) {
      console.log(`${file}: NOT FOUND`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    try {
      const data = await pdfParse(buf);
      const text = data.text || '';
      console.log(`${file}: numPages=${data.numpages}, textLength=${text.length}, textSample="${text.trim().substring(0, 100).replace(/\s+/g, ' ')}"`);
    } catch (e) {
      console.log(`${file}: FAILED to parse:`, e.message);
    }
  }
}

main().catch(e => console.error(e));

import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

async function main() {
  const buf = fs.readFileSync('documents/CSPGCL-No_04-02__I_467843_2026_date_15_06_2026.pdf');
  const data = await pdfParse(buf);
  const text = data.text || '';
  const idx = text.indexOf('िवशेषाीकरण');
  if (idx !== -1) {
    const chunk = text.substring(idx - 10, idx + 40);
    console.log('Chunk:', chunk);
    console.log('Code points:');
    for (let i = 0; i < chunk.length; i++) {
      console.log(`  ${chunk[i]} -> U+${chunk.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`);
    }
  } else {
    console.log('Not found');
  }
}

main().catch(e => console.error(e));

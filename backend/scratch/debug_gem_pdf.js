import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

async function main() {
  const filePath = 'documents/GEM-GEM_2026_B_7576832.pdf';
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  
  console.log('Total characters parsed:', text.length);

  const re = /value|cost|estimated|estimation|मूल्य|लागत/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = Math.max(0, match.index - 50);
    const end = Math.min(text.length, match.index + 150);
    console.log(`\nMatch at index ${match.index}:`);
    console.log(`"${text.slice(start, end).replace(/\r?\n/g, '\\n')}"`);
  }
}

main().catch(e => console.error(e));

import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

async function main() {
  const filePath = 'documents/CSPGCL-TN-38_2026-27__Tender_No__SHW-48_2026-27_.pdf';
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  
  const cleanText = text
    .replace(/([\u0900-\u097F\*])\s*\n\s*([\u0900-\u097F\*])/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n');

  console.log('--- BLOCK SPLITTING ---');
  // Splitting pattern specifically matching serial numbers at start of lines (e.g., "\n1. ", "\n2. \n")
  const rowBlocks = cleanText
    .split(/\n(?=\s*\d+\.\s*(?:[a-zA-Z]|\n))/)
    .filter((block) => /^\s*\d+\./.test(block));

  console.log(`Total blocks split: ${rowBlocks.length}`);
  rowBlocks.forEach((block, idx) => {
    console.log(`\nBlock #${idx + 1}:`);
    console.log('--- Block Content Start ---');
    console.log(block);
    console.log('--- Block Content End ---');
    
    // SPEC_NO_RE matches lines like "CEC/HTPS/ KW/W/ 2026/20"
    const SPEC_NO_RE = /(?:CEC|CEC\/|No\.\s*)[\w\/.\-\s]{3,40}/i;
    const specMatch = block.match(SPEC_NO_RE);
    console.log('specMatch:', specMatch ? specMatch[0] : 'null');
  });
}

main().catch(e => console.error(e));

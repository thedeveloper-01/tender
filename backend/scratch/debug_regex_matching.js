import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const regex = /EMD\s*Detail[\s\S]{0,150}?\bRequired\s*(Yes|No)\b/i;

async function testFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  
  const m = text.match(regex);
  console.log(`\nFile: ${filePath}`);
  if (m) {
    console.log(`  Full match: "${m[0].replace(/\r?\n/g, '\\n')}"`);
    console.log(`  Captured value (Group 1): "${m[1]}"`);
  } else {
    console.log('  No match found.');
  }
}

async function main() {
  await testFile('documents/GEM-GEM_2026_B_7464856.pdf');
}

main().catch(e => console.error(e));

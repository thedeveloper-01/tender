import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

async function main() {
  const filePath = 'documents/GEM-GEM_2026_B_7464856.pdf';
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  
  console.log('Total characters:', text.length);
  const lines = text.split('\n');
  console.log('Total lines:', lines.length);
  
  console.log('--- Matches ---');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/emd|amount|value|price|cost|required/i.test(line)) {
      console.log(`Line ${i + 1}: ${line.trim()}`);
    }
  }
}

main().catch(e => console.error(e));

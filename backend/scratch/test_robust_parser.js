import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

function parseAmount(str) {
  if (!str) return null;
  const clean = str.replace(/[₹Rs,]/g, '').replace(/lacs?|lakhs?/i, '').trim();
  const n = parseFloat(clean.replace(/,/g, ''));
  if (isNaN(n)) return null;
  if (/lacs?|lakhs?/i.test(str)) return n * 100000;
  return n;
}

async function testFile(filePath) {
  console.log(`\n==================================================`);
  console.log(`TESTING FILE: ${filePath}`);
  console.log(`==================================================`);
  
  if (!fs.existsSync(filePath)) {
    console.log('File does not exist.');
    return;
  }
  
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  
  const cleanText = text
    .replace(/([\u0900-\u097F\*])\s*\n\s*([\u0900-\u097F\*])/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n');

  // Cut off text at the start of Notes / Important Points to avoid matching numbered lists in the footer
  const endIdx = cleanText.search(/(?:\n\s*NOTES\b|\n\s*IMPORTANT\s+POINTS\b|\n\s*IMPORTANT\s+POINTS\s+FOR\s+THE\s+BIDDERS\b)/i);
  const tableText = endIdx !== -1 ? cleanText.slice(0, endIdx) : cleanText;

  // Splitting pattern specifically matching serial numbers
  const rowBlocks = tableText
    .split(/\n(?=\s*\d+\.\s*(?:[a-zA-Z]|\n))/)
    .filter((block) => /^\s*\d+\./.test(block));

  console.log(`Total blocks split: ${rowBlocks.length}`);
  
  const EMD_RE = /(?:EMD|Earnest\s*Money)[^₹\d\n]*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i;
  const NIT_VALUE_RE = /(\d+(?:\.\d+)?)\s*Lacs?\s*(?:\(without\s*GST\))?/i;
  const COMPLETION_RE = /(\d+\+?\d*)\s*(?:Months?|Years?|Days?)/i;

  rowBlocks.forEach((block, idx) => {
    console.log(`\nRow #${idx + 1}:`);
    
    // Extract lines
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    
    let tenderSpecNo = null;
    let scopeCandidate = '';
    
    // Line 0 contains the S.N (e.g. "1." or "1. EP-46/26-27")
    const line0 = lines[0];
    const matchSN = line0.match(/^\d+\.\s*(.*)/);
    const restOfLine0 = matchSN ? matchSN[1].trim() : '';
    
    let nextIdx = 1;
    if (restOfLine0.length > 2 && restOfLine0.length < 50) {
      tenderSpecNo = restOfLine0;
    } else if (lines.length > 1) {
      const line1 = lines[1];
      if (line1.length > 2 && line1.length < 50 && !/^\d+$/.test(line1)) {
        tenderSpecNo = line1;
        nextIdx = 2;
      }
    }
    
    // Extract RFx Nos
    const rfxNos = [];
    const rfxMatches = block.match(/\b(81000\d{5})\b/g) || [];
    rfxMatches.forEach(num => {
      if (!rfxNos.includes(num)) rfxNos.push(num);
    });

    // Value and EMD
    const nitMatch = block.match(NIT_VALUE_RE);
    const nitValueLacs = nitMatch ? parseFloat(nitMatch[1]) : null;
    const nitValueRs = nitValueLacs != null ? nitValueLacs * 100000 : null;

    const emdMatch = block.match(EMD_RE);
    const emdAmount = emdMatch ? parseAmount(emdMatch[1]) : null;

    const compMatch = block.match(COMPLETION_RE);
    const completionPeriod = compMatch ? compMatch[0].trim() : null;

    // Scope (everything remaining in the block that isn't numbers, spec no, notes, etc.)
    // We clean the lines to form scope candidate
    const scopeLines = lines.slice(nextIdx).filter(line => {
      // Skip lines that are just numbers (like RFx, EMD, value) or dates
      if (/^\s*[\d,.\/\-+]+\s*$/.test(line)) return false;
      if (line.includes('Without RLA') || line.includes('With RLA')) return false;
      if (line.startsWith('Note') || line.startsWith('(')) return false;
      return true;
    });
    
    scopeCandidate = scopeLines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);

    console.log(`  Spec No: ${tenderSpecNo}`);
    console.log(`  RFx Nos: ${rfxNos.join(', ')}`);
    console.log(`  EMD: ${emdAmount}`);
    console.log(`  Value (Lacs): ${nitValueLacs} | Value (Rs): ${nitValueRs}`);
    console.log(`  Completion Period: ${completionPeriod}`);
    console.log(`  Scope: ${scopeCandidate}`);
  });
}

async function main() {
  await testFile('documents/CSPGCL-TN-38_2026-27__Tender_No__SHW-48_2026-27_.pdf');
  await testFile('documents/CSPGCL-TN-38_EP-46.pdf');
  await testFile('documents/CSPGCL-TN-18_26-27__Tender_No_-_CP-24_26-27_.pdf');
}

main().catch(e => console.error(e));

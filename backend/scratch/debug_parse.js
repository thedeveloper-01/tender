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

async function main() {
  const filePath = 'documents/CSPGCL-TN-18_26-27__Tender_No_-_CP-24_26-27_.pdf';
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  
  const cleanText = text
    .replace(/([\u0900-\u097F\*])\s*\n\s*([\u0900-\u097F\*])/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n');

  console.log('--- BLOCKS DETECTED IN HINDI PARSER ---');
  const blocks = cleanText
    .split(/\n(?=\s*\(?\d+\)?\s*(?:िनिवदा|काय\*|काय|spec|No|CEC|CEC\/))/i)
    .filter((block) => /^\s*\(?\d+\)?\s+/.test(block));

  console.log(`Number of blocks: ${blocks.length}`);
  blocks.forEach((block, idx) => {
    console.log(`\nBlock #${idx + 1}:`);
    console.log(block);
    console.log('--- Matches ---');
    const specMatch = block.match(/(?:िनिवदा\s*िवश[ेै]ष[ीि]करण\s*मांक|िवश[ेै]ष[ीि]करण\s*मांक|spec\s*(?:no)?\.?)\s*(?::-|:)\s*([^\n]+)/i);
    console.log('specMatch:', specMatch ? specMatch[0] : 'null');
    
    const scopeMatch = block.match(/(?:काय\*?\s*का\s*नाम|name\s*of\s*work)\s*(?::-|:)\s*([\s\S]+?)(?=(?:अनुमािनत\s*लागत|estimated|value|$))/i);
    console.log('scopeMatch:', scopeMatch ? scopeMatch[0] : 'null');

    const valueMatch = block.match(/(?:अनुमािनत\s*लागत|estimated\s*cost)\s*:\s*(?:5पये|रुपये|Rs\.?|₹)?\s*([\d,.]+)/i);
    console.log('valueMatch:', valueMatch ? valueMatch[0] : 'null');

    const emdMatch = block.match(/(?:बयाने?\s*क[0ी]\s*रािश|धरोहर\s*रािश|धरोहर\s*राशि|emd|earnest\s*money)\s*:\s*(?:5पये|रुपये|Rs\.?|₹)?\s*([\d,.]+)/i);
    console.log('emdMatch:', emdMatch ? emdMatch[0] : 'null');
  });
}

main().catch(e => console.error(e));

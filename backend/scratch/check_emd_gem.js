import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const prisma = new PrismaClient();

async function main() {
  const extractedEmd = await prisma.tender.findMany({
    where: { source: 'GEM', emdAmount: { gt: 0 } },
    take: 5
  });

  console.log(`Analyzing ${extractedEmd.length} successful EMD GeM tenders...`);

  for (const t of extractedEmd) {
    console.log(`\n- BidNumber: ${t.bidNumber} | Extracted EmdAmount: ${t.emdAmount}`);
    if (t.pdfPath && fs.existsSync(t.pdfPath)) {
      const buf = fs.readFileSync(t.pdfPath);
      const data = await pdfParse(buf);
      const text = data.text || '';
      
      const valStr = String(t.emdAmount);
      const idx = text.indexOf(valStr);
      if (idx !== -1) {
        console.log(`  Context in PDF: "${text.slice(Math.max(0, idx - 150), idx + valStr.length + 150).replace(/\r?\n/g, '\\n')}"`);
      } else {
        console.log(`  (Note: the value was found in listing data, not parsed from PDF direct match)`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const prisma = new PrismaClient();

async function main() {
  const notFoundTenders = await prisma.tender.findMany({
    where: { source: 'GEM', valueExtractionStatus: 'not_found' },
    take: 10
  });

  console.log(`Analyzing ${notFoundTenders.length} not_found tenders...`);

  for (const t of notFoundTenders) {
    if (!t.pdfPath || !fs.existsSync(t.pdfPath)) {
      console.log(`- ${t.bidNumber}: PDF file does not exist at ${t.pdfPath}`);
      continue;
    }

    const buf = fs.readFileSync(t.pdfPath);
    const data = await pdfParse(buf);
    const text = data.text || '';

    // Look for lines containing "value", "cost", "estimation", "मूल्य" or "लागत"
    const lines = text.split('\n');
    const matches = [];
    for (const line of lines) {
      if (
        /value|cost|estimated|estimation|मूल्य|लागत|अनुमानित/i.test(line) &&
        /\d/.test(line) &&
        !/turnover|experience|days|validity|year|performance/i.test(line)
      ) {
        matches.push(line.trim());
      }
    }

    console.log(`\n- BidNumber: ${t.bidNumber}`);
    if (matches.length > 0) {
      console.log(`  Potential value matches found in PDF text:`);
      matches.slice(0, 5).forEach(m => console.log(`    > "${m}"`));
    } else {
      console.log(`  No potential value matches found in PDF text.`);
    }
  }
}

main().finally(() => prisma.$disconnect());

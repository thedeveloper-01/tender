import { PrismaClient } from '@prisma/client';
import { extractValueAndEmd } from '../src/pipeline/extract.js';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const tenders = await prisma.tender.findMany({
    where: { source: 'GEM' }
  });

  console.log(`Reprocessing ${tenders.length} GeM tenders...`);

  let count = 0;
  for (const t of tenders) {
    if (t.pdfPath && fs.existsSync(t.pdfPath)) {
      const rawTender = { ...t, bidValue: null, emdAmount: null };
      const result = await extractValueAndEmd(rawTender, t.pdfPath);

      const isChanged = 
        t.bidValue !== result.bidValue || 
        t.emdAmount !== result.emdAmount || 
        t.valueExtractionStatus !== result.status ||
        JSON.stringify(t.sourceMeta?.pdfExtract?.fields || {}) !== JSON.stringify(result.extractedFields || {});

      if (isChanged) {
        console.log(`Updating ${t.bidNumber}:`);
        console.log(`  Before: Value=${t.bidValue}, EMD=${t.emdAmount}, Status=${t.valueExtractionStatus}`);
        console.log(`  After:  Value=${result.bidValue}, EMD=${result.emdAmount}, Status=${result.status}`);

        await prisma.tender.update({
          where: { id: t.id },
          data: {
            bidValue: result.bidValue,
            emdAmount: result.emdAmount,
            valueExtractionStatus: result.status,
            sourceMeta: {
              ...(t.sourceMeta || {}),
              pdfExtract: {
                text: result.extractedText || t.sourceMeta?.pdfExtract?.text,
                fields: result.extractedFields,
              }
            }
          }
        });
        count++;
      }
    }
  }
  console.log(`Finished. Reprocessed and updated ${count} tenders in the database.`);
}

main().finally(() => prisma.$disconnect());

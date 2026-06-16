import { PrismaClient } from '@prisma/client';
import { extractValueAndEmd } from '../src/pipeline/extract.js';

const prisma = new PrismaClient();

async function main() {
  const tender = await prisma.tender.findFirst({
    where: {
      source: 'CSPGCL',
      bidNumber: { contains: 'TN-18' }
    }
  });
  console.log('Tender before extract:', {
    bidNumber: tender.bidNumber,
    bidValue: tender.bidValue,
    emdAmount: tender.emdAmount,
    valueExtractionStatus: tender.valueExtractionStatus,
    pdfPath: tender.pdfPath
  });

  const result = await extractValueAndEmd(tender, tender.pdfPath);
  console.log('Extraction Result:', result);
}

main().finally(() => prisma.$disconnect());

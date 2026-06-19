import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.tender.groupBy({
    by: ['source', 'valueExtractionStatus'],
    _count: { _all: true }
  });
  console.log('Extraction status counts by source:', JSON.stringify(sources, null, 2));

  const zeroBidValue = await prisma.tender.count({
    where: { bidValue: 0 }
  });
  const zeroEmd = await prisma.tender.count({
    where: { emdAmount: 0 }
  });
  console.log('Tenders with bidValue = 0:', zeroBidValue);
  console.log('Tenders with emdAmount = 0:', zeroEmd);

  const samples = await prisma.tender.findMany({
    where: { OR: [{ bidValue: 0 }, { emdAmount: 0 }] },
    take: 5
  });
  console.log('Samples of 0 values:', JSON.stringify(samples, null, 2));
}

main().catch(e => console.error('Error:', e)).finally(() => prisma.$disconnect());

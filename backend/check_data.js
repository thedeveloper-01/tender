import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const cgTotal = await prisma.tender.count({
    where: {
      source: 'GEM',
      locationState: 'Chhattisgarh'
    }
  });

  const cgWithMeta = await prisma.tender.count({
    where: {
      source: 'GEM',
      locationState: 'Chhattisgarh',
      sourceMeta: { not: null }
    }
  });

  console.log('Total GeM tenders in CG:', cgTotal);
  console.log('GeM tenders in CG with sourceMeta:', cgWithMeta);

  // Let's count how many have aiExtract manually
  const allCg = await prisma.tender.findMany({
    where: {
      source: 'GEM',
      locationState: 'Chhattisgarh'
    },
    select: {
      sourceMeta: true
    }
  });

  let withAi = 0;
  for (const t of allCg) {
    if (t.sourceMeta?.aiExtract) {
      withAi++;
    }
  }
  console.log('GeM tenders in CG with aiExtract:', withAi);

  await prisma.$disconnect();
}

main().catch(console.error);

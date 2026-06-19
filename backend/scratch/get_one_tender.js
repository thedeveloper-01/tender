import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tender = await prisma.tender.findUnique({
    where: {
      source_bidNumber: {
        source: 'GEM',
        bidNumber: 'GEM/2026/B/7615829'
      }
    }
  });
  console.log('Tender:', JSON.stringify(tender, null, 2));
}

main().finally(() => prisma.$disconnect());

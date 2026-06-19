import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tender = await prisma.tender.findFirst({
    where: {
      source: 'GEM',
      title: { contains: 'RICE' }
    }
  });
  console.log('Tender details:', JSON.stringify(tender, null, 2));
}

main().finally(() => prisma.$disconnect());

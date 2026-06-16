import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tender = await prisma.tender.findFirst({
    where: {
      source: 'CSPGCL',
      bidNumber: { contains: 'TN-18' }
    }
  });
  console.log('Tender:', JSON.stringify(tender, null, 2));
}

main().finally(() => prisma.$disconnect());


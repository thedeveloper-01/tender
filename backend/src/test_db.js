import { prisma } from './db.js';

async function main() {
  const tenders = await prisma.tender.findMany({ take: 5, select: { source: true, bidNumber: true } });
  console.log(tenders);
}

main().finally(() => prisma.$disconnect());

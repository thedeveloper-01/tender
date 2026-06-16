import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const c = await prisma.tender.count({ where: { source: 'GEM' } });
  console.log('Total GEM tenders in DB:', c);
  const c2 = await prisma.tender.count({ where: { source: 'GEM', locationCity: { not: null } } });
  console.log('Total GEM tenders with location:', c2);
}
main().finally(() => prisma.$disconnect());

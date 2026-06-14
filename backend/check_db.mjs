import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const gemTenders = await prisma.tender.findMany({
    where: { source: 'GEM' },
    select: { bidNumber: true, title: true, organization: true, department: true, locationCity: true, rawJson: true },
    take: 10,
  });
  console.log('Sample GeM Tenders in DB:');
  for (const t of gemTenders) {
    console.log(`- Bid: ${t.bidNumber}`);
    console.log(`  Title: ${t.title}`);
    console.log(`  Org: ${t.organization}`);
    console.log(`  Dept: ${t.department}`);
    console.log(`  Raw Location text: ${t.rawJson?.locationText}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

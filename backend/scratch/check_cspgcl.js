import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const allCount = await prisma.tender.count({ where: { source: 'CSPGCL' } });
  console.log('Total CSPGCL tenders in DB:', allCount);

  const samples = await prisma.tender.findMany({
    where: { source: 'CSPGCL' },
    take: 10,
    orderBy: { fetchedAt: 'desc' }
  });

  console.log('\nSample CSPGCL tenders:');
  for (const t of samples) {
    console.log(`- ID: ${t.id}`);
    console.log(`  BidNumber: ${t.bidNumber}`);
    console.log(`  Title: ${t.title.substring(0, 80)}...`);
    console.log(`  BidValue: ${t.bidValue}, EMD: ${t.emdAmount}`);
    console.log(`  Status: ${t.status}, ValueExtractionStatus: ${t.valueExtractionStatus}`);
    console.log(`  PDF Path: ${t.pdfPath}`);
  }
}

main().finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const allGem = await prisma.tender.count({ where: { source: 'GEM' } });
  console.log('Total GEM tenders in DB:', allGem);

  const statuses = await prisma.tender.groupBy({
    by: ['valueExtractionStatus'],
    where: { source: 'GEM' },
    _count: true
  });
  console.log('GEM valueExtractionStatus counts:', JSON.stringify(statuses, null, 2));

  // Find some examples of not_found
  const notFoundSamples = await prisma.tender.findMany({
    where: { source: 'GEM', valueExtractionStatus: 'not_found' },
    take: 5
  });

  console.log('\nSamples of valueExtractionStatus = not_found:');
  for (const t of notFoundSamples) {
    console.log(`- BidNumber: ${t.bidNumber}`);
    console.log(`  PDF Path: ${t.pdfPath}`);
    console.log(`  Fields:`, JSON.stringify(t.sourceMeta?.pdfExtract?.fields || {}, null, 2));
    // Print the first 200 characters of pdf text
    const text = t.sourceMeta?.pdfExtract?.text || '';
    console.log(`  Text: ${text.substring(0, 300)}...`);
  }

  // Find some examples of failed_download
  const failedDownloadSamples = await prisma.tender.findMany({
    where: { source: 'GEM', valueExtractionStatus: 'failed_download' },
    take: 5
  });

  console.log('\nSamples of valueExtractionStatus = failed_download:');
  for (const t of failedDownloadSamples) {
    console.log(`- BidNumber: ${t.bidNumber}`);
    console.log(`  PDF Path: ${t.pdfPath}`);
  }
}

main().finally(() => prisma.$disconnect());

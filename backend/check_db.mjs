// check_db.mjs — run with: node check_db.mjs
import 'dotenv/config';
import { prisma } from './src/db.js';

async function main() {
  const total     = await prisma.tender.count();
  const gemCount  = await prisma.tender.count({ where: { source: 'GEM' } });
  const withPdf   = await prisma.tender.count({ where: { source: 'GEM', pdfPath: { not: null } } });
  const extracted = await prisma.tender.count({ where: { source: 'GEM', valueExtractionStatus: 'extracted' } });
  const notAttempted = await prisma.tender.count({ where: { source: 'GEM', valueExtractionStatus: 'not_attempted' } });
  const notFound  = await prisma.tender.count({ where: { source: 'GEM', valueExtractionStatus: 'not_found' } });
  const openCount = await prisma.tender.count({ where: { source: 'GEM', status: 'open' } });
  const logs      = await prisma.fetchLog.findMany({ orderBy: { runAt: 'desc' }, take: 5 });
  const recent    = await prisma.tender.findFirst({
    where: { source: 'GEM' },
    orderBy: { fetchedAt: 'desc' },
    select: {
      bidNumber: true,
      title: true,
      fetchedAt: true,
      pdfPath: true,
      bidValue: true,
      emdAmount: true,
      valueExtractionStatus: true,
      sourceMeta: true,
    }
  });

  console.log('╔══════════════════════════════════════╗');
  console.log('  DB STATUS CHECK');
  console.log('╚══════════════════════════════════════╝');
  console.log('Total tenders in DB :', total);
  console.log('GEM tenders         :', gemCount);
  console.log('  - open            :', openCount);
  console.log('  - with PDF        :', withPdf);
  console.log('  - extracted OK    :', extracted);
  console.log('  - not_attempted   :', notAttempted);
  console.log('  - not_found       :', notFound);
  console.log('');
  console.log('=== LAST 5 FETCH LOGS ===');
  logs.forEach(l => {
    console.log(`  [${l.runAt.toISOString()}] source=${l.source} found=${l.found} new=${l.newCount} updated=${l.updatedCount} pdfs=${l.pdfsDownloaded} extractOk=${l.extractionOk} errors=${l.errors.length}`);
    if (l.errors.length > 0) l.errors.slice(0,3).forEach(e => console.log('    ERROR:', e.substring(0,120)));
  });
  console.log('');
  console.log('=== MOST RECENT GEM TENDER ===');
  if (recent) {
    console.log('  bidNumber :', recent.bidNumber);
    console.log('  title     :', recent.title?.substring(0, 80));
    console.log('  fetchedAt :', recent.fetchedAt);
    console.log('  pdfPath   :', recent.pdfPath);
    console.log('  bidValue  :', recent.bidValue);
    console.log('  emdAmount :', recent.emdAmount);
    console.log('  extraction:', recent.valueExtractionStatus);
    console.log('  gemId     :', recent.sourceMeta?.gemId ?? 'NOT SET');
  } else {
    console.log('  (no GEM tenders found)');
  }
}

main()
  .catch(e => console.error('DB ERROR:', e.message))
  .finally(() => prisma.$disconnect());

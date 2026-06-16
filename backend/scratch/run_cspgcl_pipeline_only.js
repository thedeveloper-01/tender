async function main() {
  console.log('Setting SKIP_GEM=true and SKIP_CSPGCL=false...');
  process.env.SKIP_GEM = 'true';
  process.env.SKIP_CSPGCL = 'false';

  // Dynamic import of modules to ensure they read the new env values!
  const { runPipeline } = await import('../src/pipeline/run.js');
  const { prisma } = await import('../src/db.js');

  console.log('Running pipeline for CSPGCL only...');
  const log = await runPipeline();
  console.log('\nPipeline run complete!');
  console.log(JSON.stringify(log, null, 2));

  // Count CSPGCL tenders in DB
  const cspgclCount = await prisma.tender.count({ where: { source: 'CSPGCL' } });
  console.log('\nTotal CSPGCL tenders in DB now:', cspgclCount);

  // Find some sub-tenders (tenders with subTenderSpecNo or parentNoticeNo in sourceMeta)
  const subTenders = await prisma.tender.findMany({
    where: {
      source: 'CSPGCL',
      OR: [
        { bidNumber: { contains: '-sub-' } },
        { sourceMeta: { path: ['parentNoticeNo'], not: null } }
      ]
    },
    take: 10
  });
  console.log(`\nFound ${subTenders.length} sub-tenders:`);
  for (const t of subTenders) {
    console.log(`- BidNumber: ${t.bidNumber} (parent: ${t.sourceMeta?.parentNoticeNo})`);
    console.log(`  Title: ${t.title.substring(0, 80)}...`);
    console.log(`  Value: ${t.bidValue}, EMD: ${t.emdAmount}`);
  }
  
  await prisma.$disconnect();
}

main().catch(e => console.error(e));

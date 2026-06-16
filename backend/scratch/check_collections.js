import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to database...');
  
  const tenders = await prisma.tender.findMany({
    where: { source: 'CSPGCL' }
  });
  
  console.log(`Total CSPGCL tenders found: ${tenders.length}`);
  
  const parentTenders = [];
  const subTenders = [];
  const standaloneTenders = [];
  
  for (const t of tenders) {
    const meta = t.sourceMeta || {};
    if (meta.parentNoticeNo) {
      subTenders.push(t);
    } else if (tenders.some(other => other.sourceMeta?.parentNoticeNo === t.bidNumber)) {
      parentTenders.push(t);
    } else {
      standaloneTenders.push(t);
    }
  }
  
  console.log(`- Parent notices (with sub-tenders): ${parentTenders.length}`);
  console.log(`- Sub-tenders (extracted from notices): ${subTenders.length}`);
  console.log(`- Standalone notices (single-tender): ${standaloneTenders.length}`);
  
  if (subTenders.length > 0) {
    console.log('\n--- Samples of Extracted Sub-Tenders ---');
    subTenders.slice(0, 10).forEach(t => {
      console.log(`Sub-Bid: ${t.bidNumber} | Parent: ${t.sourceMeta.parentNoticeNo}`);
      console.log(`  Title: ${t.title}`);
      console.log(`  Value: ${t.bidValue} Rs | EMD: ${t.emdAmount} Rs`);
      console.log(`  Extraction Status: ${t.valueExtractionStatus}`);
      console.log(`  PDF Path: ${t.pdfPath}`);
      console.log('  --------------------------------------------');
    });
  } else {
    console.log('\nNo sub-tenders found.');
  }

  const valueStats = tenders.reduce((acc, t) => {
    acc[t.valueExtractionStatus] = (acc[t.valueExtractionStatus] || 0) + 1;
    return acc;
  }, {});
  console.log('\nExtraction Status Stats for all CSPGCL tenders:', valueStats);
}

main().catch(e => console.error('Error:', e)).finally(() => prisma.$disconnect());


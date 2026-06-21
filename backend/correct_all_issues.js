import { prisma } from './src/db.js';
import { resolveCityForGem } from './src/pipeline/locationResolve.js';

function cleanTitle(title, category) {
  if (!title) return 'Custom Bid / BOQ';
  const isNumericGarbage = /^[\d,\s]+(\.\.\.)?$/.test(title) && (title.includes(',') || title.trim().length > 10);
  if (isNumericGarbage) {
    const cat = (category || '').toLowerCase();
    if (cat.includes('services')) {
      return 'Custom Bid for Services';
    } else if (cat.includes('boq')) {
      return 'BOQ Bid for Goods';
    } else {
      return 'Custom / BOQ Bid';
    }
  }
  return title;
}

async function main() {
  console.log('=== DATABASE MIGRATION SCRIPT ===\n');

  // 1. Resolve unspecified districts
  const unspecified = await prisma.tender.findMany({
    where: {
      source: 'GEM',
      locationCity: 'Unspecified',
      valueExtractionStatus: 'extracted'
    }
  });

  console.log(`Checking ${unspecified.length} unspecified extracted GeM tenders for PIN-based resolution...`);
  let resolvedCount = 0;

  for (const t of unspecified) {
    const address = t.sourceMeta?.pdfExtract?.fields?.consigneeAddress?.value || '';
    const text = t.sourceMeta?.pdfExtract?.text || '';
    const combined = `${address} ${text}`;
    const resolved = resolveCityForGem(combined);

    if (resolved && resolved !== 'Unspecified') {
      resolvedCount++;
      await prisma.tender.update({
        where: { id: t.id },
        data: { locationCity: resolved }
      });
      console.log(`  [location] Resolved ${t.bidNumber}: "${address.substring(0, 40)}" -> ${resolved}`);
    }
  }
  console.log(`\nDistrict resolution complete: resolved and updated ${resolvedCount} tenders.`);

  // 2. Correct garbled titles
  const allGem = await prisma.tender.findMany({
    where: { source: 'GEM' }
  });

  console.log(`\nChecking ${allGem.length} GeM tenders for garbled BOQ titles...`);
  let cleanedCount = 0;

  for (const t of allGem) {
    const category = t.rawJson?.category || '';
    const newTitle = cleanTitle(t.title, category);

    if (newTitle !== t.title) {
      cleanedCount++;
      await prisma.tender.update({
        where: { id: t.id },
        data: { title: newTitle }
      });
      console.log(`  [title] Cleaned ${t.bidNumber}: "${t.title.substring(0, 40)}..." -> "${newTitle}"`);
    }
  }
  console.log(`\nTitle cleaning complete: cleaned and updated ${cleanedCount} tenders.`);

  console.log('\n=== MIGRATION RUN COMPLETE ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
import { fetchGemTendersBrowser } from './src/fetchers/gem_browser.js';
import { normalizeGem } from './src/pipeline/normalize.js';
import { analyzeTender } from './src/pipeline/analysis.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching first page of GeM tenders...');
  const results = await fetchGemTendersBrowser();
  console.log(`Fetched ${results.length} raw results. Normalizing first 5...`);
  
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const raw = results[i];
    try {
      const normalized = normalizeGem(raw);
      const analyzed = analyzeTender(normalized);
      const data = { ...normalized, ...analyzed };
      
      console.log(`Upserting bidNumber: ${data.bidNumber}`);
      const saved = await prisma.tender.upsert({
        where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
        create: data,
        update: data,
      });
      console.log('Saved successfully:', saved.id);
    } catch (e) {
      console.error(`Error on record ${i}:`, e.message);
    }
  }
}
main().finally(() => prisma.$disconnect());

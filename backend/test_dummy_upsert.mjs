import { PrismaClient } from '@prisma/client';
import { normalizeGem } from './src/pipeline/normalize.js';
import { analyzeTender } from './src/pipeline/analysis.js';

const prisma = new PrismaClient();

async function main() {
  const rawData = {
    b_bid_number: ['GEM/2026/B/9999999'],
    b_category_name: ['Computers'],
    final_start_date_sort: [new Date().toISOString()],
    final_end_date_sort: [new Date().toISOString()],
    b_status: [1],
    ba_official_details_minName: ['Ministry of Test'],
    b_bid_type: [1]
  };
  
  const normalized = normalizeGem(rawData);
  const analyzed = analyzeTender(normalized);
  const data = { ...normalized, ...analyzed };
  
  try {
    const saved = await prisma.tender.upsert({
      where: { source_bidNumber: { source: data.source, bidNumber: data.bidNumber } },
      create: data,
      update: data,
    });
    console.log('Saved successfully:', saved.id);
  } catch(e) {
    console.error('Upsert Error:', e);
  }
}
main().finally(() => prisma.$disconnect());

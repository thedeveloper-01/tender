import { PrismaClient } from '@prisma/client';
import { downloadPdf } from '../src/pipeline/pdf.js';
import { extractValueAndEmd } from '../src/pipeline/extract.js';

const prisma = new PrismaClient();

async function main() {
  const tender = await prisma.tender.findUnique({
    where: {
      source_bidNumber: {
        source: 'GEM',
        bidNumber: 'GEM/2026/B/7464856'
      }
    }
  });

  if (!tender) {
    console.error('Tender not found in DB!');
    return;
  }

  console.log('Downloading PDF...');
  const pdfPath = await downloadPdf(tender);
  console.log('PDF Path:', pdfPath);

  if (pdfPath) {
    console.log('Extracting value and EMD...');
    const result = await extractValueAndEmd(tender, pdfPath);
    console.log('Extraction Result:', JSON.stringify(result, null, 2));
  } else {
    console.error('Failed to download PDF.');
  }
}

main().finally(() => prisma.$disconnect());

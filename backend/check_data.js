import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const openGemMseCount = await prisma.tender.count({
    where: {
      source: 'GEM',
      status: 'open',
      OR: [
        { mseExemption: true },
        { startupExemption: true }
      ]
    }
  });

  const allOpenGemCount = await prisma.tender.count({
    where: {
      source: 'GEM',
      status: 'open'
    }
  });

  console.log('Total Open GeM tenders in DB:', allOpenGemCount);
  console.log('Open GeM tenders with MSE/Startup true:', openGemMseCount);

  // Let's print the first 5 open GeM tenders with MSE/Startup true
  const samples = await prisma.tender.findMany({
    where: {
      source: 'GEM',
      status: 'open',
      OR: [
        { mseExemption: true },
        { startupExemption: true }
      ]
    },
    take: 5
  });

  console.log('Sample Open GeM tenders with exemption:', samples.map(s => ({
    bidNumber: s.bidNumber,
    mseExemption: s.mseExemption,
    startupExemption: s.startupExemption,
    locationState: s.locationState,
    locationCity: s.locationCity,
    endDate: s.endDate
  })));

  await prisma.$disconnect();
}

main().catch(console.error);

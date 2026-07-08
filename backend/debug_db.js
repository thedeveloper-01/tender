import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('backend/.env') });
const prisma = new PrismaClient({ datasources: { db: { url: process.env.MONGODB_URI } } });

try {
  const all = await prisma.tender.findMany({
    where: { source: 'GEM' }
  });
  
  let totalExempt = 0;
  let totalMseTrue = 0;
  let totalStartupTrue = 0;
  let totalNull = 0;
  let totalExemptText = 0;
  
  all.forEach(t => {
    const ai = t.sourceMeta?.aiExtract?.eligibility;
    const pdf = t.sourceMeta?.pdfExtract?.fields;
    
    const getMseExempt = (tender) => {
      const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
      if (eligibility && eligibility.mseExemption !== undefined) return eligibility.mseExemption;
      const fields = tender.sourceMeta?.pdfExtract?.fields;
      if (fields && fields.mseExemption) return fields.mseExemption.value;
      return null;
    };

    const getStartupExempt = (tender) => {
      const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
      if (eligibility && eligibility.startupExemption !== undefined) return eligibility.startupExemption;
      const fields = tender.sourceMeta?.pdfExtract?.fields;
      if (fields && fields.startupExemption) return fields.startupExemption.value;
      return null;
    };

    const isExempt = (val) => {
      if (val === true || val === 'true') return true;
      if (typeof val === 'string') {
        const s = val.toLowerCase().trim();
        return s.startsWith('yes') || s.startsWith('exempt') || s === 'applicable';
      }
      return false;
    };
    
    const mseVal = getMseExempt(t);
    const startupVal = getStartupExempt(t);
    
    if (isExempt(mseVal) || isExempt(startupVal)) {
      totalExempt++;
      if (isExempt(mseVal)) totalMseTrue++;
      if (isExempt(startupVal)) totalStartupTrue++;
    } else {
      if (mseVal == null && startupVal == null) {
        totalNull++;
      }
    }
  });
  
  console.log(`Total GeM tenders: ${all.length}`);
  console.log(`Tenders matching MSE/Startup Exempt filter: ${totalExempt}`);
  console.log(`  - MSE Exempt: ${totalMseTrue}`);
  console.log(`  - Startup Exempt: ${totalStartupTrue}`);
  console.log(`Tenders with completely null exemptions: ${totalNull}`);
  
} catch (e) {
  console.error(e);
} finally {
  await prisma.$disconnect();
}
process.exit(0);

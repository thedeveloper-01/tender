import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const where = {
      source: 'GEM',
      status: 'open',
      AND: [
        {
          OR: [
            { endDate: { gte: new Date() } },
            { endDate: null }
          ]
        }
      ]
    };
    const pageNum = 1;
    const limitNum = 100;
    
    const whereWithDate = { ...where, endDate: { not: null } };
    const whereNullDate = { ...where, endDate: null };

    console.log("Running total count query...");
    const total = await prisma.tender.count({ where });
    console.log("Total:", total);
    
    console.log("Running withDate query...");
    const withDate = await prisma.tender.findMany({
      where: whereWithDate,
      orderBy: { endDate: 'asc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });
    console.log("withDate count:", withDate.length);

    let remaining = limitNum - withDate.length;
    let nullDateItems = [];
    if (remaining > 0) {
      console.log("Running dateCount query...");
      const dateCount = await prisma.tender.count({ where: whereWithDate });
      console.log("dateCount:", dateCount);
      
      const skipNull  = Math.max(0, (pageNum - 1) * limitNum - dateCount);
      console.log("Running nullDateItems query with skipNull:", skipNull, "remaining:", remaining);
      nullDateItems = await prisma.tender.findMany({
        where: whereNullDate,
        orderBy: { fetchedAt: 'desc' },
        skip: skipNull,
        take: remaining,
      });
      console.log("nullDateItems count:", nullDateItems.length);
    }
  } catch (e) {
    console.error("Prisma error:", e);
  } finally {
    await prisma.$disconnect();
  }
}
test();

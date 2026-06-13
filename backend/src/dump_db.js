import { prisma } from './db.js';

async function check() {
  try {
    const tendersCount = await prisma.tender.count();
    const fetchLogs = await prisma.fetchLog.findMany();
    console.log('Tenders Count:', tendersCount);
    console.log('Fetch Logs:', JSON.stringify(fetchLogs, null, 2));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

check();

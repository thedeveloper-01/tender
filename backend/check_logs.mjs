import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const logs = await prisma.fetchLog.findMany({ orderBy: { runAt: 'desc' }, take: 5 });
  console.log(logs);
}
main().finally(() => prisma.$disconnect());

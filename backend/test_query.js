import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function test(query) {
  const {
    city,
    state,
    q,
    category,
    status = 'open',
    minValue,
    maxValue,
    minEmd,
    maxEmd,
    source,
    mseStartupOnly,
    zeroExperienceOnly,
    sort = 'endDate_asc',
    page = '1',
    limit = '20',
  } = query;

  const where = {};

  if (city && city !== 'all') where.locationCity = city;
  if (state && state !== 'all') where.locationState = state;
  if (source && source !== 'all') where.source = source.toUpperCase();
  if (status && status !== 'all') where.status = status;

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { organization: { contains: q, mode: 'insensitive' } },
      { bidNumber: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (category) {
    const cats = Array.isArray(category) ? category : String(category).split(',');
    where.category = { hasSome: cats };
  }

  if (minValue || maxValue) {
    where.bidValue = {};
    if (minValue) where.bidValue.gte = Number(minValue);
    if (maxValue) where.bidValue.lte = Number(maxValue);
  }

  if (minEmd || maxEmd) {
    where.emdAmount = {};
    if (minEmd) where.emdAmount.gte = Number(minEmd);
    if (maxEmd) where.emdAmount.lte = Number(maxEmd);
  }

  if (mseStartupOnly === 'true') {
    const mseOr = [];
    mseOr.push({ mseExemption:     true });
    mseOr.push({ startupExemption: true });
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: mseOr }];
      delete where.OR;
    } else {
      where.OR = mseOr;
    }
  }

  if (zeroExperienceOnly === 'true') {
    where.yearsOfExperienceZero = true;
  }

  console.log('Constructed where clause:', JSON.stringify(where, null, 2));

  const total = await prisma.tender.count({ where });
  console.log('Resulting count:', total);

  const results = await prisma.tender.findMany({
    where,
    take: 5
  });
  console.log('Result sample:', results.map(r => r.bidNumber));
}

async function main() {
  console.log('--- Test 1: source=GEM, status=open, mseStartupOnly=true ---');
  await test({
    source: 'GEM',
    status: 'open',
    mseStartupOnly: 'true'
  });

  console.log('\n--- Test 2: source=GEM, status=open, mseStartupOnly=true, zeroExperienceOnly=true ---');
  await test({
    source: 'GEM',
    status: 'open',
    mseStartupOnly: 'true',
    zeroExperienceOnly: 'true'
  });

  await prisma.$disconnect();
}

main().catch(console.error);

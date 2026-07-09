/**
 * backfill_mse_flags.js
 *
 * One-off migration script: reads sourceMeta.aiExtract.eligibility from every
 * existing tender and writes mseExemption, startupExemption, and
 * yearsOfExperienceZero to the new top-level Boolean columns.
 *
 * Run from the backend directory:
 *   node backfill_mse_flags.js
 *
 * Safe to re-run: only updates records where the flags haven't been set yet
 * (or where aiExtract data is available to override).
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// ── Same helpers as run.js ────────────────────────────────────────────────────
function resolveExemptionFlag(val) {
  if (val === true || val === false) return val;
  if (val == null) return null;
  const s = String(val).toLowerCase().trim();
  if (s.startsWith('yes') || s === 'applicable' || s.startsWith('exempt')) return true;
  if (s === 'no' || s === 'not specified' || s === 'not applicable' || s === 'na') return false;
  return null;
}

function resolveYearsZero(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val === 0;
  if (typeof val === 'string') {
    const s = val.toLowerCase().trim();
    if (s === 'not specified' || s === 'not required' || s === 'nil' || s === 'no' ||
        s === '0' || s.includes('0 year') || s === 'exempt') return true;
    const match = s.match(/(\d+)/);
    if (match) return parseInt(match[1], 10) === 0;
    return null;
  }
  return null;
}

async function main() {
  const BATCH = 500;
  let cursor = undefined;
  let total = 0;
  let updated = 0;
  let skipped = 0;

  const grandTotal = await prisma.tender.count();
  console.log(`[backfill] Starting MSE flags backfill for ${grandTotal} tenders in batches of ${BATCH}...`);

  while (true) {
    const batch = await prisma.tender.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        sourceMeta: true,
        mseExemption: true,
        startupExemption: true,
        yearsOfExperienceZero: true,
      },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    total += batch.length;

    const promises = [];

    for (const tender of batch) {
      // Try both aiExtract and legacy pdfExtract.fields
      const elig = tender.sourceMeta?.aiExtract?.eligibility ?? {};
      const legacyFields = tender.sourceMeta?.pdfExtract?.fields ?? {};

      const mseRaw     = elig.mseExemption     ?? legacyFields.mseExemption?.value     ?? null;
      const startupRaw = elig.startupExemption ?? legacyFields.startupExemption?.value ?? null;
      const yearsRaw   = elig.yearsOfExperience ?? legacyFields.experienceCriteria?.value ?? null;

      const mseFlag     = resolveExemptionFlag(mseRaw);
      const startupFlag = resolveExemptionFlag(startupRaw);
      const yearsZero   = resolveYearsZero(yearsRaw);

      // Skip if nothing to set
      if (mseFlag === null && startupFlag === null && yearsZero === null) {
        skipped++;
        continue;
      }

      const data = {};
      if (mseFlag     !== null) data.mseExemption          = mseFlag;
      if (startupFlag !== null) data.startupExemption      = startupFlag;
      if (yearsZero   !== null) data.yearsOfExperienceZero = yearsZero;

      promises.push(
        prisma.tender.update({ where: { id: tender.id }, data })
          .then(() => { updated++; })
          .catch((e) => {
            console.error(`[backfill] Failed to update tender ${tender.id}:`, e.message);
          })
      );
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    const pct = ((total / grandTotal) * 100).toFixed(1);
    console.log(`[backfill] ${total}/${grandTotal} (${pct}%) — updated: ${updated}, skipped: ${skipped}`);
  }

  console.log(`\n[backfill] ✓ Done. Total: ${total} | Updated: ${updated} | No eligibility data: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[backfill] Fatal error:', e);
  process.exit(1);
});

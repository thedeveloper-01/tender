import { config } from '../config.js';
import { deletePdf } from './pdf.js';

/**
 * runCleanup(prisma) -> { cleanedRecords, cleanedFiles }
 *
 * Finds closed tenders whose endDate is more than
 * config.autoDeleteClosedAfterDays old, deletes their PDF files, and
 * (if archive mode is on) writes a lightweight ArchivedTender record
 * before deleting the Tender document.
 *
 * Never touches tenders where status !== "closed", regardless of age.
 */
export async function runCleanup(prisma) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.autoDeleteClosedAfterDays);

  const stale = await prisma.tender.findMany({
    where: {
      status: 'closed',
      endDate: { lt: cutoff },
    },
  });

  let cleanedRecords = 0;
  let cleanedFiles = 0;

  for (const tender of stale) {
    if (tender.pdfPath) {
      deletePdf(tender.pdfPath);
      cleanedFiles += 1;
    }

    if (config.archiveMode) {
      await prisma.archivedTender.create({
        data: {
          source: tender.source,
          bidNumber: tender.bidNumber,
          title: tender.title,
          locationCity: tender.locationCity,
          endDate: tender.endDate,
          bidValue: tender.bidValue,
          emdAmount: tender.emdAmount,
          archivedAt: new Date(),
        },
      });
    }

    await prisma.tender.delete({ where: { id: tender.id } });
    cleanedRecords += 1;
  }

  return { cleanedRecords, cleanedFiles };
}

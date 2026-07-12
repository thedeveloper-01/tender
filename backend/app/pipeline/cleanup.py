"""
app/pipeline/cleanup.py

Direct port of src/pipeline/cleanup.js.
"""
from datetime import datetime, timezone, timedelta

from ..config import config
from .pdf import delete_pdf


async def run_cleanup(tenders_col, archived_tenders_col) -> dict:
    """runCleanup(prisma) -> { cleanedRecords, cleanedFiles }

    Finds closed tenders whose endDate is more than
    config.auto_delete_closed_after_days old, deletes their PDF files, and
    (if archive mode is on) writes a lightweight ArchivedTender record
    before deleting the Tender document.

    Never touches tenders where status != "closed", regardless of age.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=config.auto_delete_closed_after_days)

    stale_cursor = tenders_col.find({'status': 'closed', 'endDate': {'$lt': cutoff}})
    stale = await stale_cursor.to_list(length=None)

    cleaned_records = 0
    cleaned_files = 0

    for tender in stale:
        if tender.get('pdfPath'):
            others = await tenders_col.count_documents({
                'pdfPath': tender['pdfPath'],
                '_id': {'$ne': tender['_id']},
            })
            if others == 0:
                delete_pdf(tender['pdfPath'])
                cleaned_files += 1

        if config.archive_mode:
            await archived_tenders_col.insert_one({
                'source': tender.get('source'),
                'bidNumber': tender.get('bidNumber'),
                'title': tender.get('title'),
                'locationCity': tender.get('locationCity'),
                'endDate': tender.get('endDate'),
                'bidValue': tender.get('bidValue'),
                'emdAmount': tender.get('emdAmount'),
                'archivedAt': datetime.now(timezone.utc),
            })

        await tenders_col.delete_one({'_id': tender['_id']})
        cleaned_records += 1

    return {'cleanedRecords': cleaned_records, 'cleanedFiles': cleaned_files}

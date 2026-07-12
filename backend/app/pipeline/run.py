"""
app/pipeline/run.py

Direct port of src/pipeline/run.js.

GEM fetching stage removed: you're populating GEM tenders through your own
scraper directly (presumably straight into the `tenders` collection, or via
a separate import path), so this pipeline no longer calls a GEM fetcher.
CSPGCL fetch + normalize + analyze + upsert + PDF + cleanup + FetchLog are
all intact and unchanged in behavior.
"""
from datetime import datetime, timezone

import httpx

from .. import db
from ..config import config
from ..cache import clear as clear_cache
from ..fetchers.cspgcl import fetch_cspgcl_tenders
from .normalize import normalize_cspgcl
from .location_resolve import resolve_city_for_gem, resolve_city_for_cspgcl
from .analysis import analyze_tender
from .pdf import download_pdf
from .extract import extract_value_and_emd
from .cleanup import run_cleanup


def _resolve_exemption_flag(val):
    """Resolve mseExemption / startupExemption string values -> bool | None"""
    if val is True or val is False:
        return val
    if val is None:
        return None
    s = str(val).lower().strip()
    if s.startswith('yes') or s == 'applicable' or s.startswith('exempt'):
        return True
    if s in ('no', 'not specified', 'not applicable', 'na'):
        return False
    return None  # unknown — don't store false positives


def _resolve_years_zero(val):
    """Resolve yearsOfExperience -> bool (true = zero/not required)"""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return val == 0
    if isinstance(val, str):
        s = val.lower().strip()
        if s in ('not specified', 'not required', 'nil', 'no', '0', 'exempt') or '0 year' in s:
            return True
        import re
        m = re.search(r'(\d+)', s)
        if m:
            return int(m.group(1)) == 0
        return None
    return None


async def run_pipeline() -> dict:
    """runPipeline() -> FetchLog document

    1. Fetch raw records from CSPGCL (independent try/catch).
    2. Normalize -> resolve locations -> run analysis engine.
    3. Upsert each tender keyed on [source, bidNumber].
    4. For new/changed tenders, download PDF -> extract (CSPGCL regex parser).
    5. Push extracted fields to DB.
    6. Bulk-update status for all tenders based on endDate vs now.
    7. Run cleanup/archive.
    8. Write a FetchLog document.
    """
    run_at = datetime.now(timezone.utc)
    errors = []
    found = 0
    new_count = 0
    updated_count = 0
    pdfs_downloaded = 0
    extraction_ok = 0
    extraction_fail = 0

    tenders_col = db.tenders

    # ── 1. Fetch ────────────────────────────────────────────────────────────
    cspgcl_raw = []

    if not config.skip_cspgcl:
        try:
            cspgcl_raw = await fetch_cspgcl_tenders()
        except Exception as e:
            print(f"[pipeline] CSPGCL fetch failed: {e}")
            errors.append(f"CSPGCL fetch error: {e}")
    else:
        print("[pipeline] skipping CSPGCL fetch stage (SKIP_CSPGCL=true)")

    print("[pipeline] GEM fetch stage is handled by your external scraper — not run from this pipeline")

    found = len(cspgcl_raw)

    # ── 2 & 3. Normalize, analyze, upsert ─────────────────────────────────
    print(f"[pipeline] normalizing {len(cspgcl_raw)} CSPGCL records...")
    normalized = []
    for r in cspgcl_raw:
        try:
            normalized.append(normalize_cspgcl(r))
        except Exception as e:
            print(f"[pipeline] CSPGCL normalization failed for tenderNoticeNo={r.get('tenderNoticeNo')}: {e}")
            errors.append(f"CSPGCL normalize error ({r.get('tenderNoticeNo')}): {e}")
    print(f"[pipeline] normalization complete. {len(normalized)}/{found} records successfully normalized.")

    changed_tenders = []

    print(f"[pipeline] starting database upsert for {len(normalized)} tenders...")
    upsert_count = 0
    skip_count = 0
    for tender in normalized:
        try:
            upsert_count += 1
            if upsert_count % 100 == 0 or upsert_count == len(normalized):
                print(f"[pipeline] database upsert progress: {upsert_count}/{len(normalized)}")

            analyzed = analyze_tender(tender)
            data = {**tender, **analyzed}

            existing = await tenders_col.find_one({'source': data['source'], 'bidNumber': data['bidNumber']})

            update_data = dict(data)
            if existing:
                if (existing.get('valueExtractionStatus') and
                        existing['valueExtractionStatus'] != 'not_attempted' and
                        data['valueExtractionStatus'] == 'not_attempted'):
                    update_data.pop('valueExtractionStatus', None)
                    update_data.pop('bidValue', None)
                    update_data.pop('emdAmount', None)
                    update_data.pop('pdfPath', None)

            await tenders_col.update_one(
                {'source': data['source'], 'bidNumber': data['bidNumber']},
                {'$set': update_data},
                upsert=True,
            )
            saved = await tenders_col.find_one({'source': data['source'], 'bidNumber': data['bidNumber']})

            if not existing:
                new_count += 1
                if data['source'] == 'GEM':
                    changed_tenders.append(saved)
            else:
                updated_count += 1
                if data['source'] == 'GEM':
                    changed = (
                        existing.get('valueExtractionStatus') == 'not_attempted'
                        or not existing.get('valueExtractionStatus')
                        or existing.get('endDate') != data.get('endDate')
                    )
                    if changed:
                        changed_tenders.append(saved)
                    else:
                        skip_count += 1
                else:
                    skip_count += 1
        except Exception as e:
            print(f"[pipeline] upsert error for {tender.get('source')}/{tender.get('bidNumber')}: {e}")
            errors.append(f"Upsert error ({tender.get('source')}/{tender.get('bidNumber')}): {e}")

    print(
        f"[pipeline] database upsert complete. New: {new_count}, Updated: {updated_count} "
        f"(PDF extraction skipped for {skip_count} unchanged existing tenders)"
    )

    # ── 4. PDF download + extraction + DB sync ─────────────────────────────
    print(f"[pipeline] processing PDF download and extraction for {len(changed_tenders)} tenders...")
    pdf_count = 0
    success_pdf_count = 0
    failed_pdf_count = 0

    for tender in changed_tenders:
        try:
            pdf_count += 1
            print(f"[pipeline] [{pdf_count}/{len(changed_tenders)}] processing PDF for {tender['source']}/{tender['bidNumber']}...")

            pdf_path = await download_pdf(tender)
            if pdf_path:
                print(f"[pipeline] [{pdf_count}/{len(changed_tenders)}] PDF downloaded: {pdf_path}")
                pdfs_downloaded += 1
                success_pdf_count += 1
            else:
                print(f"[pipeline] [{pdf_count}/{len(changed_tenders)}] PDF download failed / not available")
                failed_pdf_count += 1

            result = await extract_value_and_emd(tender, pdf_path)
            if not pdf_path:
                result['status'] = 'extracted' if result['status'] == 'extracted' else 'failed_download'
            print(
                f"[pipeline] [{pdf_count}/{len(changed_tenders)}] extraction complete. "
                f"status={result['status']} bidValue={result['bidValue']} emdAmount={result['emdAmount']}"
            )

            if result['status'] == 'extracted':
                extraction_ok += 1
            elif result['status'] in ('not_found', 'failed_download'):
                extraction_fail += 1

            # ── CSPGCL multi-row handling ────────────────────────────────
            if tender['source'] == 'CSPGCL' and result.get('rows'):
                print(f"[pipeline] [{pdf_count}/{len(changed_tenders)}] {len(result['rows'])} sub-tender(s) in CSPGCL PDF")

                first_row = result['rows'][0]
                updated_city = tender.get('locationCity')
                if not updated_city or updated_city == 'Unspecified':
                    resolved = resolve_city_for_cspgcl({'scopeRaw': first_row.get('scope')})
                    if resolved and resolved != 'Unspecified':
                        updated_city = resolved
                        print(f"[pipeline] [{pdf_count}/{len(changed_tenders)}] city resolved -> \"{resolved}\"")

                first_sub_tender = {
                    **tender,
                    'title': first_row.get('scope') or tender.get('title'),
                    'bidValue': first_row.get('nitValueRs') if first_row.get('nitValueRs') is not None else tender.get('bidValue'),
                    'emdAmount': first_row.get('emdAmount') if first_row.get('emdAmount') is not None else tender.get('emdAmount'),
                    'locationCity': updated_city,
                    'sourceMeta': {
                        **(tender.get('sourceMeta') or {}),
                        'subTenderSpecNo': first_row.get('tenderSpecNo'),
                        'subTenderRfxNos': first_row.get('rfxNos') or [],
                        'pdfExtract': {'text': result.get('extractedText')},
                    },
                }
                first_analyzed = analyze_tender(first_sub_tender)

                await tenders_col.update_one(
                    {'_id': tender['_id']},
                    {'$set': {
                        'title': first_sub_tender['title'],
                        'bidValue': first_sub_tender['bidValue'],
                        'emdAmount': first_sub_tender['emdAmount'],
                        'valueExtractionStatus': result['status'],
                        'locationCity': first_sub_tender['locationCity'],
                        'category': first_analyzed['category'],
                        'viabilityScore': first_analyzed['viabilityScore'],
                        'risks': first_analyzed['risks'],
                        'pdfPath': pdf_path or tender.get('pdfPath'),
                        'sourceMeta': first_sub_tender['sourceMeta'],
                    }},
                )
                print(f"[pipeline] [{pdf_count}/{len(changed_tenders)}] updated parent CSPGCL tender {tender['bidNumber']}")

                for r_idx in range(1, len(result['rows'])):
                    row = result['rows'][r_idx]
                    sub_bid_number = (row.get('rfxNos') and row['rfxNos'][0]) or row.get('tenderSpecNo') or f"{tender['bidNumber']}-sub-{r_idx}"

                    sub_city = tender.get('locationCity')
                    if not sub_city or sub_city == 'Unspecified':
                        resolved = resolve_city_for_cspgcl({'scopeRaw': row.get('scope')})
                        if resolved and resolved != 'Unspecified':
                            sub_city = resolved

                    sub_tender = {
                        'source': 'CSPGCL',
                        'bidNumber': sub_bid_number,
                        'title': row.get('scope') or tender.get('title'),
                        'department': tender.get('department'),
                        'organization': tender.get('organization'),
                        'category': [],
                        'locationState': tender.get('locationState'),
                        'locationCity': sub_city,
                        'startDate': tender.get('startDate'),
                        'endDate': tender.get('endDate'),
                        'quantity': None,
                        'bidValue': row.get('nitValueRs'),
                        'emdAmount': row.get('emdAmount'),
                        'valueExtractionStatus': 'extracted' if (row.get('nitValueRs') is not None or row.get('emdAmount') is not None) else 'not_found',
                        'viabilityScore': None,
                        'risks': [],
                        'pdfPath': pdf_path or tender.get('pdfPath'),
                        'bidLink': tender.get('bidLink'),
                        'status': tender.get('status'),
                        'fetchedAt': datetime.now(timezone.utc),
                        'plantId': tender.get('plantId'),
                        'sourceMeta': {
                            **(tender.get('sourceMeta') or {}),
                            'parentNoticeNo': tender['bidNumber'],
                            'subTenderSpecNo': row.get('tenderSpecNo'),
                            'subTenderRfxNos': row.get('rfxNos') or [],
                        },
                    }

                    analyzed_sub = analyze_tender(sub_tender)
                    sub_data = {**sub_tender, **analyzed_sub}

                    try:
                        await tenders_col.update_one(
                            {'source': 'CSPGCL', 'bidNumber': sub_data['bidNumber']},
                            {'$set': sub_data},
                            upsert=True,
                        )
                        print(f"[pipeline] upserted CSPGCL sub-tender {sub_data['bidNumber']}: value={sub_data['bidValue']} emd={sub_data['emdAmount']}")
                    except Exception as err:
                        print(f"[pipeline] failed to upsert sub-tender {sub_data['bidNumber']}: {err}")

            # ── GEM — extraction result -> DB sync ─────────────────────────
            else:
                updated_city = tender.get('locationCity')
                if not updated_city or updated_city == 'Unspecified':
                    address_text = ((result.get('aiExtract') or {}).get('consignees') or [{}])[0].get('address', '') if result.get('aiExtract') else ''
                    full_text = result.get('extractedText') or ''
                    resolved = resolve_city_for_gem(f"{address_text} {full_text}")
                    if resolved and resolved != 'Unspecified':
                        updated_city = resolved
                        print(f"[pipeline] [{pdf_count}/{len(changed_tenders)}] city resolved \u2192 \"{resolved}\"")

                source_meta = {
                    **(tender.get('sourceMeta') or {}),
                    'pdfExtract': {'text': result.get('extractedText')},
                    'aiExtract': result.get('aiExtract'),
                }

                reanalyzed = analyze_tender({
                    **tender,
                    'bidValue': result['bidValue'],
                    'emdAmount': result['emdAmount'],
                })

                elig = (result.get('aiExtract') or {}).get('eligibility') or {}
                mse_flag = _resolve_exemption_flag(elig.get('mseExemption'))
                startup_flag = _resolve_exemption_flag(elig.get('startupExemption'))
                years_zero = _resolve_years_zero(elig.get('yearsOfExperience'))

                update_fields = {
                    'pdfPath': pdf_path or tender.get('pdfPath'),
                    'bidValue': result['bidValue'],
                    'emdAmount': result['emdAmount'],
                    'valueExtractionStatus': result['status'],
                    'locationCity': updated_city,
                    'viabilityScore': reanalyzed['viabilityScore'],
                    'risks': reanalyzed['risks'],
                    'sourceMeta': source_meta,
                }
                if mse_flag is not None:
                    update_fields['mseExemption'] = mse_flag
                if startup_flag is not None:
                    update_fields['startupExemption'] = startup_flag
                if years_zero is not None:
                    update_fields['yearsOfExperienceZero'] = years_zero

                await tenders_col.update_one({'_id': tender['_id']}, {'$set': update_fields})
        except Exception as e:
            print(f"[pipeline] pdf/extract error for {tender.get('source')}/{tender.get('bidNumber')}: {e}")
            errors.append(f"PDF/extract error ({tender.get('source')}/{tender.get('bidNumber')}): {e}")
            extraction_fail += 1
            try:
                await tenders_col.update_one({'_id': tender['_id']}, {'$set': {'valueExtractionStatus': 'failed_download'}})
            except Exception:
                pass  # ignore secondary DB error

    print(
        f"[pipeline] PDF processing complete. "
        f"Attempted: {len(changed_tenders)} | Downloaded: {success_pdf_count} | Failed: {failed_pdf_count}"
    )

    # ── 5. Bulk status update ────────────────────────────────────────────
    print("[pipeline] running bulk status update...")
    now = datetime.now(timezone.utc)
    try:
        closed_result = await tenders_col.update_many(
            {'status': 'open', 'endDate': {'$lt': now}},
            {'$set': {'status': 'closed'}},
        )
        opened_result = await tenders_col.update_many(
            {'status': 'closed', 'endDate': {'$gte': now}},
            {'$set': {'status': 'open'}},
        )
        print(f"[pipeline] status update: {closed_result.modified_count} -> closed, {opened_result.modified_count} -> open")
    except Exception as e:
        print(f"[pipeline] bulk status update failed: {e}")
        errors.append(f"Status update error: {e}")

    # ── 6. Cleanup / archive ─────────────────────────────────────────────
    print("[pipeline] running cleanup and archiving...")
    cleaned_records = 0
    cleaned_files = 0
    try:
        result = await run_cleanup(tenders_col, db.archived_tenders)
        cleaned_records = result['cleanedRecords']
        cleaned_files = result['cleanedFiles']
        print(f"[pipeline] cleanup: {cleaned_records} DB records, {cleaned_files} PDF files removed")
    except Exception as e:
        print(f"[pipeline] cleanup failed: {e}")
        errors.append(f"Cleanup error: {e}")

    # ── 7. Log ────────────────────────────────────────────────────────────
    print("[pipeline] writing fetch log...")
    log_doc = {
        'runAt': run_at,
        'source': 'ALL',
        'found': found,
        'newCount': new_count,
        'updatedCount': updated_count,
        'pdfsDownloaded': pdfs_downloaded,
        'extractionOk': extraction_ok,
        'extractionFail': extraction_fail,
        'cleanedRecords': cleaned_records,
        'cleanedFiles': cleaned_files,
        'errors': errors,
    }
    result = await db.fetch_logs.insert_one(log_doc)
    log_doc['_id'] = result.inserted_id

    # ── 8. Clear caches ──────────────────────────────────────────────────
    clear_cache()

    try:
        import os
        admin_token = config.admin_token
        frontend_base = os.environ.get('FRONTEND_URL', 'https://cgtenders.com')
        frontend_url = f"{frontend_base.rstrip('/')}/api/clear-cache"
        print(f"[pipeline] clearing remote frontend cache at {frontend_url}...")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                frontend_url,
                headers={'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'},
            )
        if resp.status_code < 300:
            print(f"[pipeline] frontend cache cleared: {resp.json() if resp.content else {}}")
        else:
            print(f"[pipeline] frontend cache clear failed. Status: {resp.status_code}")
    except Exception as e:
        print(f"[pipeline] error clearing frontend cache: {e}")

    print(
        f"[pipeline] [OK] run complete: found={found} new={new_count} updated={updated_count} "
        f"pdfs={pdfs_downloaded} extractedOk={extraction_ok} extractFail={extraction_fail} "
        f"cleaned={cleaned_records} errors={len(errors)}"
    )

    return log_doc

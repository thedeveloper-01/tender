"""
app/routes/tenders.py

Direct port of src/routes/tenders.js.

NOTE: the `/ai-extract` route's on-demand AI extraction depended on the
GeM offline extractor (src/extractor/*.js), which was not converted per
instruction ("pdf extractor not needed"). It now returns the stored
sourceMeta.aiExtract if present (same as before), otherwise a 404
explaining extraction isn't available — same shape as the original
"no PDF yet" branch, just without the on-demand fallback.
"""
import json
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse, FileResponse

from .. import db
from ..cache import get as cache_get, set as cache_set
from ..serialize import serialize_doc

router = APIRouter(prefix="/api/tenders", tags=["tenders"])

SORT_MAP = {
    'endDate_asc': [('endDate', 1)],
    'endDate_desc': [('endDate', -1)],
    'bidValue_asc': [('bidValue', 1)],
    'bidValue_desc': [('bidValue', -1)],
    'emdAmount_asc': [('emdAmount', 1)],
    'emdAmount_desc': [('emdAmount', -1)],
    'fetchedAt_desc': [('fetchedAt', -1)],
}


@router.get("")
@router.get("/")
async def list_tenders(
    request: Request,
    city: str = None,
    state: str = None,
    q: str = None,
    category: str = None,
    status: str = 'open',
    minValue: float = None,
    maxValue: float = None,
    minEmd: float = None,
    maxEmd: float = None,
    source: str = None,
    plant: str = None,
    mseStartupOnly: str = None,
    zeroExperienceOnly: str = None,
    sort: str = 'endDate_asc',
    page: int = 1,
    limit: int = 20,
):
    try:
        cache_key = 'tenders:' + json.dumps(dict(request.query_params), sort_keys=True)
        cached = cache_get(cache_key)
        if cached:
            return JSONResponse(cached)

        where = {}
        and_conditions = []

        if city and city != 'all':
            where['locationCity'] = city
        if state and state != 'all':
            where['locationState'] = state
        if source and source != 'all':
            where['source'] = source.upper()
        if plant and plant != 'all':
            where['plantId'] = plant

        now = datetime.now(timezone.utc)
        if status == 'open':
            where['status'] = 'open'
            and_conditions.append({'$or': [{'endDate': {'$gte': now}}, {'endDate': None}]})
        elif status and status != 'all':
            where['status'] = status

        if q:
            escaped = re.escape(q)
            and_conditions.append({'$or': [
                {'title': {'$regex': escaped, '$options': 'i'}},
                {'organization': {'$regex': escaped, '$options': 'i'}},
                {'bidNumber': {'$regex': escaped, '$options': 'i'}},
            ]})

        if category:
            cats = category.split(',') if isinstance(category, str) else category
            where['category'] = {'$in': cats}

        if minValue is not None or maxValue is not None:
            rng = {}
            if minValue is not None:
                rng['$gte'] = minValue
            if maxValue is not None:
                rng['$lte'] = maxValue
            where['bidValue'] = rng

        if minEmd is not None or maxEmd is not None:
            rng = {}
            if minEmd is not None:
                rng['$gte'] = minEmd
            if maxEmd is not None:
                rng['$lte'] = maxEmd
            where['emdAmount'] = rng

        page_num = max(1, page)
        limit_num = min(10000, max(1, limit))

        if mseStartupOnly == 'true':
            and_conditions.append({'$or': [{'mseExemption': True}, {'startupExemption': True}]})

        if zeroExperienceOnly == 'true':
            where['yearsOfExperienceZero'] = True

        if and_conditions:
            where['$and'] = and_conditions

        col = db.tenders

        if sort == 'endDate_asc' or not sort:
            where_with_date = {**where, 'endDate': {'$ne': None}}
            where_null_date = {**where, 'endDate': None}

            total = await col.count_documents(where)
            with_date = await col.find(where_with_date).sort('endDate', 1).skip((page_num - 1) * limit_num).limit(limit_num).to_list(length=limit_num)

            remaining = limit_num - len(with_date)
            null_date_items = []
            if remaining > 0:
                date_count = await col.count_documents(where_with_date)
                skip_null = max(0, (page_num - 1) * limit_num - date_count)
                null_date_items = await col.find(where_null_date).sort('fetchedAt', -1).skip(skip_null).limit(remaining).to_list(length=remaining)

            tenders = with_date + null_date_items
        else:
            order_by = SORT_MAP.get(sort, SORT_MAP['endDate_asc'])
            total = await col.count_documents(where)
            tenders = await col.find(where).sort(order_by).skip((page_num - 1) * limit_num).limit(limit_num).to_list(length=limit_num)

        result = {
            'tenders': [serialize_doc(t) for t in tenders],
            'total': total,
            'page': page_num,
            'limit': limit_num,
        }
        cache_set(cache_key, result, 3600000)  # 1 hour

        return JSONResponse(result)
    except Exception as e:
        print(f"[api] GET /tenders error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)


@router.get("/{source}/{bid_number}")
async def get_tender(source: str, bid_number: str):
    """GET /api/tenders/:source/:bidNumber — single tender detail (full record)"""
    try:
        tender = await db.tenders.find_one({'source': source.upper(), 'bidNumber': bid_number})
        if not tender:
            return JSONResponse({'error': 'Tender not found'}, status_code=404)
        return JSONResponse(serialize_doc(tender))
    except Exception as e:
        print(f"[api] GET /tenders/:source/:bidNumber error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)


@router.get("/{source}/{bid_number}/document")
async def get_tender_document(source: str, bid_number: str):
    """GET /api/tenders/:source/:bidNumber/document — stream saved PDF"""
    try:
        tender = await db.tenders.find_one({'source': source.upper(), 'bidNumber': bid_number})
        if not tender or not tender.get('pdfPath') or not os.path.exists(tender['pdfPath']):
            return JSONResponse({'error': 'Document not available'}, status_code=404)
        return FileResponse(
            tender['pdfPath'],
            media_type='application/pdf',
            headers={'Content-Disposition': f'inline; filename="{source}-{bid_number}.pdf"'},
        )
    except Exception as e:
        print(f"[api] GET /tenders/:source/:bidNumber/document error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)


@router.get("/{source}/{bid_number}/ai-extract")
async def get_ai_extract(source: str, bid_number: str):
    """GET /api/tenders/:source/:bidNumber/ai-extract

    Returns the stored AI-structured extraction (consignees, eligibility, atc)
    for a GEM tender, if the DB already has one cached from a prior run.
    On-demand live extraction is unavailable in this build (see module docstring).
    """
    try:
        if source.upper() != 'GEM':
            return JSONResponse({
                'error': 'AI extraction is only available for GEM tenders',
                'hint': 'CSPGCL tenders use the built-in table parser',
            }, status_code=400)

        tender = await db.tenders.find_one({'source': 'GEM', 'bidNumber': bid_number})
        if not tender:
            return JSONResponse({'error': 'Tender not found'}, status_code=404)

        stored = (tender.get('sourceMeta') or {}).get('aiExtract')
        if stored and stored.get('extractedAt'):
            return JSONResponse(serialize_doc({
                'source': 'db_cache',
                'bidNumber': bid_number,
                'title': tender.get('title'),
                **stored,
            }))

        return JSONResponse({
            'error': 'AI extract not yet available',
            'reason': 'No stored extraction for this tender, and on-demand extraction is not enabled in this deployment.',
        }, status_code=404)
    except Exception as e:
        print(f"[api] GET /tenders/:source/:bidNumber/ai-extract error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)

"""
app/routes/stats.py

Direct port of src/routes/stats.js.
"""
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import db
from ..cache import get as cache_get, set as cache_set
from ..serialize import serialize_value

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
@router.get("/")
async def get_stats():
    """GET /api/stats — totals, sums, breakdowns, last fetch time"""
    try:
        cached = cache_get('stats')
        if cached:
            return JSONResponse(cached)

        now = datetime.now(timezone.utc)
        open_where = {'status': 'open', '$or': [{'endDate': {'$gte': now}}, {'endDate': None}]}

        col = db.tenders

        total_open = await col.count_documents(open_where)

        value_agg_cursor = col.aggregate([
            {'$match': open_where},
            {'$group': {'_id': None, 'sum': {'$sum': '$bidValue'}}},
        ])
        value_agg = await value_agg_cursor.to_list(length=1)
        total_estimated_value = value_agg[0]['sum'] if value_agg else 0

        by_source_cursor = col.aggregate([
            {'$match': open_where},
            {'$group': {'_id': '$source', 'count': {'$sum': 1}}},
        ])
        by_source_raw = await by_source_cursor.to_list(length=None)
        by_source = {s['_id']: s['count'] for s in by_source_raw}

        categories_raw = await col.aggregate([
            {'$match': open_where},
            {'$unwind': '$category'},
            {'$group': {'_id': '$category', 'count': {'$sum': 1}}},
        ]).to_list(length=None)
        category_counts = {item['_id']: item['count'] for item in categories_raw if item.get('_id')}

        last_log = await db.fetch_logs.find_one(sort=[('runAt', -1)])

        result = {
            'totalOpenTenders': total_open,
            'totalEstimatedValue': total_estimated_value or 0,
            'bySource': by_source,
            'byCategory': category_counts,
            'lastFetchAt': serialize_value(last_log['runAt']) if last_log else None,
        }

        cache_set('stats', result, 3600000)  # 1 hour

        return JSONResponse(result)
    except Exception as e:
        print(f"[api] GET /stats error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)

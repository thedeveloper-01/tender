"""
app/routes/cities.py

Direct port of src/routes/cities.js.
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import db
from ..config import CG_CITIES
from ..cache import get as cache_get, set as cache_set

router = APIRouter(prefix="/api/cities", tags=["cities"])


@router.get("")
@router.get("/")
async def list_cities():
    """GET /api/cities — 33 CG districts + open-tender counts, plus "Unspecified" """
    try:
        cached = cache_get('cities')
        if cached:
            return JSONResponse(cached)

        now = datetime.now(timezone.utc)
        pipeline = [
            {'$match': {
                'status': 'open',
                '$or': [{'endDate': {'$gte': now}}, {'endDate': None}],
            }},
            {'$group': {'_id': '$locationCity', 'count': {'$sum': 1}}},
        ]
        grouped = await db.tenders.aggregate(pipeline).to_list(length=None)
        count_map = {g['_id']: g['count'] for g in grouped}

        def slugify(name: str) -> str:
            s = re.sub(r'[^a-z0-9]+', '-', name.lower())
            return s.strip('-')

        cities = [
            {'name': name, 'slug': slugify(name), 'openCount': count_map.get(name, 0)}
            for name in CG_CITIES
        ]
        cities.append({'name': 'Unspecified', 'slug': 'unspecified', 'openCount': count_map.get('Unspecified', 0)})

        result = {'cities': cities}
        cache_set('cities', result, 43200000)  # 12 hours

        return JSONResponse(result)
    except Exception as e:
        print(f"[api] GET /cities error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)

"""
app/routes/admin.py

Direct port of src/routes/admin.js.
"""
import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import db
from ..config import config
from ..pipeline.run import run_pipeline
from ..cache import clear as clear_cache
from ..serialize import serialize_doc

router = APIRouter(prefix="/api", tags=["admin"])

_run_in_progress = False


def _check_auth(request: Request):
    auth = request.headers.get('authorization', '')
    token = auth[7:] if auth.startswith('Bearer ') else None
    if not token or token != config.admin_token:
        return False
    return True


async def _run_pipeline_bg():
    global _run_in_progress
    try:
        await run_pipeline()
    except Exception as e:
        print(f"[admin] manual pipeline run failed: {e}")
    finally:
        _run_in_progress = False


@router.post("/refresh")
async def refresh(request: Request):
    """POST /api/refresh — kick off the pipeline asynchronously"""
    global _run_in_progress
    if not _check_auth(request):
        return JSONResponse({'error': 'Unauthorized'}, status_code=401)

    if _run_in_progress:
        return JSONResponse({'started': False, 'message': 'A pipeline run is already in progress'}, status_code=202)

    _run_in_progress = True
    asyncio.create_task(_run_pipeline_bg())
    return JSONResponse({'started': True, 'message': 'Pipeline run started. Check /api/fetch-logs for status.'}, status_code=202)


@router.post("/clear-cache")
async def clear_cache_route(request: Request):
    """POST /api/clear-cache — clear in-memory cache"""
    if not _check_auth(request):
        return JSONResponse({'error': 'Unauthorized'}, status_code=401)
    try:
        clear_cache()
        return JSONResponse({'success': True, 'message': 'Express cache cleared'})
    except Exception as e:
        print(f"[api] POST /clear-cache error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)


@router.get("/fetch-logs")
async def fetch_logs(request: Request, limit: int = 20):
    """GET /api/fetch-logs — most recent N FetchLog rows, newest first"""
    if not _check_auth(request):
        return JSONResponse({'error': 'Unauthorized'}, status_code=401)
    try:
        limit_num = min(100, max(1, limit))
        logs = await db.fetch_logs.find().sort('runAt', -1).limit(limit_num).to_list(length=limit_num)
        return JSONResponse({'logs': [serialize_doc(l) for l in logs]})
    except Exception as e:
        print(f"[api] GET /fetch-logs error: {e}")
        return JSONResponse({'error': 'Internal server error'}, status_code=500)

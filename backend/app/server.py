"""
app/server.py

Direct port of src/server.js.
"""
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .scheduler import start_scheduler
from . import db as db_module
from .routes.tenders import router as tenders_router
from .routes.cities import router as cities_router
from .routes.stats import router as stats_router
from .routes.admin import router as admin_router

# ANSI colors for the request logger (mirrors the Node middleware)
_COLOR = {
    500: '\x1b[31m',  # red
    400: '\x1b[33m',  # yellow
    300: '\x1b[36m',  # cyan
    200: '\x1b[32m',  # green
}
_RESET = '\x1b[0m'


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db_module.ensure_indexes()
    start_scheduler()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.cors_origin] if config.cors_origin != '*' else ['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.middleware("http")
async def request_logger(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = int((time.time() - start) * 1000)
    status = response.status_code

    color = ''
    for threshold in (500, 400, 300, 200):
        if status >= threshold:
            color = _COLOR[threshold]
            break

    print(
        f"[http] {datetime.now(timezone.utc).isoformat()} | {request.method} "
        f"{request.url.path} -> {color}{status}{_RESET} in {duration_ms}ms"
    )
    return response


app.include_router(tenders_router)
app.include_router(cities_router)
app.include_router(stats_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "ok"}

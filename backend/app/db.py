"""
app/db.py

Replaces src/db.js (PrismaClient, Mongo connector) with a direct async
Mongo client via Motor. Prisma-on-Mongo was just a typed wrapper around
these same collections, so we talk to Mongo directly here — same database,
same collection/field names, so existing data is fully compatible.

Collections (mirroring the Prisma models used across the codebase):
  - tenders          (Prisma model: Tender)
  - fetch_logs       (Prisma model: FetchLog)
  - archived_tenders (Prisma model: ArchivedTender)
"""
from motor.motor_asyncio import AsyncIOMotorClient
from .config import config

_client = AsyncIOMotorClient(config.mongo_uri) if config.mongo_uri else None
# Motor infers the database name from the URI path; fall back to a default.
db = _client.get_default_database() if _client else None

tenders = db["Tender"] if db is not None else None
fetch_logs = db["FetchLog"] if db is not None else None
archived_tenders = db["ArchivedTender"] if db is not None else None


async def ensure_indexes():
    """Create the indexes Prisma would have declared in schema.prisma.
    Safe to call repeatedly — create_index is idempotent."""
    if tenders is None:
        return
    try:
        await tenders.create_index([("source", 1), ("bidNumber", 1)], unique=True, name="Tender_source_bidNumber_key")
    except Exception as e:
        print(f"[db] index source_bidNumber warning: {e}")
        
    try:
        await tenders.create_index([("status", 1)])
    except Exception as e:
        print(f"[db] index status warning: {e}")
        
    try:
        await tenders.create_index([("locationCity", 1)])
    except Exception as e:
        print(f"[db] index locationCity warning: {e}")
        
    try:
        await tenders.create_index([("endDate", 1)])
    except Exception as e:
        print(f"[db] index endDate warning: {e}")
        
    try:
        if fetch_logs is not None:
            await fetch_logs.create_index([("runAt", -1)])
    except Exception as e:
        print(f"[db] index runAt warning: {e}")

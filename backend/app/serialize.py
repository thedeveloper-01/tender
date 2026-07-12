"""
app/serialize.py

Converts Mongo documents (ObjectId, datetime) into JSON-safe plain dicts,
and maps `_id` -> `id` the way Prisma's `@map("_id")` would expose it.
"""
from datetime import datetime
from bson import ObjectId


def serialize_value(v):
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, dict):
        return serialize_doc(v)
    if isinstance(v, list):
        return [serialize_value(x) for x in v]
    return v


def serialize_doc(doc: dict) -> dict:
    if doc is None:
        return None
    out = {}
    for k, v in doc.items():
        key = 'id' if k == '_id' else k
        out[key] = serialize_value(v)
    return out

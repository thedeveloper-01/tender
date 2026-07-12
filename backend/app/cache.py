"""
app/cache.py

Direct port of src/cache.js — simple in-process TTL cache with a max size
(oldest-first eviction), used by the routes to avoid hitting Mongo on
every request.
"""
import time
from collections import OrderedDict
from typing import Any, Optional

_cache: "OrderedDict[str, dict]" = OrderedDict()
MAX_CACHE_SIZE = 100


def get(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() * 1000 > entry["expiry"]:
        _cache.pop(key, None)
        return None
    return entry["value"]


def set(key: str, value: Any, ttl_ms: int = 3600000) -> None:  # 1 hour default
    if key not in _cache and len(_cache) >= MAX_CACHE_SIZE:
        _cache.popitem(last=False)  # evict oldest inserted key
    _cache[key] = {"value": value, "expiry": time.time() * 1000 + ttl_ms}


def clear() -> None:
    _cache.clear()
    print("[cache] Express cache invalidated.")

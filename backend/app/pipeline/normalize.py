"""
app/pipeline/normalize.py

Direct port of src/pipeline/normalize.js.
"""
import re
from datetime import datetime, timezone
from typing import Optional

from .location_resolve import resolve_city_for_gem, resolve_city_for_cspgcl
from .pdf import CSPGCL_PORTAL_BASE

_NUMERIC_GARBAGE_RE = re.compile(r'^[\d,\s]+(\.\.\.)?$')


def _derive_status(end_date) -> str:
    if not end_date:
        return 'open'
    return 'open' if _to_dt(end_date) >= _now() else 'closed'


def _now():
    return datetime.now(timezone.utc)


def _to_dt(v) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(v).replace('Z', '+00:00'))
    except Exception:
        return None


def _stable_key(parts) -> str:
    """Stable hash-like key for CSPGCL records missing a tender notice number."""
    s = '|'.join(str(p) if p is not None else '' for p in parts)
    h = 0
    for ch in s:
        h = (h << 5) - h + ord(ch)
        h &= 0xFFFFFFFF
        # emulate JS 32-bit signed overflow
        if h >= 0x80000000:
            h -= 0x100000000
    return f"CSPGCL-GEN-{abs(h)}"


def _clean_title(title: Optional[str], category: Optional[str]) -> str:
    if not title:
        return 'Custom Bid / BOQ'
    is_numeric_garbage = bool(_NUMERIC_GARBAGE_RE.match(title)) and (',' in title or len(title.strip()) > 10)
    if is_numeric_garbage:
        cat = (category or '').lower()
        if 'services' in cat:
            return 'Custom Bid for Services'
        elif 'boq' in cat:
            return 'BOQ Bid for Goods'
        else:
            return 'Custom / BOQ Bid'
    return title


def normalize_gem(raw: dict) -> dict:
    """Map a raw GeM record into the unified Tender shape."""
    end_date = _to_dt(raw.get('endDate'))
    raw_title = raw.get('title') or ''
    category_id = raw.get('category') or ''
    title = _clean_title(raw_title, category_id)

    location_state = raw.get('fetchedState') or 'Unspecified'
    location_city = 'Unspecified'

    if raw.get('gemCity'):
        location_city = raw['gemCity']
    elif raw.get('gemDistrict'):
        location_city = raw['gemDistrict']
    else:
        search_str = f"{title} {raw.get('department') or ''} {raw.get('organization') or ''} {raw.get('locationText') or ''}"
        location_city = resolve_city_for_gem(search_str)

    return {
        'source': 'GEM',
        'bidNumber': raw.get('bidNumber'),
        'title': title,
        'department': raw.get('department') or None,
        'organization': raw.get('organization') or None,
        'category': [],  # filled in by analysis step
        'locationState': location_state,
        'locationCity': location_city,
        'startDate': _to_dt(raw.get('startDate')),
        'endDate': end_date,
        'quantity': raw.get('quantity') or None,
        'bidValue': raw.get('bidValue'),
        'emdAmount': raw.get('emdAmount'),
        'valueExtractionStatus': 'extracted' if raw.get('bidValue') is not None else 'not_attempted',
        'viabilityScore': None,
        'risks': [],
        'pdfPath': None,
        'bidLink': raw.get('bidLink'),
        'status': _derive_status(end_date),
        'fetchedAt': _now(),
        'plantId': None,
        'sourceMeta': {
            'locationTextRaw': raw.get('locationText') or None,
            'gemId': raw.get('gemId'),
            'fetchedState': raw.get('fetchedState') or None,
            'gemCity': raw.get('gemCity') or None,
            'gemDistrict': raw.get('gemDistrict') or None,
            'gemPincode': raw.get('gemPincode') or None,
        },
        'rawJson': raw,
    }


def normalize_cspgcl(raw: dict) -> dict:
    """Map a raw CSPGCL record into the unified Tender shape."""
    end_date = _to_dt(raw.get('closingDate'))
    tender_notice_no = (raw.get('tenderNoticeNo') or '').strip()
    bid_number = tender_notice_no if tender_notice_no else _stable_key(
        [raw.get('issuingOffice'), raw.get('scopeRaw'), raw.get('closingDate')]
    )

    return {
        'source': 'CSPGCL',
        'bidNumber': bid_number,
        'title': raw.get('scopeRaw'),
        'department': None,
        'organization': raw.get('issuingOffice') or None,
        'category': [],
        'locationState': 'Chhattisgarh',
        'locationCity': resolve_city_for_cspgcl(raw),
        'startDate': _to_dt(raw.get('openingDate')),
        'endDate': end_date,
        'quantity': None,
        'bidValue': raw.get('estimatedCost'),
        'emdAmount': raw.get('emd'),
        'valueExtractionStatus': 'extracted' if raw.get('estimatedCost') is not None else 'not_attempted',
        'viabilityScore': None,
        'risks': [],
        'pdfPath': None,
        'bidLink': f"{CSPGCL_PORTAL_BASE}?paramflag={raw.get('paramflag')}",
        'status': _derive_status(end_date),
        'fetchedAt': _now(),
        'plantId': raw.get('plantId') or None,
        'sourceMeta': {
            'plantId': raw.get('plantId'),
            'plantLabel': raw.get('plantLabel'),
            'paramflag': raw.get('paramflag'),
            'rfxId': raw.get('rfxId'),
            'docEventTarget': raw.get('docEventTarget'),
            'isEbidding': bool(raw.get('isEbidding')),
        },
        'rawJson': raw,
    }

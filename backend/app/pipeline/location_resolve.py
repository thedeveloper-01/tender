"""
app/pipeline/location_resolve.py

Direct port of src/pipeline/locationResolve.js.
"""
import re
from typing import Optional, Dict

from ..config import CG_CITIES, CITY_ALIASES

# CSPGCL plant-level location rules (ported from src/lib/plants.js)
CSPGCL_LOCATION_RULES = [
    {'label': 'Korba', 'patterns': [r'korba\s*west', r'korba\s*east', r'\bhtps\b', r'hasdeo', r'\bdspm', r'\bktps\b']},
    {'label': 'Janjgir-Champa', 'patterns': [r'marwa', r'\babvtps\b', r'tendubhata', r'janjgir']},
    {'label': 'Raipur', 'patterns': [r'raipur']},
]

_PLANT_LOCATION_CITY = {
    'central': None,
    'korba-west': 'Korba',
    'dspm': 'Korba',
    'marwa': 'Janjgir-Champa',
}


def resolve_city_for_cspgcl(record: dict) -> str:
    """Resolve a CSPGCL tender's city using plant-level metadata first,
    falling back to text-based pattern matching."""
    plant_location_city = _PLANT_LOCATION_CITY.get(record.get('plantId'))
    if plant_location_city:
        return plant_location_city

    haystack = f"{record.get('scopeRaw') or ''} {record.get('tenderNoticeNo') or ''} {record.get('issuingOffice') or ''}".lower()
    for rule in CSPGCL_LOCATION_RULES:
        if any(re.search(p, haystack, re.I) for p in rule['patterns']):
            return rule['label']
    return 'Unspecified'


_EXACT_PIN_MAP = {
    '494553': 'Dantewada',  # Kirandul NMDC
    '494556': 'Dantewada',  # Bacheli NMDC
    '494226': 'Kondagaon',
    '495689': 'Sakti',
    '495677': 'Korba',
    '493445': 'Dhamtari',  # Kurud
    '493776': 'Dhamtari',
    '493449': 'Mahasamund',
    '493996': 'Gariaband',  # Kosambuda
    '497229': 'Surajpur',
    '497331': 'Manendragarh-Chirmiri-Bharatpur',
}

_PREFIX4_MAP = {
    '4910': 'Durg', '4913': 'Bemetara', '4914': 'Rajnandgaon', '4915': 'Balod',
    '4916': 'Rajnandgaon', '4931': 'Raipur', '4932': 'Raipur', '4934': 'Mahasamund',
    '4935': 'Mahasamund', '4936': 'Dhamtari', '4937': 'Dhamtari', '4938': 'Dhamtari',
    '4939': 'Gariaband', '4944': 'Dantewada', '4945': 'Dantewada', '4946': 'Kanker',
    '4947': 'Kanker', '4955': 'Janjgir-Champa', '4972': 'Surajpur',
    '4973': 'Manendragarh-Chirmiri-Bharatpur', '4974': 'Manendragarh-Chirmiri-Bharatpur',
}

_PREFIX3_MAP = {
    '490': 'Durg', '492': 'Raipur', '493': 'Raipur', '494': 'Bastar',
    '495': 'Bilaspur', '496': 'Raigarh', '497': 'Surguja',
}


def resolve_city_by_pin(pin: str) -> Optional[str]:
    """Map a 6-digit PIN code to a Chhattisgarh district."""
    if pin in _EXACT_PIN_MAP:
        return _EXACT_PIN_MAP[pin]

    p4 = pin[:4]
    p3 = pin[:3]

    if p4 in _PREFIX4_MAP:
        return _PREFIX4_MAP[p4]

    return _PREFIX3_MAP.get(p3)


_KOREA_FALSE_POSITIVE_RE = re.compile(
    r'\b(south\s+korea|korean|made\s+in\s+korea|origin\s*:?\s*korea|import\w*\s+from\s+korea)\b', re.I
)


def resolve_city_for_gem(location_text: Optional[str]) -> str:
    """Resolve a free-text location string (from GeM listings) to one of the
    33 CG districts via case-insensitive substring / alias matching."""
    if not location_text:
        return 'Unspecified'

    # 1. Try extracting and matching 6-digit PIN code
    pin_match = re.search(r'\b(49\d{4})\b', location_text)
    if pin_match:
        resolved_pin_city = resolve_city_by_pin(pin_match.group(1))
        if resolved_pin_city:
            return resolved_pin_city

    text = location_text.lower()

    # 2. Direct district name match — longest names first to avoid substring collisions
    sorted_cities = sorted(CG_CITIES, key=len, reverse=True)
    for city in sorted_cities:
        city_lower = city.lower()

        if city_lower == 'korea':
            if _KOREA_FALSE_POSITIVE_RE.search(text):
                continue

        escaped = re.escape(city)
        if re.search(rf'\b{escaped}\b', text, re.I):
            return city

    # 3. Alias / alternate-name match — longest aliases first
    sorted_aliases = sorted(CITY_ALIASES.keys(), key=len, reverse=True)
    for alias in sorted_aliases:
        city = CITY_ALIASES[alias]

        if alias.lower() == 'koriya':
            if _KOREA_FALSE_POSITIVE_RE.search(text):
                continue

        escaped = re.escape(alias)
        if re.search(rf'\b{escaped}\b', text, re.I):
            return city

    return 'Unspecified'

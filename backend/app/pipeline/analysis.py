"""
app/pipeline/analysis.py

Direct port of src/pipeline/analysis.js — pure, rule-based analysis engine.
No network calls, no API keys.
"""
import re
from datetime import datetime, timezone
from typing import List, Optional

CATEGORY_KEYWORDS = {
    'Civil Works': ['civil', 'construction', 'building', 'road', 'concrete', 'excavation', 'masonry', 'foundation', 'retaining', 'drainage', 'bridge', 'boundary', 'repair', 'renovation', 'plaster', 'rcc', 'r.c.c'],
    'Mechanical': ['mechanical', 'turbine', 'boiler', 'pump', 'compressor', 'valve', 'condenser', 'fan', 'mill', 'crusher', 'conveyor', 'bearing', 'gear', 'motor', 'engine', 'shaft', 'pipe', 'piping', 'welding', 'fabrication', 'overhauling', 'overhaul'],
    'Electrical': ['electrical', 'transformer', 'switchgear', 'cable', 'wiring', 'panel', 'relay', 'generator', 'battery', 'lighting', 'ht', 'lt', 'h.t.', 'l.t.', 'substation'],
    'Manpower': ['manpower', 'labour', 'labor', 'outsourc', 'housekeep', 'security', 'guard', 'cleaning', 'sweeping', 'canteen', 'catering', 'staffing', 'personnel', 'deployment'],
    'Procurement': ['supply', 'procurement', 'purchase', 'spare', 'material', 'chemical', 'lubricant', 'oil', 'fuel', 'diesel', 'coal', 'consumable', 'equipment', 'instrument'],
    'Environment': ['environment', 'pollution', 'ash', 'effluent', 'emission', 'waste', 'disposal', 'plantation', 'tree', 'green', 'ecology', 'etp', 'stp'],
    'EPC': ['epc', 'turnkey', 'erection', 'commissioning', 'installation'],
    'IT & Software': ['software', 'computer', 'it', 'i.t.', 'server', 'network', 'cctv', 'camera', 'website', 'digital'],
    'Transport': ['transport', 'vehicle', 'truck', 'loader', 'crane', 'dumper', 'jcb', 'excavator', 'dozer', 'tipper', 'hiring'],
}


def _match_keyword(lower_text: str, kw: str) -> bool:
    """Checks if a keyword matches the text. For short words or words containing
    punctuation/spaces, checks on word boundaries using regex."""
    if len(kw) <= 3 or '.' in kw or ' ' in kw:
        escaped = re.escape(kw)
        return re.search(rf'\b{escaped}\b', lower_text, re.I) is not None
    return kw in lower_text


def categorize(title: Optional[str]) -> List[str]:
    lower = (title or '').lower()
    matched = []

    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if _match_keyword(lower, kw):
                matched.append(category)
                break

    return matched if matched else ['General']


def _now():
    return datetime.now(timezone.utc)


def _as_dt(v):
    """Best-effort coercion to an aware datetime, mirroring `new Date(v)`."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(v).replace('Z', '+00:00'))
    except Exception:
        return None


def score_viability(tender: dict) -> int:
    """scoreViability(tender) -> 1-10"""
    score = 6  # neutral baseline

    cost = tender.get('bidValue')
    emd = tender.get('emdAmount')
    closing_date = _as_dt(tender.get('endDate'))

    if cost is not None:
        if cost <= 5000000:
            score += 2  # <= 50L — very accessible
        elif cost <= 20000000:
            score += 1  # <= 2Cr — moderate
        else:
            score -= 1  # large project

    if emd is not None and cost is not None and cost > 0:
        emd_ratio = emd / cost
        if emd_ratio > 0.05:
            score -= 1  # EMD > 5% of cost
        if emd_ratio <= 0.02:
            score += 1  # EMD <= 2% — friendly

    if closing_date:
        days_left = (closing_date - _now()).days
        if days_left < 0:
            score -= 2  # expired
        elif days_left <= 3:
            score -= 1  # very tight
        elif days_left >= 14:
            score += 1  # comfortable window

    if (tender.get('sourceMeta') or {}).get('isEbidding'):
        score += 1

    return max(1, min(10, score))


def identify_risks(tender: dict) -> List[str]:
    """identifyRisks(tender) -> string[] (max 4)"""
    risks = []
    cost = tender.get('bidValue')
    emd = tender.get('emdAmount')
    scope = (tender.get('title') or '').lower()

    end_date = _as_dt(tender.get('endDate'))
    if end_date:
        days_left = (end_date - _now()).days
        if days_left < 0:
            risks.append('Tender expired')
        elif days_left <= 2:
            risks.append('Closing in < 48 hours')
        elif days_left <= 5:
            risks.append('Short submission window')

    if emd is not None and cost is not None and cost > 0 and emd / cost > 0.05:
        risks.append('High EMD relative to value')
    if emd is not None and emd > 500000:
        risks.append('EMD exceeds \u20b95 lakh')

    if cost is not None and cost > 50000000:
        risks.append('Large-scale project (\u20b95 Cr+)')

    if 'specialized' in scope or 'specialised' in scope:
        risks.append('Specialised work required')
    if 'turnkey' in scope or 'epc' in scope:
        risks.append('EPC/Turnkey complexity')
    if 'hazardous' in scope or 'chemical' in scope:
        risks.append('Hazardous materials involved')

    return risks[:4]


def analyze_tender(tender: dict) -> dict:
    """Run all three analyses and return the fields to merge onto a tender."""
    return {
        'category': categorize(tender.get('title')),
        'viabilityScore': score_viability(tender),
        'risks': identify_risks(tender),
    }

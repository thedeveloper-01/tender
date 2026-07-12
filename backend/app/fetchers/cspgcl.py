"""
app/fetchers/cspgcl.py

Direct port of src/fetchers/cspgcl.js.
"""
import asyncio
import re
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
from bs4 import BeautifulSoup

from ..config import config

# CSPGCL tender portal — Central Offices + one page per power station.
PLANTS = [
    {'id': 'central', 'paramflag': 1, 'label': 'Central Offices'},
    {'id': 'korba-west', 'paramflag': 2, 'label': 'Hasdeo TPS \u2014 Korba West'},
    {'id': 'dspm', 'paramflag': 3, 'label': 'Dr. Shyama Prasad Mukharjee TPS'},
    {'id': 'marwa', 'paramflag': 5, 'label': 'Atal Bihari Vajpayee TPS \u2014 Marwa'},
]

PORTAL_BASE = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx'

IST = timezone(timedelta(hours=5, minutes=30))


def _extract_doc_event_target(tr) -> Optional[str]:
    """Pick the main tender PDF link from a table row (prefers full NIT & TenderDoc)."""
    links = tr.select('a[href*="__doPostBack"]')
    docs = []
    for a in links:
        href = a.get('href') or ''
        label = a.get_text(strip=True)
        m = re.search(r"__doPostBack\('([^']+)'", href)
        if m:
            docs.append({'label': label, 'eventTarget': m.group(1)})

    preferred = (
        next((d for d in docs if re.search(r'nit\s*&\s*tenderdoc', d['label'], re.I)), None)
        or next((d for d in docs if re.match(r'^nit$', d['label'], re.I)), None)
        or (docs[0] if docs else None)
    )
    return preferred['eventTarget'] if preferred else None


def parse_cspgcl_date(d: Optional[str]) -> Optional[datetime]:
    """Parse CSPGCL date strings like "19/06/2026 04:00PM" (DD/MM/YYYY HH:MMAM/PM)."""
    if not d:
        return None
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$', d, re.I)
    if m:
        day, month, year, raw_hr, minute, meridiem = m.groups()
        hr = int(raw_hr)
        if meridiem:
            is_pm = meridiem.upper() == 'PM'
            if is_pm and hr != 12:
                hr += 12
            if not is_pm and hr == 12:
                hr = 0
        try:
            return datetime(int(year), int(month), int(day), hr, int(minute), tzinfo=IST)
        except ValueError:
            return None
    try:
        return datetime.fromisoformat(d)
    except Exception:
        return None


async def fetch_cspgcl_tenders() -> List[dict]:
    """fetchCspgclTenders() -> raw record array"""
    all_tenders: List[dict] = []

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
    }

    async with httpx.AsyncClient(timeout=25, proxy=config.proxy_url) as client:
        for plant in PLANTS:
            url = f"{PORTAL_BASE}?paramflag={plant['paramflag']}"
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    continue
                soup = BeautifulSoup(resp.text, 'html.parser')

                table = soup.select_one('#GVTenderDetails')
                rows = table.find_all('tr') if table else []

                def text(el) -> str:
                    return re.sub(r'\s+', ' ', el.get_text(strip=True)) if el else ''

                def parse_num(s: str):
                    if not s or s.lower() == 'nil' or s == '-':
                        return None
                    num_str = re.sub(r'[^0-9.]', '', s)
                    try:
                        return float(num_str) if num_str else None
                    except ValueError:
                        return None

                for i, tr in enumerate(rows):
                    if i == 0:
                        continue
                    tds = tr.find_all('td')
                    if len(tds) < 8:
                        continue

                    closing_date = parse_cspgcl_date(text(tds[6]))
                    scope_raw = text(tds[3])
                    tender_notice_no = text(tds[2])
                    issuing_office = text(tds[1])

                    last = text(tds[-1])
                    rfx_id_raw = None
                    if last and not re.match(
                        r'^(NIT|Date Extension|Corrigendum|Tender Doc|General Terms|Amendment|Offline Tender|Tender cost|Tender Cast|Tender Specn)',
                        last, re.I
                    ):
                        rfx_id_raw = last

                    row_text = tr.get_text(' ', strip=True).lower()

                    all_tenders.append({
                        'tenderNoticeNo': tender_notice_no,
                        'scopeRaw': scope_raw,
                        'issuingOffice': issuing_office,
                        'estimatedCost': parse_num(text(tds[4])),
                        'emd': parse_num(text(tds[5])),
                        'closingDate': closing_date,
                        'openingDate': parse_cspgcl_date(text(tds[7])),
                        'plantId': plant['id'],
                        'plantLabel': plant['label'],
                        'paramflag': plant['paramflag'],
                        'rfxId': rfx_id_raw,
                        'docEventTarget': _extract_doc_event_target(tr),
                        'isEbidding': 'e-bidding' in row_text or 'eprocurement' in row_text,
                    })

                # small delay between requests to be polite to the portal
                await asyncio.sleep(0.5)
            except Exception as e:
                print(f"[cspgcl] error fetching {url}: {e}")

    return all_tenders

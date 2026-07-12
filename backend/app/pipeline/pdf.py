"""
app/pipeline/pdf.py

Direct port of src/pipeline/pdf.js.
downloadGemPdf is kept (harmless network call keyed off tender.sourceMeta.gemId,
which your external scraper can still populate) — only the GEM *scraping* was
removed, not GEM PDF downloading.
"""
import os
import re
from typing import Optional
from urllib.parse import urlencode

import httpx

from ..config import config

CSPGCL_PORTAL_BASE = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx'

_EVENT_TARGET_RE = re.compile(r'^GVTenderDetails\$ctl\d+\$\w+', re.I)


def _read_hidden_field(html: str, name: str) -> str:
    m = re.search(rf'id="{re.escape(name)}" value="([^"]*)"', html)
    return m.group(1) if m else ''


def _sanitize(s: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_-]', '_', str(s))[:120]


def _ensure_dir(d: str) -> None:
    os.makedirs(d, exist_ok=True)


async def download_pdf(tender: dict) -> Optional[str]:
    """downloadPdf(tender) -> relative filePath | None

    For GEM tenders, PDFs are stored in state-scoped subdirectories:
      documents/GEM/CHHATTISGARH/<filename>.pdf
    """
    _ensure_dir(config.documents_dir)

    if tender['source'] == 'GEM':
        state_name = (tender.get('locationState') or 'UNKNOWN').upper().replace(' ', '_')
        state_dir = os.path.join(config.documents_dir, 'GEM', state_name)
        _ensure_dir(state_dir)
        filename = f"GEM-{_sanitize(tender['bidNumber'])}.pdf"
        file_path = os.path.join(state_dir, filename)
    else:
        filename = f"{tender['source']}-{_sanitize(tender['bidNumber'])}.pdf"
        file_path = os.path.join(config.documents_dir, filename)

    if os.path.exists(file_path):
        print(f"[pdf] file already exists, skipping download: {file_path}")
        return file_path

    try:
        if tender['source'] == 'GEM':
            return await _download_gem_pdf(tender, file_path)
        if tender['source'] == 'CSPGCL':
            return await _download_cspgcl_pdf(tender, file_path)
    except Exception as e:
        print(f"[pdf] download failed for {tender['source']}/{tender['bidNumber']}: {e}")
    return None


async def _download_gem_pdf(tender: dict, file_path: str) -> Optional[str]:
    gem_id = (tender.get('sourceMeta') or {}).get('gemId')
    if not gem_id:
        print(f"[pdf] GEM tender {tender['bidNumber']} has no gemId — cannot download PDF")
        return None

    gem_base = 'https://bidplus.gem.gov.in'
    pdf_url = f"{gem_base}/showbidDocument/{gem_id}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': f"{gem_base}/advance-search",
    }

    try:
        async with httpx.AsyncClient(timeout=30, proxy=config.proxy_url) as client:
            resp = await client.get(pdf_url, headers=headers)
    except Exception as e:
        print(f"[pdf] fetch error for {pdf_url}: {e}")
        return None

    if resp.status_code != 200:
        print(f"[pdf] GEM PDF {pdf_url} -> HTTP {resp.status_code}")
        return None

    content_type = resp.headers.get('content-type', '')
    if 'pdf' not in content_type:
        print(f"[pdf] GEM PDF {pdf_url} -> unexpected content-type: {content_type}")
        return None

    with open(file_path, 'wb') as f:
        f.write(resp.content)
    print(f"[pdf] saved {len(resp.content)} bytes -> {file_path}")
    return file_path


async def _download_cspgcl_pdf(tender: dict, file_path: str) -> Optional[str]:
    meta = tender.get('sourceMeta') or {}
    target = meta.get('docEventTarget')
    if not target or not _EVENT_TARGET_RE.match(target):
        return None

    page_url = f"{CSPGCL_PORTAL_BASE}?paramflag={meta.get('paramflag')}"

    async with httpx.AsyncClient(timeout=25, proxy=config.proxy_url) as client:
        page_resp = await client.get(page_url)
        if page_resp.status_code != 200:
            return None
        html = page_resp.text

        body = {
            '__EVENTTARGET': target,
            '__EVENTARGUMENT': '',
            '__VIEWSTATE': _read_hidden_field(html, '__VIEWSTATE'),
            '__VIEWSTATEGENERATOR': _read_hidden_field(html, '__VIEWSTATEGENERATOR'),
            '__EVENTVALIDATION': _read_hidden_field(html, '__EVENTVALIDATION'),
        }

        doc_resp = await client.post(
            page_url,
            headers={'Content-Type': 'application/x-www-form-urlencoded', 'Referer': page_url},
            content=urlencode(body),
            timeout=30,
        )
    if doc_resp.status_code != 200:
        return None

    content_type = doc_resp.headers.get('content-type', '')
    if 'pdf' not in content_type:
        return None

    with open(file_path, 'wb') as f:
        f.write(doc_resp.content)
    return file_path


def delete_pdf(pdf_path: Optional[str]) -> None:
    """Delete a tender's PDF file from disk if it exists."""
    if not pdf_path:
        return
    try:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
    except Exception as e:
        print(f"[pdf] delete failed: {e}")

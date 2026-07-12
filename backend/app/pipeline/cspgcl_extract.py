"""
app/pipeline/cspgcl_extract.py

Direct port of src/pipeline/cspgcl_extract.js.
Dedicated PDF extractor for CSPGCL NIT (Notice Inviting Tender) documents.

Uses pdfplumber instead of Node's pdf-parse for text extraction (lighter
memory footprint, pure Python, no headless-browser dependency).
"""
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, Union

import pdfplumber

IST = timezone(timedelta(hours=5, minutes=30))

# ── patterns for the NIT table rows ──────────────────────────────────────────

SPEC_NO_RE = re.compile(r'(?:CEC|CEC/|No\.\s*)[\w/.\-\s]{3,40}', re.I)
RFX_NO_RE = re.compile(r'\b(\d{5,6})\s+(\d{5,6})\b')
NIT_VALUE_RE = re.compile(r'(\d+(?:\.\d+)?)\s*Lacs?\s*(?:\(without\s*GST\))?', re.I)
EMD_RE = re.compile(r'(?:EMD|Earnest\s*Money)[^\u20b9\d\n]*(?:\u20b9|Rs\.?)?\s*([\d,]+(?:\.\d+)?)', re.I)
COMPLETION_RE = re.compile(r'(\d+\+?\d*)\s*(?:Months?|Years?|Days?)', re.I)
LAST_DATE_RE = re.compile(r'Last\s*date[^:]*?:\s*([^\n]+)', re.I)
OPEN_DATE_RE = re.compile(r'Bid\s*[Oo]pening[^:]*?:\s*([^\n]+)', re.I)
OFFICE_RE = re.compile(r'OFFICE\s+OF\s+THE\s+([^\n]{10,100})', re.I)
PORTAL_RE = re.compile(r'https?://ebidding\.cspel\.co\.in\S*', re.I)


def _parse_amount(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    clean = re.sub(r'[\u20b9Rs,]', '', s)
    clean = re.sub(r'lacs?|lakhs?', '', clean, flags=re.I).strip()
    try:
        n = float(clean.replace(',', ''))
    except ValueError:
        return None
    if re.search(r'lacs?|lakhs?', s, re.I):
        return n * 100000
    return n


def _parse_cspgcl_date(s: Optional[str]):
    """'08.06.2026' or '08/06/2026' or '08-06-2026'"""
    if not s:
        return None
    m = re.match(r'(\d{2})[./-](\d{2})[./-](\d{4})', s.strip())
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), tzinfo=IST)
        except ValueError:
            return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _parse_hindi_letter(clean_text: str) -> list:
    blocks = re.split(
        r'\n(?=\s*\(?\d+\)?\s*(?:\u092f\u092c\u0928\u0926\u093e|\u0915\u093e\u092f\*|\u0915\u093e\u092f|spec|No|CEC|CEC/))',
        clean_text, flags=re.I
    )
    blocks = [b for b in blocks if re.match(r'^\s*\(?\d+\)?\s+', b)]

    rows = []
    for block in blocks:
        if len(block) < 30:
            continue

        spec_match = re.search(
            r'(?:\u092f\u092c\u0928\u0926\u093e\s*\u092c\u0935\u0936\u0947\u0937\u0940\u0915\u0930\u0923\s*\u092e\u093e\u0902\u0915|\u092c\u0935\u0936\u0947\u0937\u0940\u0915\u0930\u0923\s*\u092e\u093e\u0902\u0915|spec\s*(?:no)?\.?)\s*(?::-|:)\s*([^\n]+)',
            block, re.I
        )
        tender_spec_no = re.sub(r'\s+', ' ', spec_match.group(1).strip()) if spec_match else None

        scope_match = re.search(
            r'(?:\u0915\u093e\u092f\*?\s*\u0915\u093e\s*\u0928\u093e\u092e|name\s*of\s*work)\s*(?::-|:)\s*([\s\S]+?)(?=(?:\u0905\u0928\u0941\u092e\u093e\u0928\u093f\u0924\s*\u0932\u093e\u0917\u0924|estimated|value|$))',
            block, re.I
        )
        scope = re.sub(r'\s+', ' ', scope_match.group(1).strip())[:300] if scope_match else None

        value_match = re.search(
            r'(?:\u0905\u0928\u0941\u092e\u093e\u0928\u093f\u0924\s*\u0932\u093e\u0917\u0924|estimated\s*cost)\s*:\s*(?:5\u092a\u092f\u0947|\u0930\u0941\u092a\u092f\u0947|Rs\.?|\u20b9)?\s*([\d,.]+)',
            block, re.I
        )
        nit_value_rs = None
        nit_value_lacs = None
        if value_match:
            try:
                nit_value_rs = float(value_match.group(1).replace(',', ''))
                nit_value_lacs = nit_value_rs / 100000
            except ValueError:
                nit_value_rs = None

        emd_match = re.search(
            r'(?:\u092c\u092f\u093e\u0928\u0947?\s*\u0915[0\u0940]\s*\u0930\u093e\u0936\u093f|\u0927\u0930\u094b\u0939\u0930\s*\u0930\u093e\u0936\u093f|\u0927\u0930\u094b\u0939\u0930\s*\u0930\u093e\u0936\u093f|emd|earnest\s*money)\s*:\s*(?:5\u092a\u092f\u0947|\u0930\u0941\u092a\u092f\u0947|Rs\.?|\u20b9)?\s*([\d,.]+)',
            block, re.I
        )
        emd_amount = None
        if emd_match:
            try:
                emd_amount = float(emd_match.group(1).replace(',', ''))
            except ValueError:
                emd_amount = None

        completion_match = re.search(
            r'(?:\u0915\u093e\u092f\*?\s*\u092a\u0942\u0923\*?\s*\u0915\u0930\u0928\u0947\s*\u0915[0\u0940]\s*\u0905\u0935\s*\u0927|completion\s*period)\s*:\s*([^\n\u0964]+)',
            block, re.I
        )
        completion_period = completion_match.group(1).strip() if completion_match else None

        if tender_spec_no or scope or nit_value_rs or emd_amount:
            rows.append({
                'tenderSpecNo': tender_spec_no,
                'scope': scope or 'CSPGCL Tender',
                'nitValueLacs': nit_value_lacs,
                'nitValueRs': nit_value_rs,
                'emdAmount': emd_amount,
                'rfxNos': [],
                'completionPeriod': completion_period,
            })
    return rows


def _parse_english_numbered_list(clean_text: str) -> list:
    rfx_match = re.search(r'RFx\s*No[^\d\n]*?(\d+)', clean_text, re.I)
    rfx_nos = [rfx_match.group(1)] if rfx_match else []

    spec_match = re.search(r'(?:Tender\s+)?Specification\s+No[^\n]*\n([^\n]+)', clean_text, re.I)
    tender_spec_no = re.sub(r'^:\s*', '', spec_match.group(1).strip()).strip() if spec_match else None

    scope_match = re.search(r'Particulars[^\n]*\n([\s\S]+?)(?=\n\s*\d+\.|$)', clean_text, re.I)
    scope = None
    if scope_match:
        scope = re.sub(r'\s+', ' ', scope_match.group(1).strip())
        scope = re.sub(r'^:\s*', '', scope).strip()[:300]

    cost_match = re.search(r'(?:Estimated\s+)?Cost[^\n]*\n([\s\S]+?)(?=\n\s*\d+\.|$)', clean_text, re.I)
    nit_value_rs = None
    if cost_match:
        cost_text = cost_match.group(1)
        num_match = re.search(r'(?:Rs\.?|\u20b9)?\s*([\d,]+(?:\.\d+)?)', cost_text, re.I)
        if num_match:
            try:
                nit_value_rs = float(num_match.group(1).replace(',', ''))
            except ValueError:
                nit_value_rs = None

    emd_match = re.search(r'Earnest\s+Money\s+Deposit[^\n]*?(?::|Rs\.?|\u20b9)?\s*([\d,]+)', clean_text, re.I)
    emd_amount = None
    if emd_match:
        try:
            emd_amount = float(emd_match.group(1).replace(',', ''))
        except ValueError:
            emd_amount = None

    if tender_spec_no or scope or emd_amount:
        return [{
            'tenderSpecNo': tender_spec_no,
            'scope': scope or 'CSPGCL Tender',
            'nitValueLacs': (nit_value_rs / 100000) if nit_value_rs else None,
            'nitValueRs': nit_value_rs,
            'emdAmount': emd_amount,
            'rfxNos': rfx_nos,
            'completionPeriod': None,
        }]
    return []


def _extract_text(buf: bytes) -> str:
    import io
    text_parts = []
    with pdfplumber.open(io.BytesIO(buf)) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or '')
    return '\n'.join(text_parts)


async def extract_cspgcl_pdf(pdf_path_or_buffer: Union[str, bytes]) -> dict:
    """extractCspgclPdf(pdfPathOrBuffer)

    Accepts either a file path string or raw bytes.
    Returns a dict with all extracted fields.
    """
    if isinstance(pdf_path_or_buffer, str):
        if not os.path.exists(pdf_path_or_buffer):
            return {'status': 'not_found', 'rows': [], 'rawText': None}
        with open(pdf_path_or_buffer, 'rb') as f:
            buf = f.read()
    else:
        buf = pdf_path_or_buffer

    try:
        text = _extract_text(buf)
    except Exception as e:
        print(f"[cspgcl_extract] pdf text extraction failed: {e}")
        return {'status': 'parse_error', 'rows': [], 'rawText': None}

    # Normalise Devnagari word layout and whitespace
    clean_text = re.sub(r'([\u0900-\u097F*])\s*\n\s*([\u0900-\u097F*])', r'\1\2', text)
    clean_text = re.sub(r'[ \t]+', ' ', clean_text)
    clean_text = clean_text.replace('\r\n', '\n')
    raw_text = clean_text[:6000]  # excerpt for frontend display

    office_match = OFFICE_RE.search(clean_text)
    issuing_office = office_match.group(1).strip() if office_match else None

    portal_match = PORTAL_RE.search(clean_text)
    portal_link = portal_match.group(0) if portal_match else None

    # ── Parse each table row ───────────────────────────────────────────────
    rows = _parse_hindi_letter(clean_text)

    if not rows:
        row_blocks = re.split(r"\n(?=\s*\d+\s+(?:CEC|KW|CEC/|[\w./]{3,}|\n))", clean_text)
        row_blocks = [b for b in row_blocks if re.match(r'^\s*\d+\s', b)]

        for block in row_blocks:
            if len(block) < 30:
                continue

            spec_match = SPEC_NO_RE.search(block)
            tender_spec_no = re.sub(r'\s+', ' ', spec_match.group(0).strip()) if spec_match else None

            nit_match = NIT_VALUE_RE.search(block)
            nit_value_lacs = float(nit_match.group(1)) if nit_match else None
            nit_value_rs = nit_value_lacs * 100000 if nit_value_lacs is not None else None

            emd_match = EMD_RE.search(block)
            emd_amount = _parse_amount(emd_match.group(1)) if emd_match else None

            rfx_match = RFX_NO_RE.search(block)
            rfx_nos = [rfx_match.group(1), rfx_match.group(2)] if rfx_match else []

            comp_match = COMPLETION_RE.search(block)
            completion_period = comp_match.group(0).strip() if comp_match else None

            scope_candidate = re.sub(r'^\s*\d+\s*', '', block)
            scope_lines = [l for l in scope_candidate.split('\n') if not re.match(r'^\s*[\d.]+\s*$', l)]
            scope_candidate = re.sub(r'\s+', ' ', ' '.join(scope_lines)).strip()[:300]

            if not nit_value_lacs and not emd_amount and not tender_spec_no:
                continue

            rows.append({
                'tenderSpecNo': tender_spec_no,
                'scope': scope_candidate,
                'nitValueLacs': nit_value_lacs,
                'nitValueRs': nit_value_rs,
                'emdAmount': emd_amount,
                'rfxNos': rfx_nos,
                'completionPeriod': completion_period,
            })

    if not rows:
        rows = _parse_english_numbered_list(clean_text)

    # ── Fallback: top-level amount extraction if table parsing yielded nothing ─
    bid_value = None
    emd_amount_top = None

    if rows:
        bid_value = rows[0]['nitValueRs']
        emd_amount_top = rows[0]['emdAmount']
    else:
        nit_fb = NIT_VALUE_RE.search(clean_text)
        if nit_fb:
            bid_value = float(nit_fb.group(1)) * 100000
        emd_fb = EMD_RE.search(clean_text)
        if emd_fb:
            emd_amount_top = _parse_amount(emd_fb.group(1))

    last_date_match = LAST_DATE_RE.search(clean_text)
    last_date_str = last_date_match.group(1).strip()[:40] if last_date_match else None
    last_date = _parse_cspgcl_date(last_date_str)

    open_date_match = OPEN_DATE_RE.search(clean_text)
    open_date_str = open_date_match.group(1).strip()[:40] if open_date_match else None
    open_date = _parse_cspgcl_date(open_date_str)

    status = 'extracted' if (bid_value is not None or emd_amount_top is not None) else 'not_found'

    extracted_fields = {}
    if issuing_office:
        extracted_fields['issuingOffice'] = {'label': 'Issuing Office', 'value': issuing_office}
    if portal_link:
        extracted_fields['portalLink'] = {'label': 'e-Bidding Portal', 'value': portal_link}
    if last_date_str:
        extracted_fields['lastSubmission'] = {'label': 'Last Date for Submission', 'value': last_date_str}
    if open_date_str:
        extracted_fields['bidOpeningDate'] = {'label': 'Bid Opening Date', 'value': open_date_str}
    if rows:
        extracted_fields['totalRowsInNIT'] = {'label': 'Total Items in NIT', 'value': str(len(rows))}

    return {
        'status': status,
        'bidValue': bid_value,
        'emdAmount': emd_amount_top,
        'issuingOffice': issuing_office,
        'portalLink': portal_link,
        'lastDate': last_date,
        'openDate': open_date,
        'rows': rows,
        'rawText': raw_text,
        'extractedFields': extracted_fields,
    }

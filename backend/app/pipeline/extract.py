"""
app/pipeline/extract.py

Direct port of src/pipeline/extract.js.

NOTE: the GeM offline PDF field-extractor (src/extractor/*.js — parser.js,
sections.js, fieldExtractor.js, etc.) was intentionally NOT converted, per
instruction ("pdf extractor not needed"). GEM tenders therefore fall through
to the "no PDF value found" branch below (status='not_found') unless the
tender already carries a bidValue/emdAmount from its source record. If you
later want GEM PDF field extraction, that offline parser can be ported the
same way as everything else here.

CSPGCL still uses its own dedicated regex table-parser (cspgcl_extract.py),
which is unrelated to the GeM extractor and is fully ported.
"""
import os
from typing import Optional

from .cspgcl_extract import extract_cspgcl_pdf


async def extract_value_and_emd(tender: dict, pdf_path: Optional[str]) -> dict:
    """extractValueAndEmd(tender, pdfPath) -> extract result

    Dispatcher:
      - CSPGCL -> dedicated regex table-parser (extract_cspgcl_pdf)
      - GEM    -> stubbed (extractor not converted); falls back to existing
                  tender.bidValue/emdAmount if present.
    """
    # ── No PDF available ───────────────────────────────────────────────────
    if not pdf_path or not os.path.exists(pdf_path):
        bid_value = tender.get('bidValue')
        emd_amount = tender.get('emdAmount')
        return {
            'bidValue': bid_value,
            'emdAmount': emd_amount,
            'status': 'extracted' if (bid_value is not None or emd_amount is not None) else 'not_attempted',
            'extractedText': None,
            'aiExtract': None,
            'rows': [],
        }

    # ── CSPGCL — dedicated parser (regex-based, unchanged) ────────────────
    if tender['source'] == 'CSPGCL':
        try:
            result = await extract_cspgcl_pdf(pdf_path)
            return {
                'bidValue': result.get('bidValue') if result.get('bidValue') is not None else tender.get('bidValue'),
                'emdAmount': result.get('emdAmount') if result.get('emdAmount') is not None else tender.get('emdAmount'),
                'status': result['status'],
                'extractedText': result.get('rawText'),
                'aiExtract': None,  # CSPGCL uses its own parser, no AI pass
                'rows': result.get('rows') or [],
            }
        except Exception as e:
            print(f"[extract] CSPGCL pdf-parse failed: {e}")
            return {
                'bidValue': tender.get('bidValue'),
                'emdAmount': tender.get('emdAmount'),
                'status': 'not_found',
                'extractedText': None,
                'aiExtract': None,
                'rows': [],
            }

    # ── GEM — extractor not converted (see module docstring) ──────────────
    bid_value = tender.get('bidValue')
    emd_amount = tender.get('emdAmount')
    return {
        'bidValue': bid_value,
        'emdAmount': emd_amount,
        'status': 'extracted' if (bid_value is not None or emd_amount is not None) else 'not_found',
        'extractedText': None,
        'aiExtract': None,
        'rows': [],
    }

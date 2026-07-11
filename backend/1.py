import os
import sys
import re
import time
import math
import concurrent.futures
from datetime import datetime

# Ensure essential dependencies are installed
try:
    import requests
except ImportError:
    print("[-] Error: 'requests' library is not installed.")
    print("    Please run: pip install requests")
    sys.exit(1)

try:
    from pymongo import MongoClient, UpdateOne
except ImportError:
    print("[-] Error: 'pymongo' library is not installed.")
    print("    Please run: pip install pymongo dnspython")
    sys.exit(1)

try:
    from pypdf import PdfReader
    import pdfplumber
except ImportError as e:
    print(f"[-] Error: required libraries are not installed. {e}")
    print("    Please run: pip install pypdf pdfplumber")
    sys.exit(1)

DEBUG = False  # set True only when you need per-page/per-field internals; off by default to keep output readable

def debug_log(msg):
    if DEBUG:
        print(f"[debug] {msg}")

# ─────────────────────────────────────────────────────────────────────────────
# Clean terminal output helpers
#
# Routine per-item events (one PDF downloaded, one tender extracted...) are
# collapsed into a single self-overwriting progress line instead of one
# printed line per item, so the terminal doesn't scroll into a wall of text.
# Anything that actually needs attention (an error, a failure) is always
# printed as its own permanent line via log_error(), so it never gets lost
# or overwritten by the progress line.
# ─────────────────────────────────────────────────────────────────────────────

_progress_line_active = False

def log(msg):
    """A normal, permanent status line. Clears any in-progress progress line first."""
    global _progress_line_active
    if _progress_line_active:
        sys.stdout.write("\n")
        _progress_line_active = False
    print(msg)

def log_error(msg):
    """A failure/warning line. Always visible, never overwritten, never dropped."""
    log(f"[-] {msg}")

def progress(current, total, phase, extra="", start_time=None):
    """
    Single self-overwriting progress line: '[phase] 12/50 (24%) | ETA 00:32 | extra'
    Call once per completed item. Does not clutter scrollback.
    """
    global _progress_line_active
    pct = (current / total * 100) if total else 100
    eta_str = ""
    if start_time is not None and current > 0:
        elapsed = time.time() - start_time
        avg = elapsed / current
        remaining = avg * max(total - current, 0)
        m, s = divmod(int(remaining), 60)
        h, m = divmod(m, 60)
        eta_str = f" | ETA {h:02d}:{m:02d}:{s:02d}" if h else f" | ETA {m:02d}:{s:02d}"
    line = f"[{phase}] {current}/{total} ({pct:.0f}%){eta_str}"
    if extra:
        line += f" | {extra}"
    sys.stdout.write("\r" + line.ljust(110))
    sys.stdout.flush()
    _progress_line_active = True

def progress_done():
    """Close out the current progress line with a newline so the next log() starts clean."""
    global _progress_line_active
    if _progress_line_active:
        sys.stdout.write("\n")
        sys.stdout.flush()
        _progress_line_active = False

def print_failure_summary(title, failures):
    """failures: list of (label, reason) tuples. Prints nothing if empty."""
    if not failures:
        return
    log(f"[-] {title}: {len(failures)} failure(s)")
    for label, reason in failures:
        log(f"      - {label}: {reason}")

try:
    from dateutil import parser as date_parser
except ImportError:
    date_parser = None

# Helper to load .env variables manually to avoid dependency on python-dotenv
def load_dotenv(dotenv_path):
    if not os.path.exists(dotenv_path):
        return
    with open(dotenv_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            m = re.match(r'^([^=]+)=(.*)$', line)
            if m:
                key = m.group(1).strip()
                val = m.group(2).strip()
                # Strip wrapping quotes if any
                if val.startswith('"') and val.endswith('"'):
                    val = val[1:-1]
                elif val.startswith("'") and val.endswith("'"):
                    val = val[1:-1]
                os.environ[key] = val

# Set up paths relative to this script
backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(backend_dir, '.env'))

# Hardcoded default fallback for stand-alone running (e.g., in Termux on mobile)
mongodb_uri = os.environ.get("MONGODB_URI") or "mongodb+srv://Vasu:9753%40@cluster0.wpm3f1b.mongodb.net/cgtenders?retryWrites=true&w=majority&appName=Cluster0"

documents_dir_name = os.environ.get("DOCUMENTS_DIR", "documents")
documents_dir = os.path.join(backend_dir, documents_dir_name)

# ─────────────────────────────────────────────────────────────────────────────
# PDF Extractor Configuration & Functions in Python
# ─────────────────────────────────────────────────────────────────────────────

FIELD_DICTIONARY = [
    {
        'key': 'bidNumber',
        'section': 'BID_DETAILS',
        'anchor': 'Bid Number',
        'regex': r'Bid\s+Number\s*[:\-]?\s*([A-Z0-9\/\-_]{10,40})',
        'shape': r'^GEM/',
        'type': 'text',
        'required': True,
        'window': 3
    },
    {
        'key': 'ministry',
        'section': 'BID_DETAILS',
        'anchor': 'Ministry',
        'regex': r'Ministry(?:/State)?\s+Name\s*[:\-]?\s*(.{3,100})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': False,
        'window': 2
    },
    {
        'key': 'department',
        'section': 'BID_DETAILS',
        'anchor': 'Department',
        'regex': r'Department\s+Name\s*[:\-]?\s*(.{3,100})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': True,
        'window': 2
    },
    {
        'key': 'organisation',
        'section': 'BID_DETAILS',
        'anchor': 'Organisation',
        'regex': r'Organi[sz]ation\s+Name\s*[:\-]?\s*(.{3,100})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': False,
        'window': 2
    },
    {
        'key': 'office',
        'section': 'BID_DETAILS',
        'anchor': 'Office',
        'regex': r'Office\s+Name\s*[:\-]?\s*(.{3,100})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': False,
        'window': 2
    },
    {
        'key': 'bidStartDate',
        'section': 'PREAMBLE',
        'anchor': 'Dated',
        'regex': r'(?:Dated|Start\s+Date)[^:\d\n]*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})',
        'shape': r'^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$',
        'type': 'date',
        'required': False,
        'window': 3
    },
    {
        'key': 'bidEndDate',
        'section': 'BID_DETAILS',
        'anchor': 'Bid End Date',
        'regex': r'Bid\s+End\s+Date[^:\d\n]*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})',
        'shape': r'^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$',
        'type': 'date',
        'required': False,
        'window': 3
    },
    {
        'key': 'bidOpeningDate',
        'section': 'BID_DETAILS',
        'anchor': 'Bid Opening',
        'regex': r'Bid\s+Opening[^:\d\n]*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})',
        'shape': r'^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$',
        'type': 'date',
        'required': False,
        'window': 3
    },
    {
        'key': 'bidType',
        'section': 'BID_DETAILS',
        'anchor': 'Bid Type',
        'regex': r'Bid\s+Type\s*[:\-]?\s*((?:BOQ|Bid|Reverse\s*Auction|Single\s*Packet|Two\s*Packet)[^\n]{0,40})',
        'shape': r'(?:BOQ|Bid|Reverse|Single|Two)',
        'type': 'text',
        'required': False,
        'window': 2
    },
    {
        'key': 'bidToRA',
        'section': 'BID_DETAILS',
        'anchor': 'Bid to RA',
        'regex': r'Bid\s+to\s+RA\s*(?:enabled)?\s*(Yes|No)',
        'shape': r'^(?:Yes|No)$',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'bidOfferValidityDays',
        'section': 'FULL_TEXT',
        'anchor': 'Validity (From End Date)',
        'regex': r'(\d+)\s*\(Days?\)',
        'shape': r'^\d+$',
        'type': 'number',
        'required': False,
        'window': 1
    },
    {
        'key': 'totalQuantity',
        'section': 'BID_DETAILS',
        'anchor': 'Total Quantity',
        'regex': r'Total\s+Quantity[^:\n]*[:\-]?\s*(\d[\d,]*)',
        'shape': r'^[\d,]+$',
        'type': 'number',
        'required': False,
        'window': 2
    },
    {
        'key': 'emdAmount',
        'section': 'BID_DETAILS',
        'anchor': 'EMD',
        'regex': r'(?:EMD|Earnest\s*Money)(?:\s*(?:Amount|Detail))?[\s:\-]{0,5}((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore|K))?)',
        'shape': r'^(?:₹|Rs\.?)?\s*(?:\d{3,}|[\d.,]+\s*(?:Lakh|Lac|Cr|Crore|K))',
        'type': 'money',
        'required': False,
        'window': 3
    },
    {
        'key': 'bidValue',
        'section': 'BID_DETAILS',
        'anchor': 'Estimated Value',
        'regex': r'(?:Estimated\s+)?(?:Estimated|Bid)\s*Value[\s:\-]{0,5}((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore))?)',
        'shape': r'^(?:₹|Rs\.?)?\s*(?:\d{3,}|[\d.,]+\s*(?:Lakh|Lac|Cr|Crore))',
        'type': 'money',
        'required': False,
        'window': 3
    },
    {
        'key': 'itemCategory',
        'section': 'ITEM_DETAILS',
        'anchor': 'Item Category',
        'regex': r'Item\s+Category\s*[:\-]?\s*(.{3,120})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': True,
        'window': 2
    },
    {
        'key': 'itemCategory',
        'section': 'ITEM_DETAILS',
        'anchor': 'Categories selected for notification',
        'regex': r'(?:Relevant\s+)?Categories\s+selected\s+for\s+notification\s*[:\-]?\s*(.{3,120})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': True,
        'window': 3
    },
    {
        'key': 'itemCategory',
        'section': 'ITEM_DETAILS',
        'anchor': 'BOQ Title',
        'regex': r'BOQ\s+Title\s*[:\-]?\s*(.{3,120})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': True,
        'window': 3
    },
    {
        'key': 'quantity',
        'section': 'ITEM_DETAILS',
        'anchor': 'Quantity',
        'regex': r'Quantity\s*[:\-]?\s*([\d,]+(?:\.\d+)?)',
        'shape': r'^[\d,]+',
        'type': 'number',
        'required': False,
        'window': 2
    },
    {
        'key': 'deliveryDays',
        'section': 'ITEM_DETAILS',
        'anchor': 'Delivery Period',
        'regex': r'Delivery\s+Period\s*[:\-]?\s*([\d]+(?:\.\d+)?)\s*(Days?|Months?|Weeks?|Years?)?',
        'shape': r'^\d+',
        'type': 'days',
        'required': False,
        'window': 2
    },
    {
        'key': 'primaryProductCategory',
        'section': 'ITEM_DETAILS',
        'anchor': 'Primary Product Category',
        'regex': r'Primary\s+Product\s+Category\s*[:\-]?\s*(.{3,120})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': False,
        'window': 2
    },
    {
        'key': 'minAnnualTurnover',
        'section': 'FULL_TEXT',
        'anchor': 'Minimum Average Annual Turnover',
        'regex': r'(?:Minimum|Min\.?)\s+(?:Average\s+)?Annual\s+Turnover[^\n]{0,30}?([\d,]+(?:\.\d+)?\s*(?:Lakh|Lac|Cr|Crore|K)?)',
        'shape': r'^[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore|K))?',
        'type': 'money',
        'required': False,
        'window': 3
    },
    {
        'key': 'oemAverageTurnover',
        'section': 'ELIGIBILITY_CRITERIA',
        'anchor': 'OEM Average Turnover',
        'regex': r'OEM\s+Average\s+Turnover[\s:\-]{0,5}((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore))?)',
        'shape': r'^(?:₹|Rs\.?)?\s*(?:\d{3,}|[\d.,]+\s*(?:Lakh|Lac|Cr|Crore))',
        'type': 'money',
        'required': False,
        'window': 3
    },
    {
        'key': 'yearsOfExperience',
        'section': 'FULL_TEXT',
        'anchor': 'Years of Past Experience Required',
        'regex': r'Years\s+of\s+Past\s+Experience\s+Required[^\n]{0,40}(\d+(?:\.\d+)?)\s*[Yy]ear',
        'shape': r'^\d+',
        'type': 'number',
        'required': False,
        'window': 3
    },
    {
        'key': 'yearsOfExperience',
        'section': 'FULL_TEXT',
        'anchor': 'Experience',
        'regex': r'(?:Years?\s+of\s+)?Experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*[Yy]ears?',
        'shape': r'^\d+',
        'type': 'number',
        'required': False,
        'window': 3
    },
    {
        'key': 'mseExemption',
        'section': 'FULL_TEXT',
        'anchor': 'MSE Relaxation for Years Of Experience',
        'regex': r'MSE\s+Relaxation\s+for\s+Years\s+Of\s+Experience(?:[^\n]*)\b(Yes|No)\b',
        'shape': r'^(?:Yes|No)$',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'mseExemption',
        'section': 'ELIGIBILITY_CRITERIA',
        'anchor': 'MSE Exemption',
        'regex': r'MSE\s+Exemption\s*[:\-]?\s*(Yes|No|Applicable|Not\s+Applicable|Exempted)',
        'shape': r'^(?:Yes|No|Applicable|Not|Exempted)',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'startupExemption',
        'section': 'FULL_TEXT',
        'anchor': 'Startup Relaxation for Years Of',
        'regex': r'Startup\s+Relaxation\s+for\s+Years\s+Of(?:[^\n]*)\b(Yes|No)\b',
        'shape': r'^(?:Yes|No)$',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'startupExemption',
        'section': 'ELIGIBILITY_CRITERIA',
        'anchor': 'Startup Exemption',
        'regex': r'Startup\s+Exemption\s*[:\-]?\s*(Yes|No|Applicable|Not\s+Applicable|Exempted)',
        'shape': r'^(?:Yes|No|Applicable|Not|Exempted)',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'msePurchasePreference',
        'section': 'ELIGIBILITY_CRITERIA',
        'anchor': 'MSE Purchase Preference',
        'regex': r'MSE\s+Purchase\s+Preference\s*[:\-]?\s*(Yes|No|Applicable|Not\s+Applicable)',
        'shape': r'^(?:Yes|No|Applicable|Not)',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'technicalClarificationDays',
        'section': 'FULL_TEXT',
        'anchor': 'Time allowed for Technical',
        'regex': r'Time\s+allowed\s+for\s+Technical[^\n]*\b(\d+)\s*Days?',
        'shape': r'^\d+$',
        'type': 'number',
        'required': False,
        'window': 2
    },
    {
        'key': 'technicalClarificationDays',
        'section': 'FULL_TEXT',
        'anchor': 'Technical Clarification',
        'regex': r'Technical\s+Clarification[^\n]{0,60}\b(\d+)\s*Days?',
        'shape': r'^\d+$',
        'type': 'number',
        'required': False,
        'window': 2
    },
    {
        'key': 'typeOfBid',
        'section': 'FULL_TEXT',
        'anchor': 'Type of Bid',
        'regex': r'Type\s+of\s+Bid\s*[:\-]?\s*((?:Single|Two)\s+Packet[^\n]{0,20})',
        'shape': r'(?:Single|Two)',
        'type': 'text',
        'required': False,
        'window': 2
    },
    {
        'key': 'inspectionRequired',
        'section': 'FULL_TEXT',
        'anchor': 'Inspection Required',
        'regex': r'Inspection\s+Required[\s\S]{0,100}?\b(Yes|No)\b',
        'shape': r'^(?:Yes|No)$',
        'type': 'boolean',
        'required': False,
        'window': 3
    },
    {
        'key': 'pastPerformancePct',
        'section': 'FULL_TEXT',
        'anchor': 'Past Performance',
        'regex': r'^\s*Past\s+Performance\s+([\d.]+)\s*%',
        'shape': r'^[\d.]+$',
        'type': 'percent',
        'required': False,
        'window': 2
    },
    {
        'key': 'evaluationMethod',
        'section': 'FULL_TEXT',
        'anchor': 'Evaluation Method',
        'regex': r'\bEvaluation\s+Method\b\s+(.{3,80})',
        'shape': r'[A-Za-z]{3}',
        'type': 'text',
        'required': False,
        'window': 2
    },
    {
        'key': 'arbitrationClause',
        'section': 'FULL_TEXT',
        'anchor': 'Arbitration Clause',
        'regex': r'Arbitration\s+Clause[^\n]{0,30}\b(Yes|No)\b',
        'shape': r'^(?:Yes|No)$',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'mediationClause',
        'section': 'FULL_TEXT',
        'anchor': 'Mediation Clause',
        'regex': r'Mediation\s+Clause[^\n]{0,30}\b(Yes|No)\b',
        'shape': r'^(?:Yes|No)$',
        'type': 'boolean',
        'required': False,
        'window': 2
    },
    {
        'key': 'epbgRequired',
        'section': 'FULL_TEXT',
        'anchor': 'ePBG',
        'regex': r'ePBG[^\n]*(?:\n[^\n]*){0,4}\bRequired\s+(Yes|No)\b',
        'shape': r'^(?:Yes|No)$',
        'type': 'boolean',
        'required': False,
        'window': 4
    },
    {
        'key': 'miiPurchasePreference',
        'section': 'FULL_TEXT',
        'anchor': 'MII Purchase Preference',
        'regex': r'MII\s+Purchase\s+Preference[^\n]{0,30}\b(Yes|No|Applicable|Not\s+Applicable)\b',
        'shape': r'^(?:Yes|No|Applicable|Not)',
        'type': 'boolean',
        'required': False,
        'window': 2
    }
]

# Precompile each field's regex/shape patterns once instead of recompiling
# them (via re.search(pattern_string, ...)) for every field, on every
# section/window, for every single tender.
for _field in FIELD_DICTIONARY:
    _field['regex_compiled'] = re.compile(_field['regex'], re.IGNORECASE)
    _field['shape_compiled'] = re.compile(_field['shape'], re.IGNORECASE) if _field.get('shape') else None

SECTION_ANCHORS = [
    {
        'key': 'BID_DETAILS',
        'patterns': [
            r'^[^\w]*bid\s+detail',
            r'^[^\w]*bid\s+information',
            r'^[^\w]*basic\s+details'
        ]
    },
    {
        'key': 'ITEM_DETAILS',
        'patterns': [
            r'^[^\w]*item\s+detail',
            r'^[^\w]*item\s+category',
            r'^[^\w]*product\s+detail'
        ]
    },
    {
        'key': 'CONSIGNEE_DETAILS',
        'patterns': [
            r'^[^\w]*consignee\s+detail',
            r'^[^\w]*delivery\s+detail',
            r'^[^\w]*consignees?/reporting\s+officer',
            r'^[^\w]*consignees?\s*and\s*quantity'
        ]
    },
    {
        'key': 'ELIGIBILITY_CRITERIA',
        'patterns': [
            r'^[^\w]*eligibility\s+criteria',
            r'^[^\w]*eligibility\s+condition',
            r'^[^\w]*seller\s+eligibility'
        ]
    },
    {
        'key': 'PAST_PERFORMANCE',
        'patterns': [
            r'^[^\w]*(?:\d+[.)]\s*)?past\s+performance\s*(?:[:\-]\s*(?:The\s+Bidder|Bidder|Seller)|$)'
        ]
    },
    {
        'key': 'FINANCIAL_CRITERIA',
        'patterns': [
            r'^[^\w]*(?:\d+[.)]\s*)?financial\s+criteria\s*(?:[:\-]\s*(?:The\s+Bidder|Bidder|Seller)|$)',
            r'^[^\w]*financial\s+requirement'
        ]
    },
    {
        'key': 'BUYER_ATC',
        'patterns': [
            r'^[^\w]*buyer\s+added\s+bid\s+specific',
            r'^[^\w]*buyer\s+specific\s+terms',
            r'^[^\w]*additional\s+terms\s+and\s+conditions',
            r'^[^\w]*bid\s+specific\s+terms'
        ]
    },
    {
        'key': 'UPLOADED_DOCS',
        'patterns': [
            r'^[^\w]*buyer\s+uploaded',
            r'^[^\w]*uploaded\s+(atc\s+)?documents?\s*(?:by\s+buyer|$)',
            r'^[^\w]*buyer\s+added\s+documents'
        ]
    },
    {
        'key': 'DISCLAIMER',
        'patterns': [
            r'^[^\w]*disclaimer'
        ]
    }
]

# Precompile section-anchor patterns once (was being re-compiled by re.search()
# on every single line of every PDF, for every tender)
for _item in SECTION_ANCHORS:
    _item['compiled'] = [re.compile(p, re.IGNORECASE) for p in _item['patterns']]

# ─────────────────────────────────────────────────────────────────────────────
# Text Cleaning & Normalization Helpers
# ─────────────────────────────────────────────────────────────────────────────

def clean_text(val_str):
    if not val_str:
        return ""
    return re.sub(r'\s+', ' ', str(val_str)).strip()

def parse_money(val_str):
    if not val_str:
        return None
    val_str = str(val_str)
    crore = bool(re.search(r'cr(?:ore)?s?', val_str, re.IGNORECASE))
    lakh = bool(re.search(r'l(?:a(?:c|kh))?s?', val_str, re.IGNORECASE))
    thou = bool(re.search(r'k\b', val_str, re.IGNORECASE))
    s = re.sub(r'[₹Rs.,\s]', '', val_str)
    clean = re.sub(r'[a-zA-Z]', '', s).strip()
    try:
        n = float(clean)
        if crore:
            n *= 10000000
        elif lakh:
            n *= 100000
        elif thou:
            n *= 1000
        return round(n, 2)
    except ValueError:
        return None

def parse_date(val_str):
    if not val_str:
        return None
    val_str = str(val_str).strip()
    m = re.match(r'^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$', val_str)
    if m:
        d, mo, y = m.groups()
        try:
            dt = datetime(int(y), int(mo), int(d))
            return dt
        except ValueError:
            return None
    elif date_parser:
        try:
            return date_parser.parse(val_str)
        except Exception:
            pass
    try:
        for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
            try:
                return datetime.strptime(val_str, fmt)
            except ValueError:
                continue
    except Exception:
        pass
    return None

def parse_days(val_str):
    if not val_str:
        return None
    val_str = str(val_str).strip()
    m = re.search(r'(\d+(?:\.\d+)?)\s*(day|month|week|year)?s?', val_str, re.IGNORECASE)
    if not m:
        return None
    try:
        n = float(m.group(1))
        unit = (m.group(2) or 'day').lower()
        if unit.startswith('month'):
            n = round(n * 30)
        elif unit.startswith('week'):
            n = round(n * 7)
        elif unit.startswith('year'):
            n = round(n * 365)
        return int(n)
    except ValueError:
        return None

def parse_bool(val_str):
    if val_str is None:
        return None
    s = str(val_str).strip().lower()
    if s in ['yes', 'true', 'exempted', 'applicable', '1', 'allowed']:
        return True
    if s in ['no', 'false', 'not applicable', 'na', 'n/a', '0', 'not allowed']:
        return False
    return None

def parse_number(val_str):
    if not val_str:
        return None
    try:
        return float(str(val_str).replace(',', '').strip())
    except ValueError:
        return None

def parse_percent(val_str):
    if not val_str:
        return None
    m = re.search(r'([\d.]+)\s*%', str(val_str))
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None

def anchor_search(lines, anchor, window_size=4, look_behind=2):
    lower_anchor = re.sub(r'\s+', ' ', anchor.lower())
    for i, line in enumerate(lines):
        line_clean = re.sub(r'\s+', ' ', line.lower())
        if lower_anchor in line_clean:
            start = max(0, i - look_behind)
            return "\n".join(lines[start : i + 1 + window_size])
    return ""

def convert_value(raw, val_type):
    if raw is None or raw == '':
        return None
    if val_type == 'money':
        return parse_money(raw)
    elif val_type == 'date':
        return parse_date(raw)
    elif val_type == 'days':
        return parse_days(raw)
    elif val_type == 'boolean':
        return parse_bool(raw)
    elif val_type == 'number':
        return parse_number(raw)
    elif val_type == 'percent':
        return parse_percent(raw)
    else:
        return clean_text(raw)

# ─────────────────────────────────────────────────────────────────────────────
# Extraction Flow Functions
# ─────────────────────────────────────────────────────────────────────────────

def normalize_pdf_text(raw_text):
    if not raw_text:
        return ""
    text = raw_text
    text = re.sub(r'[\u0900-\u097f\u1cd0-\u1cff]+', '', text)
    text = re.sub(r'^(\s*)/', r'\1', text, flags=re.MULTILINE)
    text = re.sub(r'^(\s*)[&%#]\s*', r'\1', text, flags=re.MULTILINE)
    
    unicode_map = [
        (r'\u2019|\u2018|\u201a|\u201b', "'"),
        (r'\u201c|\u201d|\u201e|\u201f', '"'),
        (r'\u2013|\u2014|\u2015', '-'),
        (r'\u2022|\u2023|\u25e6', '-'),
        (r'\u20B9', '₹'),
        (r'\u00a0', ' '),
        (r'\r\n', '\n'),
        (r'\r', '\n'),
        (r'\f', '\n')
    ]
    for pattern, replacement in unicode_map:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        
    text = text.replace('\t', '  ')
    
    lines = text.split('\n')
    processed_lines = []
    for line in lines:
        l = line.rstrip()
        l = re.sub(r'([^\s]) {2,}', r'\1 ', l)
        processed_lines.append(l)
        
    collapsed = []
    blank_run = 0
    for line in processed_lines:
        if line.strip() == '':
            blank_run += 1
            if blank_run <= 2:
                collapsed.append(line)
        else:
            blank_run = 0
            collapsed.append(line)
            
    return '\n'.join(collapsed)

def detect_section_key(line):
    trimmed = line.strip()
    if not trimmed or len(trimmed) > 120:
        return None
    for item in SECTION_ANCHORS:
        for pattern in item['compiled']:
            if pattern.search(trimmed):
                return item['key']
    return None

def split_sections(normalized_text):
    lines = normalized_text.split('\n')
    sections = {'PREAMBLE': []}
    current_key = 'PREAMBLE'
    
    for line in lines:
        key = detect_section_key(line)
        if key:
            current_key = key
            if current_key not in sections:
                sections[current_key] = []
        sections[current_key].append(line)
        
    result = {}
    for k, line_arr in sections.items():
        result[k] = '\n'.join(line_arr).strip()
    result['FULL_TEXT'] = normalized_text
    return result

def try_extract(text, regex_pattern, shape_pattern, val_type):
    # regex_pattern/shape_pattern may be a precompiled pattern object or a raw string;
    # accept both so this stays a drop-in replacement everywhere it's called.
    compiled_regex = regex_pattern if hasattr(regex_pattern, 'search') else re.compile(regex_pattern, re.IGNORECASE)
    match = compiled_regex.search(text)
    if not match or len(match.groups()) < 1 or not match.group(1):
        return None
    raw = clean_text(match.group(1))
    if not raw:
        return None
    if shape_pattern:
        compiled_shape = shape_pattern if hasattr(shape_pattern, 'search') else re.compile(shape_pattern, re.IGNORECASE)
        if not compiled_shape.search(raw):
            return None
    converted = convert_value(raw, val_type)
    return converted if (converted is not None and converted != '') else None

def extract_in_section(section_text, anchor, regex, shape, val_type, window_size):
    if not section_text:
        return None
    lines = section_text.split('\n')
    window_text = anchor_search(lines, anchor, window_size)
    if window_text:
        val = try_extract(window_text, regex, shape, val_type)
        if val is not None:
            return val
    return try_extract(section_text, regex, shape, val_type)

def label_matches(label, anchor):
    if not label or not anchor:
        return False
    # Remove all non-alphanumeric chars to strip out Hindi/punctuation and get clean English matching
    l_clean = re.sub(r'[^a-z0-9]', '', label.lower())
    a_clean = re.sub(r'[^a-z0-9]', '', anchor.lower())
    
    # Handle spelling differences for organisation/organization
    if 'organis' in a_clean:
        a_clean = a_clean.replace('organisation', 'org')
    if 'organiz' in a_clean:
        a_clean = a_clean.replace('organization', 'org')
    if 'organis' in l_clean:
        l_clean = l_clean.replace('organisation', 'org')
    if 'organiz' in l_clean:
        l_clean = l_clean.replace('organization', 'org')
        
    return a_clean in l_clean

def extract_consignees_from_all_tables(all_tables):
    consignees = []
    for table in all_tables:
        if not table or len(table) < 2:
            continue
            
        header = None
        header_idx = -1
        for idx, row in enumerate(table):
            row_str = " ".join([str(c).lower() for c in row if c is not None])
            if "consignee" in row_str or "reporting officer" in row_str or "address" in row_str or "पता" in row_str:
                header = row
                header_idx = idx
                break
                
        if header is None:
            continue
            
        sno_col = -1
        officer_col = -1
        address_col = -1
        qty_col = -1
        days_col = -1
        
        for c_idx, cell in enumerate(header):
            if not cell:
                continue
            c_lower = str(cell).lower()
            if "s.n" in c_lower or "s.no" in c_lower or "क.सं" in c_lower:
                sno_col = c_idx
            elif "consignee" in c_lower or "reporting officer" in c_lower or "परेषती" in c_lower:
                officer_col = c_idx
            elif "address" in c_lower or "पता" in c_lower:
                address_col = c_idx
            elif "quantity" in c_lower or "मात्रा" in c_lower:
                qty_col = c_idx
            elif "delivery" in c_lower or "delivery days" in c_lower or "days" in c_lower or "डलीवर के दन" in c_lower or "डलीवरी के दन" in c_lower:
                days_col = c_idx
                
        if address_col != -1:
            for row in table[header_idx + 1:]:
                if not row or len(row) <= max(address_col, qty_col):
                    continue
                
                addr_val = row[address_col]
                if not addr_val or "address" in str(addr_val).lower():
                    continue
                    
                sno_val = row[sno_col] if (sno_col != -1 and sno_col < len(row)) else None
                officer_val = row[officer_col] if (officer_col != -1 and officer_col < len(row)) else None
                qty_val = row[qty_col] if (qty_col != -1 and qty_col < len(row)) else None
                days_val = row[days_col] if (days_col != -1 and days_col < len(row)) else None
                
                sNo = parse_number(sno_val)
                if sNo is not None:
                    sNo = int(sNo)
                else:
                    sNo = len(consignees) + 1
                    
                consignees.append({
                    "sNo": sNo,
                    "reportingOfficer": clean_text(officer_val) if officer_val else None,
                    "address": clean_text(addr_val) if addr_val else None,
                    "quantity": parse_number(qty_val) if qty_val else None,
                    "deliveryDays": parse_days(days_val) if days_val else None
                })
    return consignees

def extract_fields(sections, table_rows=None):
    result = {}
    
    # Try structural table cell extraction first
    if table_rows:
        for field in FIELD_DICTIONARY:
            key = field['key']
            anchor = field['anchor']
            val_type = field['type']
            shape_compiled = field.get('shape_compiled')
            
            if result.get(key) is not None:
                continue
                
            for label, value in table_rows:
                if label_matches(label, anchor):
                    clean_val = clean_text(value)
                    if clean_val:
                        if shape_compiled:
                            if not shape_compiled.search(clean_val):
                                continue
                        converted = convert_value(clean_val, val_type)
                        if converted is not None and converted != '':
                            result[key] = converted
                            break
                            
    # Fallback to regex-based text extraction for missing fields
    for field in FIELD_DICTIONARY:
        key = field['key']
        if result.get(key) is not None:
            continue
            
        section = field['section']
        anchor = field['anchor']
        regex = field['regex_compiled']
        shape = field.get('shape_compiled')
        val_type = field['type']
        win = field.get('window', 3)
        
        value = extract_in_section(sections.get(section, ''), anchor, regex, shape, val_type, win)
        if value is None and 'FULL_TEXT' in sections:
            value = extract_in_section(sections['FULL_TEXT'], anchor, regex, shape, val_type, win)
            
        result[key] = value
        
    return result

def extract_documents_required(sections):
    text = sections.get('ELIGIBILITY_CRITERIA') or sections.get('FULL_TEXT') or ''
    if not text:
        return []
    lines = text.split('\n')
    docs = []
    in_doc_list = False
    blanks_seen = 0
    for line in lines:
        line_strip = line.strip()
        if not in_doc_list and re.search(r'(?:required|mandatory)\s+documents?', line_strip, re.IGNORECASE):
            in_doc_list = True
            continue
        if in_doc_list:
            if line_strip == '':
                blanks_seen += 1
                if blanks_seen > 1:
                    break
                continue
            blanks_seen = 0
            if re.search(r'^(?:Buyer|Eligibility|Consignee|Past\s+Performance|Disclaimer)', line_strip, re.IGNORECASE):
                break
            item_match = re.match(r'^(?:\d+[.)]\s*|-\s*|\*\s*|[•►]\s*)(.+)', line_strip)
            if item_match:
                docs.append(clean_text(item_match.group(1)))
            elif len(line_strip) > 3 and len(line_strip) < 150:
                docs.append(clean_text(line_strip))
    return docs

HEADER_PATTERNS = [
    r's\.?\s*no', r'serial', r'consignee', r'officer', r'address', r'delivery',
    r's\.?n\b', r'reporting', r'quantity', r'officer'
]
SNO_PATTERN = r'^\s*[^\w]*(\d{1,3})(?:[.)]|\s+[A-Z][a-z]+)'
OFFICER_NAME_PATTERN = r'\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b'

def parse_consignee_row(row_lines, fallback_sno):
    if not row_lines:
        return None
    first_line_idx = 0
    sNo = fallback_sno
    for i, line in enumerate(row_lines):
        m = re.match(SNO_PATTERN, line)
        if m:
            sNo = int(m.group(1))
            first_line_idx = i
            break
            
    first_line = row_lines[first_line_idx]
    quantity = None
    delivery_days = None
    remaining_first_line = first_line
    
    trailing_match = re.search(r'\s+(\d+)\s+(\d+)\s*$', first_line)
    if trailing_match:
        quantity = parse_number(trailing_match.group(1))
        delivery_days = parse_days(trailing_match.group(2))
        remaining_first_line = first_line[:trailing_match.start()].strip()
    else:
        single_trailing_match = re.search(r'\s+(\d+)\s*$', first_line)
        if single_trailing_match:
            quantity = parse_number(single_trailing_match.group(1))
            remaining_first_line = first_line[:single_trailing_match.start()].strip()
            
    m_sno = re.match(SNO_PATTERN, remaining_first_line)
    if m_sno:
        sno_str = m_sno.group(1)
        sno_end_idx = remaining_first_line.find(sno_str) + len(sno_str)
        remaining_first_line = remaining_first_line[sno_end_idx:].strip()
        
    m_name = re.search(OFFICER_NAME_PATTERN, remaining_first_line)
    reporting_officer = None
    address_first_line = remaining_first_line
    if m_name:
        reporting_officer = m_name.group(1)
        name_end_idx = remaining_first_line.find(reporting_officer) + len(reporting_officer)
        address_first_line = remaining_first_line[name_end_idx:].strip()
        
    prepended = [l.strip() for l in row_lines[:first_line_idx]]
    appended = [l.strip() for l in row_lines[first_line_idx+1:]]
    
    parts = prepended + [address_first_line] + appended
    filtered_parts = []
    for p in parts:
        p_clean = p.strip()
        if p_clean and not any(re.search(hp, p_clean, re.IGNORECASE) for hp in HEADER_PATTERNS):
            filtered_parts.append(p_clean)
            
    address = ", ".join(filtered_parts).strip()
    address = re.sub(r'^[,/\s\-#]+|[,/\s\-#]+$', '', address)
    address = re.sub(r',\s*,', ',', address).strip()
    
    return {
        "sNo": sNo,
        "reportingOfficer": clean_text(reporting_officer) if reporting_officer else None,
        "address": clean_text(address) if address else None,
        "quantity": quantity,
        "deliveryDays": delivery_days
    }

def split_into_consignee_rows(lines):
    rows = []
    current_row = None
    for line in lines:
        m = re.match(SNO_PATTERN, line)
        if m:
            if current_row:
                rows.append(current_row)
            current_row = [line]
        elif current_row:
            current_row.append(line)
    if current_row:
        rows.append(current_row)
    return rows

def parse_consignees(sections):
    text = sections.get('CONSIGNEE_DETAILS') or ''
    if not text:
        return []
    lines = [l for l in text.split('\n') if l.strip()]
    sno_matches = [re.match(SNO_PATTERN, l) for l in lines]
    sno_matches = [m for m in sno_matches if m]
    if len(sno_matches) <= 1:
        row = parse_consignee_row(lines, 1)
        return [row] if row else []
    rows = split_into_consignee_rows(lines)
    return [parse_consignee_row(row_lines, idx + 1) for idx, row_lines in enumerate(rows) if row_lines]

ATC_CATEGORY_KEYWORDS = {
    'Warranty': ['warrant', 'guarantee', 'defect', 'replacement', 'repair', 'liability period'],
    'Packing': ['pack', 'packaging', 'container', 'carton', 'label', 'marking'],
    'Sample Clause': ['sample', 'proto', 'pre-dispatch', 'inspection sample'],
    'Certificates': ['certificate', 'certifi', 'test report', 'type test', 'bis', 'iso', 'bureau'],
    'Inspection': ['inspect', 'quality check', 'acceptance test', 'qa', 'qc', 'third party'],
    'Service Support': ['service', 'after sale', 'amc', 'maintenance', 'support center', 'helpdesk'],
    'Installation': ['install', 'commission', 'erect', 'set up', 'site'],
    'Testing': ['testing', 'performance test', 'factory test', 'fat', 'sat'],
    'Payment': ['payment', 'invoice', 'billing', 'advance', 'milestone', 'lc', 'letter of credit'],
    'Delivery': ['deliver', 'dispatch', 'transit', 'freight', 'consignment', 'shipment'],
    'OEM': ['oem', 'original equipment', 'manufacturer', 'authoriz'],
    'Financial': ['financial', 'turnover', 'net worth', 'bank guarantee', 'bg', 'sd ', 'security deposit'],
    'Eligibility': ['eligible', 'qualification', 'experience', 'credential', 'empanel'],
    'Technical': ['technical', 'specification', 'drawing', 'standard', 'compliance', 'make'],
    'Experience': ['experience', 'past performance', 'similar work', 'completion certificate'],
    'Generic': ['general', 'applicable', 'terms and condition', 'as per gem']
}

def split_clauses(text):
    lines = text.split('\n')
    clauses = []
    current = None
    CLAUSE_START = r'^(\d{1,2})[.)]\s+(.+)'
    for line in lines:
        trimmed = line.strip()
        if not trimmed:
            continue
        if re.match(r'^Buyer\s+Added\s+Bid', trimmed, re.IGNORECASE):
            continue
        match = re.match(CLAUSE_START, trimmed)
        if match:
            if current:
                clauses.append(current)
            current = {"rawNumber": int(match.group(1)), "rawText": match.group(2)}
        elif current:
            current["rawText"] += " " + trimmed
    if current:
        clauses.append(current)
    return clauses

def categorize_clause(raw_clause, fallback_number):
    raw_number = raw_clause.get("rawNumber")
    raw_text = raw_clause.get("rawText")
    full_text = clean_text(raw_text)
    lower = full_text.lower()
    category = 'Other'
    for cat, keywords in ATC_CATEGORY_KEYWORDS.items():
        if any(kw.lower() in lower for kw in keywords):
            category = cat
            break
    first_sentence = full_text.split('.')[0].strip()
    if len(first_sentence) > 5:
        summary = first_sentence[:120] + ('…' if len(first_sentence) > 120 else '')
    else:
        summary = full_text[:120]
    return {
        "number": raw_number if raw_number is not None else fallback_number,
        "category": category,
        "summary": summary,
        "fullText": full_text
    }

def parse_atc(sections):
    text = sections.get('BUYER_ATC') or ''
    if not text:
        return []
    clauses = split_clauses(text)
    return [categorize_clause(c, idx + 1) for idx, c in enumerate(clauses)]

DOC_TYPES = ['ATC', 'Specification', 'Drawing', 'BOQ', 'Annexure', 'Compliance']

def classify_doc_type(text):
    lower = text.lower()
    if 'atc' in lower or 'terms' in lower: return 'ATC'
    if 'spec' in lower or 'technical' in lower: return 'Specification'
    if 'draw' in lower or 'dwg' in lower: return 'Drawing'
    if 'boq' in lower or 'bill of quantity' in lower: return 'BOQ'
    if 'annex' in lower: return 'Annexure'
    if 'compliance' in lower: return 'Compliance'
    return 'Other'

def parse_uploaded_docs(sections):
    text = sections.get('UPLOADED_DOCS') or ''
    if not text:
        return []
    lines = [l for l in text.split('\n') if l.strip()]
    docs = []
    current_doc = None
    for line in lines:
        trimmed = line.strip()
        if re.match(r'^Buyer\s+Uploaded', trimmed, re.IGNORECASE):
            continue
        name_match = re.match(r'(?:Document\s+Name|File\s+Name)[:\-]?\s*(.+)', trimmed, re.IGNORECASE)
        type_match = re.match(r'(?:Document\s+Type|Type)[:\-]?\s*(.+)', trimmed, re.IGNORECASE)
        url_match = re.search(r'(https?://\S+)', trimmed, re.IGNORECASE)
        file_line_match = re.match(r'^(.+\.(?:pdf|doc[x]?|xlsx?|zip|rar))\s*$', trimmed, re.IGNORECASE)
        
        if name_match:
            if current_doc:
                docs.append(current_doc)
            current_doc = {"name": clean_text(name_match.group(1)), "type": "Other", "url": None}
        elif file_line_match and not current_doc:
            current_doc = {"name": clean_text(file_line_match.group(1)), "type": classify_doc_type(file_line_match.group(1)), "url": None}
        elif type_match and current_doc:
            current_doc["type"] = classify_doc_type(type_match.group(1))
        elif url_match and current_doc:
            current_doc["url"] = url_match.group(1)
        elif len(trimmed) > 5 and len(trimmed) < 200 and not current_doc:
            if re.search(r'\.(pdf|doc|xlsx|zip)', trimmed, re.IGNORECASE) or any(t.upper() in trimmed.upper() for t in DOC_TYPES):
                docs.append({"name": clean_text(trimmed), "type": classify_doc_type(trimmed), "url": None})
    if current_doc:
        docs.append(current_doc)
    return [{"name": d["name"], "type": d.get("type") or classify_doc_type(d.get("name") or ""), "url": d.get("url")} for d in docs]

def extract_financial_criteria(sections):
    text = sections.get('FINANCIAL_CRITERIA') or ''
    if text:
        lines = [l for l in text.split('\n') if l.strip()]
        body_lines = lines[1:]
        if body_lines:
            return clean_text(" ".join(body_lines))[:500]
    elig_text = sections.get('ELIGIBILITY_CRITERIA') or ''
    match = re.search(r'Financial\s+Criteria[:\-]?\s*(.{10,300})', elig_text, re.IGNORECASE | re.DOTALL)
    return clean_text(match.group(1))[:500] if match else None

def extract_technical_criteria(sections):
    elig_text = sections.get('ELIGIBILITY_CRITERIA') or ''
    match = re.search(r'Technical\s+(?:Criteria|Specification)[:\-]?\s*(.{10,300})', elig_text, re.IGNORECASE | re.DOTALL)
    return clean_text(match.group(1))[:500] if match else None

def parse_eligibility(sections, field_results):
    eligibility = {
        "minAnnualTurnover": field_results.get("minAnnualTurnover"),
        "oemAverageTurnover": field_results.get("oemAverageTurnover"),
        "yearsOfExperience": field_results.get("yearsOfExperience"),
        "mseExemption": field_results.get("mseExemption"),
        "startupExemption": field_results.get("startupExemption"),
        "msePurchasePreference": field_results.get("msePurchasePreference"),
        "miiPurchasePreference": field_results.get("miiPurchasePreference"),
        "technicalClarificationDays": field_results.get("technicalClarificationDays"),
        "inspectionRequired": field_results.get("inspectionRequired"),
        "pastPerformancePct": field_results.get("pastPerformancePct"),
        "evaluationMethod": field_results.get("evaluationMethod"),
        "arbitrationClause": field_results.get("arbitrationClause"),
        "mediationClause": field_results.get("mediationClause"),
        "typeOfBid": field_results.get("typeOfBid"),
        "documentsRequired": extract_documents_required(sections)
    }
    eligibility["financialCriteria"] = extract_financial_criteria(sections)
    eligibility["technicalCriteria"] = extract_technical_criteria(sections)
    return eligibility

# ─────────────────────────────────────────────────────────────────────────────
# Location Resolution & Rule-based Analysis Engine
# ─────────────────────────────────────────────────────────────────────────────

CG_CITIES = [
    'Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh', 'Rajnandgaon',
    'Bastar', 'Surguja', 'Dhamtari', 'Mahasamund', 'Kanker', 'Kondagaon',
    'Dantewada', 'Sukma', 'Bijapur', 'Narayanpur', 'Kabirdham', 'Mungeli',
    'Janjgir-Champa', 'Korea', 'Surajpur', 'Balrampur', 'Jashpur',
    'Gariaband', 'Balod', 'Baloda Bazar', 'Bemetara', 'Mohla-Manpur',
    'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
    'Manendragarh-Chirmiri-Bharatpur', 'Sakti', 'Gaurela-Pendra-Marwahi',
]

CITY_ALIASES = {
    'koriya': 'Korea',
    'kawardha': 'Kabirdham',
    'jagdalpur': 'Bastar',
    'ambikapur': 'Surguja',
    'mcb': 'Manendragarh-Chirmiri-Bharatpur',
    'gpm': 'Gaurela-Pendra-Marwahi',
    'kkc': 'Khairagarh-Chhuikhadan-Gandai',
    'khairagarh': 'Khairagarh-Chhuikhadan-Gandai',
    'sarangarh': 'Sarangarh-Bilaigarh',
    'baloda bazar-bhatapara': 'Baloda Bazar',
    'bhatapara': 'Baloda Bazar',
    'janjgir': 'Janjgir-Champa',
    'champa': 'Janjgir-Champa',
}

_KOREA_CONTEXT_RE = re.compile(
    r'\b(south\s+korea|korean|made\s+in\s+korea|origin\s*:?\s*korea|import\w*\s+from\s+korea)\b',
    re.IGNORECASE
)

# Precompile city/alias lookup patterns once (was: sort + re.escape + re.search
# freshly on every single tender during extraction)
_SORTED_CITY_PATTERNS = [
    (city, re.compile(r'\b' + re.escape(city) + r'\b', re.IGNORECASE))
    for city in sorted(CG_CITIES, key=len, reverse=True)
]
_SORTED_ALIAS_PATTERNS = [
    (alias, CITY_ALIASES[alias], re.compile(r'\b' + re.escape(alias) + r'\b', re.IGNORECASE))
    for alias in sorted(CITY_ALIASES.keys(), key=len, reverse=True)
]

INDIAN_STATES_LIST = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman & Nicobar', 'Chandigarh', 'Dadra & Nagar Haveli', 'Daman & Diu',
    'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
]
_SORTED_STATE_PATTERNS = [
    (state, re.compile(r'\b' + re.escape(state) + r'\b', re.IGNORECASE))
    for state in sorted(INDIAN_STATES_LIST, key=len, reverse=True)
]

def resolve_city_by_pin(pin):
    exact_map = {
        '494553': 'Dantewada',
        '494556': 'Dantewada',
        '494226': 'Kondagaon',
        '495689': 'Sakti',
        '495677': 'Korba',
        '493445': 'Dhamtari',
        '493776': 'Dhamtari',
        '493449': 'Mahasamund',
        '493996': 'Gariaband',
        '497229': 'Surajpur',
        '497331': 'Manendragarh-Chirmiri-Bharatpur',
    }
    if pin in exact_map:
        return exact_map[pin]
    p4 = pin[:4]
    p3 = pin[:3]
    prefix4_map = {
        '4910': 'Durg',
        '4913': 'Bemetara',
        '4914': 'Rajnandgaon',
        '4915': 'Balod',
        '4916': 'Rajnandgaon',
        '4931': 'Raipur',
        '4932': 'Raipur',
        '4934': 'Mahasamund',
        '4935': 'Mahasamund',
        '4936': 'Dhamtari',
        '4937': 'Dhamtari',
        '4938': 'Dhamtari',
        '4939': 'Gariaband',
        '4944': 'Dantewada',
        '4945': 'Dantewada',
        '4946': 'Kanker',
        '4947': 'Kanker',
        '4955': 'Janjgir-Champa',
        '4972': 'Surajpur',
        '4973': 'Manendragarh-Chirmiri-Bharatpur',
        '4974': 'Manendragarh-Chirmiri-Bharatpur',
    }
    if p4 in prefix4_map:
        return prefix4_map[p4]
    prefix3_map = {
        '490': 'Durg',
        '492': 'Raipur',
        '493': 'Raipur',
        '494': 'Bastar',
        '495': 'Bilaspur',
        '496': 'Raigarh',
        '497': 'Surguja',
    }
    return prefix3_map.get(p3)

def resolve_city_for_gem(location_text):
    if not location_text:
        return 'Unspecified'
    pin_match = re.search(r'\b(49\d{4})\b', location_text)
    if pin_match:
        resolved = resolve_city_by_pin(pin_match.group(1))
        if resolved:
            return resolved
    text = location_text.lower()
    for city, pattern in _SORTED_CITY_PATTERNS:
        if city.lower() == 'korea':
            if _KOREA_CONTEXT_RE.search(text):
                continue
        if pattern.search(text):
            return city
            
    for alias, city, pattern in _SORTED_ALIAS_PATTERNS:
        if alias == 'koriya':
            if _KOREA_CONTEXT_RE.search(text):
                continue
        if pattern.search(text):
            return city
            
    return 'Unspecified'

ANALYSIS_CATEGORY_KEYWORDS = {
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

def match_keyword(lower_text, kw):
    if len(kw) <= 3 or '.' in kw or ' ' in kw:
        escaped = re.escape(kw)
        return bool(re.search(r'\b' + escaped + r'\b', lower_text, re.IGNORECASE))
    return kw in lower_text

def categorize(title):
    lower = (title or '').lower()
    matched = []
    for category, keywords in ANALYSIS_CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if match_keyword(lower, kw):
                matched.append(category)
                break
    return matched if matched else ['General']

def score_viability(tender):
    score = 6
    cost = tender.get('bidValue')
    emd = tender.get('emdAmount')
    closing_date = tender.get('endDate')
    if cost is not None:
        if cost <= 5000000: score += 2
        elif cost <= 20000000: score += 1
        else: score -= 1
    if emd is not None and cost is not None and cost > 0:
        ratio = emd / cost
        if ratio > 0.05: score -= 1
        if ratio <= 0.02: score += 1
    if closing_date:
        try:
            close_dt = closing_date
            if close_dt.tzinfo is not None:
                close_dt = close_dt.replace(tzinfo=None)
            days_left = (close_dt - datetime.now().replace(tzinfo=None)).days
            if days_left < 0: score -= 2
            elif days_left <= 3: score -= 1
            elif days_left >= 14: score += 1
        except Exception:
            pass
    meta = tender.get('sourceMeta') or {}
    if meta.get('isEbidding'):
        score += 1
    return max(1, min(10, score))

def identify_risks(tender):
    risks = []
    cost = tender.get('bidValue')
    emd = tender.get('emdAmount')
    scope = (tender.get('title') or '').lower()
    closing_date = tender.get('endDate')
    if closing_date:
        try:
            close_dt = closing_date
            if close_dt.tzinfo is not None:
                close_dt = close_dt.replace(tzinfo=None)
            days_left = (close_dt - datetime.now().replace(tzinfo=None)).days
            if days_left < 0: risks.append('Tender expired')
            elif days_left <= 2: risks.append('Closing in < 48 hours')
            elif days_left <= 5: risks.append('Short submission window')
        except Exception:
            pass
    if emd is not None and cost is not None and cost > 0 and emd / cost > 0.05:
        risks.append('High EMD relative to value')
    if emd is not None and emd > 500000:
        risks.append('EMD exceeds ₹5 lakh')
    if cost is not None and cost > 50000000:
        risks.append('Large-scale project (₹5 Cr+)')
    if 'specialized' in scope or 'specialised' in scope:
        risks.append('Specialised work required')
    if 'turnkey' in scope or 'epc' in scope:
        risks.append('EPC/Turnkey complexity')
    if 'hazardous' in scope or 'chemical' in scope:
        risks.append('Hazardous materials involved')
    return risks[:4]

def analyze_tender(tender):
    return {
        "category": categorize(tender.get('title')),
        "viabilityScore": score_viability(tender),
        "risks": identify_risks(tender)
    }

def resolve_exemption_flag(val):
    if val is True or val is False:
        return val
    if val is None:
        return None
    s = str(val).lower().strip()
    if s.startswith('yes') or s == 'applicable' or s.startswith('exempt'):
        return True
    if s == 'no' or s == 'not specified' or s == 'not applicable' or s == 'na':
        return False
    return None

def resolve_years_zero(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return val == 0
    if isinstance(val, str):
        s = val.lower().strip()
        if s in ('not specified', 'not required', 'nil', 'no', '0', 'exempt') or '0 year' in s:
            return True
        m = re.search(r'(\d+)', s)
        if m:
            return int(m.group(1)) == 0
    return None

# ─────────────────────────────────────────────────────────────────────────────
# PDF Parser Entry point
# ─────────────────────────────────────────────────────────────────────────────

def extract_pdf_text_and_tables(pdf_path):
    raw_text_parts = []
    table_rows = []
    all_tables = []
    is_scanned = False
    
    try:
        debug_log(f"Opening PDF for reading with pdfplumber: {pdf_path}")
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            pages_to_read = pdf.pages[:4]
            debug_log(f"PDF loaded successfully. Total pages: {total_pages}. Extracting first {len(pages_to_read)} pages...")
            
            for idx, page in enumerate(pages_to_read):
                # 1. Extract text
                t = page.extract_text()
                if t:
                    raw_text_parts.append(t)
                    
                # 2. Extract tables
                tables = page.extract_tables()
                page_rows_count = 0
                for table in tables:
                    if not table:
                        continue
                    all_tables.append(table)
                    for row in table:
                        if not row:
                            continue
                        if len(row) >= 2:
                            col0 = row[0]
                            col1 = row[1]
                            if col0 is not None or col1 is not None:
                                col0_str = clean_text(col0)
                                col1_str = clean_text(col1)
                                table_rows.append((col0_str, col1_str))
                                page_rows_count += 1
                        elif len(row) == 1:
                            col0_str = clean_text(row[0])
                            table_rows.append((col0_str, ""))
                            page_rows_count += 1
                            
                debug_log(f"  [page {idx+1}] extracted {len(t) if t else 0} chars, {len(tables)} tables ({page_rows_count} rows)")
                
        raw_text = "\n".join(raw_text_parts)
        if len(raw_text.strip()) < 100:
            is_scanned = True
            
        return raw_text, table_rows, all_tables, is_scanned
    except Exception as e:
        log_error(f"PDF extraction failed for {pdf_path}: {e}")
        return "", [], [], True

def extract_gem_pdf(pdf_path):
    raw_text, table_rows, all_tables, is_scanned = extract_pdf_text_and_tables(pdf_path)
    if is_scanned or not raw_text or len(raw_text.strip()) < 100:
        return {
            "bidValue": None,
            "emdAmount": None,
            "status": "scanned",
            "extractedText": None,
            "aiExtract": None,
            "warnings": ["Scanned or empty PDF — extraction skipped"]
        }
        
    normalized = normalize_pdf_text(raw_text)
    debug_log(f"Normalized text size: {len(normalized)} chars")
    sections = split_sections(normalized)
    debug_log(f"Split PDF into sections: {list(sections.keys())}")
    
    fields = extract_fields(sections, table_rows)
    
    # Plausibility sanity check for bidStartDate (Bug 3)
    start_dt = fields.get("bidStartDate")
    end_dt = fields.get("bidEndDate")
    if start_dt and isinstance(start_dt, datetime) and end_dt and isinstance(end_dt, datetime):
        if (end_dt - start_dt).days > 730 or (end_dt - start_dt).days < 0:
            debug_log(f"[warning] Plausibility check failed: start={start_dt.strftime('%Y-%m-%d')}, end={end_dt.strftime('%Y-%m-%d')}. Setting start date to None.")
            fields["bidStartDate"] = None
            
    debug_log(f"Extracted fields: bidNumber={fields.get('bidNumber')}, bidValue={fields.get('bidValue')}, emdAmount={fields.get('emdAmount')}, itemCategory={fields.get('itemCategory')}")
    
    consignees = extract_consignees_from_all_tables(all_tables)
    if not consignees:
        consignees = parse_consignees(sections)
    debug_log(f"Parsed {len(consignees)} consignees")
    
    eligibility = parse_eligibility(sections, fields)
    debug_log(f"Parsed eligibility criteria. MSE Exemption: {eligibility.get('mseExemption')}, Startup Exemption: {eligibility.get('startupExemption')}")
    
    atc = parse_atc(sections)
    debug_log(f"Parsed {len(atc)} buyer added ATC clauses")
    
    uploaded_docs = parse_uploaded_docs(sections)
    debug_log(f"Parsed {len(uploaded_docs)} uploaded ATC documents")
    
    ai_extract = {
        "bidNumber": fields.get("bidNumber"),
        "ministry": fields.get("ministry"),
        "department": fields.get("department"),
        "organisation": fields.get("organisation"),
        "office": fields.get("office"),
        "bidStartDate": fields.get("bidStartDate").isoformat() if isinstance(fields.get("bidStartDate"), datetime) else fields.get("bidStartDate"),
        "bidEndDate": fields.get("bidEndDate").isoformat() if isinstance(fields.get("bidEndDate"), datetime) else fields.get("bidEndDate"),
        "bidOpeningDate": fields.get("bidOpeningDate").isoformat() if isinstance(fields.get("bidOpeningDate"), datetime) else fields.get("bidOpeningDate"),
        "bidType": fields.get("bidType"),
        "bidToRA": fields.get("bidToRA"),
        "bidOfferValidityDays": fields.get("bidOfferValidityDays"),
        "epbgRequired": fields.get("epbgRequired"),
        "bidValue": fields.get("bidValue"),
        "emdAmount": fields.get("emdAmount"),
        "itemCategory": fields.get("itemCategory"),
        "quantity": fields.get("quantity"),
        "totalQuantity": fields.get("totalQuantity"),
        "deliveryDays": fields.get("deliveryDays"),
        "primaryProductCategory": fields.get("primaryProductCategory"),
        "eligibility": eligibility,
        "consignees": consignees,
        "atc": atc,
        "uploadedDocuments": uploaded_docs,
        "_extractionMethod": "pdfplumber_python",
        "_isScanned": False,
        "extractedAt": datetime.now().isoformat()
    }
    
    # Exclude datetime types from nested fields for JSON serialization
    for k, v in ai_extract["eligibility"].items():
        if isinstance(v, datetime):
            ai_extract["eligibility"][k] = v.isoformat()
            
    status = "extracted" if (ai_extract["bidValue"] is not None or ai_extract["emdAmount"] is not None) else "not_found"
    excerpt = re.sub(r'\s+', ' ', normalized).strip()[:4000]
    
    return {
        "bidValue": ai_extract["bidValue"],
        "emdAmount": ai_extract["emdAmount"],
        "status": status,
        "extractedText": excerpt,
        "aiExtract": ai_extract,
        "warnings": []
    }

def compute_tender_extraction(tender):
    """
    Pure CPU-bound extraction step: reads the local PDF, parses it, and
    returns the Mongo update_data dict. Does NOT touch the database, so it
    is safe to run inside a ProcessPoolExecutor worker (pymongo
    client/collection objects cannot be pickled across process boundaries).
    Returns (bid_number, tender_id, update_data) on success, or None if
    there was nothing to extract.
    """
    pdf_path = tender.get("pdfPath")
    if not pdf_path:
        return None
        
    full_pdf_path = os.path.join(backend_dir, pdf_path)
    if not os.path.exists(full_pdf_path):
        return None
        
    start_time = time.time()
    debug_log(f"Extracting details from local PDF: {full_pdf_path}")
    result = extract_gem_pdf(full_pdf_path)
    
    # ── State Resolution from PDF ─────────────────────────────────────────────
    updated_state = tender.get("locationState") or 'Unspecified'
    consignees = result["aiExtract"].get("consignees") if result["aiExtract"] else None
    address_text = consignees[0].get("address", "") if (consignees and len(consignees) > 0) else ""
    full_text = result["extractedText"] or ""
    
    ministry = result["aiExtract"].get("ministry") or ""
    department = result["aiExtract"].get("department") or ""
    haystack = f"{address_text} {ministry} {department} {full_text}"
    
    if not updated_state or updated_state == 'Unspecified':
        for state, pattern in _SORTED_STATE_PATTERNS:
            if pattern.search(haystack):
                updated_state = state
                debug_log(f"Resolved state from PDF: {updated_state}")
                break
                
    # ── City Resolution from PDF ──────────────────────────────────────────────
    updated_city = tender.get("locationCity")
    if not updated_city or updated_city == 'Unspecified':
        resolved = resolve_city_for_gem(f"{address_text} {full_text}")
        if resolved and resolved != 'Unspecified':
            updated_city = resolved
            debug_log(f"Resolved city from PDF: {updated_city}")
            
    # ── Move PDF to State Folder if State is Resolved ─────────────────────────
    if updated_state and updated_state != 'Unspecified' and pdf_path:
        old_full_path = os.path.join(backend_dir, pdf_path)
        if os.path.exists(old_full_path):
            state_dir_name = updated_state.upper().replace(" ", "_")
            new_state_dir = os.path.join(documents_dir, "GEM", state_dir_name)
            os.makedirs(new_state_dir, exist_ok=True)
            new_filename = f"GEM-{sanitize_filename(tender['bidNumber'])}.pdf"
            new_full_path = os.path.join(new_state_dir, new_filename)
            if os.path.normpath(old_full_path) != os.path.normpath(new_full_path):
                try:
                    os.rename(old_full_path, new_full_path)
                    pdf_path = os.path.relpath(new_full_path, start=backend_dir)
                    debug_log(f"Moved PDF file to state folder: {pdf_path}")
                except Exception as e:
                    log_error(f"Failed to rename/move PDF for {tender['bidNumber']}: {e}")
                    
    source_meta = tender.get("sourceMeta") or {}
    source_meta["pdfExtract"] = {
        "text": result["extractedText"]
    }
    source_meta["aiExtract"] = result["aiExtract"]
    if updated_state and updated_state != 'Unspecified':
        source_meta["fetchedState"] = updated_state
        
    temp_tender = dict(tender)
    temp_tender["bidValue"] = result["bidValue"]
    temp_tender["emdAmount"] = result["emdAmount"]
    reanalyzed = analyze_tender(temp_tender)
    
    elig = result["aiExtract"].get("eligibility") if result["aiExtract"] else {}
    mse_flag = resolve_exemption_flag(elig.get("mseExemption"))
    startup_flag = resolve_exemption_flag(elig.get("startupExemption"))
    years_zero = resolve_years_zero(elig.get("yearsOfExperience"))
    
    update_data = {
        "pdfPath": pdf_path,
        "bidValue": result["bidValue"],
        "emdAmount": result["emdAmount"],
        "valueExtractionStatus": result["status"],
        "locationState": updated_state,
        "locationCity": updated_city,
        "viabilityScore": reanalyzed["viabilityScore"],
        "risks": reanalyzed["risks"],
        "sourceMeta": source_meta
    }
    
    if mse_flag is not None:
        update_data["mseExemption"] = mse_flag
    if startup_flag is not None:
        update_data["startupExemption"] = startup_flag
    if years_zero is not None:
        update_data["yearsOfExperienceZero"] = years_zero
        
    elapsed = time.time() - start_time
    debug_log(f"Extracted {tender['bidNumber']} in {elapsed:.2f}s: bidValue={result['bidValue']}, emdAmount={result['emdAmount']}")
    return (tender['bidNumber'], tender["_id"], update_data)

def process_tender_extraction(tender, tenders_col):
    """Single-process convenience wrapper: extract + write to DB immediately."""
    computed = compute_tender_extraction(tender)
    if not computed:
        return False
    _bid_number, tender_id, update_data = computed
    tenders_col.update_one(
        {"_id": tender_id},
        {"$set": update_data}
    )
    return True

# ─────────────────────────────────────────────────────────────────────────────
# Downloader Functions
# ─────────────────────────────────────────────────────────────────────────────

def sanitize_filename(filename):
    return re.sub(r'[^a-zA-Z0-9_-]', '_', filename)[:120]

# Shared session + connection pool for PDF downloads. requests.get() creates a
# brand-new Session (and therefore a brand-new TCP/TLS connection) on every
# single call, which is very slow when downloading hundreds of PDFs from the
# same host. A shared, pool-sized Session reuses keep-alive connections across
# the ThreadPoolExecutor workers instead. requests.Session is safe to share
# across threads for simple get()/post() usage like this.
_DOWNLOAD_POOL_SIZE = 32
_download_session = requests.Session()
_download_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/pdf,*/*',
    'Referer': 'https://bidplus.gem.gov.in/advance-search',
})
_download_adapter = requests.adapters.HTTPAdapter(
    pool_connections=_DOWNLOAD_POOL_SIZE,
    pool_maxsize=_DOWNLOAD_POOL_SIZE,
    max_retries=2
)
_download_session.mount('https://', _download_adapter)
_download_session.mount('http://', _download_adapter)

def download_gem_pdf(tender, documents_dir):
    meta = tender.get("sourceMeta") or {}
    gem_id = meta.get("gemId")
    if not gem_id:
        return None, "no gemId on tender"
        
    state_name = (tender.get("locationState") or "UNKNOWN").upper().replace(" ", "_")
    state_dir = os.path.join(documents_dir, "GEM", state_name)
    os.makedirs(state_dir, exist_ok=True)
    
    filename = f"GEM-{sanitize_filename(tender['bidNumber'])}.pdf"
    file_path = os.path.join(state_dir, filename)
    
    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
        return file_path, None
        
    pdf_url = f"https://bidplus.gem.gov.in/showbidDocument/{gem_id}"
    
    try:
        response = _download_session.get(pdf_url, timeout=30)
        if response.status_code == 200 and 'pdf' in response.headers.get('content-type', '').lower():
            with open(file_path, 'wb') as f:
                f.write(response.content)
            debug_log(f"Downloaded GeM PDF: {file_path}")
            return file_path, None
        else:
            return None, f"HTTP {response.status_code}"
    except Exception as e:
        return None, str(e)

def process_single_tender_download(tender, documents_dir, tenders_col):
    source = tender.get("source")
    bid_number = tender.get("bidNumber")
    
    # 1. Resolve potential local path
    pdf_path = tender.get("pdfPath")
    if pdf_path:
        full_local_path = os.path.join(backend_dir, pdf_path)
    else:
        # Generate expected path
        state_name = (tender.get("locationState") or "UNKNOWN").upper().replace(" ", "_")
        state_dir = os.path.join(documents_dir, "GEM", state_name)
        filename = f"GEM-{sanitize_filename(bid_number)}.pdf"
        full_local_path = os.path.join(state_dir, filename)
        
    # Check if file exists and has valid size
    if os.path.exists(full_local_path) and os.path.getsize(full_local_path) > 1000:
        return True, None # Skipped downloading since it's already here
        
    # 2. File does not exist locally. Download it.
    local_path, fail_reason = None, "unsupported source"
    if source == 'GEM':
        local_path, fail_reason = download_gem_pdf(tender, documents_dir)
        
    if local_path:
        rel_path = os.path.relpath(local_path, start=backend_dir)
        tenders_col.update_one(
            {"_id": tender["_id"]},
            {
                "$set": {
                    "pdfPath": rel_path,
                    "valueExtractionStatus": "not_attempted"
                }
            }
        )
        return True, None
    else:
        tenders_col.update_one(
            {"_id": tender["_id"]},
            {"$set": {"valueExtractionStatus": "failed_download"}}
        )
        return False, fail_reason

def title_case(s):
    if not s:
        return s
    return " ".join(w.capitalize() for w in s.split())

def clean_title(title, category):
    if not title:
        return 'Custom Bid / BOQ'
    is_numeric_garbage = bool(re.match(r'^[\d,\s]+(\.\.\.)?$', title)) and (',' in title or len(title.strip()) > 10)
    if is_numeric_garbage:
        cat = (category or '').lower()
        if 'services' in cat:
            return 'Custom Bid for Services'
        elif 'boq' in cat:
            return 'BOQ Bid for Goods'
        else:
            return 'Custom / BOQ Bid'
    return title

def arr(v):
    if isinstance(v, list):
        return v[0] if len(v) > 0 else None
    return v

def normalize_gem(doc):
    bid_number = arr(doc.get("b_bid_number"))
    if not bid_number:
        return None
        
    category = arr(doc.get("b_cat_id")) or 'General'
    raw_title = arr(doc.get("bd_category_name")) or arr(doc.get("b_category_name")) or bid_number
    title = clean_title(raw_title, category)
    
    start_date_str = arr(doc.get("final_start_date_sort"))
    end_date_str = arr(doc.get("final_end_date_sort"))
    
    start_date = None
    if start_date_str:
        try:
            start_date = date_parser.parse(start_date_str) if date_parser else datetime.strptime(start_date_str[:19], "%Y-%m-%dT%H:%M:%S")
        except Exception:
            pass
            
    end_date = None
    if end_date_str:
        try:
            end_date = date_parser.parse(end_date_str) if date_parser else datetime.strptime(end_date_str[:19], "%Y-%m-%dT%H:%M:%S")
        except Exception:
            pass
            
    status = arr(doc.get("b_status"))
    is_active = status == 1
    
    derived_status = 'open'
    if end_date:
        end_date_naive = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date
        derived_status = 'open' if end_date_naive >= datetime.now() else 'closed'
        
    ministry = arr(doc.get("ba_official_details_minName"))
    department = arr(doc.get("ba_official_details_deptName"))
    bid_type = arr(doc.get("b_bid_type"))
    
    fetched_state = doc.get("fetchedState")
    state_title_case = title_case(fetched_state) if fetched_state else 'Unspecified'
    
    return {
        "source": "GEM",
        "bidNumber": bid_number,
        "title": title[:300] if len(title) > 300 else title,
        "department": department or ministry or None,
        "organization": ministry or None,
        "category": [],
        "locationState": state_title_case,
        "locationCity": "Unspecified",
        "startDate": start_date,
        "endDate": end_date,
        "quantity": str(arr(doc.get("b_total_quantity"))) if arr(doc.get("b_total_quantity")) is not None else None,
        "bidValue": None,
        "emdAmount": None,
        "valueExtractionStatus": "not_attempted",
        "viabilityScore": None,
        "risks": [],
        "pdfPath": None,
        "bidLink": f"https://bidplus.gem.gov.in/showbidDocument/{bid_number}",
        "status": derived_status,
        "fetchedAt": datetime.now(),
        "plantId": None,
        "sourceMeta": {
            "locationTextRaw": arr(doc.get("locationText")) or None,
            "gemId": arr(doc.get("b_id")) or None,
            "fetchedState": state_title_case,
            "gemCity": arr(doc.get("gemCity")) or None,
            "gemDistrict": arr(doc.get("gemDistrict")) or None,
            "gemPincode": arr(doc.get("gemPincode")) or None,
            "isActive": is_active,
            "bidTypeLabel": "Reverse Auction" if bid_type == 2 else "Bid"
        },
        "rawJson": doc
    }

def fetch_page(session, csrf, page_no):
    payload = f'{{"searchType":"all","page":{page_no}}}'
    data = {
        'payload': payload,
        'csrf_bd_gem_nk': csrf
    }
    headers_post = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://bidplus.gem.gov.in/advance-search',
        'Origin': 'https://bidplus.gem.gov.in'
    }
    try:
        r = session.post("https://bidplus.gem.gov.in/search-bids", data=data, headers=headers_post, timeout=25)
        if r.status_code == 200:
            json_data = r.json()
            return json_data.get('response', {}).get('response', {}).get('docs', [])
    except Exception:
        pass
    return []

GEM_STATES = [
    'ANDHRA PRADESH', 'ARUNACHAL PRADESH', 'ASSAM', 'BIHAR', 'CHHATTISGARH',
    'GOA', 'GUJARAT', 'HARYANA', 'HIMACHAL PRADESH', 'JHARKHAND', 'KARNATAKA',
    'KERALA', 'MADHYA PRADESH', 'MAHARASHTRA', 'MANIPUR', 'MEGHALAYA', 'MIZORAM',
    'NAGALAND', 'ODISHA', 'PUNJAB', 'RAJASTHAN', 'SIKKIM', 'TAMIL NADU',
    'TELANGANA', 'TRIPURA', 'UTTAR PRADESH', 'UTTARAKHAND', 'WEST BENGAL',
    'ANDAMAN AND NICOBAR ISLANDS', 'CHANDIGARH', 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
    'DELHI', 'JAMMU AND KASHMIR', 'LADAKH', 'LAKSHADWEEP', 'PUDUCHERRY'
]

def fetch_page_state_full(session, csrf, state_name, page_no):
    payload = f'{{"searchType":"con","state_name_con":"{state_name}","city_name_con":"","bidEndFromCon":"","bidEndToCon":"","page":{page_no}}}'
    data = {
        'payload': payload,
        'csrf_bd_gem_nk': csrf
    }
    headers_post = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://bidplus.gem.gov.in/advance-search',
        'Origin': 'https://bidplus.gem.gov.in'
    }
    try:
        r = session.post("https://bidplus.gem.gov.in/search-bids", data=data, headers=headers_post, timeout=25)
        if r.status_code == 200:
            json_data = r.json()
            solr = json_data.get('response', {}).get('response', {})
            num_found = solr.get('numFound', 0)
            docs = solr.get('docs', [])
            for doc in docs:
                doc['fetchedState'] = state_name
            return num_found, docs
    except Exception:
        pass
    return 0, []

def scrape_gem_listings(tenders_col):
    print("\n[*] Synchronizing GeM portal listings directly from website (Statewise)...")
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })
    try:
        r = session.get("https://bidplus.gem.gov.in/advance-search", timeout=25)
        if r.status_code != 200:
            print(f"[-] Failed to load advance-search: HTTP {r.status_code}")
            return
    except Exception as e:
        print(f"[-] Error loading advance-search: {e}")
        return
        
    csrf = None
    m = re.search(r'id="chash"\s+value="([^"]*)"', r.text)
    if m:
        csrf = m.group(1)
    if not csrf:
        m2 = re.search(r"'csrf_bd_gem_nk'\s*:\s*'([a-f0-9]{16,})'", r.text, re.IGNORECASE)
        if m2:
            csrf = m2.group(1)
    if not csrf:
        m3 = re.search(r'csrf_bd_gem_nk["\']?\s*[=:]\s*["\']([a-f0-9]{16,})["\']', r.text, re.IGNORECASE)
        if m3:
            csrf = m3.group(1)
            
    if not csrf:
        print("[-] Could not find CSRF token on GeM website.")
        return
        
    print(f"[+] CSRF token acquired: {csrf[:8]}...")
    
    all_docs = []
    
    # Query page 1 for all states in parallel to get active counts
    print(f"[*] Querying page 1 for all {len(GEM_STATES)} states to check active counts...")
    state_counts = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        future_to_state = {
            executor.submit(fetch_page_state_full, session, csrf, state, 1): state 
            for state in GEM_STATES
        }
        for future in concurrent.futures.as_completed(future_to_state):
            state = future_to_state[future]
            try:
                num_found, docs = future.result()
                state_counts[state] = num_found
                all_docs.extend(docs)
                print(f"  - {state}: {num_found} active bids found.")
            except Exception as e:
                print(f"  - {state}: failed to query counts: {e}")
                
    # Now queue pages 2-4 for states that have more than 10 bids
    extra_page_tasks = []
    print("\n[*] Fetching remaining pages (up to page 4) for states with > 10 bids...")
    for state, num_found in state_counts.items():
        if num_found > 10:
            pages_to_crawl = min(4, math.ceil(num_found / 10))
            for page_no in range(2, pages_to_crawl + 1):
                extra_page_tasks.append((state, page_no))
                
    if extra_page_tasks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            future_to_task = {
                executor.submit(fetch_page_state_full, session, csrf, state, page_no): (state, page_no)
                for state, page_no in extra_page_tasks
            }
            for future in concurrent.futures.as_completed(future_to_task):
                state, page_no = future_to_task[future]
                try:
                    _, docs = future.result()
                    all_docs.extend(docs)
                except Exception as e:
                    print(f"  [-] Failed to fetch {state} page {page_no}: {e}")
                    
    print(f"\n[+] Scraped {len(all_docs)} raw GeM tender listings across all states.")
    print("[*] Preparing database bulk operations...")
    bulk_ops = []
    for doc in all_docs:
        normalized = normalize_gem(doc)
        if not normalized:
            continue
            
        analyzed = analyze_tender(normalized)
        data = {**normalized, **analyzed}
        
        set_on_insert = {
            "source": data["source"],
            "bidNumber": data["bidNumber"],
            "pdfPath": data["pdfPath"],
            "bidValue": data["bidValue"],
            "emdAmount": data["emdAmount"],
            "valueExtractionStatus": data["valueExtractionStatus"],
            "viabilityScore": data["viabilityScore"],
            "risks": data["risks"],
            "locationState": data["locationState"],
            "locationCity": data["locationCity"],
            "startDate": data["startDate"],
            "fetchedAt": data["fetchedAt"],
            "bidLink": data["bidLink"]
        }
        set_fields = {
            "title": data["title"],
            "endDate": data["endDate"],
            "department": data["department"],
            "organization": data["organization"],
            "status": data["status"],
            "quantity": data["quantity"],
            "sourceMeta": data["sourceMeta"]
        }
        
        op = UpdateOne(
            {"source": "GEM", "bidNumber": data["bidNumber"]},
            {
                "$setOnInsert": set_on_insert,
                "$set": set_fields
            },
            upsert=True
        )
        bulk_ops.append(op)
        
    new_inserts = 0
    updates = 0
    if bulk_ops:
        try:
            print(f"[*] Bulk writing {len(bulk_ops)} operations to MongoDB...")
            bulk_result = tenders_col.bulk_write(bulk_ops, ordered=False)
            new_inserts = bulk_result.upserted_count
            updates = bulk_result.modified_count
        except Exception as e:
            print(f"[-] Bulk database write failed: {e}")
            
    print(f"[+] Website sync complete: {new_inserts} new tenders inserted, {updates} existing tenders updated.")

def scrape_gem_listings_for_state(session, csrf, state_name, tenders_col):
    import math
    num_found, docs = fetch_page_state_full(session, csrf, state_name, 1)
    if num_found == 0:
        log(f"[*] {state_name}: no active bids found.")
        return 0
        
    pages_to_crawl = math.ceil(num_found / 10)
    if pages_to_crawl > 1:
        page_start = time.time()
        page_failures = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=25) as executor:
            future_to_page = {
                executor.submit(fetch_page_state_full, session, csrf, state_name, p): p 
                for p in range(2, pages_to_crawl + 1)
            }
            completed = 0
            for future in concurrent.futures.as_completed(future_to_page):
                completed += 1
                try:
                    _, extra_docs = future.result()
                    docs.extend(extra_docs)
                except Exception:
                    page_failures += 1
                progress(completed, pages_to_crawl - 1, f"Listing pages {state_name}",
                         extra=f"{page_failures} failed" if page_failures else "",
                         start_time=page_start)
        progress_done()
        if page_failures:
            log_error(f"{state_name}: {page_failures} listing page(s) failed to fetch")
                    
    log(f"[+] {state_name}: {num_found} active bids, {len(docs)} listings scraped.")
    
    # Bulk write to DB
    bulk_ops = []
    for doc in docs:
        normalized = normalize_gem(doc)
        if not normalized:
            continue
            
        analyzed = analyze_tender(normalized)
        data = {**normalized, **analyzed}
        
        set_on_insert = {
            "source": data["source"],
            "bidNumber": data["bidNumber"],
            "pdfPath": data["pdfPath"],
            "bidValue": data["bidValue"],
            "emdAmount": data["emdAmount"],
            "valueExtractionStatus": data["valueExtractionStatus"],
            "viabilityScore": data["viabilityScore"],
            "risks": data["risks"],
            "locationState": data["locationState"],
            "locationCity": data["locationCity"],
            "startDate": data["startDate"],
            "fetchedAt": data["fetchedAt"],
            "bidLink": data["bidLink"]
        }
        set_fields = {
            "title": data["title"],
            "endDate": data["endDate"],
            "department": data["department"],
            "organization": data["organization"],
            "status": data["status"],
            "quantity": data["quantity"],
            "sourceMeta": data["sourceMeta"]
        }
        
        op = UpdateOne(
            {"source": "GEM", "bidNumber": data["bidNumber"]},
            {
                "$setOnInsert": set_on_insert,
                "$set": set_fields
            },
            upsert=True
        )
        bulk_ops.append(op)
        
    new_inserts = 0
    updates = 0
    if bulk_ops:
        try:
            bulk_result = tenders_col.bulk_write(bulk_ops, ordered=False)
            new_inserts = bulk_result.upserted_count
            updates = bulk_result.modified_count
        except Exception as e:
            log_error(f"Bulk database write failed for {state_name}: {e}")
            
    log(f"[+] {state_name} sync done: {new_inserts} inserted, {updates} updated.")
    return len(docs)

def acquire_session_and_csrf():
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })
    try:
        r = session.get("https://bidplus.gem.gov.in/advance-search", timeout=25)
        csrf = None
        m = re.search(r'id="chash"\s+value="([^"]*)"', r.text)
        if m: csrf = m.group(1)
        if not csrf:
            m2 = re.search(r"'csrf_bd_gem_nk'\s*:\s*'([a-f0-9]{16,})'", r.text, re.IGNORECASE)
            if m2: csrf = m2.group(1)
        if not csrf:
            m3 = re.search(r'csrf_bd_gem_nk["\']?\s*[=:]\s*["\']([a-f0-9]{16,})["\']', r.text, re.IGNORECASE)
            if m3: csrf = m3.group(1)
        return session, csrf
    except Exception as e:
        log_error(f"Error loading CSRF: {e}")
        return None, None

# ─────────────────────────────────────────────────────────────────────────────
# Main Orchestrator
# ─────────────────────────────────────────────────────────────────────────────

def main():
    import math
    total_start = time.time()
    
    # Configuration: Target state for filtering GeM tenders (None or "All India" for all states)
    # To run a single state, set it here (e.g. 'CHHATTISGARH'). Set to None for All India.
    target_state_filter = None
    
    log("[*] Connecting to MongoDB...")
    client = MongoClient(mongodb_uri)
    db = client.get_database()
    tenders_col = db['Tender']
    
    # Prepare states list
    if target_state_filter:
        states_to_process = [target_state_filter.upper()]
    else:
        states_to_process = list(reversed(GEM_STATES))
        
    log(f"[*] Processing {len(states_to_process)} state(s) sequentially (state-by-state)...")
    
    # One process pool reused across all states for the CPU-bound PDF
    # extraction step (creating a new pool per state would pay process
    # start-up cost repeatedly for no benefit).
    cpu_workers = max(1, os.cpu_count() or 4)
    log(f"[*] Extraction process pool size: {cpu_workers} (based on available CPU cores)")
    extract_executor = concurrent.futures.ProcessPoolExecutor(max_workers=cpu_workers)
    
    for idx, state_name in enumerate(states_to_process):
        state_title = title_case(state_name)
        log(f"\n── STATE {idx+1}/{len(states_to_process)}: {state_title} ──")
        
        # Acquire a fresh session and CSRF token per state to prevent expiration/timeout
        session, csrf = acquire_session_and_csrf()
        if not session or not csrf:
            log_error(f"Skipped {state_title}: could not acquire CSRF token")
            continue
        
        # 1. Scrape listings and sync database for this state
        try:
            scrape_gem_listings_for_state(session, csrf, state_name, tenders_col)
        except Exception as e:
            log_error(f"Scraper failed for {state_title}: {e}")
            
        # 2. Query tenders for this state to download
        query = {
            "source": "GEM",
            "locationState": state_title
        }
        all_tenders = list(tenders_col.find(query))
        
        tenders_to_download = []
        already_downloaded_count = 0
        
        for tender in all_tenders:
            bid_number = tender.get("bidNumber")
            pdf_path = tender.get("pdfPath")
            
            if pdf_path:
                full_local_path = os.path.join(backend_dir, pdf_path)
            else:
                state_dir = os.path.join(documents_dir, "GEM", state_name.upper().replace(" ", "_"))
                filename = f"GEM-{sanitize_filename(bid_number)}.pdf"
                full_local_path = os.path.join(state_dir, filename)
                
            if os.path.exists(full_local_path) and os.path.getsize(full_local_path) > 1000:
                already_downloaded_count += 1
                if not pdf_path:
                    rel_path = os.path.relpath(full_local_path, start=backend_dir)
                    tenders_col.update_one({"_id": tender["_id"]}, {"$set": {"pdfPath": rel_path}})
            else:
                tenders_to_download.append(tender)
                
        total_pending = len(tenders_to_download)
        log(f"[*] {state_title}: {already_downloaded_count}/{len(all_tenders)} PDFs already on disk.")
        
        if total_pending > 0:
            download_start = time.time()
            downloaded_count = 0
            download_failures = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=25) as executor:
                futures = {
                    executor.submit(process_single_tender_download, t, documents_dir, tenders_col): t
                    for t in tenders_to_download
                }
                completed = 0
                for fut in concurrent.futures.as_completed(futures):
                    tender = futures[fut]
                    completed += 1
                    ok, reason = fut.result()
                    if ok:
                        downloaded_count += 1
                    else:
                        download_failures.append((tender.get('bidNumber', '?'), reason or 'unknown error'))
                    progress(completed, total_pending, f"Downloading {state_title}",
                             extra=f"{downloaded_count} ok, {len(download_failures)} failed",
                             start_time=download_start)
            progress_done()
            download_time = time.time() - download_start
            log(f"[+] Downloads for {state_title}: {downloaded_count}/{total_pending} ok in {download_time:.2f}s.")
            print_failure_summary(f"Download failures in {state_title}", download_failures)
        else:
            log(f"[+] All PDFs for {state_title} are already present.")
            
        # 3. Process extraction for this state
        query_extract = {
            "source": "GEM",
            "locationState": state_title,
            "pdfPath": {"$ne": None, "$ne": ""},
            "valueExtractionStatus": "not_attempted"
        }
        tenders_to_extract = list(tenders_col.find(query_extract))
        total_extract = len(tenders_to_extract)
        
        if total_extract > 0:
            extracted_count = 0
            completed_count = 0
            extract_start = time.time()
            pending_ops = []
            extraction_failures = []
            
            def flush_ops():
                if not pending_ops:
                    return
                try:
                    tenders_col.bulk_write(pending_ops, ordered=False)
                except Exception as e:
                    log_error(f"Bulk extraction write failed: {e}")
                pending_ops.clear()
            
            # PDF parsing (pdfplumber + regex-heavy field extraction) is CPU-bound,
            # so a ProcessPoolExecutor gives real parallelism across cores instead
            # of being serialized behind the GIL like ThreadPoolExecutor was.
            # DB writes (I/O) are done back in this main process, batched via
            # bulk_write to cut down on round-trips.
            futures = {
                extract_executor.submit(compute_tender_extraction, t): t
                for t in tenders_to_extract
            }
            for fut in concurrent.futures.as_completed(futures):
                tender = futures[fut]
                completed_count += 1
                try:
                    computed = fut.result()
                    if computed:
                        bid_number, tender_id, update_data = computed
                        pending_ops.append(UpdateOne({"_id": tender_id}, {"$set": update_data}))
                        extracted_count += 1
                        if len(pending_ops) >= 25:
                            flush_ops()
                    else:
                        extraction_failures.append((tender.get('bidNumber', '?'), 'no local PDF found'))
                except Exception as e:
                    extraction_failures.append((tender.get('bidNumber', '?'), str(e)))
                    
                progress(completed_count, total_extract, f"Extracting {state_title}",
                         extra=f"{extracted_count} ok, {len(extraction_failures)} failed",
                         start_time=extract_start)
                    
            flush_ops()
            progress_done()
            extract_time = time.time() - extract_start
            log(f"[+] Extraction for {state_title}: {extracted_count}/{total_extract} ok in {extract_time:.2f}s.")
            print_failure_summary(f"Extraction failures in {state_title}", extraction_failures)
        else:
            log(f"[+] No tenders in {state_title} require details extraction.")
            
    extract_executor.shutdown(wait=True)
    log(f"\n[+] SUCCESS: Completed processing of all states in {time.time() - total_start:.2f}s.")

if __name__ == "__main__":
    main()
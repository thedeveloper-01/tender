"""
app/config.py

Direct port of src/config.js.
Loads environment variables (via python-dotenv) and exposes a single
`config` object plus the CG_CITIES / CITY_ALIASES lookup tables.
"""
import os
from dataclasses import dataclass, field
from typing import Optional, List, Dict

from dotenv import load_dotenv

load_dotenv()

if not os.environ.get("ADMIN_TOKEN"):
    raise RuntimeError("FATAL: ADMIN_TOKEN environment variable is not defined!")


def _bool(name: str, default: str) -> bool:
    return (os.environ.get(name, default)) == "true"


@dataclass
class Config:
    mongo_uri: Optional[str] = os.environ.get("MONGODB_URI")
    fetch_time: str = os.environ.get("FETCH_TIME", "06:00")  # HH:MM, 24h
    pdf_retention_days: int = int(os.environ.get("PDF_RETENTION_DAYS", "2"))
    auto_delete_closed_after_days: int = int(os.environ.get("AUTO_DELETE_CLOSED_AFTER_DAYS", "2"))
    archive_mode: bool = _bool("ARCHIVE_MODE", "true")
    use_mock_gem: bool = _bool("USE_MOCK_GEM", "false")
    admin_token: str = os.environ.get("ADMIN_TOKEN", "admin_dev_token_123")
    site_url: str = os.environ.get("SITE_URL", "https://cgtenders.com/")
    port: int = int(os.environ.get("PORT", "4000"))
    cors_origin: str = os.environ.get("CORS_ORIGIN", "*")
    documents_dir: str = os.environ.get("DOCUMENTS_DIR", "documents")
    skip_cspgcl: bool = _bool("SKIP_CSPGCL", "false")
    skip_gem: bool = _bool("SKIP_GEM", "true")  # GEM scraper removed — always skipped
    skip_scheduler: bool = _bool("SKIP_SCHEDULER", "false")
    proxy_url: Optional[str] = os.environ.get("PROXY_URL") or None
    open_router_api_key: str = os.environ.get("OPENROUTER_API_KEY", "")
    open_router_model: str = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4.1-mini:free")
    ai_extract_enabled: bool = _bool("AI_EXTRACT_ENABLED", "false")


config = Config()

# 33 Chhattisgarh districts. "Unspecified" is used as a fallback bucket
# and is NOT part of this list.
CG_CITIES: List[str] = [
    'Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh', 'Rajnandgaon',
    'Bastar', 'Surguja', 'Dhamtari', 'Mahasamund', 'Kanker', 'Kondagaon',
    'Dantewada', 'Sukma', 'Bijapur', 'Narayanpur', 'Kabirdham', 'Mungeli',
    'Janjgir-Champa', 'Korea', 'Surajpur', 'Balrampur', 'Jashpur',
    'Gariaband', 'Balod', 'Baloda Bazar', 'Bemetara', 'Mohla-Manpur',
    'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
    'Manendragarh-Chirmiri-Bharatpur', 'Sakti', 'Gaurela-Pendra-Marwahi',
]

# Common alias / alternate-name lookups used by the GeM location resolver.
CITY_ALIASES: Dict[str, str] = {
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

# NOTE: config.js configures a global proxy dispatcher for outgoing fetch()
# calls when PROXY_URL is set (via undici ProxyAgent). In Python, the
# equivalent is handled per-client in the modules that make HTTP calls
# (httpx.AsyncClient(proxy=config.proxy_url)) since Python has no global
# HTTP dispatcher to patch.

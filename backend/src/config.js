import dotenv from 'dotenv';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
dotenv.config();

export const config = {
  mongoUri: process.env.MONGODB_URI,
  fetchTime: process.env.FETCH_TIME || '06:00', // HH:MM, 24h
  pdfRetentionDays: Number(process.env.PDF_RETENTION_DAYS || 2),
  autoDeleteClosedAfterDays: Number(process.env.AUTO_DELETE_CLOSED_AFTER_DAYS || 2),
  archiveMode: (process.env.ARCHIVE_MODE ?? 'true') === 'true',
  useMockGem: (process.env.USE_MOCK_GEM ?? 'false') === 'true',
  adminToken: process.env.ADMIN_TOKEN || 'changeme',
  siteUrl: 'https://cgtenders.com/',
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  documentsDir: process.env.DOCUMENTS_DIR || 'documents',
  skipCspgcl: (process.env.SKIP_CSPGCL ?? 'false') === 'true',
  skipGem: (process.env.SKIP_GEM ?? 'false') === 'true',  // set true on Render — GEM is local-only
  skipScheduler: (process.env.SKIP_SCHEDULER ?? 'false') === 'true',
  proxyUrl: process.env.PROXY_URL || null,
};

// 33 Chhattisgarh districts. "Unspecified" is used as a fallback bucket
// and is NOT part of this list.
export const CG_CITIES = [
  'Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh', 'Rajnandgaon',
  'Bastar', 'Surguja', 'Dhamtari', 'Mahasamund', 'Kanker', 'Kondagaon',
  'Dantewada', 'Sukma', 'Bijapur', 'Narayanpur', 'Kabirdham', 'Mungeli',
  'Janjgir-Champa', 'Korea', 'Surajpur', 'Balrampur', 'Jashpur',
  'Gariaband', 'Balod', 'Baloda Bazar', 'Bemetara', 'Mohla-Manpur',
  'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
  'Manendragarh-Chirmiri-Bharatpur', 'Sakti', 'Gaurela-Pendra-Marwahi',
];

// Common alias / alternate-name lookups used by the GeM location resolver.
export const CITY_ALIASES = {
  koriya: 'Korea',
  kawardha: 'Kabirdham',
  jagdalpur: 'Bastar',
  ambikapur: 'Surguja',
  mcb: 'Manendragarh-Chirmiri-Bharatpur',
  gpm: 'Gaurela-Pendra-Marwahi',
  kkc: 'Khairagarh-Chhuikhadan-Gandai',
  khairagarh: 'Khairagarh-Chhuikhadan-Gandai',
  sarangarh: 'Sarangarh-Bilaigarh',
  'baloda bazar-bhatapara': 'Baloda Bazar',
  bhatapara: 'Baloda Bazar',
  janjgir: 'Janjgir-Champa',
  champa: 'Janjgir-Champa',
};

if (config.proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(config.proxyUrl));
  let sanitizedProxy = config.proxyUrl;
  try {
    const url = new URL(config.proxyUrl);
    if (url.password) {
      url.password = '******';
    }
    sanitizedProxy = url.toString();
  } catch (e) {
    // Fallback regex masking if parsing throws
    sanitizedProxy = config.proxyUrl.replace(/\/\/([^:]+):([^@]+)@/, '//hl_user:******@');
  }
  console.log('[proxy] Global HTTP/HTTPS proxy dispatcher configured:', sanitizedProxy);
}


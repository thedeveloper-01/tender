/**
 * scrape.mjs — CGTenders local scraper
 *
 * HOW TO RUN:
 *   Open a terminal in your project root, then:
 *       node scrape.mjs
 *
 * SETUP (one time only):
 *   1. Edit MONGODB_URI below with your real connection string
 *   2. cd backend && npm install
 */

// ══════════════════════════════════════════════
//  CONFIG — edit this section
// ══════════════════════════════════════════════
const MONGODB_URI = 'mongodb+srv://Vasu:9753%40@cluster0.wpm3f1b.mongodb.net/cgtenders?retryWrites=true&w=majority&appName=Cluster0';
const USE_MOCK_GEM  = false;
const SKIP_CSPGCL  = false;
const ARCHIVE_MODE = true;
const AUTO_DELETE_CLOSED_AFTER_DAYS = 2;
// ══════════════════════════════════════════════

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';   // <-- pathToFileURL fixes Windows
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND   = path.join(__dirname, 'backend');

const line = '═'.repeat(48);

function die(msg) {
  console.error('\n❌  ERROR: ' + msg + '\n');
  process.exit(1);
}

// ── Validate setup ────────────────────────────────────────────────────────────
if (!existsSync(path.join(BACKEND, 'package.json'))) {
  die(
    'Cannot find backend/package.json\n' +
    '     Make sure scrape.mjs is in the project root (next to the backend/ folder).'
  );
}

if (MONGODB_URI.includes('YOUR_USER')) {
  die(
    'MONGODB_URI is not set.\n' +
    '     Open scrape.mjs and update the MONGODB_URI in the CONFIG section at the top.'
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────
console.log('\n' + line);
console.log('  CGTenders — Local Scraper');
console.log(line);
console.log('  Started    : ' + new Date().toLocaleString('en-IN'));
console.log('  Backend    : ' + BACKEND);
console.log('  Mock GeM   : ' + USE_MOCK_GEM);
console.log('  Skip CSPGCL: ' + SKIP_CSPGCL);
console.log(line);

// ── Install dependencies if node_modules is missing ───────────────────────────
console.log('\n[1/3] Checking dependencies...');
const nodeModules = path.join(BACKEND, 'node_modules');
if (!existsSync(nodeModules)) {
  console.log('     node_modules not found — running npm install...');
  const result = spawnSync('npm', ['install'], {
    cwd: BACKEND,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) die('npm install failed. Check your internet connection.');
  console.log('     Dependencies installed.');
} else {
  console.log('     Dependencies OK.');
}

// ── Inject env vars ───────────────────────────────────────────────────────────
process.env.DATABASE_URL                  = MONGODB_URI;
process.env.MONGODB_URI                   = MONGODB_URI;
process.env.USE_MOCK_GEM                  = String(USE_MOCK_GEM);
process.env.SKIP_CSPGCL                  = String(SKIP_CSPGCL);
process.env.ARCHIVE_MODE                 = String(ARCHIVE_MODE);
process.env.AUTO_DELETE_CLOSED_AFTER_DAYS = String(AUTO_DELETE_CLOSED_AFTER_DAYS);
process.env.PROXY_URL                    = '';

// ── Load pipeline (use pathToFileURL for Windows compatibility) ───────────────
console.log('\n[2/3] Loading pipeline...');
let runPipeline;
try {
  const runPath = path.join(BACKEND, 'src', 'pipeline', 'run.js');
  const runUrl  = pathToFileURL(runPath).href;   // converts C:\... → file:///C:/...
  const mod = await import(runUrl);
  runPipeline = mod.runPipeline;
  console.log('     Pipeline loaded OK.');
} catch (err) {
  console.error('\n     Import error:', err.message);
  die('Failed to load the pipeline.\n     cd backend && npm install  — then try again.');
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('\n[3/3] Scraping GeM + CSPGCL portals...');
console.log('     This usually takes 1–3 minutes. Please wait...\n');

let log;
try {
  log = await runPipeline();
} catch (err) {
  console.error('\n❌  Pipeline crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
}

// ── Results ───────────────────────────────────────────────────────────────────
console.log('\n' + line);
console.log('  ✅  SCRAPE COMPLETE');
console.log(line);
console.log('  New tenders   : ' + log.newCount);
console.log('  Updated       : ' + log.updatedCount);
console.log('  Total found   : ' + log.found);
console.log('  Cleaned up    : ' + log.cleanedRecords);
console.log('  Errors        : ' + log.errors.length);

if (log.errors.length > 0) {
  console.log('\n  ⚠️  Errors:');
  log.errors.forEach(e => console.log('     - ' + e));
}

console.log(line);
console.log('  Finished  : ' + new Date().toLocaleString('en-IN'));
console.log(line + '\n');

process.exit(0);

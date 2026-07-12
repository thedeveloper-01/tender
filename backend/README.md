# CGTenders API — Python port

Python (FastAPI + Motor/async MongoDB) conversion of the original Node/Express +
Prisma-on-MongoDB backend. Same MongoDB database, same collections/fields,
same API routes and JSON shapes — you can point this at your existing Mongo
instance and it will read/write the same data your frontend already expects.

## What changed vs. the Node version

- **GEM scraper removed.** `fetchers/gem.js`, `fetchers/gem_browser.js` (the
  Playwright/headless-Chromium scraper — almost certainly your memory
  problem), and `gem_scraper_run.js` were dropped entirely, per your
  instruction. You're scraping GEM yourself and presumably writing straight
  into the `tenders` collection, or via your own import path — this API
  doesn't need to know how.
- **GeM offline PDF extractor removed.** `src/extractor/*.js` (the
  deterministic NIT-PDF field parser: sections, field dictionary, consignee/
  eligibility/ATC parsers) was **not** converted, per your instruction ("pdf
  extractor not needed"). GEM tenders now just pass through whatever
  `bidValue`/`emdAmount` they already carry; the `/ai-extract` route still
  serves anything already cached in `sourceMeta.aiExtract` from before, it
  just can't compute new ones on-demand anymore.
- **CSPGCL PDF extraction is fully ported** (`pipeline/cspgcl_extract.py`) —
  it's a separate regex table-parser, unrelated to the GEM extractor, and
  still works standalone (uses `pdfplumber` instead of Node's `pdf-parse`).
- **Prisma → direct Motor (async pymongo) calls.** Prisma-on-Mongo was a
  typed wrapper over the same collections; talking to Mongo directly is
  lighter-weight and avoids the Prisma Rust query-engine binary.
- **node-cron → APScheduler**, **cheerio → BeautifulSoup**, **node `fetch` →
  `httpx.AsyncClient`**.
- `extract_and_upsert_cli.js` (a one-off CLI helper) was not ported — say
  the word if you want it too.

## Why this should actually fix your memory problem

The Node service's biggest memory consumer, by far, was launching a
**headless Chromium browser via Playwright** inside `gem_browser.js` for
every state in `GEM_STATES`. A Chromium process alone can eat several
hundred MB to 1GB+ RAM. None of that exists in this codebase anymore — this
is a plain async HTTP/Mongo API service, which should run comfortably in a
fraction of the memory footprint.

## Project layout

```
app/
  config.py            # env config (port of config.js)
  db.py                 # Motor client + collections (replaces db.js/Prisma)
  cache.py               # in-process TTL cache (port of cache.js)
  scheduler.py            # APScheduler daily job (port of scheduler.js)
  serialize.py             # Mongo doc -> JSON-safe dict helper
  server.py                 # FastAPI app + middleware (port of server.js)
  routes/
    tenders.py               # port of routes/tenders.js
    cities.py                 # port of routes/cities.js
    stats.py                   # port of routes/stats.js
    admin.py                    # port of routes/admin.js
  pipeline/
    run.py                       # port of pipeline/run.js (GEM fetch stage removed)
    normalize.py                  # port of pipeline/normalize.js
    location_resolve.py            # port of pipeline/locationResolve.js
    analysis.py                     # port of pipeline/analysis.js
    pdf.py                            # port of pipeline/pdf.js
    extract.py                        # port of pipeline/extract.js (GEM branch stubbed)
    cspgcl_extract.py                  # port of pipeline/cspgcl_extract.js
    cleanup.py                          # port of pipeline/cleanup.js
  fetchers/
    cspgcl.py                            # port of fetchers/cspgcl.js
main.py                                    # entrypoint (uvicorn)
requirements.txt
.env.example
```

## Running it

```bash
cd python_api  # this folder
pip install -r requirements.txt
cp .env.example .env   # fill in ADMIN_TOKEN and MONGODB_URI
python main.py          # serves on :4000 (or $PORT)
```

or with uvicorn directly (with auto-reload for dev):

```bash
uvicorn main:app --reload --port 4000
```

## Routes (all unchanged from the Node API)

- `GET  /api/tenders` — filters: city, state, q, category, status, minValue,
  maxValue, minEmd, maxEmd, source, plant, mseStartupOnly,
  zeroExperienceOnly, sort, page, limit
- `GET  /api/tenders/{source}/{bidNumber}`
- `GET  /api/tenders/{source}/{bidNumber}/document`
- `GET  /api/tenders/{source}/{bidNumber}/ai-extract`
- `GET  /api/cities`
- `GET  /api/stats`
- `POST /api/refresh` (Bearer ADMIN_TOKEN)
- `POST /api/clear-cache` (Bearer ADMIN_TOKEN)
- `GET  /api/fetch-logs` (Bearer ADMIN_TOKEN)
- `GET  /health`

## Sanity-checked

Every module was smoke-tested for import correctness and byte-compiled.
The pure-logic modules (`analysis.py`, `location_resolve.py`,
`normalize.py`) were run against representative inputs and produce output
matching the original JS logic (category keyword matching, viability
scoring, city resolution incl. the Korea false-positive guard, title
cleanup, CSPGCL stable-key hashing, etc).

Routes were verified to register correctly and the FastAPI app boots and
serves requests end-to-end through the logging/CORS middleware. Full
DB-backed route testing needs a real MongoDB connection (point `MONGODB_URI`
at your existing database — same collections, so your current data works
as-is).

# CGTenders.com — Backend

Express + Prisma (MongoDB) backend for the CGTenders.com Chhattisgarh tender
aggregator. Fetches tenders daily from GeM (mock data by default) and the
CSPGCL portal, normalizes them into a unified schema, extracts bid
value/EMD and additional details from PDFs, scores viability, and serves a
REST API for the Astro frontend.

## 1. Project Structure

```
backend/
  prisma/schema.prisma        # Tender, FetchLog, ArchivedTender models
  src/
    server.js                  # Express app entrypoint
    config.js                  # env config + CG city list/aliases
    db.js                       # Prisma client singleton
    scheduler.js                # node-cron daily pipeline trigger
    routes/
      tenders.js                # GET /api/tenders, /:source/:bidNumber, /document
      cities.js                 # GET /api/cities
      stats.js                  # GET /api/stats
      admin.js                  # POST /api/refresh, GET /api/fetch-logs
    fetchers/
      gem.js                     # fetchGemTenders() — mock + live (isolated)
      cspgcl.js                  # fetchCspgclTenders() — adapted from tenders.json.js
    pipeline/
      normalize.js               # raw -> unified Tender shape
      locationResolve.js          # free-text -> one of 33 CG districts
      analysis.js                 # categorize / viability score / risks
      pdf.js                      # PDF download (GeM direct, CSPGCL __doPostBack)
      extract.js                  # pdf-parse: bidValue/EMD + extra detail fields
      cleanup.js                  # closed-tender retention/archive/delete
      run.js                      # orchestrates the full daily pipeline
  documents/                    # downloaded PDFs (gitignored)
  .env.example
```

## 2. Local Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env: set MONGODB_URI to a MongoDB Atlas connection string (free tier works)

npm run db:push     # creates collections/indexes via Prisma
npm run dev          # starts the API server on PORT (default 4000) + scheduler
```

To populate the database immediately (instead of waiting for the 06:00
cron), trigger a manual run:

```bash
curl -X POST http://localhost:4000/api/refresh \
  -H "Authorization: Bearer changeme"
```

Then check progress:

```bash
curl http://localhost:4000/api/fetch-logs -H "Authorization: Bearer changeme"
curl http://localhost:4000/api/tenders
```

## 3. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGODB_URI` | — | MongoDB connection string (Atlas recommended) |
| `FETCH_TIME` | `06:00` | Daily pipeline run time (24h `HH:MM`) |
| `PDF_RETENTION_DAYS` | `2` | (reserved for future use) |
| `AUTO_DELETE_CLOSED_AFTER_DAYS` | `2` | Delete closed tenders older than this many days |
| `ARCHIVE_MODE` | `true` | If true, write a lightweight `ArchivedTender` row before deleting |
| `USE_MOCK_GEM` | `true` | Use built-in mock GeM data instead of live scraping |
| `ADMIN_TOKEN` | `changeme` | Bearer token required for `/api/refresh` and `/api/fetch-logs` |
| `SITE_URL` | `https://cgtenders.com` | Used for sitemap/canonical URLs (frontend) |
| `PORT` | `4000` | API server port |
| `CORS_ORIGIN` | `*` | Set to your Vercel frontend origin in production |
| `DOCUMENTS_DIR` | `documents` | Where PDFs are stored — use a persistent volume in production |

## 4. Deploying to Railway

1. Push this `backend/` folder to a GitHub repo (or a `backend/` subfolder
   of your monorepo — set Railway's "root directory" accordingly).
2. Create a new Railway project → "Deploy from GitHub repo".
3. Add a **MongoDB** database (Railway plugin) or use **MongoDB Atlas**
   (recommended for the free tier) and set `MONGODB_URI` accordingly.
4. Set all env vars from `.env.example` in Railway's Variables tab.
   - Set `CORS_ORIGIN` to your Vercel frontend URL.
   - Set `SITE_URL` to `https://cgtenders.com` (or your domain).
   - Keep `USE_MOCK_GEM=true` until the live GeM endpoint is verified.
5. **Persistent storage for PDFs**: add a Railway Volume mounted at
   e.g. `/data`, and set `DOCUMENTS_DIR=/data/documents`. Without a volume,
   downloaded PDFs are lost on every redeploy/restart.
6. Railway will run `npm install` (which runs `prisma generate` via
   `postinstall`) then `node src/server.js` (see `railway.json`).
7. Run `npm run db:push` once against your production `MONGODB_URI`
   (e.g. via Railway's shell, or locally pointed at the prod URI) to create
   collections/indexes.
8. Trigger the first pipeline run via `POST /api/refresh` to populate data.

> Note: this backend is a long-running Node process (Express server +
> node-cron scheduler), so it is **not** suitable for Netlify Functions
> (serverless, no persistent disk, no long-lived cron). Railway (or Render/
> Fly.io) is recommended. If Netlify is required for the frontend, deploy
> only the Astro frontend there and point it at this Railway-hosted API.

## 5. Connecting the Vercel Frontend

The Astro frontend (deployed on Vercel) should call this API via a base URL
env var, e.g.:

```
PUBLIC_API_BASE_URL=https://your-backend.up.railway.app
```

All frontend data fetches (`/api/tenders`, `/api/cities`, `/api/stats`,
`/api/tenders/:source/:bidNumber`, `/.../document`) should use this base URL.

## 6. "View More Details"

Every tender record includes a `sourceMeta.pdfExtract` object populated by
`pipeline/extract.js`:

- `sourceMeta.pdfExtract.fields` — a map of extra fields parsed from the PDF
  (ePBG %, bid offer validity, delivery period, payment terms, eligibility
  criteria, consignee address, etc.), each with a human-readable `label`
  and `value`.
- `sourceMeta.pdfExtract.text` — the first ~4000 characters of extracted PDF
  text, as a fallback raw-details view.

The frontend's tender detail page should show `bidValue`, `emdAmount`,
`viabilityScore`, `risks`, and a summary up front, with a **"View more
details"** expander/section that renders `sourceMeta.pdfExtract.fields`
(and optionally the raw `text` excerpt) plus a link/embed to
`/api/tenders/:source/:bidNumber/document`.

## 7. Switching off Mock GeM Data

Once the live `bidplus.gem.gov.in` request/response shape has been
confirmed:

1. Implement `parseGemHtml()` and the pagination loop in
   `src/fetchers/gem.js` (`fetchGemTendersLive`).
2. Set `USE_MOCK_GEM=false`.
3. Trigger `/api/refresh` and check `/api/fetch-logs` for errors.

## 8. Build Order Recap

1. `prisma/schema.prisma` + `npm run db:push`
2. `config.js` + CG city constants ✅
3. `pipeline/analysis.js` ✅
4. `pipeline/locationResolve.js` ✅
5. `fetchers/gem.js` (mock mode) ✅
6. `fetchers/cspgcl.js` ✅
7. `pipeline/normalize.js` ✅
8. `pipeline/pdf.js` + `pipeline/extract.js` ✅
9. `pipeline/cleanup.js` ✅
10. `pipeline/run.js` ✅
11. `scheduler.js` ✅
12. Express routes + `server.js` ✅
13. Run `/api/refresh` to populate DB, verify endpoints
14. README (this file) ✅

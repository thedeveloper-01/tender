# Migration / Build Fix Guide

## Why the build was failing

The Vercel build was picking up `src/pages/api/tenders.json.js` and
`src/pages/api/tender-doc.js` from the **original CSPGCL dashboard** repo.
These files import `cheerio` (a Node scraping library) which Rollup/Vite
cannot bundle for the browser, causing:

```
[vite]: Rollup failed to resolve import "cheerio" from
"src/pages/api/tenders.json.js"
```

Those files are **not needed** in the frontend — all data now comes from
the Express backend API. They must be deleted from the repo.

## Steps to fix your existing repo

### 1. Delete the old API route files
```bash
git rm src/pages/api/tenders.json.js
git rm src/pages/api/tender-doc.js
git rm src/lib/plants.js        # if present
git rm src/lib/tenderAnalysis.js # if present
# Remove the directory if now empty
rmdir src/pages/api 2>/dev/null || true
```

### 2. Replace package.json
Use the `package.json` from this zip. Key changes:
- `astro`: `^6.4.0` (was ^4.16.0 — version mismatch caused peer dep warnings)
- `@astrojs/react`: `^4.0.0` (was ^3.6.0)
- `@astrojs/vercel`: `^8.0.0` (was ^7.8.0 — v8 drops the `/serverless` subpath)
- `react` / `react-dom`: `^19.0.0` (npm was resolving v19 anyway — align explicitly)

### 3. Replace astro.config.mjs
The import path changed in v8:
```js
// OLD (breaks with @astrojs/vercel v8)
import vercel from '@astrojs/vercel/serverless';

// NEW
import vercel from '@astrojs/vercel';
```

### 4. Copy in all new source files from this zip
Replace your entire `src/` directory with the one from this zip, which:
- Has no `src/pages/api/` directory
- Has no `src/lib/plants.js` or `src/lib/tenderAnalysis.js`
- Has the new `src/lib/api.js` and `src/lib/cities.js`
- Has the new pages, components, and layout

### 5. Set environment variables in Vercel dashboard
```
PUBLIC_API_BASE_URL = https://your-backend.up.railway.app
SITE_URL            = https://cgtenders.com
```

### 6. Push and redeploy
```bash
git add -A
git commit -m "rebrand: CGTenders.com — remove old scrapers, add new pages"
git push
```

Vercel will pick up the new `package.json` and `astro.config.mjs` and the
build will succeed.

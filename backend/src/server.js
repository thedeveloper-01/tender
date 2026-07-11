import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { startScheduler } from './scheduler.js';

import tendersRouter from './routes/tenders.js';
import citiesRouter from './routes/cities.js';
import statsRouter from './routes/stats.js';
import adminRouter from './routes/admin.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Styled HTTP Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const status = res.statusCode;
    
    let statusColor = `${status}`;
    if (status >= 500) {
      statusColor = `\x1b[31m${status}\x1b[0m`; // Red
    } else if (status >= 400) {
      statusColor = `\x1b[33m${status}\x1b[0m`; // Yellow
    } else if (status >= 300) {
      statusColor = `\x1b[36m${status}\x1b[0m`; // Cyan
    } else if (status >= 200) {
      statusColor = `\x1b[32m${status}\x1b[0m`; // Green
    }
    
    console.log(`[http] ${new Date().toISOString()} | ${method} ${url} -> ${statusColor} in ${duration}ms`);
  });
  next();
});

app.get('/', (_req, res) => {
  res.json({ name: 'CGTenders API', status: 'ok', siteUrl: config.siteUrl });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/tenders', tendersRouter);
app.use('/api/cities', citiesRouter);
app.use('/api/stats', statsRouter);
app.use('/api', adminRouter); // exposes /api/refresh and /api/fetch-logs

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(config.port, () => {
  console.log(`[server] CGTenders API listening on port ${config.port}`);
  startScheduler();
});

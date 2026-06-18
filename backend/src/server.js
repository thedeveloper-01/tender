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

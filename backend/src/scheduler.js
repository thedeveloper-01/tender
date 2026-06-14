import cron from 'node-cron';
import { config } from './config.js';
import { runPipeline } from './pipeline/run.js';

/** Convert "HH:MM" -> cron expression "MM HH * * *" */
function toCronExpr(hhmm) {
  const [hh, mm] = hhmm.split(':').map((n) => parseInt(n, 10));
  return `${mm} ${hh} * * *`;
}

export function startScheduler() {
  if (config.skipScheduler) {
    console.log('[scheduler] Pipeline scheduler is disabled (running on Render or skipScheduler configured).');
    return;
  }
  const cronExpr = toCronExpr(config.fetchTime);
  console.log(`[scheduler] daily pipeline scheduled at ${config.fetchTime} (cron: "${cronExpr}")`);

  cron.schedule(cronExpr, async () => {
    console.log(`[scheduler] starting daily pipeline run at ${new Date().toISOString()}`);
    try {
      await runPipeline();
      console.log(`[scheduler] pipeline run finished at ${new Date().toISOString()}`);
    } catch (e) {
      console.error('[scheduler] pipeline run failed:', e);
    }
  });
}

export { runPipeline };

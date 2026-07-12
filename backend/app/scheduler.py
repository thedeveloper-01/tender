"""
app/scheduler.py

Direct port of src/scheduler.js. Uses APScheduler's AsyncIOScheduler
(cron trigger) in place of node-cron.
"""
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import config
from .pipeline.run import run_pipeline

_scheduler = AsyncIOScheduler()


async def _scheduled_run():
    print(f"[scheduler] starting daily pipeline run at {datetime.now(timezone.utc).isoformat()}")
    try:
        await run_pipeline()
        print(f"[scheduler] pipeline run finished at {datetime.now(timezone.utc).isoformat()}")
    except Exception as e:
        print(f"[scheduler] pipeline run failed: {e}")


def start_scheduler():
    if config.skip_scheduler:
        print("[scheduler] Pipeline scheduler is disabled (SKIP_SCHEDULER configured).")
        return

    hh, mm = (int(x) for x in config.fetch_time.split(':'))
    print(f'[scheduler] daily pipeline scheduled at {config.fetch_time} (cron: "{mm} {hh} * * *")')

    _scheduler.add_job(_scheduled_run, CronTrigger(hour=hh, minute=mm))
    _scheduler.start()

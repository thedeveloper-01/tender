"""
main.py

Entry point — equivalent of running `node src/server.js`.
Run with:  python main.py
or:        uvicorn main:app --host 0.0.0.0 --port 4000
"""
import uvicorn

from app.server import app  # noqa: F401  (re-exported for `uvicorn main:app`)
from app.config import config

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=config.port, reload=False)

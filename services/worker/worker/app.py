"""
Processing worker. Receives a task (from Cloud Tasks in production, directly in
development) containing only signed URLs, processes the document in a private
temp dir, uploads the result, and reports status back to the API.

Security properties:
  * never holds storage credentials — only short-lived signed URLs
  * authenticates callers (Cloud Run IAM/OIDC in prod; HMAC header in dev)
  * enforces size limits and per-operation timeouts
  * never logs document contents, file names or parameters
"""
from __future__ import annotations

import hashlib
import hmac
import asyncio
import base64
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, Header, HTTPException, Request

from .errors import JobError
from .ops import OPS
from .scan import scan_file

log = logging.getLogger("worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
# httpx logs full request URLs at INFO — those are signed capability URLs and must never reach logs.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

MAX_BYTES = int(os.environ.get("MAX_INPUT_BYTES", str(1024 * 1024 * 1024)))
APP_SECRET = os.environ.get("APP_SECRET", "")
REQUIRE_HMAC = os.environ.get("REQUIRE_HMAC", "1") == "1"

app = FastAPI(title="PDFella worker", docs_url=None, redoc_url=None, openapi_url=None)


def expected_token(job_id: str) -> str:
    mac = hmac.new(APP_SECRET.encode(), f"callback:{job_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).rstrip(b"=").decode()


@app.get("/healthz")
def healthz():
    return {"ok": True, "ops": sorted(OPS)}


async def _download(client: httpx.AsyncClient, url: str, dest: Path) -> None:
    total = 0
    async with client.stream("GET", url) as r:
        if r.status_code != 200:
            raise JobError("failed", f"download status {r.status_code}")
        with dest.open("wb") as f:
            async for chunk in r.aiter_bytes(1024 * 1024):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise JobError("unsupported", "input too large")
                f.write(chunk)


async def _callback(client: httpx.AsyncClient, cb: dict, payload: dict) -> None:
    for attempt in range(3):
        try:
            r = await client.post(cb["url"], json=payload, headers={"X-Worker-Auth": cb["token"]})
            if r.status_code < 500:
                return
        except httpx.HTTPError:
            pass
        await asyncio.sleep(1 + attempt)


@app.post("/process")
async def process(request: Request, x_worker_auth: str | None = Header(default=None)):
    task = await request.json()
    job_id = str(task.get("jobId", ""))
    op = task.get("op")
    if REQUIRE_HMAC and (not APP_SECRET or not x_worker_auth or not hmac.compare_digest(x_worker_auth, expected_token(job_id))):
        raise HTTPException(status_code=401)
    if op not in OPS:
        raise HTTPException(status_code=400)

    started = time.monotonic()
    tmp = tempfile.mkdtemp(prefix="job-")
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10), follow_redirects=False) as client:
        try:
            inputs = []
            for i, inp in enumerate(task["inputs"]):
                ext = "".join(c for c in str(inp.get("ext", "bin")) if c.isalnum())[:5] or "bin"
                dest = Path(tmp) / f"in-{i}.{ext}"
                await _download(client, inp["url"], dest)
                scan_file(str(dest))
                inputs.append(str(dest))
            out = str(Path(tmp) / f"out.{task['output']['ext']}")
            await _callback(client, task["callback"], {"status": "PROGRESS", "progress": 20})
            OPS[op](inputs, out, task.get("params") or {}, tmp)
            with open(out, "rb") as f:
                r = await client.put(task["output"]["url"], content=f.read(), headers={"Content-Type": task["output"]["contentType"]})
            if r.status_code >= 300:
                raise JobError("failed", f"upload status {r.status_code}")
            await _callback(client, task["callback"], {"status": "READY"})
            log.info("job=%s op=%s status=ready ms=%d", job_id[:8], op, (time.monotonic() - started) * 1000)
        except JobError as e:
            log.warning("job=%s op=%s status=error code=%s", job_id[:8], op, e.code)
            await _callback(client, task["callback"], {"status": "ERROR", "error": {"code": e.code}})
        except Exception:  # noqa: BLE001
            log.exception("job=%s op=%s status=error code=failed", job_id[:8], op)
            await _callback(client, task["callback"], {"status": "ERROR", "error": {"code": "failed"}})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    # Always 200: the outcome was reported via callback, so Cloud Tasks must not retry.
    return {"ok": True}

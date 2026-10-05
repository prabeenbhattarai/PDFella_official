"""HTTP-level tests for the worker: auth and the full download → process → upload → callback cycle."""
import os

os.environ["APP_SECRET"] = "test-secret"

import httpx  # noqa: E402
import pymupdf as fitz  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from worker import app as worker_app  # noqa: E402


def make_pdf() -> bytes:
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "hello world")
    return doc.tobytes()


def test_rejects_bad_auth():
    c = TestClient(worker_app.app)
    r = c.post("/process", json={"jobId": "abc", "op": "repair"}, headers={"X-Worker-Auth": "nope"})
    assert r.status_code == 401


def test_full_cycle(monkeypatch):
    uploaded, callbacks = {}, []
    src = make_pdf()

    def handler(request: httpx.Request):
        if request.method == "GET":
            return httpx.Response(200, content=src)
        if request.method == "PUT":
            uploaded["body"] = request.content
            return httpx.Response(200)
        callbacks.append(request.read())
        return httpx.Response(200)

    real = httpx.AsyncClient
    monkeypatch.setattr(worker_app.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    job = "job123"
    task = {
        "jobId": job, "op": "repair", "params": {},
        "inputs": [{"url": "https://storage/in", "ext": "pdf"}],
        "output": {"url": "https://storage/out", "contentType": "application/pdf", "ext": "pdf"},
        "callback": {"url": "https://app/cb", "token": worker_app.expected_token(job)},
    }
    r = TestClient(worker_app.app).post("/process", json=task, headers={"X-Worker-Auth": worker_app.expected_token(job)})
    assert r.status_code == 200
    assert uploaded["body"].startswith(b"%PDF")
    assert b'"READY"' in callbacks[-1]


@pytest.mark.parametrize("op", ["unknown-op"])
def test_unknown_op(op):
    job = "j"
    r = TestClient(worker_app.app).post("/process", json={"jobId": job, "op": op}, headers={"X-Worker-Auth": worker_app.expected_token(job)})
    assert r.status_code == 400

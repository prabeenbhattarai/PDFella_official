"""Worker operation tests (those that don't need OCR/LibreOffice/Ghostscript binaries)."""
import shutil
from pathlib import Path

import pikepdf
import pymupdf as fitz
import pytest

from worker import ops
from worker.errors import JobError

SECRET = "4401-2290-1187"


@pytest.fixture()
def tmp(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture()
def sample(tmp: Path) -> str:
    doc = fitz.open()
    for i in range(2):
        page = doc.new_page(width=595, height=842)
        page.insert_text((60, 80), f"Service agreement page {i + 1}", fontsize=20)
        page.insert_text((60, 130), f"Account number {SECRET}", fontsize=12)
        page.insert_text((60, 160), "Payment due in 60 days", fontsize=12)
    p = tmp / "sample.pdf"
    doc.save(p)
    return str(p)


def text_of(path: str) -> str:
    return "\n".join(page.get_text() for page in fitz.open(path))


def secret_rect(path: str, page_index=0):
    """Find the secret on the page and return it as a PDF-space [x, y, w, h] rect (bottom-left origin)."""
    page = fitz.open(path)[page_index]
    r = page.search_for(SECRET)[0]
    h = page.rect.height
    return [r.x0, h - r.y1, r.width, r.height]


def test_redact_removes_text_permanently(sample, tmp):
    out = str(tmp / "out.pdf")
    ops.redact([sample], out, {"regions": [{"pageIndex": 0, "rect": secret_rect(sample), "fill": "#000000"}]}, str(tmp))
    pages = [p.get_text() for p in fitz.open(out)]
    assert SECRET not in pages[0]
    assert "Payment due" in pages[0]          # unrelated text survives
    assert SECRET in pages[1]                  # other pages untouched
    raw = Path(out).read_bytes()
    assert SECRET.encode() not in raw


def test_edit_text_removes_without_fill(sample, tmp):
    out = str(tmp / "out.pdf")
    ops.edit_text([sample], out, {"regions": [{"pageIndex": 0, "rect": secret_rect(sample)}]}, str(tmp))
    assert SECRET not in fitz.open(out)[0].get_text()


def test_protect_and_unlock_roundtrip(sample, tmp):
    locked = str(tmp / "locked.pdf")
    ops.protect([sample], locked, {"password": "s3cret!", "allowPrint": True, "allowCopy": False}, str(tmp))
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(locked)
    with pytest.raises(JobError) as e:
        ops.unlock([locked], str(tmp / "x.pdf"), {"password": "wrong"}, str(tmp))
    assert e.value.code == "wrong_password"
    unlocked = str(tmp / "unlocked.pdf")
    ops.unlock([locked], unlocked, {"password": "s3cret!"}, str(tmp))
    assert not pikepdf.open(unlocked).is_encrypted
    assert "Payment due" in text_of(unlocked)


def test_unlock_rejects_unencrypted(sample, tmp):
    with pytest.raises(JobError) as e:
        ops.unlock([sample], str(tmp / "x.pdf"), {"password": "x"}, str(tmp))
    assert e.value.code == "not_encrypted"


def test_repair_truncated_file(sample, tmp):
    broken = tmp / "broken.pdf"
    data = Path(sample).read_bytes()
    broken.write_bytes(data[: data.rfind(b"xref")])  # drop the cross-reference table
    out = str(tmp / "fixed.pdf")
    ops.repair([str(broken)], out, {}, str(tmp))
    assert fitz.open(out).page_count == 2


def test_compress_never_grows(sample, tmp):
    out = str(tmp / "c.pdf")
    if shutil.which("gs") is None:
        ops.compress([sample], out, {"preset": "recommended"}, str(tmp))
        assert Path(out).stat().st_size <= Path(sample).stat().st_size


def test_pdf_to_pptx_and_xlsx_and_html(sample, tmp):
    from openpyxl import load_workbook
    from pptx import Presentation

    pptx = str(tmp / "o.pptx")
    ops.pdf_to_pptx([sample], pptx, {}, str(tmp))
    prs = Presentation(pptx)
    assert len(prs.slides) == 2
    assert "Payment due" in prs.slides[0].notes_slide.notes_text_frame.text

    xlsx = str(tmp / "o.xlsx")
    ops.pdf_to_xlsx([sample], xlsx, {}, str(tmp))
    assert load_workbook(xlsx).sheetnames == ["Page 1", "Page 2"]

    html = tmp / "o.html"
    ops.pdf_to_html([sample], str(html), {}, str(tmp))
    assert "Payment due" in html.read_text()


def test_pdf_to_docx(sample, tmp):
    from docx import Document

    out = str(tmp / "o.docx")
    ops.pdf_to_docx([sample], out, {}, str(tmp))
    text = "\n".join(p.text for p in Document(out).paragraphs)
    assert "Payment due" in text


def test_damaged_input_reports_code(tmp):
    bad = tmp / "bad.pdf"
    bad.write_bytes(b"%PDF-1.7\nthis is not a pdf")
    with pytest.raises(JobError) as e:
        ops.pdf_to_html([str(bad)], str(tmp / "x.html"), {}, str(tmp))
    assert e.value.code in {"damaged", "failed"}

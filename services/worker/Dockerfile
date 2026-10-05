# Processing worker: PyMuPDF, pikepdf (qpdf), OCRmyPDF (Tesseract), Ghostscript, LibreOffice.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HOME=/tmp

RUN apt-get update && apt-get install -y --no-install-recommends \
      ghostscript qpdf pngquant unpaper \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa tesseract-ocr-ita \
      tesseract-ocr-por tesseract-ocr-nld tesseract-ocr-hin tesseract-ocr-nep tesseract-ocr-ara tesseract-ocr-chi-sim tesseract-ocr-jpn \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-dejavu fonts-liberation fonts-noto-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY worker ./worker

# Run as an unprivileged user; only /tmp is writable at runtime (Cloud Run: read-only rootfs semantics).
RUN useradd --uid 10001 --create-home --home-dir /home/worker worker
USER 10001

EXPOSE 8080
CMD ["uvicorn", "worker.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--timeout-keep-alive", "5"]

# PDFella public API. Build from the repository root (it bundles shared code from src/lib):
#   docker build -f services/public-api/Dockerfile -t pdfella-api .
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY services/public-api ./services/public-api
RUN node services/public-api/build.mjs

FROM node:22-slim
ENV NODE_ENV=production PORT=8080 \
    QPDF_WASM_PATH=/app/qpdf.wasm PDFJS_WORKER_SRC=/app/pdf.worker.mjs \
    API_KEYS_BACKEND=firestore
WORKDIR /app
# firebase-admin is the only runtime dependency left outside the bundle.
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund firebase-admin@14.5.0 && npm cache clean --force
COPY --from=build /repo/services/public-api/dist ./
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "server.mjs"]

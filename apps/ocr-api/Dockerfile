FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    tesseract-ocr \
    tesseract-ocr-kor \
    tesseract-ocr-eng \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=8080
ENV OCR_TEMP_DIR=/tmp/p2-ocr
ENV TESSERACT_LANG=kor+eng
ENV PDF_RENDER_DPI=200
ENV MAX_UPLOAD_BYTES=52428800

EXPOSE 8080

CMD ["node", "src/server.mjs"]

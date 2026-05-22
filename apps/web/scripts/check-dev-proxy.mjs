import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const normalizedOrigin = webOrigin.replace(/\/$/, '');
const healthUrl = `${normalizedOrigin}/ocr-api/health`;
const ocrUrl = `${normalizedOrigin}/ocr-api/ocr?pages=1`;
const samplePdfPath = process.env.OCR_PROXY_SAMPLE_PDF;

async function assertOk(url, label, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }

  return response;
}

function assertUniqueIds(items, label) {
  const ids = items.map((item) => item.id).filter(Boolean);
  const uniqueIds = new Set(ids);

  if (ids.length !== uniqueIds.size) {
    throw new Error(`${label} contains duplicate ids`);
  }
}

await assertOk(normalizedOrigin, 'web root');
const healthResponse = await assertOk(healthUrl, 'OCR proxy health');
const health = await healthResponse.json();

if (health.provider !== 'tesseract-local') {
  throw new Error(`Unexpected OCR provider: ${health.provider}`);
}

if (samplePdfPath) {
  const pdfBuffer = await readFile(resolve(samplePdfPath));
  const ocrResponse = await assertOk(ocrUrl, 'OCR proxy sample request', {
    method: 'POST',
    headers: { 'content-type': 'application/pdf' },
    body: pdfBuffer
  });
  const ocr = await ocrResponse.json();

  assertUniqueIds(ocr.detections ?? [], 'OCR detections');
  assertUniqueIds(ocr.maskBoxCandidates ?? [], 'OCR maskBoxCandidates');
}

process.stdout.write(`dev proxy check passed: ${healthUrl}${samplePdfPath ? ' with sample OCR request' : ''}\n`);

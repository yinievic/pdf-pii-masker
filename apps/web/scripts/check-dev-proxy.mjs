import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const normalizedOrigin = webOrigin.replace(/\/$/, '');
const healthUrl = `${normalizedOrigin}/ocr-api/health`;
const ocrUrl = `${normalizedOrigin}/ocr-api/ocr?pages=1`;
const ocrSupplementUrl = `${normalizedOrigin}/ocr-api/ocr?pages=1&psm=11`;
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

  const supplementResponse = await assertOk(ocrSupplementUrl, 'OCR proxy supplement request', {
    method: 'POST',
    headers: { 'content-type': 'application/pdf' },
    body: pdfBuffer
  });
  const supplementOcr = await supplementResponse.json();

  if (supplementOcr.ocrOptions?.psm !== 11) {
    throw new Error('OCR supplement request did not apply psm=11. Rebuild/restart the OCR API container with the latest code.');
  }

  assertUniqueIds(supplementOcr.detections ?? [], 'OCR supplement detections');
  assertUniqueIds(supplementOcr.maskBoxCandidates ?? [], 'OCR supplement maskBoxCandidates');

  process.stdout.write(`default OCR: words=${ocr.words?.length ?? 0}, detections=${ocr.detections?.length ?? 0}, candidates=${ocr.maskBoxCandidates?.length ?? 0}\n`);
  process.stdout.write(`PSM 11 OCR: words=${supplementOcr.words?.length ?? 0}, detections=${supplementOcr.detections?.length ?? 0}, candidates=${supplementOcr.maskBoxCandidates?.length ?? 0}\n`);
}

process.stdout.write(`dev proxy check passed: ${healthUrl}${samplePdfPath ? ' with default and PSM 11 sample OCR requests' : ''}\n`);

import { createServer } from 'node:http';
import { createRequestId, parsePagesParam, recognizePdf } from './ocr.mjs';

const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const MAX_UPLOAD_BYTES = Number.parseInt(process.env.MAX_UPLOAD_BYTES || String(50 * 1024 * 1024), 10);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': process.env.CORS_ORIGIN || 'http://localhost:5173',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;

    request.on('data', (chunk) => {
      received += chunk.length;

      if (received > MAX_UPLOAD_BYTES) {
        request.destroy(new Error('Request body too large.'));
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function handleOcr(request, response, url) {
  const contentType = request.headers['content-type'] || '';

  if (!contentType.includes('application/pdf')) {
    sendJson(response, 415, { message: 'PDF 파일만 OCR 처리할 수 있습니다.' });
    return;
  }

  try {
    const pdfBuffer = await readBody(request);

    if (pdfBuffer.length === 0) {
      sendJson(response, 400, { message: 'OCR 처리할 PDF 파일이 없습니다.' });
      return;
    }

    const pages = parsePagesParam(url.searchParams.get('pages'));
    const result = await recognizePdf(pdfBuffer, { pages, provider: 'tesseract-local' });

    sendJson(response, 200, {
      requestId: createRequestId(),
      ...result
    });
  } catch {
    sendJson(response, 500, { message: 'OCR 처리 중 오류가 발생했습니다.' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok', provider: 'tesseract-local' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/ocr') {
    await handleOcr(request, response, url);
    return;
  }

  sendJson(response, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
  process.stdout.write(`OCR API listening on ${PORT}\n`);
});

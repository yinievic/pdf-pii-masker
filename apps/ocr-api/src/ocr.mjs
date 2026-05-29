import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { detectSensitiveInfo } from './detection/detectSensitiveInfo.mjs';

const execFileAsync = promisify(execFile);

export const DEFAULT_PROVIDER = 'tesseract-local';
export const DEFAULT_LANGUAGE = process.env.TESSERACT_LANG || 'kor+eng';
export const DEFAULT_DPI = Number.parseInt(process.env.PDF_RENDER_DPI || '200', 10);
export const DEFAULT_TESSERACT_PSM = parseOptionalPsm(process.env.TESSERACT_PSM);
export const DEFAULT_TEMP_ROOT = process.env.OCR_TEMP_DIR || join(tmpdir(), 'pdf-pii-masker-ocr');

export function parseOptionalPsm(value) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 13 ? parsed : undefined;
}

export class OcrUserFacingError extends Error {
  constructor(message = 'OCR 처리 중 오류가 발생했습니다.') {
    super(message);
    this.name = 'OcrUserFacingError';
  }
}

export function parsePagesParam(value) {
  if (!value) {
    return undefined;
  }

  const pages = value
    .split(',')
    .map((page) => Number.parseInt(page.trim(), 10))
    .filter((page) => Number.isInteger(page) && page > 0);

  return pages.length > 0 ? [...new Set(pages)] : undefined;
}

export function parsePdfPageCount(pdfInfoOutput) {
  const match = pdfInfoOutput.match(/^Pages:\s+(\d+)$/im);

  if (!match) {
    throw new Error('Unable to read PDF page count.');
  }

  return Number.parseInt(match[1], 10);
}

export function parseTesseractTsv(tsv, pageNumber) {
  const lines = tsv.split(/\r?\n/).filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split('\t');
  const columnIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const requiredColumns = ['level', 'left', 'top', 'width', 'height', 'conf', 'text'];

  for (const column of requiredColumns) {
    if (!(column in columnIndex)) {
      throw new Error(`Missing Tesseract TSV column: ${column}`);
    }
  }

  return lines.slice(1).flatMap((line) => {
    const columns = line.split('\t');
    const text = (columns[columnIndex.text] || '').trim();
    const level = Number.parseInt(columns[columnIndex.level] || '0', 10);
    const confidence = Number.parseFloat(columns[columnIndex.conf] || '-1');

    if (level !== 5 || !text || !Number.isFinite(confidence) || confidence < 0) {
      return [];
    }

    const x = Number.parseInt(columns[columnIndex.left] || '0', 10);
    const y = Number.parseInt(columns[columnIndex.top] || '0', 10);
    const width = Number.parseInt(columns[columnIndex.width] || '0', 10);
    const height = Number.parseInt(columns[columnIndex.height] || '0', 10);

    if (width <= 0 || height <= 0) {
      return [];
    }

    const blockNumber = Number.parseInt(columns[columnIndex.block_num] || '0', 10);
    const paragraphNumber = Number.parseInt(columns[columnIndex.par_num] || '0', 10);
    const lineNumber = Number.parseInt(columns[columnIndex.line_num] || '0', 10);
    const wordNumber = Number.parseInt(columns[columnIndex.word_num] || '0', 10);

    return [
      {
        pageNumber,
        text,
        x,
        y,
        width,
        height,
        confidence,
        blockNumber,
        paragraphNumber,
        lineNumber,
        wordNumber
      }
    ];
  });
}

export async function getPdfPageCount(pdfPath) {
  const { stdout } = await execFileAsync('pdfinfo', [pdfPath], { maxBuffer: 1024 * 1024 });
  return parsePdfPageCount(stdout);
}

export async function convertPdfPageToPng(pdfPath, pageNumber, workDir, dpi = DEFAULT_DPI, options = {}) {
  const outputPrefix = join(workDir, `page-${pageNumber}`);
  const formatArgs = options.grayscale ? ['-gray', '-png'] : ['-png'];

  await execFileAsync('pdftoppm', ['-r', String(dpi), '-f', String(pageNumber), '-l', String(pageNumber), '-singlefile', ...formatArgs, pdfPath, outputPrefix], {
    maxBuffer: 1024 * 1024
  });

  return `${outputPrefix}.png`;
}

export async function getPngDimensions(imagePath) {
  const header = await readFile(imagePath);

  if (header.length < 24 || header.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Unable to read PNG dimensions.');
  }

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

export async function recognizePng(imagePath, pageNumber, language = DEFAULT_LANGUAGE, options = {}) {
  const psmArgs = options.psm ? ['--psm', String(options.psm)] : [];
  const configArgs = Object.entries(options.configs ?? {}).flatMap(([key, value]) => ['-c', `${key}=${value}`]);
  const { stdout } = await execFileAsync('tesseract', [imagePath, 'stdout', '-l', language, ...psmArgs, ...configArgs, 'tsv'], {
    maxBuffer: 50 * 1024 * 1024
  });

  return parseTesseractTsv(stdout, pageNumber);
}

export async function recognizePdf(pdfBuffer, options = {}) {
  const provider = options.provider || DEFAULT_PROVIDER;

  if (provider !== DEFAULT_PROVIDER) {
    throw new OcrUserFacingError('지원하지 않는 OCR Provider입니다.');
  }

  const tempRoot = options.tempRoot || DEFAULT_TEMP_ROOT;
  await mkdir(tempRoot, { recursive: true });
  const workDir = await mkdtemp(join(tempRoot, 'job-'));
  const pdfPath = join(workDir, 'input.pdf');

  try {
    await writeFile(pdfPath, pdfBuffer);

    const pageCount = await getPdfPageCount(pdfPath);
    const selectedPages = options.pages?.length ? options.pages : Array.from({ length: pageCount }, (_, index) => index + 1);
    const validPages = selectedPages.filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount);

    if (validPages.length === 0) {
      throw new OcrUserFacingError('OCR 처리 대상 페이지가 없습니다.');
    }

    const words = [];
    const pageImages = [];
    const errors = [];
    const tesseractOptions = options.tesseractOptions ?? (DEFAULT_TESSERACT_PSM === undefined ? {} : { psm: DEFAULT_TESSERACT_PSM });

    for (const pageNumber of validPages) {
      try {
        const pngPath = await convertPdfPageToPng(pdfPath, pageNumber, workDir, options.dpi || DEFAULT_DPI);
        const dimensions = await getPngDimensions(pngPath);
        pageImages.push({ pageNumber, ...dimensions });
        const pageWords = await recognizePng(pngPath, pageNumber, options.language || DEFAULT_LANGUAGE, tesseractOptions);
        words.push(...pageWords);
      } catch {
        errors.push({ pageNumber, message: '해당 페이지 OCR 처리에 실패했습니다.' });
      }
    }

    const { detections, maskBoxCandidates } = detectSensitiveInfo(words);

    return {
      provider: DEFAULT_PROVIDER,
      pageCount,
      coordinateSpace: 'pdf-page-image',
      dpi: options.dpi || DEFAULT_DPI,
      ocrOptions: {
        language: options.language || DEFAULT_LANGUAGE,
        psm: tesseractOptions.psm ?? null
      },
      pageImages,
      words,
      detections,
      maskBoxCandidates,
      ...(errors.length > 0 ? { errors } : {})
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function createRequestId() {
  return randomUUID();
}

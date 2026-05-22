import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { detectSensitiveInfo } from '../src/detection/detectSensitiveInfo.mjs';
import {
  DEFAULT_DPI,
  DEFAULT_LANGUAGE,
  convertPdfPageToPng,
  getPdfPageCount,
  getPngDimensions,
  parsePagesParam,
  recognizePng
} from '../src/ocr.mjs';
import { compareDetectionCounts, findExpandedNumberCandidates } from '../src/quality/numberCandidateQuality.mjs';

function parseArgs(argv) {
  const [pdfPath, ...rest] = argv;
  const pagesArg = rest.find((arg) => arg.startsWith('--pages='));
  const dpiArg = rest.find((arg) => arg.startsWith('--dpi='));

  return {
    pdfPath,
    pages: parsePagesParam(pagesArg?.slice('--pages='.length)),
    dpi: Number.parseInt(dpiArg?.slice('--dpi='.length) || String(DEFAULT_DPI), 10)
  };
}

async function runVariant({ pdfPath, workDir, pageNumber, variant, dpi }) {
  const variantDir = join(workDir, `${variant.id}-${pageNumber}`);
  const pngPath = await convertPdfPageToPng(pdfPath, pageNumber, variantDir, variant.dpi ?? dpi, variant.renderOptions ?? {});
  const dimensions = await getPngDimensions(pngPath);
  const words = await recognizePng(pngPath, pageNumber, variant.language ?? DEFAULT_LANGUAGE, variant.tesseractOptions ?? {});
  const { detections, maskBoxCandidates } = detectSensitiveInfo(words);
  const expandedNumberCandidates = findExpandedNumberCandidates(words, new Map([[pageNumber, dimensions]]));

  return {
    id: variant.id,
    label: variant.label,
    pageNumber,
    dimensions,
    wordCount: words.length,
    detections,
    maskBoxCandidates,
    expandedNumberCandidates,
    comparison: compareDetectionCounts({ baselineDetections: detections, expandedCandidates: expandedNumberCandidates })
  };
}

const { pdfPath, pages, dpi } = parseArgs(process.argv.slice(2));

if (!pdfPath) {
  process.stderr.write('Usage: node scripts/compare-ocr-quality.mjs <sample.pdf> --pages=1,2 [--dpi=200]\n');
  process.exit(1);
}

const variants = [
  {
    id: 'baseline',
    label: '기본 kor+eng OCR'
  },
  {
    id: 'digit-whitelist',
    label: '숫자 전용 OCR + tessedit_char_whitelist',
    language: 'eng',
    tesseractOptions: {
      psm: 6,
      configs: {
        tessedit_char_whitelist: '0123456789-'
      }
    }
  },
  {
    id: 'preprocess-gray-threshold',
    label: '고해상도 grayscale 렌더링 + Tesseract thresholding',
    dpi: Math.max(300, dpi),
    renderOptions: { grayscale: true },
    tesseractOptions: {
      configs: {
        thresholding_method: '2'
      }
    }
  }
];

const tempRoot = await mkdtemp(join(tmpdir(), 'p2-ocr-quality-'));
const workPdfPath = join(tempRoot, basename(pdfPath));

try {
  await writeFile(workPdfPath, await readFile(pdfPath));
  const pageCount = await getPdfPageCount(workPdfPath);
  const targetPages = pages?.length ? pages.filter((page) => page >= 1 && page <= pageCount) : [1];
  const results = [];

  for (const pageNumber of targetPages) {
    for (const variant of variants) {
      results.push(await runVariant({ pdfPath: workPdfPath, workDir: tempRoot, pageNumber, variant, dpi }));
    }
  }

  const summary = results.map((result) => ({
    variant: result.id,
    pageNumber: result.pageNumber,
    wordCount: result.wordCount,
    detectionCount: result.detections.length,
    maskBoxCandidateCount: result.maskBoxCandidates.length,
    expandedNumberCandidateCount: result.expandedNumberCandidates.length,
    comparison: result.comparison
  }));

  process.stdout.write(JSON.stringify({ pdf: basename(pdfPath), pageCount, pages: targetPages, summary, results }, null, 2));
  process.stdout.write('\n');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

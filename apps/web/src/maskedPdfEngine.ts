import { PDFDocument } from 'pdf-lib';
import type { MaskBox, MaskFillColor, PageRenderState } from './maskingTypes';

export type MaskedPdfSourceDocument = {
  pages: PageRenderState[];
};

export type GenerateMaskedPdfInput = {
  documents: MaskedPdfSourceDocument[];
  masks: MaskBox[];
  fillColor: MaskFillColor;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('마스킹 PDF 생성을 위한 페이지 이미지를 불러올 수 없습니다.'));
    image.src = src;
  });
}

function getMaskFillStyle(fillColor: MaskFillColor) {
  return fillColor === 'white' ? '#fff' : '#000';
}

function getMasksForPage(page: PageRenderState, masks: MaskBox[]) {
  const finalMaskById = new Map(masks.map((mask) => [mask.id, mask]));

  return page.masks.flatMap((pageMask) => {
    const finalMask = finalMaskById.get(pageMask.id);
    return finalMask ? [finalMask] : [];
  });
}

function assertRenderablePages(documents: MaskedPdfSourceDocument[]) {
  const pageCount = documents.reduce((count, sourceDocument) => count + sourceDocument.pages.length, 0);

  if (pageCount === 0) {
    throw new Error('마스킹 PDF를 생성할 페이지가 없습니다.');
  }

  for (const sourceDocument of documents) {
    for (const page of sourceDocument.pages) {
      if (!page.canvasDataUrl || page.width <= 0 || page.height <= 0) {
        throw new Error('마스킹 PDF 생성을 위한 페이지 렌더링 정보가 올바르지 않습니다.');
      }
    }
  }

  return pageCount;
}

function assertMaskBox(mask: MaskBox) {
  const values = [mask.x, mask.y, mask.width, mask.height];
  if (values.some((value) => !Number.isFinite(value)) || mask.width <= 0 || mask.height <= 0) {
    throw new Error('마스킹 PDF에 적용할 박스 좌표가 올바르지 않습니다.');
  }
}

async function createMaskedPagePng(page: PageRenderState, masks: MaskBox[], fillColor: MaskFillColor) {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('마스킹 PDF 생성을 위한 canvas context를 만들 수 없습니다.');
  }

  const image = await loadImage(page.canvasDataUrl);
  context.drawImage(image, 0, 0, page.width, page.height);
  context.fillStyle = getMaskFillStyle(fillColor);

  getMasksForPage(page, masks).forEach((mask) => {
    assertMaskBox(mask);

    const x = Math.min(Math.max(mask.x, 0), page.width);
    const y = Math.min(Math.max(mask.y, 0), page.height);
    const width = Math.min(Math.max(mask.width, 0), page.width - x);
    const height = Math.min(Math.max(mask.height, 0), page.height - y);

    if (width > 0 && height > 0) {
      context.fillRect(x, y, width, height);
    }
  });

  return canvas.toDataURL('image/png');
}

export async function generateMaskedPdf({ documents, masks, fillColor }: GenerateMaskedPdfInput) {
  const expectedPageCount = assertRenderablePages(documents);
  const resultPdf = await PDFDocument.create();

  for (const sourceDocument of documents) {
    for (const page of sourceDocument.pages) {
      const pngDataUrl = await createMaskedPagePng(page, masks, fillColor);
      const pngImage = await resultPdf.embedPng(pngDataUrl);
      const pdfPage = resultPdf.addPage([page.width, page.height]);
      pdfPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: page.width,
        height: page.height
      });
    }
  }

  if (resultPdf.getPageCount() !== expectedPageCount) {
    throw new Error('생성된 PDF의 페이지 수가 원본 렌더링 페이지 수와 일치하지 않습니다.');
  }

  return resultPdf.save();
}

import type { MaskBox } from '../maskingTypes';

export type OcrProvider = 'tesseract-local' | 'external-api';

export type EnabledOcrProvider = 'tesseract-local';

export type OcrRequest = {
  fileId?: string;
  pages?: number[];
  provider: OcrProvider;
};

export type OcrWord = {
  pageNumber: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type OcrPageError = {
  pageNumber: number;
  message: string;
};

export type DetectionType = 'residentRegistrationNumber' | 'address';

export type Detection = {
  id: string;
  type: DetectionType;
  ruleId: string;
  label: string;
  pageNumber: number;
  rawText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  source: 'regex';
  textRange: { start: number; end: number };
  lineText: string;
};

export type MaskBoxCandidateStatus = 'review' | 'accepted' | 'rejected';

export type MaskBoxCandidate = {
  id: string;
  detectionId: string;
  type: DetectionType;
  ruleId: string;
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  status: MaskBoxCandidateStatus;
  source: 'regex';
  rawText: string;
  maskText: string;
  confidence?: number;
  policy?: string;
};

export type OcrCoordinateSpace = 'pdf-page-image';

export type OcrResponse = {
  provider: EnabledOcrProvider;
  pageCount?: number;
  coordinateSpace?: OcrCoordinateSpace;
  dpi?: number;
  words: OcrWord[];
  detections?: Detection[];
  maskBoxCandidates?: MaskBoxCandidate[];
  errors?: OcrPageError[];
};

export type OcrSecurityPolicy = {
  persistOriginalPdf: false;
  persistPageImages: false;
  persistOcrText: false;
  logOriginalPdf: false;
  logPageImages: false;
  logOcrText: false;
  tempFileRetention: 'delete-after-request';
};

export type OcrProviderAdapter = {
  provider: EnabledOcrProvider;
  recognize(request: OcrRequest & { provider: EnabledOcrProvider }): Promise<OcrResponse>;
};

export const DEFAULT_OCR_PROVIDER: EnabledOcrProvider = 'tesseract-local';

export const APPROVAL_REQUIRED_OCR_PROVIDERS: readonly Exclude<OcrProvider, EnabledOcrProvider>[] = ['external-api'];

export const OCR_SECURITY_POLICY: OcrSecurityPolicy = {
  persistOriginalPdf: false,
  persistPageImages: false,
  persistOcrText: false,
  logOriginalPdf: false,
  logPageImages: false,
  logOcrText: false,
  tempFileRetention: 'delete-after-request'
};

export function createOcrRequest(fileId: string, pages?: number[]): OcrRequest {
  return {
    fileId,
    pages,
    provider: DEFAULT_OCR_PROVIDER
  };
}

export function ocrWordsToMaskBoxes(words: OcrWord[]): MaskBox[] {
  return words.map((word, index) => ({
    id: `ocr-${word.pageNumber}-${index}`,
    pageNumber: word.pageNumber,
    x: word.x,
    y: word.y,
    width: word.width,
    height: word.height,
    source: 'ocr',
    status: 'candidate',
    label: 'OCR 후보',
    confidence: word.confidence,
    text: word.text
  }));
}

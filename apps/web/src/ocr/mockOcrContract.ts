import {
  DEFAULT_OCR_PROVIDER,
  OCR_SECURITY_POLICY,
  createOcrRequest,
  ocrWordsToMaskBoxes,
  type OcrResponse
} from './apiContract';

export const mockOcrRequest = createOcrRequest('local-upload-001', [1, 2]);

export const mockOcrResponse = {
  provider: DEFAULT_OCR_PROVIDER,
  pageCount: 2,
  coordinateSpace: 'pdf-page-image',
  dpi: 200,
  words: [
    {
      pageNumber: 1,
      text: '900101-1234567',
      x: 128,
      y: 244,
      width: 220,
      height: 36,
      confidence: 91.4
    },
    {
      pageNumber: 2,
      text: 'test@example.com',
      x: 96,
      y: 420,
      width: 260,
      height: 32,
      confidence: 88.2
    }
  ]
} satisfies OcrResponse;

export const mockOcrMaskCandidates = ocrWordsToMaskBoxes(mockOcrResponse.words);

export const mockOcrContractVerification = {
  canTargetPages: Array.isArray(mockOcrRequest.pages),
  hasProvider: mockOcrRequest.provider === DEFAULT_OCR_PROVIDER,
  hasCoordinatesAndConfidence: mockOcrResponse.words.every(
    (word) =>
      word.pageNumber > 0 &&
      word.width > 0 &&
      word.height > 0 &&
      word.confidence >= 0 &&
      word.confidence <= 100
  ),
  producesCandidateMasks: mockOcrMaskCandidates.every((mask) => mask.source === 'ocr' && mask.status === 'candidate'),
  preventsSensitiveLogging:
    !OCR_SECURITY_POLICY.logOriginalPdf &&
    !OCR_SECURITY_POLICY.logPageImages &&
    !OCR_SECURITY_POLICY.logOcrText &&
    OCR_SECURITY_POLICY.tempFileRetention === 'delete-after-request'
} as const;

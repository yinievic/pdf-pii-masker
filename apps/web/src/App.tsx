import { type CSSProperties, type ChangeEvent, type DragEvent, type PointerEvent, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';
import { Header } from './components/Header';
import { PolicyPanel } from './components/PolicyPanel';
import { StepCard } from './components/StepCard';
import type { MaskBox, MaskFillColor, MaskingMode, MaskStatus, MaskingWorkflowState, PageRenderState, WorkingBase } from './maskingTypes';
import type { Detection, MaskBoxCandidate, OcrPageImage, OcrResponse } from './ocr/apiContract';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
const steps = [
  {
    title: 'PDF 업로드',
    description: '공문서/계약서 PDF를 업로드하고 파일 용량·페이지 제한을 즉시 검증합니다.'
  },
  {
    title: '개인정보 자동 탐지',
    description: '전화번호/이메일/식별정보 패턴을 기반으로 후보를 추출합니다.'
  },
  {
    title: '검수 및 수동 수정',
    description: '사용자가 마스킹 영역을 추가·해제·범위 조정하여 결과를 확정합니다.'
  },
  {
    title: '마스킹 PDF 생성',
    description: '확정된 영역으로 이미지 기반 PDF를 생성해 원문 노출을 최소화합니다.'
  },
  {
    title: '1회 다운로드',
    description: '짧은 만료시간의 1회성 링크로 내려받고, 완료 즉시 토큰을 폐기합니다.'
  }
];

type DisplayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DisplayToCanvasScale = {
  scaleX: number;
  scaleY: number;
};

type MaskDraft = {
  pdfId: string;
  pageNumber: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  displayWidth: number;
  displayHeight: number;
};

type OcrReviewSummary = {
  pdfId: string;
  fileName: string;
  detections: Detection[];
  candidates: MaskBoxCandidate[];
};

type UploadedPdfPreview = {
  id: string;
  file: File;
  arrayBuffer: ArrayBuffer | null;
  isReading: boolean;
  error: string;
  pageCount: number;
  pages: PageRenderState[];
};

const PDF_RENDER_SCALE = 2;
const OCR_API_URL = import.meta.env.VITE_OCR_API_URL ?? '/ocr-api';

const initialMaskingWorkflow: MaskingWorkflowState = {
  mode: 'idle',
  workingBase: 'original',
  masks: []
};

function PdfUploadPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedPdfs, setUploadedPdfs] = useState<UploadedPdfPreview[]>([]);
  const [maskingWorkflow, setMaskingWorkflow] = useState<MaskingWorkflowState>(initialMaskingWorkflow);
  const [maskDraft, setMaskDraft] = useState<MaskDraft | null>(null);
  const [isGeneratingMaskedPdf, setIsGeneratingMaskedPdf] = useState(false);
  const [isRunningAutoMask, setIsRunningAutoMask] = useState(false);
  const [autoMaskProgress, setAutoMaskProgress] = useState<{ current: number; total: number } | null>(null);
  const autoMaskRunIdRef = useRef(0);
  const autoMaskAbortControllerRef = useRef<AbortController | null>(null);
  const [maskDownloadError, setMaskDownloadError] = useState('');
  const [autoMaskError, setAutoMaskError] = useState('');
  const [ocrReviewSummaries, setOcrReviewSummaries] = useState<OcrReviewSummary[]>([]);
  const [maskFillColor, setMaskFillColor] = useState<MaskFillColor>('black');
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({});
  const [showPreviews, setShowPreviews] = useState(false);
  const [fileListVersion, setFileListVersion] = useState(0);
  const [previewVersion, setPreviewVersion] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const isReadingPdf = uploadedPdfs.some((pdf) => pdf.isReading);
  const pdfReadError = uploadedPdfs.find((pdf) => pdf.error)?.error ?? '';
  const hasRenderablePdf = uploadedPdfs.some((pdf) => pdf.arrayBuffer);
  const hasVisiblePreviewPage = showPreviews && uploadedPdfs.some((pdf) => pdf.pages.length > 0);
  const isPreviewCurrent = hasVisiblePreviewPage && previewVersion === fileListVersion;
  const canConfirmPdfPages = hasRenderablePdf && !isReadingPdf && !isPreviewCurrent;
  const finalMasks = maskingWorkflow.masks.filter((mask) => mask.status === 'accepted');
  const autoReviewMasks = maskingWorkflow.masks.filter((mask) => mask.source !== 'manual' && (mask.status === 'review' || mask.status === 'candidate'));
  const autoAcceptedMasks = maskingWorkflow.masks.filter((mask) => mask.source !== 'manual' && mask.status === 'accepted');
  const hasAutoReviewItems = ocrReviewSummaries.some((summary) => summary.detections.length > 0 || summary.candidates.length > 0);

  const isPdfFile = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  const formatFileSize = (size: number) => {
    const sizeInKb = size / 1024;

    if (sizeInKb < 1024) {
      return `${Math.round(sizeInKb).toLocaleString()}KB`;
    }

    return `${(sizeInKb / 1024).toLocaleString(undefined, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    })}MB`;
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'PDF 파일을 읽거나 렌더링하는 중 오류가 발생했습니다.';
  };

  const createUploadId = (file: File) => {
    const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    return `${file.name}-${file.lastModified}-${file.size}-${randomId}`;
  };

  const updateUploadedPdf = (id: string, updates: Partial<UploadedPdfPreview>) => {
    setUploadedPdfs((currentPdfs) => currentPdfs.map((pdf) => (pdf.id === id ? { ...pdf, ...updates } : pdf)));
  };

  const createMaskId = () => {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mask-${Date.now()}`;
  };

  const syncWorkflowMasksFromPages = (pdfs: UploadedPdfPreview[]) => {
    return pdfs.flatMap((pdf) => pdf.pages.flatMap((page) => page.masks));
  };

  const getFinalMasks = (workflow: MaskingWorkflowState) => {
    return workflow.masks.filter((mask) => mask.status === 'accepted');
  };

  const getOcrApiUrl = () => `${OCR_API_URL.replace(/\/$/, '')}/ocr`;

  const getPageImage = (pageImages: OcrPageImage[] | undefined, pageNumber: number) => {
    return pageImages?.find((pageImage) => pageImage.pageNumber === pageNumber);
  };

  const clampCanvasRect = (rect: DisplayRect, page: PageRenderState): DisplayRect => {
    const x = Math.min(Math.max(rect.x, 0), page.width);
    const y = Math.min(Math.max(rect.y, 0), page.height);

    return {
      x,
      y,
      width: Math.min(Math.max(rect.width, 0), page.width - x),
      height: Math.min(Math.max(rect.height, 0), page.height - y)
    };
  };

  const setMaskingMode = (mode: MaskingMode, workingBase: WorkingBase = maskingWorkflow.workingBase) => {
    setMaskingWorkflow((currentWorkflow) => ({ ...currentWorkflow, mode, workingBase }));
  };

  const discardAutoMasks = () => {
    setUploadedPdfs((currentPdfs) =>
      currentPdfs.map((pdf) => ({
        ...pdf,
        pages: pdf.pages.map((page) => ({
          ...page,
          masks: page.masks.filter((mask) => mask.source === 'manual')
        }))
      }))
    );

    setMaskingWorkflow((currentWorkflow) => ({
      mode: 'manualFromOriginal',
      workingBase: 'original',
      masks: currentWorkflow.masks.filter((mask) => mask.source === 'manual')
    }));
    setOcrReviewSummaries([]);
    setAutoMaskError('');
  };

  const getDisplayToCanvasScale = (page: PageRenderState, displayWidth: number, displayHeight: number): DisplayToCanvasScale => {
    return {
      scaleX: displayWidth > 0 ? page.width / displayWidth : 1,
      scaleY: displayHeight > 0 ? page.height / displayHeight : 1
    };
  };

  const displayRectToCanvasRect = (displayRect: DisplayRect, page: PageRenderState, displayWidth: number, displayHeight: number): DisplayRect => {
    const { scaleX, scaleY } = getDisplayToCanvasScale(page, displayWidth, displayHeight);
    const rawX = displayRect.x * scaleX;
    const rawY = displayRect.y * scaleY;
    const rawWidth = displayRect.width * scaleX;
    const rawHeight = displayRect.height * scaleY;
    const x = Math.min(Math.max(rawX, 0), page.width);
    const y = Math.min(Math.max(rawY, 0), page.height);

    return {
      x,
      y,
      width: Math.min(Math.max(rawWidth, 0), page.width - x),
      height: Math.min(Math.max(rawHeight, 0), page.height - y)
    };
  };

  const canvasRectToDisplayRect = (canvasRect: DisplayRect, page: PageRenderState, displayWidth: number, displayHeight: number): DisplayRect => {
    const { scaleX, scaleY } = getDisplayToCanvasScale(page, displayWidth, displayHeight);

    return {
      x: canvasRect.x / scaleX,
      y: canvasRect.y / scaleY,
      width: canvasRect.width / scaleX,
      height: canvasRect.height / scaleY
    };
  };


  const normalizeDisplayRect = (draft: Pick<MaskDraft, 'startX' | 'startY' | 'currentX' | 'currentY'>): DisplayRect => {
    const x = Math.min(draft.startX, draft.currentX);
    const y = Math.min(draft.startY, draft.currentY);

    return {
      x,
      y,
      width: Math.abs(draft.currentX - draft.startX),
      height: Math.abs(draft.currentY - draft.startY)
    };
  };

  const getPointerPositionInPage = (event: PointerEvent<HTMLDivElement>): DisplayRect => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);

    return {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
  };

  const isPageControlTarget = (target: EventTarget) => {
    return target instanceof HTMLElement && Boolean(target.closest('button, input, label'));
  };

  const handleMaskPointerDown = (event: PointerEvent<HTMLDivElement>, pdfId: string, page: PageRenderState) => {
    if (event.button !== 0 || isPageControlTarget(event.target)) return;

    const pointerPosition = getPointerPositionInPage(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setMaskDraft({
      pdfId,
      pageNumber: page.pageNumber,
      startX: pointerPosition.x,
      startY: pointerPosition.y,
      currentX: pointerPosition.x,
      currentY: pointerPosition.y,
      displayWidth: pointerPosition.width,
      displayHeight: pointerPosition.height
    });
  };

  const handleMaskPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!maskDraft) return;

    const pointerPosition = getPointerPositionInPage(event);
    setMaskDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            currentX: pointerPosition.x,
            currentY: pointerPosition.y,
            displayWidth: pointerPosition.width,
            displayHeight: pointerPosition.height
          }
        : currentDraft
    );
  };

  const handleMaskPointerUp = (event: PointerEvent<HTMLDivElement>, pdfId: string, page: PageRenderState) => {
    if (!maskDraft || maskDraft.pdfId !== pdfId || maskDraft.pageNumber !== page.pageNumber) return;

    const displayRect = normalizeDisplayRect(maskDraft);
    setMaskDraft(null);

    if (displayRect.width < 6 || displayRect.height < 6) return;

    const canvasRect = displayRectToCanvasRect(displayRect, page, maskDraft.displayWidth, maskDraft.displayHeight);
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    addMask(pdfId, page.pageNumber, {
      ...canvasRect,
      source: 'manual',
      status: 'accepted'
    });
  };

  const handleMaskPointerCancel = () => {
    setMaskDraft(null);
  };

  const addMask = (pdfId: string, pageNumber: number, mask: Omit<MaskBox, 'id' | 'pageNumber' | 'source' | 'status'> & Partial<Pick<MaskBox, 'id' | 'source' | 'status'>>) => {
    const source = mask.source ?? 'manual';
    const nextMask: MaskBox = {
      ...mask,
      id: mask.id ?? createMaskId(),
      pageNumber,
      source,
      status: mask.status ?? (source === 'manual' ? 'accepted' : 'review')
    };

    setUploadedPdfs((currentPdfs) => {
      const nextPdfs = currentPdfs.map((pdf) =>
        pdf.id === pdfId
          ? {
              ...pdf,
              pages: pdf.pages.map((page) =>
                page.pageNumber === pageNumber ? { ...page, masks: [...page.masks, nextMask] } : page
              )
            }
          : pdf
      );

      setMaskingWorkflow((currentWorkflow) => ({
        ...currentWorkflow,
        mode: source === 'manual' && currentWorkflow.mode === 'idle' ? 'manual' : currentWorkflow.mode,
        masks: syncWorkflowMasksFromPages(nextPdfs)
      }));

      return nextPdfs;
    });
  };

  const removeMask = (pdfId: string, pageNumber: number, maskId: string) => {
    setUploadedPdfs((currentPdfs) => {
      const nextPdfs = currentPdfs.map((pdf) =>
        pdf.id === pdfId
          ? {
              ...pdf,
              pages: pdf.pages.map((page) =>
                page.pageNumber === pageNumber
                  ? { ...page, masks: page.masks.filter((mask) => mask.id !== maskId) }
                  : page
              )
            }
          : pdf
      );

      setMaskingWorkflow((currentWorkflow) => ({
        ...currentWorkflow,
        masks: syncWorkflowMasksFromPages(nextPdfs)
      }));

      return nextPdfs;
    });
  };

  const setMaskStatus = (pdfId: string, pageNumber: number, maskId: string, status: MaskStatus) => {
    setUploadedPdfs((currentPdfs) => {
      const nextPdfs = currentPdfs.map((pdf) =>
        pdf.id === pdfId
          ? {
              ...pdf,
              pages: pdf.pages.map((page) =>
                page.pageNumber === pageNumber
                  ? {
                      ...page,
                      masks: page.masks.map((mask) =>
                        mask.id === maskId ? { ...mask, status } : mask
                      )
                    }
                  : page
              )
            }
          : pdf
      );

      setMaskingWorkflow((currentWorkflow) => ({
        ...currentWorkflow,
        masks: syncWorkflowMasksFromPages(nextPdfs)
      }));

      return nextPdfs;
    });
  };

  const rejectMask = (pdfId: string, pageNumber: number, maskId: string) => {
    setMaskStatus(pdfId, pageNumber, maskId, 'rejected');
  };

  const restoreMask = (pdfId: string, pageNumber: number, maskId: string) => {
    setMaskStatus(pdfId, pageNumber, maskId, 'review');
  };

  const deleteMask = (pdfId: string, pageNumber: number, mask: MaskBox) => {
    if (mask.source === 'manual') {
      removeMask(pdfId, pageNumber, mask.id);
      return;
    }

    rejectMask(pdfId, pageNumber, mask.id);
  };

  const acceptCandidateMasks = () => {
    setUploadedPdfs((currentPdfs) => {
      const nextPdfs = currentPdfs.map((pdf) => ({
        ...pdf,
        pages: pdf.pages.map((page) => ({
          ...page,
          masks: page.masks.map((mask) =>
            mask.source !== 'manual' && (mask.status === 'candidate' || mask.status === 'review')
              ? { ...mask, status: 'accepted' as MaskStatus }
              : mask
          )
        }))
      }));

      setMaskingWorkflow((currentWorkflow) => ({
        ...currentWorkflow,
        mode: currentWorkflow.mode === 'autoReview' ? 'autoEdit' : currentWorkflow.mode,
        masks: syncWorkflowMasksFromPages(nextPdfs)
      }));

      return nextPdfs;
    });
  };


  const mapCandidateToMask = (candidate: MaskBoxCandidate, page: PageRenderState, pageImage?: OcrPageImage): MaskBox => {
    const scaleX = pageImage && pageImage.width > 0 ? page.width / pageImage.width : 1;
    const scaleY = pageImage && pageImage.height > 0 ? page.height / pageImage.height : 1;
    const canvasRect = clampCanvasRect(
      {
        x: candidate.x * scaleX,
        y: candidate.y * scaleY,
        width: candidate.width * scaleX,
        height: candidate.height * scaleY
      },
      page
    );

    return {
      id: candidate.id,
      pageNumber: candidate.pageNumber,
      ...canvasRect,
      source: 'regex',
      status: 'review',
      label: candidate.label,
      confidence: candidate.confidence,
      text: candidate.rawText,
      detectionId: candidate.detectionId,
      rawText: candidate.rawText,
      maskText: candidate.maskText
    };
  };

  const applyOcrResponseToPdf = (pdfId: string, response: OcrResponse) => {
    setUploadedPdfs((currentPdfs) => {
      const nextPdfs = currentPdfs.map((pdf) => {
        if (pdf.id !== pdfId) return pdf;

        return {
          ...pdf,
          pages: pdf.pages.map((page) => {
            const pageImage = getPageImage(response.pageImages, page.pageNumber);
            const nextAutoMasks = (response.maskBoxCandidates ?? [])
              .filter((candidate) => candidate.pageNumber === page.pageNumber)
              .map((candidate) => mapCandidateToMask(candidate, page, pageImage));

            return {
              ...page,
              masks: [...page.masks.filter((mask) => mask.source === 'manual'), ...nextAutoMasks]
            };
          })
        };
      });

      setMaskingWorkflow((currentWorkflow) => ({
        ...currentWorkflow,
        mode: 'autoReview',
        workingBase: 'autoResult',
        masks: syncWorkflowMasksFromPages(nextPdfs)
      }));

      return nextPdfs;
    });
  };

  const getMaskForCandidate = (pdfId: string, candidate: MaskBoxCandidate) => {
    return uploadedPdfs
      .find((pdf) => pdf.id === pdfId)
      ?.pages.find((page) => page.pageNumber === candidate.pageNumber)
      ?.masks.find((mask) => mask.id === candidate.id);
  };

  const toggleCandidateReview = (pdfId: string, candidate: MaskBoxCandidate) => {
    const mask = getMaskForCandidate(pdfId, candidate);
    if (!mask) return;

    if (mask.status === 'rejected') {
      restoreMask(pdfId, candidate.pageNumber, mask.id);
      return;
    }

    deleteMask(pdfId, candidate.pageNumber, mask);
  };

  const handleAutoMaskReview = async () => {
    const renderablePdfs = uploadedPdfs.filter((pdf) => pdf.pages.length > 0 && pdf.file);
    if (!renderablePdfs.length) return;

    autoMaskAbortControllerRef.current?.abort();
    const runId = autoMaskRunIdRef.current + 1;
    const abortController = new AbortController();
    autoMaskRunIdRef.current = runId;
    autoMaskAbortControllerRef.current = abortController;

    discardAutoMasks();
    setIsRunningAutoMask(true);
    setAutoMaskProgress({ current: 0, total: renderablePdfs.length });
    setAutoMaskError('');
    setMaskDownloadError('');

    try {
      const summaries: OcrReviewSummary[] = [];

      for (const [index, pdf] of renderablePdfs.entries()) {
        if (autoMaskRunIdRef.current !== runId) return;
        setAutoMaskProgress({ current: index + 1, total: renderablePdfs.length });

        const response = await fetch(getOcrApiUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/pdf' },
          body: pdf.file,
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`OCR API 요청이 실패했습니다. (${response.status})`);
        }

        const ocrResponse = (await response.json()) as OcrResponse;
        if (autoMaskRunIdRef.current !== runId) return;

        applyOcrResponseToPdf(pdf.id, ocrResponse);
        summaries.push({
          pdfId: pdf.id,
          fileName: pdf.file.name,
          detections: ocrResponse.detections ?? [],
          candidates: ocrResponse.maskBoxCandidates ?? []
        });
      }

      if (autoMaskRunIdRef.current === runId) {
        setOcrReviewSummaries(summaries);
      }
    } catch (error) {
      if (autoMaskRunIdRef.current !== runId || (error instanceof DOMException && error.name === 'AbortError')) return;

      const message = error instanceof TypeError && error.message === 'Failed to fetch'
        ? `OCR API에 연결할 수 없습니다. OCR API 프록시(${OCR_API_URL})가 Vite 서버에서 접근 가능한 OCR API로 연결되는지 확인해 주세요.`
        : getErrorMessage(error);
      setAutoMaskError(message);
    } finally {
      if (autoMaskRunIdRef.current === runId) {
        setIsRunningAutoMask(false);
        setAutoMaskProgress(null);
        autoMaskAbortControllerRef.current = null;
      }
    }
  };

  const getAcceptedMasksForPage = (page: PageRenderState, masks: MaskBox[]) => {
    return masks.filter((mask) => mask.pageNumber === page.pageNumber && mask.status === 'accepted');
  };

  const loadImage = (src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('마스킹 PDF 생성을 위한 페이지 이미지를 불러올 수 없습니다.'));
      image.src = src;
    });
  };

  const getMaskFillStyle = (fillColor: MaskFillColor) => {
    return fillColor === 'white' ? '#fff' : '#000';
  };

  const createMaskedPagePng = async (page: PageRenderState, masks: MaskBox[], fillColor: MaskFillColor) => {
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

    getAcceptedMasksForPage(page, masks).forEach((mask) => {
      const x = Math.min(Math.max(mask.x, 0), page.width);
      const y = Math.min(Math.max(mask.y, 0), page.height);
      const width = Math.min(Math.max(mask.width, 0), page.width - x);
      const height = Math.min(Math.max(mask.height, 0), page.height - y);

      if (width > 0 && height > 0) {
        context.fillRect(x, y, width, height);
      }
    });

    return canvas.toDataURL('image/png');
  };

  const createImageBasedMaskedPdfBytes = async (pdfs: UploadedPdfPreview[], fillColor: MaskFillColor) => {
    const resultPdf = await PDFDocument.create();

    for (const pdf of pdfs) {
      for (const page of pdf.pages) {
        const pngDataUrl = await createMaskedPagePng(page, page.masks, fillColor);
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

    return resultPdf.save();
  };

  const getMaskedPdfFileName = () => {
    if (uploadedPdfs.length === 1) {
      const originalName = uploadedPdfs[0].file.name.replace(/\.pdf$/i, '');
      return `${originalName || 'masked'}_masked.pdf`;
    }

    return 'masked-pdfs.pdf';
  };

  const downloadPdfBytes = (bytes: Uint8Array, fileName: string) => {
    const pdfBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(pdfBuffer).set(bytes);
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleMaskedPdfDownload = async () => {
    const renderablePdfs = uploadedPdfs.filter((pdf) => pdf.pages.length > 0);
    if (!renderablePdfs.length || isGeneratingMaskedPdf) return;

    if (autoReviewMasks.length > 0) {
      setMaskDownloadError('자동 탐지 후보를 승인하거나 삭제한 뒤 다운로드할 수 있습니다.');
      return;
    }

    setIsGeneratingMaskedPdf(true);
    setMaskDownloadError('');

    try {
      const pdfBytes = await createImageBasedMaskedPdfBytes(renderablePdfs, maskFillColor);
      downloadPdfBytes(pdfBytes, getMaskedPdfFileName());
    } catch (error) {
      setMaskDownloadError(getErrorMessage(error));
    } finally {
      setIsGeneratingMaskedPdf(false);
    }
  };

  const getCurrentPageNumber = (pdf: UploadedPdfPreview) => {
    const currentPage = currentPages[pdf.id] ?? 1;
    return Math.min(Math.max(currentPage, 1), Math.max(pdf.pageCount, 1));
  };

  const setPdfCurrentPage = (pdf: UploadedPdfPreview, pageNumber: number) => {
    const maxPage = Math.max(pdf.pageCount, 1);
    const nextPageNumber = Math.min(Math.max(pageNumber, 1), maxPage);
    setCurrentPages((current) => ({ ...current, [pdf.id]: nextPageNumber }));
  };

  const handlePreviewButtonClick = () => {
    if (!canConfirmPdfPages) return;
    setShowPreviews(true);
    setPreviewVersion(fileListVersion);
  };

  const renderPdfPages = async (arrayBuffer: ArrayBuffer) => {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
    const pages: PageRenderState[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('PDF 페이지를 렌더링할 canvas context를 만들 수 없습니다.');
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({ canvasContext: context, viewport }).promise;

      pages.push({
        pageNumber,
        width: canvas.width,
        height: canvas.height,
        scale: PDF_RENDER_SCALE,
        canvasDataUrl: canvas.toDataURL('image/png'),
        masks: []
      });
    }

    return {
      pageCount: pdf.numPages,
      pages
    };
  };

  const readAndRenderPdf = async (id: string, file: File) => {
    updateUploadedPdf(id, { isReading: true, error: '', arrayBuffer: null, pageCount: 0, pages: [] });

    try {
      const arrayBuffer = await file.arrayBuffer();
      updateUploadedPdf(id, { arrayBuffer });

      const renderedPdf = await renderPdfPages(arrayBuffer);
      updateUploadedPdf(id, { ...renderedPdf, isReading: false });
    } catch (error) {
      updateUploadedPdf(id, {
        arrayBuffer: null,
        isReading: false,
        error: getErrorMessage(error),
        pageCount: 0,
        pages: []
      });
    }
  };

  const appendFiles = (nextFiles: File[]) => {
    const pdfFiles = nextFiles.filter(isPdfFile);

    if (pdfFiles.length) {
      setUploadMessage('');
      setFiles((currentFiles) => [...currentFiles, ...pdfFiles]);

      const nextUploadedPdfs = pdfFiles.map((file) => ({
        id: createUploadId(file),
        file,
        arrayBuffer: null,
        isReading: true,
        error: '',
        pageCount: 0,
        pages: []
      }));

      setShowPreviews(false);
      setFileListVersion((currentVersion) => currentVersion + 1);
      setMaskingWorkflow(initialMaskingWorkflow);
      setOcrReviewSummaries([]);
      setAutoMaskError('');
      setUploadedPdfs((currentPdfs) => [...currentPdfs, ...nextUploadedPdfs]);
      setCurrentPages((currentPagesById) => ({
        ...currentPagesById,
        ...Object.fromEntries(nextUploadedPdfs.map((pdf) => [pdf.id, 1]))
      }));
      nextUploadedPdfs.forEach((pdf) => {
        void readAndRenderPdf(pdf.id, pdf.file);
      });
    }
  };

  const selectFiles = (fileList?: FileList | null) => {
    if (!fileList?.length) return;
    appendFiles(Array.from(fileList));
  };

  const selectDroppedFiles = (dataTransfer: DataTransfer) => {
    const droppedFiles = Array.from(dataTransfer.files);
    const filesToUpload = droppedFiles.length
      ? droppedFiles
      : Array.from(dataTransfer.items)
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file));

    if (filesToUpload.some((file) => file.size === 0)) {
      setUploadMessage('드래그 앤 드롭으로 실제 파일을 읽을 수 없습니다. 찾아보기를 사용해 주세요.');
      return;
    }

    appendFiles(filesToUpload);
  };

  const removeFile = (fileIndex: number) => {
    const removedPdf = uploadedPdfs[fileIndex];

    setFiles((currentFiles) => currentFiles.filter((_, index) => index !== fileIndex));
    setFileListVersion((currentVersion) => currentVersion + 1);
    setUploadedPdfs((currentPdfs) => {
      const nextPdfs = currentPdfs.filter((_, index) => index !== fileIndex);
      setMaskingWorkflow((currentWorkflow) => ({
        ...currentWorkflow,
        masks: syncWorkflowMasksFromPages(nextPdfs)
      }));
      setOcrReviewSummaries((currentSummaries) => currentSummaries.filter((summary) => summary.pdfId !== removedPdf?.id));
      return nextPdfs;
    });

    if (removedPdf) {
      setCurrentPages((currentPagesById) => {
        const { [removedPdf.id]: _removedPage, ...remainingPages } = currentPagesById;
        return remainingPages;
      });
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadMessage('');
    selectFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectDroppedFiles(event.dataTransfer);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  return (
    <section className="section">
      <div
        className={`card upload-panel${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          id="pdf-upload-input"
          className="upload-input"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={handleInputChange}
        />
        <span className="muted upload-instruction">
          찾아보기를 눌러 마스킹할 PDF 파일(들)을 선택할 수 있습니다.
        </span>
        <label className="btn-secondary upload-button" htmlFor="pdf-upload-input">
          찾아보기
        </label>
      </div>
      {uploadMessage ? <p className="upload-message">{uploadMessage}</p> : null}
      {isReadingPdf ? <p className="upload-message">PDF 파일을 읽고 미리보기를 생성하는 중입니다.</p> : null}
      {pdfReadError ? <p className="upload-message">PDF 파일을 처리할 수 없습니다. {pdfReadError}</p> : null}
      {maskDownloadError ? <p className="upload-message">마스킹 PDF를 생성할 수 없습니다. {maskDownloadError}</p> : null}
      {autoMaskError ? <p className="upload-message">자동 탐지를 완료할 수 없습니다. {autoMaskError}</p> : null}
      {files.length ? (
        <ul className="upload-files" aria-label="선택된 PDF 파일 목록">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              <span className="upload-file-name">{file.name}</span>
              <span className="upload-file-size">{formatFileSize(file.size)}</span>
              <button type="button" aria-label={`${file.name} 업로드 제외`} onClick={() => removeFile(index)}>
                -
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={`masking-actions${hasVisiblePreviewPage ? ' has-preview-actions' : ''}`}>
        <button
          className="masking-button"
          type="button"
          data-pdf-ready={hasRenderablePdf}
          disabled={!canConfirmPdfPages}
          onClick={handlePreviewButtonClick}
        >
          PDF 파일 페이지 확인
        </button>
        {hasVisiblePreviewPage ? (
          <>
            <button
              className="masking-button"
              type="button"
              data-pdf-ready={hasRenderablePdf}
              disabled={!hasVisiblePreviewPage}
              onClick={handleAutoMaskReview}
            >
              {isRunningAutoMask && autoMaskProgress
                ? `자동 탐지 중 (${autoMaskProgress.current}/${autoMaskProgress.total})`
                : '자동 개인정보 탐지'}
            </button>
            <button
              className="masking-button"
              type="button"
              data-pdf-ready={hasRenderablePdf}
              disabled={isGeneratingMaskedPdf || !hasVisiblePreviewPage}
              onClick={handleMaskedPdfDownload}
            >
              {isGeneratingMaskedPdf ? 'PDF 생성 중' : `마스킹된 PDF 파일 다운로드${finalMasks.length ? ` (${finalMasks.length})` : ''}`}
            </button>
          </>
        ) : null}
      </div>
      <div className="mask-color-control" aria-label="마스킹 색상 선택">
        <span>마스킹 색상</span>
        <div className="mask-color-options">
          <button
            className="mask-color-option mask-color-option-black"
            type="button"
            aria-pressed={maskFillColor === 'black'}
            onClick={() => setMaskFillColor('black')}
          >
            <span className="mask-color-check" aria-hidden="true">✓</span>
            검정
          </button>
          <button
            className="mask-color-option mask-color-option-white"
            type="button"
            aria-pressed={maskFillColor === 'white'}
            onClick={() => setMaskFillColor('white')}
          >
            <span className="mask-color-check" aria-hidden="true">✓</span>
            흰색
          </button>
        </div>
      </div>
      {hasAutoReviewItems ? (
        <section className="auto-review-panel" aria-label="자동 탐지 결과 검토">
          <div className="auto-review-summary">
            <div>
              <h2>자동 탐지 결과</h2>
              <p>
                검토 대기 {autoReviewMasks.length.toLocaleString()}개 · 승인됨 {autoAcceptedMasks.length.toLocaleString()}개
              </p>
            </div>
            <div className="auto-review-actions">
              <button type="button" onClick={acceptCandidateMasks} disabled={!autoReviewMasks.length}>
                자동 후보 전체 승인
              </button>
              <button type="button" onClick={discardAutoMasks} disabled={!autoReviewMasks.length && !autoAcceptedMasks.length}>
                자동 후보 전체 폐기
              </button>
            </div>
          </div>
          <div className="auto-detection-list">
            {ocrReviewSummaries.map((summary) => (
              <div className="auto-detection-group" key={summary.pdfId}>
                <h3>{summary.fileName}</h3>
                {summary.detections.length ? (
                  <ul>
                    {summary.candidates.map((candidate) => {
                      const detection = summary.detections.find((item) => item.id === candidate.detectionId);
                      const candidateMask = getMaskForCandidate(summary.pdfId, candidate);
                      const isRejected = candidateMask?.status === 'rejected';

                      return (
                        <li key={candidate.id}>
                          <span>{candidate.label}</span>
                          <strong>{candidate.maskText || candidate.rawText}</strong>
                          <em>{candidate.pageNumber.toLocaleString()}페이지</em>
                          <button
                            className="auto-detection-delete"
                            type="button"
                            aria-label={`${candidate.label} 자동 후보 ${isRejected ? '원복' : '삭제'}`}
                            aria-pressed={isRejected}
                            title={detection?.rawText}
                            onClick={() => toggleCandidateReview(summary.pdfId, candidate)}
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>탐지된 항목이 없습니다.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {showPreviews && uploadedPdfs.length ? (
        <div className="pdf-preview-list" aria-label="PDF 미리보기 목록">
          {uploadedPdfs.map((pdf) => {
            const currentPageNumber = getCurrentPageNumber(pdf);
            const currentPage = pdf.pages[currentPageNumber - 1];

            return (
              <section className="pdf-preview-frame" key={pdf.id} aria-labelledby={`${pdf.id}-title`}>
                <div className="pdf-preview-header">
                  <div className="pdf-preview-title-row">
                    <h2 id={`${pdf.id}-title`}>{pdf.file.name}</h2>
                    <p className="muted">
                      {pdf.pageCount ? `총 ${pdf.pageCount.toLocaleString()}페이지` : '페이지 정보를 준비 중입니다.'}
                    </p>
                  </div>
                  {pdf.isReading ? <span className="pdf-preview-status">렌더링 중</span> : null}
                </div>
                {pdf.error ? <p className="upload-message">이 파일의 미리보기를 생성할 수 없습니다. {pdf.error}</p> : null}
                {currentPage ? (
                  <div className="pdf-page-viewer">
                    <div className="pdf-page-toolbar" aria-label={`${pdf.file.name} 페이지 이동`}>
                      <label className="pdf-page-input-label">
                        <span>현재 페이지</span>
                        <input
                          type="number"
                          min={1}
                          max={pdf.pageCount}
                          value={currentPageNumber}
                          onChange={(event) => {
                            const nextPageNumber = Number(event.target.value);
                            if (Number.isFinite(nextPageNumber)) {
                              setPdfCurrentPage(pdf, nextPageNumber);
                            }
                          }}
                        />
                      </label>
                      <span className="pdf-page-total">/ {pdf.pageCount.toLocaleString()}</span>
                    </div>
                    <div
                      className="pdf-page-wrapper"
                      style={{ '--page-aspect-ratio': `${currentPage.width} / ${currentPage.height}` } as CSSProperties}
                      onPointerDown={(event) => handleMaskPointerDown(event, pdf.id, currentPage)}
                      onPointerMove={handleMaskPointerMove}
                      onPointerUp={(event) => handleMaskPointerUp(event, pdf.id, currentPage)}
                      onPointerCancel={handleMaskPointerCancel}
                    >
                      <button
                        className="pdf-page-nav pdf-page-nav-prev"
                        type="button"
                        aria-label={`${pdf.file.name} 이전 페이지`}
                        disabled={currentPageNumber <= 1}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setPdfCurrentPage(pdf, currentPageNumber - 1)}
                      >
                        ‹
                      </button>
                      <img
                        src={currentPage.canvasDataUrl}
                        width={currentPage.width}
                        height={currentPage.height}
                        alt={`${pdf.file.name} ${currentPage.pageNumber}페이지 미리보기`}
                        draggable={false}
                      />
                      <div className="pdf-mask-layer">
                        {currentPage.masks
                          .filter((mask) => mask.status !== 'rejected')
                          .map((mask) => {
                            const maskRect = canvasRectToDisplayRect(mask, currentPage, 100, 100);

                            return (
                              <div
                                className={`pdf-mask-box pdf-mask-box-${mask.source} pdf-mask-box-${mask.status}`}
                                key={mask.id}
                                title={mask.label ? `${mask.label}${mask.maskText ? `: ${mask.maskText}` : ''}` : undefined}
                                style={{
                                  left: `${maskRect.x}%`,
                                  top: `${maskRect.y}%`,
                                  width: `${maskRect.width}%`,
                                  height: `${maskRect.height}%`
                                }}
                              >
                                {mask.source !== 'manual' ? <span className="pdf-mask-label">{mask.label ?? '자동 후보'}</span> : null}
                                <button
                                  className="pdf-mask-delete"
                                  type="button"
                                  aria-label={`${pdf.file.name} ${mask.pageNumber}페이지 마스킹 박스 삭제`}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteMask(pdf.id, currentPage.pageNumber, mask);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        {maskDraft && maskDraft.pdfId === pdf.id && maskDraft.pageNumber === currentPage.pageNumber ? (
                          <div
                            className="pdf-mask-box pdf-mask-box-draft"
                            style={{
                              left: `${normalizeDisplayRect(maskDraft).x}px`,
                              top: `${normalizeDisplayRect(maskDraft).y}px`,
                              width: `${normalizeDisplayRect(maskDraft).width}px`,
                              height: `${normalizeDisplayRect(maskDraft).height}px`
                            }}
                          />
                        ) : null}
                      </div>
                      <button
                        className="pdf-page-nav pdf-page-nav-next"
                        type="button"
                        aria-label={`${pdf.file.name} 다음 페이지`}
                        disabled={currentPageNumber >= pdf.pageCount}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setPdfCurrentPage(pdf, currentPageNumber + 1)}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function App() {
  const [page, setPage] = useState<'home' | 'demo'>('home');

  return (
    <main className="page">
      <Header onStart={() => setPage('home')} onShowDemo={() => setPage('demo')} />

      {page === 'demo' ? (
        <section className="section demo-page" aria-labelledby="demo-flow-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">DEMO FLOW</p>
              <h2 id="demo-flow-title">처리 단계</h2>
            </div>
          </div>
          <div className="grid">
            {steps.map((step, idx) => (
              <StepCard key={step.title} index={idx + 1} title={step.title} description={step.description} />
            ))}
          </div>
        </section>
      ) : (
        <>
          <PdfUploadPanel />
          <PolicyPanel />
        </>
      )}
    </main>
  );
}

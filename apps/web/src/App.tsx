import { type CSSProperties, type ChangeEvent, type DragEvent, type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { StepCard } from './components/StepCard';
import type { MaskBox, MaskFillColor, MaskingMode, MaskStatus, MaskingWorkflowState, PageRenderState, WorkingBase } from './maskingTypes';
import type { Detection, MaskBoxCandidate, OcrPageImage, OcrResponse } from './ocr/apiContract';
import { getFinalMasks } from './maskingWorkflow';
import './styles.css';

const steps = [
  {
    title: 'PDF 파일 업로드',
    description: '<찾아보기>로 PDF 파일을 추가합니다. 여러 파일을 올리면 파일별로 미리보기와 결과 링크가 분리됩니다.'
  },
  {
    title: 'PDF 페이지 확인',
    description: '<PDF 파일 페이지 확인>을 눌러 각 문서의 페이지를 렌더링합니다. 한 번에 한 페이지씩 확인하고, 페이지 번호 입력이나 좌우 이동 버튼으로 이동합니다.'
  },
  {
    title: '마스킹 색상 선택',
    description: '현재 마스킹 상황에서 흰색 또는 검정색 마스킹 색상을 선택합니다. 기본값은 흰색입니다.'
  },
  {
    title: '자동 개인정보 탐지 실행 및 확인',
    description: '<자동 개인정보 탐지>를 누르면 문서를 분석해 주민등록번호와 주소 후보를 생성합니다. 기본 탐지 후 <누락 탐지 보완>으로 누락 가능성이 있는 후보를 한 번 더 확인할 수 있습니다. 현재 마스킹 상황에서 파일별 자동 탐지 후보를 확인하고, <X> 버튼이나 파일 단위 체크박스로 후보를 해제하거나 다시 원복할 수 있습니다.'
  },
  {
    title: '수동 마스킹 추가',
    description: '미리보기 페이지 위에서 드래그해 수동 마스킹 박스를 추가합니다. 자동 탐지에서 누락된 영역이나 직접 가리고 싶은 영역을 보완할 수 있습니다.'
  },
  {
    title: '마스킹 상태 확인',
    description: '현재 마스킹 상황에서 파일별 자동 후보의 선택/해제 수량과 수동 마스킹 위치를 확인합니다. 수동 마스킹은 목록 또는 페이지 위 <X> 버튼으로 삭제할 수 있습니다.'
  },
  {
    title: '다운로드 링크 생성 및 다운로드',
    description: '<마스킹된 PDF 파일(들) 다운로드 링크 생성> 버튼을 누르면 파일별 링크가 생성됩니다. 링크 클릭 시 파일명 및 폴더를 선택하여 저장할 수 있습니다.'
  }
];

const guideNotes = [
  '자동 탐지는 OCR 품질과 원본 스캔 상태에 따라 누락 또는 오탐이 발생할 수 있습니다. 다운로드 전 파일별 현재 마스킹 상황과 페이지 미리보기를 함께 확인하세요.',
  '결과 PDF는 텍스트 레이어를 유지하지 않는 이미지 기반 PDF로 생성됩니다.',
  '<마스킹된 PDF 파일(들) 다운로드 링크 생성> 후 수동 마스킹을 추가하면 해당 파일의 기존 링크는 자동으로 초기화됩니다. 수정사항을 반영하려면 다운로드 링크를 다시 생성하세요.'
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

type DownloadLinkState = {
  id: string;
  url: string;
  fileName: string;
  blob: Blob;
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
};

type FileSystemWritableFileStreamLike = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandleLike = {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
};

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
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
  const [autoMaskRunType, setAutoMaskRunType] = useState<'default' | 'supplement'>('default');
  const [autoMaskProgress, setAutoMaskProgress] = useState<{ current: number; total: number } | null>(null);
  const autoMaskRunIdRef = useRef(0);
  const autoMaskAbortControllerRef = useRef<AbortController | null>(null);
  const pdfJsLibRef = useRef<typeof import('pdfjs-dist') | null>(null);
  const downloadUrlsRef = useRef<string[]>([]);
  const [maskedPdfDownloadLinks, setMaskedPdfDownloadLinks] = useState<DownloadLinkState[]>([]);
  const [isLoadingPdfRenderer, setIsLoadingPdfRenderer] = useState(false);
  const [pdfRendererError, setPdfRendererError] = useState('');
  const [isLoadingPdfGenerator, setIsLoadingPdfGenerator] = useState(false);
  const [maskDownloadError, setMaskDownloadError] = useState('');
  const [autoMaskError, setAutoMaskError] = useState('');
  const [ocrReviewSummaries, setOcrReviewSummaries] = useState<OcrReviewSummary[]>([]);
  const [maskFillColor, setMaskFillColor] = useState<MaskFillColor>('white');
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
  const finalMasks = getFinalMasks(maskingWorkflow.masks);
  const hasWorkInProgress = uploadedPdfs.length > 0 || maskingWorkflow.masks.length > 0 || maskedPdfDownloadLinks.length > 0;
  const hasAutoMaskResults = ocrReviewSummaries.length > 0;

  const clearMaskedPdfDownloadLinks = (pdfId?: string) => {
    if (!pdfId) {
      downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      downloadUrlsRef.current = [];
      setMaskedPdfDownloadLinks([]);
      return;
    }

    setMaskedPdfDownloadLinks((currentLinks) => {
      const removedLinks = currentLinks.filter((link) => link.id === pdfId);
      removedLinks.forEach((link) => URL.revokeObjectURL(link.url));
      const nextLinks = currentLinks.filter((link) => link.id !== pdfId);
      downloadUrlsRef.current = nextLinks.map((link) => link.url);
      return nextLinks;
    });
  };

  useEffect(() => {
    return () => {
      downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!hasWorkInProgress) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasWorkInProgress]);

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

    if (source === 'manual') {
      clearMaskedPdfDownloadLinks(pdfId);
    }

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

  const applyOcrResponseToPdf = (pdfId: string, response: OcrResponse, mergeMode: 'replace' | 'append' = 'replace') => {
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

            if (mergeMode === 'append') {
              const existingMaskIds = new Set(page.masks.map((mask) => mask.id));
              return {
                ...page,
                masks: [...page.masks, ...nextAutoMasks.filter((mask) => !existingMaskIds.has(mask.id))]
              };
            }

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

  const getAutoMasksForSummary = (summary: OcrReviewSummary) => {
    return summary.candidates.flatMap((candidate) => {
      const mask = getMaskForCandidate(summary.pdfId, candidate);
      return mask ? [mask] : [];
    });
  };

  const getManualMasksForPdf = (pdfId: string) => {
    return uploadedPdfs
      .find((pdf) => pdf.id === pdfId)
      ?.pages.flatMap((page) => page.masks.filter((mask) => mask.source === 'manual')) ?? [];
  };

  const setFileAutoCandidateStatus = (summary: OcrReviewSummary, status: MaskStatus) => {
    const candidateIds = new Set(summary.candidates.map((candidate) => candidate.id));
    if (!candidateIds.size) return;

    setUploadedPdfs((currentPdfs) => {
      const nextPdfs = currentPdfs.map((pdf) =>
        pdf.id === summary.pdfId
          ? {
              ...pdf,
              pages: pdf.pages.map((page) => ({
                ...page,
                masks: page.masks.map((mask) =>
                  candidateIds.has(mask.id) ? { ...mask, status } : mask
                )
              }))
            }
          : pdf
      );

      setMaskingWorkflow((currentWorkflow) => ({
        ...currentWorkflow,
        mode: currentWorkflow.mode === 'autoReview' && status === 'accepted' ? 'autoEdit' : currentWorkflow.mode,
        masks: syncWorkflowMasksFromPages(nextPdfs)
      }));

      return nextPdfs;
    });
  };

  const toggleFileAutoCandidates = (summary: OcrReviewSummary) => {
    const masks = getAutoMasksForSummary(summary);
    const shouldRejectAll = masks.length > 0 && masks.every((mask) => mask.status !== 'rejected');
    setFileAutoCandidateStatus(summary, shouldRejectAll ? 'rejected' : 'review');
  };

  const mergeOcrReviewSummaries = (currentSummaries: OcrReviewSummary[], nextSummaries: OcrReviewSummary[]) => {
    const summaryMap = new Map(currentSummaries.map((summary) => [summary.pdfId, summary]));

    for (const nextSummary of nextSummaries) {
      const currentSummary = summaryMap.get(nextSummary.pdfId);
      if (!currentSummary) {
        summaryMap.set(nextSummary.pdfId, nextSummary);
        continue;
      }

      const detectionIds = new Set(currentSummary.detections.map((detection) => detection.id));
      const candidateIds = new Set(currentSummary.candidates.map((candidate) => candidate.id));
      summaryMap.set(nextSummary.pdfId, {
        ...currentSummary,
        detections: [
          ...currentSummary.detections,
          ...nextSummary.detections.filter((detection) => !detectionIds.has(detection.id))
        ],
        candidates: [
          ...currentSummary.candidates,
          ...nextSummary.candidates.filter((candidate) => !candidateIds.has(candidate.id))
        ]
      });
    }

    return [...summaryMap.values()];
  };

  const handleAutoMaskReview = async (mode: 'default' | 'supplement' = 'default') => {
    const renderablePdfs = uploadedPdfs.filter((pdf) => pdf.pages.length > 0 && pdf.file);
    if (!renderablePdfs.length) return;

    autoMaskAbortControllerRef.current?.abort();
    const runId = autoMaskRunIdRef.current + 1;
    const abortController = new AbortController();
    autoMaskRunIdRef.current = runId;
    autoMaskAbortControllerRef.current = abortController;

    if (mode === 'default') {
      discardAutoMasks();
    }
    setAutoMaskRunType(mode);
    setIsRunningAutoMask(true);
    setAutoMaskProgress({ current: 0, total: renderablePdfs.length });
    setAutoMaskError('');
    setMaskDownloadError('');

    try {
      const summaries: OcrReviewSummary[] = [];

      for (const [index, pdf] of renderablePdfs.entries()) {
        if (autoMaskRunIdRef.current !== runId) return;
        setAutoMaskProgress({ current: index + 1, total: renderablePdfs.length });

        const response = await fetch(mode === 'supplement' ? `${getOcrApiUrl()}?psm=11` : getOcrApiUrl(), {
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

        if (mode === 'supplement' && ocrResponse.ocrOptions?.psm !== 11) {
          throw new Error('OCR API가 누락 탐지 보완 요청을 PSM 11로 처리하지 않았습니다. OCR API 컨테이너를 최신 코드로 재빌드/재시작한 뒤 다시 시도해 주세요.');
        }

        applyOcrResponseToPdf(pdf.id, ocrResponse, mode === 'supplement' ? 'append' : 'replace');
        summaries.push({
          pdfId: pdf.id,
          fileName: pdf.file.name,
          detections: ocrResponse.detections ?? [],
          candidates: ocrResponse.maskBoxCandidates ?? []
        });
      }

      if (autoMaskRunIdRef.current === runId) {
        setOcrReviewSummaries((currentSummaries) => (
          mode === 'supplement' ? mergeOcrReviewSummaries(currentSummaries, summaries) : summaries
        ));
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

  const loadPdfRenderer = async () => {
    if (pdfJsLibRef.current) {
      return pdfJsLibRef.current;
    }

    setIsLoadingPdfRenderer(true);
    setPdfRendererError('');

    try {
      const [pdfjsLib, workerModule] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.mjs?worker')
      ]);
      pdfjsLib.GlobalWorkerOptions.workerPort = new workerModule.default();
      pdfJsLibRef.current = pdfjsLib;
      return pdfjsLib;
    } catch (error) {
      const message = `PDF.js 렌더러를 불러올 수 없습니다. ${getErrorMessage(error)}`;
      setPdfRendererError(message);
      throw new Error(message);
    } finally {
      setIsLoadingPdfRenderer(false);
    }
  };

  const getMaskedPdfFileName = (pdf: UploadedPdfPreview) => {
    const originalName = pdf.file.name.replace(/\.pdf$/i, '');
    return `${originalName || 'masked'}_masked.pdf`;
  };

  const createMaskedPdfDownloadLinks = (outputs: Array<{ id: string; bytes: Uint8Array; fileName: string }>) => {
    downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));

    const links = outputs.map((output) => {
      const pdfBuffer = new ArrayBuffer(output.bytes.byteLength);
      new Uint8Array(pdfBuffer).set(output.bytes);
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      return { id: output.id, url, fileName: output.fileName, blob };
    });

    downloadUrlsRef.current = links.map((link) => link.url);
    setMaskedPdfDownloadLinks(links);
  };

  const handleMaskedPdfLinkClick = async (event: MouseEvent<HTMLAnchorElement>, downloadLink: DownloadLinkState) => {
    event.preventDefault();
    setMaskDownloadError('');

    const saveFilePicker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
    if (!saveFilePicker) {
      setMaskDownloadError('현재 브라우저 또는 접속 방식에서는 다른 이름으로 저장 창을 열 수 없습니다. Chrome/Edge에서 HTTPS 또는 localhost 주소로 접속해야 저장 위치와 파일명을 직접 선택할 수 있습니다.');
      return;
    }

    try {
      const fileHandle = await saveFilePicker({
        suggestedName: downloadLink.fileName,
        startIn: 'downloads',
        types: [
          {
            description: 'PDF 파일',
            accept: { 'application/pdf': ['.pdf'] }
          }
        ],
        excludeAcceptAllOption: true
      });
      const writable = await fileHandle.createWritable();
      await writable.write(downloadLink.blob);
      await writable.close();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMaskDownloadError(getErrorMessage(error));
    }
  };

  const handleMaskedPdfDownload = async () => {
    const renderablePdfs = uploadedPdfs.filter((pdf) => pdf.pages.length > 0);
    if (!renderablePdfs.length || isGeneratingMaskedPdf) return;

    const masksToApply = getFinalMasks(maskingWorkflow.masks);

    setIsGeneratingMaskedPdf(true);
    setMaskDownloadError('');

    try {
      setIsLoadingPdfGenerator(true);
      const { generateMaskedPdf } = await import('./maskedPdfEngine');
      const outputs = [];

      for (const pdf of renderablePdfs) {
        const pdfBytes = await generateMaskedPdf({
          documents: [pdf],
          masks: masksToApply,
          fillColor: maskFillColor
        });
        outputs.push({ id: pdf.id, bytes: pdfBytes, fileName: getMaskedPdfFileName(pdf) });
      }

      createMaskedPdfDownloadLinks(outputs);
    } catch (error) {
      setMaskDownloadError(getErrorMessage(error));
    } finally {
      setIsLoadingPdfGenerator(false);
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
    const pdfjsLib = await loadPdfRenderer();
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
      if (hasWorkInProgress && !window.confirm('새 파일을 추가하면 기존 다운로드 링크가 초기화됩니다. 계속할까요?')) {
        return;
      }

      clearMaskedPdfDownloadLinks();
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
      setUploadMessage('드래그 앤 드롭으로 실제 파일을 읽을 수 없습니다. <찾아보기>를 사용해 주세요.');
      return;
    }

    appendFiles(filesToUpload);
  };

  const removeFile = (fileIndex: number) => {
    if (!window.confirm('이 파일과 연결된 마스킹 작업이 제거될 수 있습니다. 계속할까요?')) {
      return;
    }

    clearMaskedPdfDownloadLinks();
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
          &lt;찾아보기&gt;를 눌러 마스킹할 PDF 파일(들)을 선택할 수 있습니다.
        </span>
        <label className="btn-secondary upload-button" htmlFor="pdf-upload-input">
          찾아보기
        </label>
      </div>
      {uploadMessage ? <p className="upload-message">{uploadMessage}</p> : null}
      {isReadingPdf || isLoadingPdfRenderer ? <p className="upload-message">PDF 파일을 읽고 미리보기를 생성하는 중입니다.</p> : null}
      {isLoadingPdfGenerator ? <p className="upload-message">PDF 생성 모듈을 불러오는 중입니다.</p> : null}
      {pdfRendererError ? <p className="upload-message">PDF 렌더러를 준비할 수 없습니다. {pdfRendererError}</p> : null}
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
            <div className="auto-mask-action-group" aria-label="자동 개인정보 탐지 기능">
              <button
                className="masking-button auto-mask-button"
                type="button"
                data-pdf-ready={hasRenderablePdf}
                disabled={!hasVisiblePreviewPage}
                onClick={() => handleAutoMaskReview('default')}
              >
                {isRunningAutoMask && autoMaskRunType === 'default' && autoMaskProgress
                  ? `자동 탐지 중 (${autoMaskProgress.current}/${autoMaskProgress.total})`
                  : '자동 개인정보 탐지'}
              </button>
              <button
                className="masking-button auto-mask-button"
                type="button"
                data-pdf-ready={hasRenderablePdf}
                disabled={!hasVisiblePreviewPage || !hasAutoMaskResults}
                onClick={() => handleAutoMaskReview('supplement')}
              >
                {isRunningAutoMask && autoMaskRunType === 'supplement' && autoMaskProgress
                  ? `보완 탐지 중 (${autoMaskProgress.current}/${autoMaskProgress.total})`
                  : '누락 탐지 보완'}
              </button>
            </div>
            <button
              className="masking-button"
              type="button"
              data-pdf-ready={hasRenderablePdf}
              disabled={isGeneratingMaskedPdf || !hasVisiblePreviewPage}
              onClick={handleMaskedPdfDownload}
            >
              {isGeneratingMaskedPdf ? 'PDF 생성 중' : '마스킹된 PDF 파일(들) 다운로드 링크 생성'}
            </button>
          </>
        ) : null}
      </div>
      {maskedPdfDownloadLinks.length > 0 ? (
        <div className="masked-download-link" role="status">
          <span>{maskedPdfDownloadLinks.length > 1 ? '파일별 저장 링크가 준비되었습니다.' : '저장 링크가 준비되었습니다.'}</span>
          <div className="masked-download-link-list">
            {maskedPdfDownloadLinks.map((downloadLink) => (
              <a
                key={downloadLink.id}
                href={downloadLink.url}
                download={downloadLink.fileName}
                onClick={(event) => handleMaskedPdfLinkClick(event, downloadLink)}
              >
                {downloadLink.fileName}
              </a>
            ))}
          </div>
          <button type="button" onClick={() => clearMaskedPdfDownloadLinks()}>
            초기화
          </button>
        </div>
      ) : null}
      {hasVisiblePreviewPage ? (
        <section className="auto-review-panel" aria-label="현재 마스킹 상황">
          <div className="auto-review-summary">
            <h2>현재 마스킹 상황</h2>
            <div className="mask-color-control" aria-label="마스킹 색상 선택">
              <span>마스킹 색상</span>
              <div className="mask-color-options">
                <button
                  className="mask-color-option mask-color-option-white"
                  type="button"
                  aria-pressed={maskFillColor === 'white'}
                  onClick={() => setMaskFillColor('white')}
                >
                  <span className="mask-color-check" aria-hidden="true">✓</span>
                  흰색
                </button>
                <button
                  className="mask-color-option mask-color-option-black"
                  type="button"
                  aria-pressed={maskFillColor === 'black'}
                  onClick={() => setMaskFillColor('black')}
                >
                  <span className="mask-color-check" aria-hidden="true">✓</span>
                  검정
                </button>
              </div>
            </div>
          </div>
          <div className="auto-detection-list">
            {uploadedPdfs
              .filter((pdf) => pdf.pages.length > 0)
              .map((pdf) => {
                const summary = ocrReviewSummaries.find((item) => item.pdfId === pdf.id);
                const autoMasks = summary ? getAutoMasksForSummary(summary) : [];
                const manualMasks = getManualMasksForPdf(pdf.id);
                const selectedAutoCount = autoMasks.filter((mask) => mask.status !== 'rejected').length;
                const rejectedAutoCount = autoMasks.filter((mask) => mask.status === 'rejected').length;
                const autoStatusText = summary
                  ? `선택됨 ${selectedAutoCount.toLocaleString()}개 · 해제됨 ${rejectedAutoCount.toLocaleString()}개`
                  : '';
                const allAutoSelected = autoMasks.length > 0 && autoMasks.every((mask) => mask.status !== 'rejected');

                return (
                  <div className="auto-detection-group" key={pdf.id}>
                    <div className="auto-detection-file-row">
                      <span>{pdf.file.name}</span>
                    </div>
                    <div className="auto-detection-columns">
                      <div className="auto-detection-column">
                        <div className="auto-detection-column-header">
                          <h4>
                            자동 탐지 {autoStatusText ? <span className="auto-detection-status">{autoStatusText}</span> : null}
                          </h4>
                          <label className="auto-file-toggle" aria-label={`${pdf.file.name} 자동 후보 전체 설정 또는 해제`}>
                            <input
                              type="checkbox"
                              checked={allAutoSelected}
                              disabled={!summary?.candidates.length}
                              onChange={() => {
                                if (summary) {
                                  toggleFileAutoCandidates(summary);
                                }
                              }}
                            />
                          </label>
                        </div>
                        {summary?.candidates.length ? (
                          <ul>
                            {summary.candidates.map((candidate) => {
                              const detection = summary.detections.find((item) => item.id === candidate.detectionId);
                              const candidateMask = getMaskForCandidate(pdf.id, candidate);
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
                                    onClick={() => toggleCandidateReview(pdf.id, candidate)}
                                  >
                                    ×
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p>{summary ? '탐지된 항목이 없습니다.' : '자동 탐지가 아직 실행되지 않았습니다.'}</p>
                        )}
                      </div>
                      <div className="auto-detection-column manual-mask-column">
                        <h4>{`수동 마스킹 ${manualMasks.length.toLocaleString()}개`}</h4>
                        {manualMasks.length ? (
                          <ul>
                            {manualMasks.map((mask) => (
                              <li key={mask.id}>
                                <span>수동</span>
                                <strong>{`${mask.width.toFixed(0)}×${mask.height.toFixed(0)}`}</strong>
                                <em>{mask.pageNumber.toLocaleString()}페이지</em>
                                <button
                                  className="auto-detection-delete"
                                  type="button"
                                  aria-label={`${pdf.file.name} ${mask.pageNumber}페이지 수동 마스킹 삭제`}
                                  onClick={() => deleteMask(pdf.id, mask.pageNumber, mask)}
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>수동 마스킹 없음</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
            <div className="section-header-copy">
              <p className="eyebrow">USER GUIDE</p>
              <h2 id="demo-flow-title">사용 방법</h2>
              <p className="section-description">
                PDF 파일을 페이지별로 확인 후, 개인정보를 자동 탐지하고 수동 마스킹을 추가한 뒤 파일별 마스킹 PDF 저장 링크를 생성합니다.
              </p>
            </div>
          </div>
          <div className="grid guide-grid">
            {steps.map((step, idx) => (
              <StepCard key={step.title} index={idx + 1} title={step.title} description={step.description} />
            ))}
          </div>
          <div className="guide-notes" aria-label="추가 안내">
            {guideNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </section>
      ) : (
        <PdfUploadPanel />
      )}
    </main>
  );
}

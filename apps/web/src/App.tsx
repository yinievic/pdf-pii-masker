import { type CSSProperties, type ChangeEvent, type DragEvent, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Header } from './components/Header';
import { PolicyPanel } from './components/PolicyPanel';
import { StepCard } from './components/StepCard';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
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

type MaskSource = 'manual' | 'ocr' | 'regex' | 'llm';

type MaskBox = {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source?: MaskSource;
  label?: string;
};

type PageRenderState = {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  canvasDataUrl: string;
  masks: MaskBox[];
};

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

function PdfUploadPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedPdfs, setUploadedPdfs] = useState<UploadedPdfPreview[]>([]);
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({});
  const [showPreviews, setShowPreviews] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const isReadingPdf = uploadedPdfs.some((pdf) => pdf.isReading);
  const pdfReadError = uploadedPdfs.find((pdf) => pdf.error)?.error ?? '';
  const hasRenderablePdf = uploadedPdfs.some((pdf) => pdf.arrayBuffer);
  const hasVisiblePreviewPage = showPreviews && uploadedPdfs.some((pdf) => pdf.pages.length > 0);

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

  const addMask = (pdfId: string, pageNumber: number, mask: Omit<MaskBox, 'id' | 'pageNumber'> & Partial<Pick<MaskBox, 'id'>>) => {
    const nextMask: MaskBox = {
      ...mask,
      id: mask.id ?? createMaskId(),
      pageNumber
    };

    setUploadedPdfs((currentPdfs) =>
      currentPdfs.map((pdf) =>
        pdf.id === pdfId
          ? {
              ...pdf,
              pages: pdf.pages.map((page) =>
                page.pageNumber === pageNumber ? { ...page, masks: [...page.masks, nextMask] } : page
              )
            }
          : pdf
      )
    );
  };

  const removeMask = (pdfId: string, pageNumber: number, maskId: string) => {
    setUploadedPdfs((currentPdfs) =>
      currentPdfs.map((pdf) =>
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
      )
    );
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
    setShowPreviews(true);
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
    setUploadedPdfs((currentPdfs) => currentPdfs.filter((_, index) => index !== fileIndex));

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
        <button className="masking-button" type="button" data-pdf-ready={hasRenderablePdf} onClick={handlePreviewButtonClick}>
          PDF 파일 페이지 확인
        </button>
        {hasVisiblePreviewPage ? (
          <button className="masking-button" type="button" data-pdf-ready={hasRenderablePdf}>
            PDF 파일 마스킹
          </button>
        ) : null}
      </div>
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
                    >
                      <button
                        className="pdf-page-nav pdf-page-nav-prev"
                        type="button"
                        aria-label={`${pdf.file.name} 이전 페이지`}
                        disabled={currentPageNumber <= 1}
                        onClick={() => setPdfCurrentPage(pdf, currentPageNumber - 1)}
                      >
                        ‹
                      </button>
                      <img
                        src={currentPage.canvasDataUrl}
                        width={currentPage.width}
                        height={currentPage.height}
                        alt={`${pdf.file.name} ${currentPage.pageNumber}페이지 미리보기`}
                      />
                      <button
                        className="pdf-page-nav pdf-page-nav-next"
                        type="button"
                        aria-label={`${pdf.file.name} 다음 페이지`}
                        disabled={currentPageNumber >= pdf.pageCount}
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

import { type ChangeEvent, type DragEvent, useState } from 'react';
import { Header } from './components/Header';
import { PolicyPanel } from './components/PolicyPanel';
import { StepCard } from './components/StepCard';
import './styles.css';

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

function PdfUploadPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

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

  const appendFiles = (nextFiles: File[]) => {
    const pdfFiles = nextFiles.filter(isPdfFile);

    if (pdfFiles.length) {
      setUploadMessage('');
      setFiles((currentFiles) => [...currentFiles, ...pdfFiles]);
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
    setFiles((currentFiles) => currentFiles.filter((_, index) => index !== fileIndex));
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
      <button className="masking-button" type="button">
        마스킹하기
      </button>
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

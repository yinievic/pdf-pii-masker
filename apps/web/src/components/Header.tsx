type HeaderProps = {
  onStart: () => void;
  onShowDemo: () => void;
};

export function Header({ onStart, onShowDemo }: HeaderProps) {
  return (
    <header className="hero card">
      <h1>PDF 개인정보 마스킹</h1>
      <p className="subtitle">
        PDF 파일을 페이지별로 확인 후, 개인정보를 자동 탐지하고 수동 마스킹을 추가한 뒤
        <br />
        파일별 이미지형 마스킹 PDF 저장 링크를 생성합니다.
      </p>
      <div className="hero-actions">
        <button className="btn-primary" onClick={onStart}>
          지금 시작
        </button>
        <button className="btn-secondary" onClick={onShowDemo}>
          사용 방법
        </button>
      </div>
    </header>
  );
}

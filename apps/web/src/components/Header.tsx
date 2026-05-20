type HeaderProps = {
  onStart: () => void;
  onShowDemo: () => void;
};

export function Header({ onStart, onShowDemo }: HeaderProps) {
  return (
    <header className="hero card">
      <p className="eyebrow">SESSION ACTIVE · TTL PROTECTED</p>
      <h1>PDF 개인정보 마스킹</h1>
      <p className="subtitle">
        PDF 파일을 업로드하면 개인식별정보 등을 탐지하고,
        <br />
        검수 후 마스킹된 이미지형 PDF를 1회성 링크로 안전하게 내려받을 수 있습니다.
      </p>
      <div className="hero-actions">
        <button className="btn-primary" onClick={onStart}>
          지금 시작
        </button>
        <button className="btn-secondary" onClick={onShowDemo}>
          데모 흐름 보기
        </button>
      </div>
    </header>
  );
}

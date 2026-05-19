export function Header() {
  return (
    <header className="hero card">
      <p className="eyebrow">SESSION ACTIVE · TTL PROTECTED</p>
      <h1>PDF 개인정보 마스킹</h1>
      <p className="subtitle">
        공문서·계약서 PDF를 업로드하면 개인정보를 탐지하고, 검수 후 마스킹된 이미지형 PDF를 1회성
        링크로 안전하게 내려받을 수 있습니다.
      </p>
      <div className="hero-actions">
        <button className="btn-primary">지금 시작</button>
        <button className="btn-secondary">데모 흐름 보기</button>
      </div>
    </header>
  );
}

const steps = ['업로드', '개인정보 탐지', '검수/수정', '마스킹 PDF 생성', '1회 다운로드'];

export function App() {
  return (
    <div className="page">
      <header className="hero card">
        <h1>PDF 개인정보 마스킹 (PC 샘플)</h1>
        <p>
          공문서/계약서 PDF를 업로드해 개인정보를 탐지하고, 마스킹된 이미지형 PDF를 1회성 링크로
          다운로드하는 샘플 화면입니다.
        </p>
      </header>

      <section className="card">
        <h2>처리 단계</h2>
        <ol className="steps">
          {steps.map((step, idx) => (
            <li key={step}>
              <strong>{idx + 1}.</strong> {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid-2">
        <article className="card">
          <h2>1) 업로드</h2>
          <div className="upload-box">PDF 파일을 여기에 드래그하거나 클릭해 업로드</div>
          <ul>
            <li>권장 제한: 최대 20MB, 200페이지</li>
            <li>허용 형식: .pdf</li>
          </ul>
        </article>

        <article className="card">
          <h2>2) 개인정보 후보</h2>
          <div className="preview-box">
            <p>탐지 예시</p>
            <p>홍길동 / 010-1234-5678 / test@example.com</p>
            <div className="mask-sample">██████ / ███████████ / █████████████</div>
          </div>
          <p className="muted">자동 탐지 결과를 사용자가 추가/해제/범위 조정할 수 있음</p>
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <h2>3) 다운로드</h2>
          <p>마스킹 완료 후 1회 다운로드 링크를 발급합니다.</p>
          <button className="primary">1회 다운로드 링크 발급 (샘플 버튼)</button>
          <p className="muted">만료 예시: 05:00 / 다운로드 완료 시 즉시 폐기</p>
        </article>

        <article className="card">
          <h2>보안 정책(샘플 표기)</h2>
          <ul>
            <li>업로드/결과 파일 TTL 자동 삭제</li>
            <li>페이지 이탈 시 세션 정리 API 호출</li>
            <li>서버 스케줄러로 유실 세션 재정리</li>
          </ul>
        </article>
      </section>
    </div>
  );
}

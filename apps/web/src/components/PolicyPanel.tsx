export function PolicyPanel() {
  return (
    <section className="card policy-panel">
      <h2>보안/삭제 정책</h2>
      <ul>
        <li>업로드 원본·중간 결과·최종 파일 모두 TTL 정책으로 자동 삭제</li>
        <li>페이지 이탈 시 세션 정리 API 호출로 즉시 삭제 시도</li>
        <li>예외 상황은 서버 스케줄러가 짧은 주기로 재정리</li>
        <li>다운로드 토큰은 1회 사용 후 즉시 폐기</li>
      </ul>
    </section>
  );
}

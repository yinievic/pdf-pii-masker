import { useState } from 'react';
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
        <PolicyPanel />
      )}
    </main>
  );
}

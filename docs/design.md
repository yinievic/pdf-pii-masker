# Design System (Supabase-inspired, for PDF PII Masking Web)

> 목적: 본 문서는 `apps/web`의 PC 우선 MVP UI를 빠르게 일관성 있게 구현하기 위한 내부 템플릿이다.
> 원본 레퍼런스는 Supabase 감성(다크/개발자 친화/그린 포인트)을 참고하되, 본 제품 목적(문서 업로드·검수·1회 다운로드)에 맞게 단순화한다.

## 1. 제품 맥락에 맞춘 적용 범위

- **적용 대상**: 업로드 페이지, 검수 페이지, 다운로드 페이지, 공통 내비게이션/상태 표시.
- **비적용(현재 제외)**: 모바일 전용 최적화, 마케팅 랜딩용 과한 애니메이션, 복잡한 브랜딩 인터랙션.
- **핵심 UX 목표**:
  1. 사용자가 처리 단계를 한눈에 이해할 것
  2. 개인정보 탐지/수정 결과를 신뢰할 수 있을 것
  3. 1회 다운로드와 TTL 삭제 정책이 명확히 전달될 것

---

## 2. Color Tokens (제품 맞춤 축약판)

```css
:root {
  --bg-page: #171717;
  --bg-elevated: #1d1d1d;
  --bg-deep: #0f0f0f;

  --text-primary: #fafafa;
  --text-secondary: #b4b4b4;
  --text-muted: #898989;

  --border-subtle: #242424;
  --border-default: #2e2e2e;
  --border-strong: #363636;

  --brand-green: #3ecf8e;
  --brand-green-link: #00c573;
  --brand-green-border: rgba(62, 207, 142, 0.3);

  --state-warn: hsla(45, 100%, 62%, 0.9);
  --state-error: hsla(8, 86%, 60%, 0.95);
}
```

### 사용 규칙
- 배경은 `--bg-page`/`--bg-elevated` 위주.
- 강조는 초록색을 남용하지 않고 **링크/포커스/핵심 CTA**에 제한.
- 깊이는 그림자 대신 테두리 단계(`subtle/default/strong`)로 표현.

---

## 3. Typography

- **Primary Sans**: `Circular, Inter, Helvetica Neue, Arial, sans-serif`
- **Mono Label**: `Source Code Pro, Menlo, monospace`

| Role | Size | Weight | Line-height | Note |
|---|---:|---:|---:|---|
| Hero | 56px | 400 | 1.05 | 제품 소개 헤더 (72px는 내부 도구 화면에 과도해 축소) |
| Section Title | 32px | 400 | 1.2 | 주요 섹션 제목 |
| Card Title | 22px | 400 | 1.3 | 카드 제목 |
| Body | 16px | 400 | 1.5 | 기본 본문 |
| Button | 14px | 500 | 1.2 | 버튼 |
| Small | 12px | 400 | 1.35 | 보조 설명 |
| Code Label | 12px | 400 | 1.33 | uppercase + letter-spacing: 1.2px |

### 제품 맞춤 변경점
- Supabase 스타일의 72px hero는 내부 도구형 화면에서 과해 **56px로 조정**.
- 정보 밀도가 높은 검수 화면에서 가독성을 위해 본문 line-height를 1.5 유지.

---

## 4. Components (우리 목표 기준)

### 4.1 Navigation (Sticky)
- 배경: `--bg-page`
- 하단 보더: `1px solid --border-subtle`
- 우측 액션: `새 세션 시작` Pill 버튼
- 상태 배지: `SESSION ACTIVE`, `TTL 09:42`

### 4.2 Progress Stepper (핵심)
- 5단계: 업로드 → 탐지 → 검수 → 생성 → 다운로드
- 활성 단계: `--brand-green-border` + `--text-primary`
- 완료 단계: 테두리 `--brand-green`

### 4.3 Upload Dropzone
- 배경: `--bg-elevated`
- 테두리: `1px dashed --border-strong`
- 호버: 테두리 `--brand-green-border`
- 안내문구: 허용 파일/용량/페이지 제한 명시

### 4.4 Detection/Review Card
- 탐지 건수, 위험도, 수동 수정 버튼 배치
- “마스킹 사유” 태그(전화번호/이메일/주민번호)
- 본문 텍스트에 샘플 마스킹 프리뷰 표시

### 4.5 One-time Download Panel
- 토큰 만료 시간(카운트다운)
- `1회 다운로드` CTA는 **Pill(9999px)**
- 다운로드 성공 후 토큰 폐기 상태를 명확히 표시

### 4.6 Alert/Policy Box
- 메시지: “페이지 이탈 시 즉시 삭제 시도, 실패 시 TTL 자동 삭제”
- 경고/오류 색은 상태 토큰으로 제한적으로 사용

---

## 5. Spacing, Radius, Border, Shadow

- **Spacing scale**: 8px 기반 (`8, 12, 16, 24, 32, 48, 64, 96`)
- **Radius**:
  - 6px: 보조 버튼/입력
  - 12px: 카드
  - 9999px: 핵심 CTA/탭
- **Shadow**: 기본적으로 미사용
- **Focus**: `0 0 0 3px rgba(62, 207, 142, 0.2)`

---

## 6. IA별 화면 구조 (PC 우선)

### UploadPage
1. 상단 내비게이션
2. Hero + 정책 요약
3. 업로드 박스
4. 처리 제한/보안 안내

### ReviewPage
1. Progress Stepper
2. 좌측: PDF 프리뷰(페이지 이동)
3. 우측: 탐지 목록 + 수정 패널
4. 하단: “마스킹 PDF 생성” 액션

### DownloadPage
1. 결과 요약(파일명/페이지 수/생성시각)
2. 1회 다운로드 CTA
3. 만료 타이머 + 폐기 정책 고지

---

## 7. Do / Don’t (실무판)

### Do
- 다크 배경 + 보더 대비로 구조를 분리한다.
- 초록 포인트는 핵심 행동/상태 강조에만 사용한다.
- 정책 문구(TTL/1회성/삭제 시점)를 사용자 행동 근처에 배치한다.

### Don’t
- 카드 그림자를 크게 넣지 않는다.
- 본문에 700 볼드 남용하지 않는다.
- 경고색(노랑/빨강)을 브랜딩 색처럼 사용하지 않는다.

---

## 8. Implementation checklist (현재 저장소 기준)

- [ ] `apps/web/src/styles.css`를 토큰 기반 CSS 변수로 교체
- [ ] `apps/web/src/App.tsx`를 3개 페이지 구조(Upload/Review/Download)로 분리
- [ ] 공통 컴포넌트 `Stepper`, `PolicyBox`, `TokenTimer` 추가
- [ ] 정책 문구를 UI 내 고정 위치에 배치
- [ ] (선택) 다크 테마 대비 접근성(AA) 점검

---

## 9. Designer/Dev handoff 문구 템플릿

- "이 화면은 PC 우선이며 모바일 레이아웃은 이번 스프린트 범위에서 제외한다."
- "브랜드 포인트 컬러는 링크/핵심 CTA/활성 상태에만 사용한다."
- "파일 삭제 정책은 사용자가 클릭하는 액션 근처에서 반복 노출한다."

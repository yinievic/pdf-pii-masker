# PDF 개인정보 마스킹 웹앱 기획안 (React + TypeScript + Vite)

## 1) 아이디어 보강점

### A. 기능 보강
- **개인정보 탐지 모드 2단계**
  - 1차: 정규식 기반(주민등록번호/전화번호/이메일/주소 패턴)
  - 2차: 문맥 기반(이름 + 직책 + 연락처 같은 조합 탐지)
- **수동 보정 UX**
  - 자동 탐지 결과를 사용자에게 하이라이트로 보여주고, 사용자가
    - 마스킹 추가
    - 마스킹 해제
    - 마스킹 범위 확대/축소
    를 할 수 있게 구성
- **문서 유형 프리셋**
  - 공문서/계약서별로 탐지 정책 프리셋 제공
  - 예: 계약서에서는 계좌/서명/연락처 민감도 상향
- **마스킹 사유 태깅**
  - 마스킹 블록별 사유(예: 연락처, 고유식별정보) 저장
  - 추후 감사 로그/검수 시 유용

### B. 보안/개인정보 처리 보강
- **파일 비영구 저장 원칙**
  - 업로드 원본, 처리 중 산출물 모두 TTL(예: 10~30분) 적용
  - 다운로드 완료 또는 다운로드 페이지 종료 이벤트 시 즉시 삭제 시도
- **서버 저장소 분리**
  - 임시 저장소를 애플리케이션 본 저장소와 분리(예: tmp 볼륨/버킷)
- **다운로드 링크 일회성 토큰**
  - 단일 사용 + 짧은 만료시간(예: 5분)
  - 토큰 재사용/만료 시 즉시 무효 응답
- **전송 및 로그 최소화**
  - HTTPS 강제
  - 요청/응답 로그에 원문 텍스트, 파일명, 식별자 평문을 남기지 않음
- **운영자 접근통제**
  - 임시 파일 경로에 대한 운영자 접근 권한 최소화

### C. 품질/운영 보강
- **처리 상태 가시화**
  - 업로드 → OCR/탐지 → 미리보기 → 확정 → 다운로드 단계 표시
- **실패 복구 UX**
  - OCR 실패/용량 초과/암호화 PDF 등에 대해 명확한 재시도 안내
- **성능 제한 정책**
  - 파일 크기, 페이지 수 제한(예: 20MB, 200p)
  - 큐 기반 처리(동시 사용자 대비)
- **감사/추적 메타데이터 최소 기록**
  - 파일 내용 대신 처리 성공 여부/소요시간/오류코드 정도만 저장

---

## 2) 최소 구현 흐름(권장)

1. 사용자가 PDF 업로드
2. 서버가 PDF를 페이지 이미지로 변환
3. OCR 또는 텍스트 레이어 추출
4. 개인정보 후보 탐지(정규식 + 규칙)
5. 프론트에서 후보 하이라이트 미리보기 + 수동 수정
6. 확정된 마스킹 좌표를 서버에 전달
7. 서버가 각 페이지 이미지에 마스킹 렌더링 후 새 PDF 생성(이미지 기반)
8. 일회성 다운로드 링크 발급
9. 다운로드 완료 또는 만료/페이지 종료 시 파일 및 토큰 삭제

---

## 3) React + TypeScript + Vite 기준 개략 파일 구조

```txt
project-root/
├─ apps/
│  └─ web/
│     ├─ index.html
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ vite.config.ts
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ pages/
│        │  ├─ UploadPage.tsx
│        │  ├─ ReviewPage.tsx
│        │  └─ DownloadPage.tsx
│        ├─ components/
│        │  ├─ FileDropzone.tsx
│        │  ├─ PdfPreview.tsx
│        │  ├─ MaskLayerEditor.tsx
│        │  ├─ ProgressTracker.tsx
│        │  └─ ExpireTimer.tsx
│        ├─ features/
│        │  ├─ upload/
│        │  │  ├─ api.ts
│        │  │  └─ types.ts
│        │  ├─ detection/
│        │  │  ├─ api.ts
│        │  │  └─ types.ts
│        │  ├─ masking/
│        │  │  ├─ api.ts
│        │  │  └─ types.ts
│        │  └─ download/
│        │     ├─ api.ts
│        │     └─ types.ts
│        ├─ hooks/
│        │  ├─ useUpload.ts
│        │  ├─ useDetection.ts
│        │  ├─ useMaskEditor.ts
│        │  └─ useDownloadToken.ts
│        ├─ store/
│        │  └─ sessionStore.ts
│        ├─ lib/
│        │  ├─ client.ts
│        │  ├─ validators.ts
│        │  └─ constants.ts
│        └─ types/
│           └─ common.ts
├─ services/
│  └─ api/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ server.ts
│        ├─ routes/
│        │  ├─ upload.ts
│        │  ├─ detect.ts
│        │  ├─ mask.ts
│        │  └─ download.ts
│        ├─ controllers/
│        │  ├─ uploadController.ts
│        │  ├─ detectController.ts
│        │  ├─ maskController.ts
│        │  └─ downloadController.ts
│        ├─ domain/
│        │  ├─ entities/
│        │  │  ├─ DocumentSession.ts
│        │  │  └─ MaskRegion.ts
│        │  ├─ services/
│        │  │  ├─ PdfRenderService.ts
│        │  │  ├─ OcrService.ts
│        │  │  ├─ PiiDetectionService.ts
│        │  │  ├─ MaskingService.ts
│        │  │  └─ OneTimeLinkService.ts
│        │  └─ policies/
│        │     └─ retentionPolicy.ts
│        ├─ infra/
│        │  ├─ storage/
│        │  │  ├─ TempFileStore.ts
│        │  │  └─ cleanupWorker.ts
│        │  ├─ queue/
│        │  │  └─ jobQueue.ts
│        │  └─ security/
│        │     ├─ token.ts
│        │     └─ auditLogger.ts
│        ├─ middleware/
│        │  ├─ errorHandler.ts
│        │  ├─ requestLimit.ts
│        │  └─ authOptional.ts
│        └─ types/
│           └─ dto.ts
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ piiPatterns.ts
│        ├─ documentPreset.ts
│        └─ apiContract.ts
├─ docs/
│  ├─ webapp_concept.md
│  ├─ api-spec.md
│  ├─ privacy-policy-draft.md
│  └─ threat-model.md
└─ pnpm-workspace.yaml
```

---

## 4) 핵심 API(초안)

- `POST /v1/upload`
  - 입력: PDF 파일
  - 출력: `sessionId`, `pageCount`, `expiresAt`
- `POST /v1/detect`
  - 입력: `sessionId`, `documentType`(official/contract)
  - 출력: 페이지별 개인정보 후보 좌표 목록
- `POST /v1/mask`
  - 입력: `sessionId`, 확정 마스킹 좌표
  - 출력: `resultId`, `downloadToken`, `downloadExpiresAt`
- `GET /v1/download/:token`
  - 출력: 마스킹된 PDF
  - 제약: 1회 다운로드 후 토큰 즉시 폐기
- `DELETE /v1/session/:sessionId`
  - 출력: 삭제 성공 여부
  - 용도: 사용자가 페이지 이탈 시 즉시 정리

---

## 5) "페이지를 닫으면 파일 삭제" 요구사항 현실화 포인트

브라우저 종료/탭 강제 종료 상황에서 100% 즉시 삭제 보장은 어려우므로, 아래 **이중 전략**이 안전함.

- 1차: 프론트에서 `pagehide`/`visibilitychange` 이벤트 시 `DELETE /session` 호출
- 2차: 서버에서 TTL 만료 스케줄러(예: 5분 주기)로 유실 세션 강제 삭제

즉, 제품 문구는 "페이지 이탈 시 즉시 삭제를 시도하며, 예외 상황에서도 짧은 만료시간 내 자동 삭제"로 정의하는 것이 정확함.

---

## 6) MVP 범위 추천(최소)

- 문서 업로드
- 정규식 기반 PII 자동 탐지(주민번호/전화/이메일)
- 탐지 결과 수동 보정
- 마스킹된 이미지형 PDF 생성
- 일회성 다운로드 링크 + TTL 삭제

위 범위로 먼저 완성하고, 이후
- 고도화 탐지 모델,
- 문서 유형별 정책,
- 관리자 감사 대시보드
순으로 확장하는 것이 리스크가 낮음.

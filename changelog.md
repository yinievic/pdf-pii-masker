# Changelog

## 2026-05-20 - Version 4 common mask workflow state

### Summary

Version 4 기준으로 수동 마스킹과 자동 OCR/정규식 후보를 같은 `MaskBox` 구조에서 다룰 수 있도록 상태 모델을 확장했다. 아직 UI 드래그나 OCR 실행은 구현하지 않고, 후속 단계에서 사용할 공통 상태·전환·산정 함수를 준비했다.

### Version 3 보강

- `PageRenderState`가 `canvasDataUrl`과 페이지별 `masks` 배열을 보유하도록 정리했다.
- `MaskBox`를 페이지별 canvas 좌표 기준으로 관리한다.
- 화면 표시 좌표와 canvas 좌표를 변환하는 함수를 분리했다.
- 특정 페이지에 mask를 추가하는 `addMask`와 특정 mask를 삭제하는 `removeMask`를 준비했다.

### Version 4 구현

- `MaskStatus`를 추가해 `candidate`, `accepted`, `rejected` 상태를 표현한다.
- `MaskingMode`와 `WorkingBase`를 추가해 현재 작업 모드와 작업 기준을 표현한다.
- `MaskBox`에 필수 `source`, `status`와 선택 `label`, `confidence`, `text`를 포함했다.
- `MaskingWorkflowState`를 추가해 모드, 작업 기준, 최종 후보 masks를 함께 관리한다.
- 수동 mask는 기본적으로 `source: "manual"`, `status: "accepted"`로 저장되도록 했다.
- 자동 계열 mask는 기본적으로 `candidate` 상태로 들어갈 수 있도록 했다.
- `getFinalMasks`로 다운로드 대상인 `accepted` mask만 산정할 수 있게 했다.
- `discardAutoMasks`로 OCR/regex 계열 결과를 폐기하고 원본 기준 수동 모드로 전환할 수 있는 상태 구조를 준비했다.
- `rejectMask`, `acceptCandidateMasks`로 자동 후보 거절·승인 흐름을 상태 레벨에서 준비했다.

### Verification

- `npm run build` 통과를 확인했다.
- Vite 개발 서버 `http://127.0.0.1:5173`에서 Version 4 변경 소스가 제공되는 것을 확인했다.
- mock 데이터로 `accepted` mask만 최종 대상에 포함되는지 확인했다.
- mock 데이터로 OCR/regex 결과 폐기 시 수동 mask만 남고 `manualFromOriginal` / `original` 상태가 되는지 확인했다.

### Notes

- `plan.md` ver.2.0 기준에 맞춰 `MaskSource`는 `manual | ocr | regex | llm`을 유지한다.
- 수동 드래그 UI, OCR API, PDF 재생성 및 다운로드 엔진은 아직 구현하지 않았다.


## 2026-05-20 - Version 2 PDF page preview flow

### Summary

pdf-pii-masker PDF 개인(신용)정보 마스킹 웹앱의 Version 1 보완과 Version 2 구현을 완료했다. 기존 PDF 업로드 UI를 유지하면서, 브라우저 안에서 PDF 파일을 ArrayBuffer로 읽고 PDF.js로 페이지를 렌더링하는 MVP 기반을 마련했다.

### Version 1 보완

- 선택 또는 드래그앤드롭된 PDF 파일을 `file.arrayBuffer()`로 읽는 흐름을 추가했다.
- 선택된 `File` 상태를 유지하면서 PDF 처리용 ArrayBuffer 상태를 관리할 수 있도록 구조를 확장했다.
- PDF 읽기 중 상태와 오류 메시지 상태를 추가해 사용자에게 처리 상태를 표시하도록 했다.

### Version 2 구현

- `pdfjs-dist`를 도입하고 Vite 환경에서 PDF.js worker를 연결했다.
- PDF 파일별 렌더링 상태를 추가했다.
- PDF 업로드 후 `getDocument()`, `getPage()`, `viewport`, `canvas.render()` 흐름으로 전체 페이지를 렌더링한다.
- 렌더링 scale은 우선 `2` 기준으로 설정했다.
- 파일 목록 아래의 `PDF 파일 페이지 확인` 버튼을 누르면 미리보기 영역이 표시된다.
- 미리보기는 파일별로 독립된 frame을 사용한다.
- 각 문서는 한 번에 한 페이지씩 표시되며, 좌우 페이지 이동 버튼과 현재 페이지 숫자 입력으로 이동할 수 있다.
- 실제 표시 가능한 페이지가 있는 경우에만 `PDF 파일 페이지 확인` / `PDF 파일 마스킹` 버튼이 2열로 분리된다.
- 미리보기 헤더에는 파일명과 `총 x페이지` 문구를 같은 줄에 표시한다.
- 업로드 박스 높이를 기존 대비 절반 수준으로 줄였다.

### UI/UX adjustments

- `PDF 파일 페이지 확인` 버튼 hover 테두리를 더 진한 초록색으로 조정했다.
- 페이지 이동 버튼 크기를 키우고, 화살표가 버튼 중앙에 오도록 정렬을 보정했다.
- 미리보기 페이지 wrapper는 향후 마스킹 박스 overlay를 얹을 수 있는 구조로 유지했다.

### Verification

- 사용자가 브라우저에서 Version 2 수동 검증을 완료했다.
- `npm run build`를 반복 실행해 TypeScript 및 Vite production build 통과를 확인했다.
- Vite 개발 서버 `http://127.0.0.1:5173`에서 변경된 소스가 제공되는 것을 확인했다.
- 샘플 PDF를 PDF.js로 로드하고 canvas 렌더링이 가능한 것을 확인했다.

### Notes

- 이번 단계에서는 수동 마스킹 박스 생성, 삭제, PDF 재생성, 다운로드 기능은 아직 구현하지 않았다.
- `plan.md`는 작업 지시 및 단계 확인용 파일로 로컬에 남겨두었고, 현재 커밋에는 포함하지 않았다.

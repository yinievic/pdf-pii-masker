# Step 11A OCR 품질 검증

Step 11A는 Step 12로 넘어가기 전 OCR 탐지 품질을 최소한으로 개선·검증하는 단계다. 운영 OCR API 응답 구조는 유지하고, 품질 비교는 별도 스크립트로 수행한다.

## 비교 항목

- 기본 `kor+eng` OCR
- 숫자 전용 OCR pass
- `tessedit_char_whitelist=0123456789-` 적용 OCR
- grayscale 렌더링과 Tesseract thresholding 기반 전처리 OCR
- 주민등록번호·계좌번호 후보 영역 확장 후처리

## 실행

OCR 도구가 설치된 OCR API 컨테이너 또는 NAS 호스트에서 실행한다.

```bash
cd apps/ocr-api
npm run compare:quality -- ../../sample.pdf --pages=1
```

mock 검증은 로컬 devbox에서도 실행 가능하다.

```bash
cd apps/ocr-api
npm run test:quality
```

## 해석

Step 11A에서는 운영 OCR API 응답 구조를 유지하면서 탐지 후처리를 먼저 보강한다.

- 주민등록번호 탐지 전 공백 축소, 하이픈 유사 문자 통일, 전각 숫자 변환, `I/l/|/O/Q`의 제한적 숫자 보정을 적용한다.
- 주민등록번호는 같은 줄의 인접 OCR word 1~5개 window를 결합해 탐지한다.
- 주민등록번호 후보는 OCR confidence가 낮아도 자동 제외하지 않고 `review` 상태의 `Detection`/`MaskBoxCandidate`로 올린다.
- 주민등록번호 `Detection.rawText`는 OCR 원문을 보존하고, 기본 `MaskBoxCandidate`는 뒤 7자리 영역만 생성한다.
- 주소는 같은 줄의 연속 단어를 결합하고, 가까운 다음 줄이 주소 연속부로 보이면 같은 `detectionId`/`groupId` 아래 줄별 `MaskBoxCandidate`를 생성한다. 줄별 후보를 유지해 줄 사이의 불필요한 공백 영역을 가리지 않는다.

이번 단계에서는 다음 항목을 구현하지 않고 후속 개선 과제로 남긴다.

- OCR DPI 변경
- 이미지 대비/이진화 전처리의 운영 API 반영
- 숫자 전용 재OCR pass의 운영 API 반영
- whitelist 기반 재OCR 파이프라인
- OCR 엔진 교체

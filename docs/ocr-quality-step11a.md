# Step 11A OCR 품질 검증

Step 11A는 Step 12로 넘어가기 전 OCR 탐지 품질을 최소한으로 개선·검증하는 단계다. 운영 OCR API 응답 구조는 유지하고, 품질 비교는 별도 스크립트로 수행한다.

## 비교 항목

- 기본 `kor+eng` OCR
- 숫자 전용 OCR pass
- `tessedit_char_whitelist=0123456789-` 적용 OCR
- `psm 11` sparse text OCR
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


## PSM 비교 기록

사용자 PSM 테스트 결과, sample PDF 2페이지에서는 default 및 `psm 6`보다 `psm 11` 결과가 가장 양호했다. `psm 11`은 sparse text 탐색에 유리할 수 있으므로 주민등록번호처럼 고위험 개인정보가 기본 OCR 결과에서 누락되는 경우의 내부 보완 전략 후보로 기록한다.

다만 현재 단계에서는 전체 문서 기본값을 `psm 11`로 변경하지 않는다. 전체 기본값으로 적용하기 전에는 여러 문서 샘플에서 주소, 일반 한글 텍스트, 숫자 개인정보 탐지 모두에 대한 회귀 검증이 필요하다.

개발자는 OCR API 실행 시 `TESSERACT_PSM=11`을 지정해 동일 API 구조에서 PSM 영향을 비교할 수 있다. 이 설정은 개발자 내부 검증용이며 사용자 UI에는 노출하지 않는다.

자동 재OCR 파이프라인은 아직 구현하지 않는다. 향후 고위험 개인정보 미탐지 가능성이 확인되는 경우, 기본 OCR 후 특정 조건에서만 `psm 11` 재시도를 수행하는 내부 fallback으로 검토한다.

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

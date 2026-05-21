# OCR API 계약

## Step 8 범위

Step 8은 OCR 구조 설계와 mock 기반 연결 준비까지만 다룬다. PDF 페이지 이미지 변환, Tesseract 실행, TSV/hOCR 파싱, 내부 NAS 또는 컨테이너 런타임 구현은 Step 9 범위다.

## 배포 구조

OCR 런타임은 별도 내부 OCR API 컨테이너/서버 모듈로 분리한다. React 앱은 자동 마스킹을 시작할 때 이 내부 서비스를 호출한다. 웹 앱 내부에 Tesseract나 OCR 바이너리를 포함하지 않는다.

기본 Provider는 다음 하나만 활성화한다.

```ts
type EnabledOcrProvider = "tesseract-local";
```

Provider 타입에는 향후 확장 가능성만 남긴다.

```ts
type OcrProvider = "tesseract-local" | "external-api";
```

`external-api`는 타입상 예약값일 뿐이며, 별도 승인 전까지 외부 OCR API Provider나 adapter를 구현하지 않는다.

## API 요청 구조

프론트엔드는 내부 OCR API에 PDF 참조값과 선택적인 페이지 목록을 전달한다. Step 9에서는 multipart 업로드 또는 내부 파일 토큰 방식 중 하나를 선택할 수 있지만, 프론트엔드 계약은 아래 형태를 유지한다.

```ts
type OcrRequest = {
  fileId?: string;
  pages?: number[];
  provider: OcrProvider;
};
```

규칙:

- `provider` 기본값은 `tesseract-local`이다.
- `pages`는 OCR 대상 페이지를 1-based page number로 제한한다.
- `fileId`는 영구 저장 키가 아니라 일시적인 업로드/세션 식별자다.

## API 응답 구조

OCR API는 단어 단위 OCR 결과와 좌표를 반환한다. 좌표는 서버에서 생성한 페이지 이미지 기준이며, Step 9에서 프론트엔드 canvas 좌표와의 scale 관계를 확정해야 한다.

```ts
type OcrWord = {
  pageNumber: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type OcrResponse = {
  provider: "tesseract-local";
  pageCount?: number;
  coordinateSpace?: "pdf-page-image";
  dpi?: number;
  words: OcrWord[];
};
```

프론트엔드 변환 규칙:

```text
OcrWord[] -> source: "ocr", status: "candidate"인 MaskBox[]
```

OCR 결과는 즉시 확정하지 않는다. 최종 PDF 생성에는 사용자가 승인한 `accepted` 마스크만 포함한다.

## Provider 경계

Step 8에서 준비하는 Provider adapter 경계는 내부 Tesseract Provider만 대상으로 한다.

```ts
type OcrProviderAdapter = {
  provider: "tesseract-local";
  recognize(request: OcrRequest & { provider: "tesseract-local" }): Promise<OcrResponse>;
};
```

추가 Provider는 OCR 텍스트가 개인정보를 포함할 수 있으므로 별도 승인 후에만 구현한다.

## 보안 정책

OCR API 구현은 다음 기본 정책을 따라야 한다.

- 원본 PDF를 영구 저장하지 않는다.
- 생성된 페이지 이미지를 영구 저장하지 않는다.
- OCR 텍스트를 영구 저장하지 않는다.
- 원본 PDF 내용, 페이지 이미지, OCR 텍스트를 로그에 남기지 않는다.
- 요청 처리 종료 후 임시 파일을 삭제한다. 오류 경로에서도 동일하게 삭제한다.
- 사용자에게 표시하는 OCR 실패 메시지는 일반화한다.

이 정책은 `apps/web/src/ocr/apiContract.ts`의 `OCR_SECURITY_POLICY` 타입/상수로도 표현한다.

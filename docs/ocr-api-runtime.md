# OCR API Runtime

## Step 9 범위

Step 9는 내부 OCR API 컨테이너에서 PDF 페이지를 이미지로 변환하고 Tesseract OCR을 실행하는 구조를 구현한다. 외부 OCR API는 사용하지 않는다.

## 컨테이너 구성

`apps/ocr-api/Dockerfile`은 다음 패키지를 설치한다.

- `tesseract-ocr`
- `tesseract-ocr-kor`
- `tesseract-ocr-eng`
- `poppler-utils`

`docker-compose.yml`의 `ocr-api` 서비스는 `8080:8080`으로 노출된다. 임시 파일은 `/tmp`의 tmpfs에 생성되고 요청 종료 후 삭제된다.

## 실행

```bash
docker compose up --build ocr-api
```

상태 확인:

```bash
curl http://localhost:8080/health
```

OCR 요청 예시:

```bash
curl -X POST \
  -H 'content-type: application/pdf' \
  --data-binary @sample.pdf \
  'http://localhost:8080/ocr?pages=1,2'
```

## OCR 실행 전 검증 명령

컨테이너 안에서 다음 명령을 실행해 OCR 도구 설치 상태를 확인한다.

```bash
docker compose run --rm ocr-api npm run verify:tools
```

위 스크립트는 다음 명령을 실행한다.

```bash
tesseract --version
tesseract --list-langs
pdftoppm -h
```

검증 기준:

- `tesseract --version`이 버전 정보를 출력한다.
- `tesseract --list-langs`에 `kor`와 `eng`가 포함된다.
- `pdftoppm -h`가 poppler 사용법을 출력한다.

## API 응답

`POST /ocr`는 `application/pdf` 본문을 받고 다음 JSON을 반환한다.

```json
{
  "requestId": "...",
  "provider": "tesseract-local",
  "pageCount": 2,
  "coordinateSpace": "pdf-page-image",
  "dpi": 200,
  "words": [
    {
      "pageNumber": 1,
      "text": "sample",
      "x": 128,
      "y": 244,
      "width": 220,
      "height": 36,
      "confidence": 91.4
    }
  ],
  "detections": [
    {
      "type": "residentRegistrationNumber",
      "rawText": "900101-1234567"
    }
  ],
  "maskBoxCandidates": [
    {
      "type": "residentRegistrationNumber",
      "status": "review",
      "maskText": "1234567"
    }
  ]
}
```

좌표는 `pdftoppm`으로 생성한 페이지 이미지 기준이다. Step 10은 OCR API 응답에서 `Detection[]`과 `MaskBoxCandidate[]`를 생성한다. Step 11 이후 프론트엔드 `MaskBox` 후보로 변환할 때 canvas 좌표와의 scale 변환을 적용해야 한다.

## 보안 정책

- 원본 PDF, 페이지 이미지, OCR 텍스트를 로그에 남기지 않는다.
- 원본 PDF와 페이지 이미지는 요청별 임시 디렉터리에만 저장한다.
- 요청 종료 후 성공/실패와 무관하게 임시 디렉터리를 삭제한다.
- 사용자에게 반환하는 오류 메시지는 일반화한다.

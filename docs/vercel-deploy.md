# Vercel Deployment Checklist

## Scope

Vercel should deploy only the browser web app in `apps/web`. The OCR API is a Docker/Tesseract service and should remain a separate server/container deployment.

## Vercel project settings

Use the repository root as the Vercel project root. The root `vercel.json` defines the web build:

- Install Command: `npm --prefix apps/web ci`
- Build Command: `npm --prefix apps/web run build`
- Output Directory: `apps/web/dist`
- Framework: Vite

The SPA rewrite in `vercel.json` sends unknown browser routes to `index.html`.

## Required production environment variable

Set this in Vercel Project Settings > Environment Variables:

```text
VITE_OCR_API_URL=https://YOUR_OCR_API_BASE_URL
```

`apps/web/src/App.tsx` appends `/ocr` to this value. Therefore:

- If the public OCR API endpoint is `https://ocr.example.com/ocr`, set `VITE_OCR_API_URL=https://ocr.example.com`.
- If a reverse proxy exposes OCR under `https://example.com/ocr-api/ocr`, set `VITE_OCR_API_URL=https://example.com/ocr-api`.

Do not use the Vite dev-only `/ocr-api` proxy as the production value unless Vercel rewrites are separately configured to forward that path to a public OCR API endpoint.

## OCR API deployment requirement

The OCR API must be reachable from the user's browser or through a production reverse proxy over HTTPS. The current OCR API container needs:

- `tesseract-ocr`
- `tesseract-ocr-kor`
- `tesseract-ocr-eng`
- `poppler-utils`

If the browser calls the OCR API directly from the Vercel domain, configure the OCR API `CORS_ORIGIN` to allow the Vercel production URL.

Example:

```bash
CORS_ORIGIN=https://YOUR_VERCEL_DOMAIN docker compose up -d ocr-api
```

If a reverse proxy exposes OCR under the same public origin/path, configure the proxy to forward:

```text
/ocr-api/health -> OCR_API_INTERNAL/health
/ocr-api/ocr    -> OCR_API_INTERNAL/ocr
```

## Pre-deploy checks

Run from the repository root:

```bash
npm --prefix apps/web run build
```

Run OCR checks against the production OCR API base URL after it is deployed:

```bash
curl https://YOUR_OCR_API_BASE_URL/health
curl -X POST \
  -H 'content-type: application/pdf' \
  --data-binary @sample.pdf \
  'https://YOUR_OCR_API_BASE_URL/ocr?psm=11'
```

The PSM 11 response should include:

```json
{
  "ocrOptions": {
    "psm": 11
  }
}
```

## Current unresolved deployment decision

A real production OCR API HTTPS URL is still required before the Vercel web app can perform automatic OCR detection in production. Manual PDF page checking, manual masking, and client-side PDF generation can build on Vercel without the OCR API, but automatic detection depends on that endpoint.

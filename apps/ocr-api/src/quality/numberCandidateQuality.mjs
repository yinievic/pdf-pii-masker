import { buildLineText, getRectForCharacterRange, groupWordsByLine } from '../detection/detectSensitiveInfo.mjs';

const DIGIT_CONFUSION_MAP = new Map([
  ['O', '0'],
  ['o', '0'],
  ['Q', '0'],
  ['I', '1'],
  ['l', '1'],
  ['|', '1'],
  ['S', '5'],
  ['s', '5'],
  ['B', '8'],
  ['Z', '2'],
  ['z', '2'],
  ['–', '-'],
  ['—', '-'],
  ['−', '-']
]);

const RESIDENT_REGISTRATION_PATTERN = /\b\d{6}\s*-?\s*\d{7}\b/gu;
const ACCOUNT_NUMBER_PATTERN = /\b\d[\d\s-]{7,}\d\b/gu;

export function normalizeLikelyDigitText(text) {
  return Array.from(text, (character) => DIGIT_CONFUSION_MAP.get(character) ?? character).join('');
}

function expandRect(rect, pageBounds, paddingRatio = 0.12) {
  const padX = Math.max(4, rect.width * paddingRatio);
  const padY = Math.max(3, rect.height * paddingRatio);
  const maxWidth = pageBounds?.width ?? Number.POSITIVE_INFINITY;
  const maxHeight = pageBounds?.height ?? Number.POSITIVE_INFINITY;
  const x = Math.max(0, Math.round(rect.x - padX));
  const y = Math.max(0, Math.round(rect.y - padY));
  const right = Math.min(maxWidth, Math.round(rect.x + rect.width + padX));
  const bottom = Math.min(maxHeight, Math.round(rect.y + rect.height + padY));

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  };
}

function createExpandedCandidate({ type, label, match, normalizedLineText, line, spans, pageBounds }) {
  const rawText = line.text.slice(match.index, match.index + match[0].length);
  const rect = getRectForCharacterRange(spans, match.index, match.index + match[0].length);

  if (!rect) return undefined;

  return {
    type,
    label,
    pageNumber: line.pageNumber,
    rawText,
    normalizedText: normalizedLineText.slice(match.index, match.index + match[0].length),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    expandedRect: expandRect(rect, pageBounds),
    strategy: 'expanded-number-postprocess'
  };
}

export function findExpandedNumberCandidates(words, pageBoundsByNumber = new Map()) {
  const candidates = [];
  const lines = groupWordsByLine(words).map((line) => {
    const builtLine = buildLineText(line.words);
    return {
      ...line,
      text: builtLine.text,
      normalizedText: normalizeLikelyDigitText(builtLine.text),
      spans: builtLine.spans
    };
  });

  for (const line of lines) {
    const pageBounds = pageBoundsByNumber.get(line.pageNumber);
    const rrnMatches = [...line.normalizedText.matchAll(RESIDENT_REGISTRATION_PATTERN)];

    for (const match of rrnMatches) {
      const candidate = createExpandedCandidate({
        type: 'residentRegistrationNumber',
        label: '주민등록번호 후보',
        match,
        normalizedLineText: line.normalizedText,
        line,
        spans: line.spans,
        pageBounds
      });

      if (candidate) candidates.push(candidate);
    }

    const accountMatches = [...line.normalizedText.matchAll(ACCOUNT_NUMBER_PATTERN)].filter(
      (match) => !RESIDENT_REGISTRATION_PATTERN.test(match[0])
    );
    RESIDENT_REGISTRATION_PATTERN.lastIndex = 0;

    for (const match of accountMatches) {
      const candidate = createExpandedCandidate({
        type: 'accountNumber',
        label: '계좌번호 후보',
        match,
        normalizedLineText: line.normalizedText,
        line,
        spans: line.spans,
        pageBounds
      });

      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

export function compareDetectionCounts({ baselineDetections = [], expandedCandidates = [] }) {
  const countByType = (items) =>
    items.reduce((counts, item) => ({ ...counts, [item.type]: (counts[item.type] ?? 0) + 1 }), {});

  return {
    baseline: countByType(baselineDetections),
    expanded: countByType(expandedCandidates),
    totalBaseline: baselineDetections.length,
    totalExpanded: expandedCandidates.length
  };
}

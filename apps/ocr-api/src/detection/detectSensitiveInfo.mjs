import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(currentDir, 'detectionRules.json'), 'utf-8'));

const DEFAULT_LINE_Y_TOLERANCE = 12;
const DEFAULT_STATUS = 'review';
const DEFAULT_SOURCE = 'regex';

function createId(prefix, parts) {
  return `${prefix}-${parts.join('-')}`.replace(/[^a-zA-Z0-9가-힣_-]+/g, '-');
}

function getWordCenterY(word) {
  return word.y + word.height / 2;
}

function getWordEndX(word) {
  return word.x + word.width;
}

function getLineKey(word) {
  if (Number.isInteger(word.blockNumber) && Number.isInteger(word.paragraphNumber) && Number.isInteger(word.lineNumber)) {
    return `block-${word.blockNumber}-paragraph-${word.paragraphNumber}-line-${word.lineNumber}`;
  }

  if (Number.isInteger(word.lineNumber)) {
    return `line-${word.lineNumber}`;
  }

  return undefined;
}

function isSameFallbackLine(currentLine, word, tolerance = DEFAULT_LINE_Y_TOLERANCE) {
  const currentCenterY = currentLine.words.reduce((sum, lineWord) => sum + getWordCenterY(lineWord), 0) / currentLine.words.length;
  return word.pageNumber === currentLine.pageNumber && Math.abs(getWordCenterY(word) - currentCenterY) <= tolerance;
}

export function groupWordsByLine(words) {
  const sortedWords = [...words].sort((a, b) => a.pageNumber - b.pageNumber || a.y - b.y || a.x - b.x);
  const keyedLines = new Map();
  const fallbackLines = [];

  for (const word of sortedWords) {
    const key = getLineKey(word);

    if (key) {
      const mapKey = `${word.pageNumber}-${key}`;
      const line = keyedLines.get(mapKey) || { pageNumber: word.pageNumber, key: mapKey, words: [] };
      line.words.push(word);
      keyedLines.set(mapKey, line);
      continue;
    }

    const existingLine = fallbackLines.find((line) => isSameFallbackLine(line, word));

    if (existingLine) {
      existingLine.words.push(word);
    } else {
      fallbackLines.push({ pageNumber: word.pageNumber, key: `fallback-${fallbackLines.length}`, words: [word] });
    }
  }

  return [...keyedLines.values(), ...fallbackLines]
    .map((line) => ({ ...line, words: [...line.words].sort((a, b) => a.x - b.x) }))
    .sort((a, b) => a.pageNumber - b.pageNumber || Math.min(...a.words.map((word) => word.y)) - Math.min(...b.words.map((word) => word.y)));
}

export function buildLineText(lineWords) {
  let cursor = 0;
  const spans = [];
  const textParts = [];

  for (const [index, word] of lineWords.entries()) {
    const separator = index === 0 ? '' : ' ';
    textParts.push(separator);
    cursor += separator.length;

    const start = cursor;
    textParts.push(word.text);
    cursor += word.text.length;
    spans.push({ word, start, end: cursor });
  }

  return { text: textParts.join(''), spans };
}

function getBoundingRect(words) {
  const left = Math.min(...words.map((word) => word.x));
  const top = Math.min(...words.map((word) => word.y));
  const right = Math.max(...words.map((word) => getWordEndX(word)));
  const bottom = Math.max(...words.map((word) => word.y + word.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function estimatePartialWordRect(word, wordStart, wordEnd, maskStart, maskEnd) {
  const overlapStart = Math.max(wordStart, maskStart);
  const overlapEnd = Math.min(wordEnd, maskEnd);

  if (overlapStart >= overlapEnd) {
    return undefined;
  }

  const wordLength = Math.max(wordEnd - wordStart, 1);
  const startRatio = (overlapStart - wordStart) / wordLength;
  const endRatio = (overlapEnd - wordStart) / wordLength;

  return {
    x: word.x + word.width * startRatio,
    y: word.y,
    width: word.width * (endRatio - startRatio),
    height: word.height
  };
}

function mergeRects(rects) {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}

export function getRectForCharacterRange(spans, start, end) {
  const rects = spans.flatMap((span) => {
    const rect = estimatePartialWordRect(span.word, span.start, span.end, start, end);
    return rect ? [rect] : [];
  });

  return rects.length > 0 ? mergeRects(rects) : undefined;
}

function resolveMaskRange(rule, rawText, matchStart) {
  const policy = rule.maskPolicy;

  if (!policy || policy.type !== 'regex-group') {
    return { start: matchStart, end: matchStart + rawText.length, text: rawText };
  }

  if (policy.groupPattern) {
    const groupRegex = new RegExp(policy.groupPattern);
    const groupMatch = groupRegex.exec(rawText);

    if (groupMatch?.[policy.groupIndex]) {
      const prefixLength = groupMatch.slice(1, policy.groupIndex).join('').length;
      const selectedText = groupMatch[policy.groupIndex];
      const start = matchStart + prefixLength;
      return { start, end: start + selectedText.length, text: selectedText };
    }
  }

  if (policy.groupIndex && typeof policy.groupIndex === 'number') {
    const selectedText = rawText.match(new RegExp(rule.pattern))?.[policy.groupIndex];

    if (selectedText) {
      const offset = rawText.indexOf(selectedText);
      const start = matchStart + offset;
      return { start, end: start + selectedText.length, text: selectedText };
    }
  }

  return { start: matchStart, end: matchStart + rawText.length, text: rawText };
}

function createDetection({ rule, match, line, lineText, spans, matchIndex }) {
  const rawText = match[0];
  const matchStart = match.index;
  const matchEnd = matchStart + rawText.length;
  const matchedWords = spans.filter((span) => span.start < matchEnd && span.end > matchStart).map((span) => span.word);
  const rect = getBoundingRect(matchedWords);
  const maskRange = resolveMaskRange(rule, rawText, matchStart, match);
  const maskRect = getRectForCharacterRange(spans, maskRange.start, maskRange.end);
  const confidenceValues = matchedWords.map((word) => word.confidence).filter((confidence) => Number.isFinite(confidence));
  const confidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : undefined;
  const detectionId = createId('det', [rule.id, line.pageNumber, matchIndex, matchStart]);

  const detection = {
    id: detectionId,
    type: rule.type,
    ruleId: rule.id,
    label: rule.label,
    pageNumber: line.pageNumber,
    rawText,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    confidence,
    source: DEFAULT_SOURCE,
    textRange: { start: matchStart, end: matchEnd },
    lineText
  };

  const maskBoxCandidate = maskRect
    ? {
        id: createId('mask-candidate', [rule.id, line.pageNumber, matchIndex, maskRange.start]),
        detectionId,
        type: rule.type,
        ruleId: rule.id,
        label: rule.label,
        pageNumber: line.pageNumber,
        x: maskRect.x,
        y: maskRect.y,
        width: maskRect.width,
        height: maskRect.height,
        status: DEFAULT_STATUS,
        source: DEFAULT_SOURCE,
        rawText,
        maskText: maskRange.text,
        confidence,
        policy: rule.maskPolicy?.description
      }
    : undefined;

  return { detection, maskBoxCandidate };
}

export function detectSensitiveInfo(words, activeRules = rules) {
  const detections = [];
  const maskBoxCandidates = [];
  const lines = groupWordsByLine(words);

  for (const line of lines) {
    const { text: lineText, spans } = buildLineText(line.words);

    for (const rule of activeRules) {
      const regex = new RegExp(rule.pattern, 'gu');
      const matches = [...lineText.matchAll(regex)];

      for (const [matchIndex, match] of matches.entries()) {
        const result = createDetection({ rule, match, line, lineText, spans, matchIndex });
        detections.push(result.detection);

        if (result.maskBoxCandidate) {
          maskBoxCandidates.push(result.maskBoxCandidate);
        }
      }
    }
  }

  return { detections, maskBoxCandidates };
}

export { rules as detectionRules };

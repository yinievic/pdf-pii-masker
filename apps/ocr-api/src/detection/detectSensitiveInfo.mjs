import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(currentDir, 'detectionRules.json'), 'utf-8'));
const addressAdminDistricts = JSON.parse(readFileSync(join(currentDir, 'addressAdminDistricts.json'), 'utf-8'));
const publicInstitutionAddressExclusions = JSON.parse(readFileSync(join(currentDir, 'publicInstitutionAddressExclusions.json'), 'utf-8'));

const DEFAULT_LINE_Y_TOLERANCE = 12;
const DEFAULT_STATUS = 'review';
const DEFAULT_SOURCE = 'regex';
const adminDistrictSet = new Set(addressAdminDistricts.adminDistricts ?? []);
const publicInstitutionAddressSet = new Set((publicInstitutionAddressExclusions.exclusions ?? []).map((item) => item.normalizedAddress).filter(Boolean));

function createId(prefix, parts) {
  return `${prefix}-${parts.join('-')}`.replace(/[^a-zA-Z0-9가-힣_-]+/g, '-');
}

function normalizeAddressForComparison(value) {
  return (value || '')
    .replace(/서울특별시/gu, '서울')
    .replace(/부산광역시/gu, '부산')
    .replace(/대구광역시/gu, '대구')
    .replace(/인천광역시/gu, '인천')
    .replace(/광주광역시/gu, '광주')
    .replace(/대전광역시/gu, '대전')
    .replace(/울산광역시/gu, '울산')
    .replace(/세종특별자치시/gu, '세종')
    .replace(/경기도/gu, '경기')
    .replace(/강원특별자치도/gu, '강원')
    .replace(/강원도/gu, '강원')
    .replace(/충청북도/gu, '충북')
    .replace(/충청남도/gu, '충남')
    .replace(/전북특별자치도/gu, '전북')
    .replace(/전라북도/gu, '전북')
    .replace(/전라남도/gu, '전남')
    .replace(/경상북도/gu, '경북')
    .replace(/경상남도/gu, '경남')
    .replace(/제주특별자치도/gu, '제주')
    .replace(/[\s,()（）·.-]+/gu, '');
}

const publicInstitutionAddressVariants = [...publicInstitutionAddressSet].flatMap((address) => [address, normalizeAddressForComparison(address)]);

function isPublicInstitutionAddress(rawText) {
  const normalized = normalizeAddressForComparison(rawText);
  if (!normalized) return false;
  return publicInstitutionAddressVariants.some((address) => address && (normalized.includes(address) || address.includes(normalized)));
}

function hasKnownAdminDistrict(addressText, maskedText) {
  const prefix = maskedText ? addressText.slice(0, Math.max(addressText.length - maskedText.length, 0)) : addressText;
  return prefix.split(/\s+/u).some((part) => adminDistrictSet.has(part));
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


function normalizeDetectionCharacter(character) {
  const codePoint = character.codePointAt(0);

  if (codePoint >= 0xff10 && codePoint <= 0xff19) {
    return String.fromCodePoint(codePoint - 0xff10 + 0x30);
  }

  if (/\d/u.test(character)) return character;
  if (/[‐‑‒–—―﹘﹣－]/u.test(character)) return '-';
  if (/[Il|]/u.test(character)) return '1';
  if (/[OoQ]/u.test(character)) return '0';

  return character;
}

function createNormalizedWordChars(words, { collapseWhitespace = true } = {}) {
  const chars = [];

  for (const [wordIndex, word] of words.entries()) {
    if (!collapseWhitespace && wordIndex > 0) {
      chars.push({ value: ' ', word: undefined, rawIndex: -1 });
    }

    for (const [rawIndex, character] of [...word.text].entries()) {
      const normalized = normalizeDetectionCharacter(character);
      if (collapseWhitespace && /\s/u.test(normalized)) continue;
      chars.push({ value: normalized, word, rawIndex });
    }
  }

  return chars;
}

function getTextFromNormalizedChars(chars) {
  return chars.map((char) => char.value).join('');
}

function getRectForNormalizedCharRange(chars, start, end) {
  const rects = chars.slice(start, end).flatMap((char) => {
    if (!char.word || char.rawIndex < 0) return [];
    return [estimatePartialWordRect(char.word, 0, [...char.word.text].length, char.rawIndex, char.rawIndex + 1)];
  });

  return rects.length > 0 ? mergeRects(rects) : undefined;
}

function getLineId(line) {
  return line.key ?? `${Math.round(Math.min(...line.words.map((word) => word.y)))}-${Math.round(Math.min(...line.words.map((word) => word.x)))}`;
}

function createResidentRegistrationDetection({ rule, line, words, startIndex, windowSize, match }) {
  const rawText = words.map((word) => word.text).join(' ');
  const normalizedChars = createNormalizedWordChars(words);
  const normalizedText = getTextFromNormalizedChars(normalizedChars);
  const rearSevenStart = normalizedText.length - 7;
  const rect = getBoundingRect(words);
  const maskRect = getRectForNormalizedCharRange(normalizedChars, rearSevenStart, normalizedText.length);
  const confidenceValues = words.map((word) => word.confidence).filter((confidence) => Number.isFinite(confidence));
  const confidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : undefined;
  const lineId = getLineId(line);
  const detectionId = createId('det', [rule.id, line.pageNumber, lineId, startIndex, windowSize, 'normalized']);

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
    textRange: { start: 0, end: rawText.length },
    lineText: line.words.map((word) => word.text).join(' '),
    normalizedText
  };

  const maskBoxCandidate = maskRect
    ? {
        id: createId('mask-candidate', [rule.id, line.pageNumber, lineId, startIndex, windowSize, 'rear7']),
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
        maskText: match[2],
        confidence,
        policy: rule.maskPolicy?.description
      }
    : undefined;

  return { detection, maskBoxCandidate };
}

function detectResidentRegistrationNumbers(lines, rule) {
  const detections = [];
  const maskBoxCandidates = [];
  const seen = new Set();
  const rrnPattern = /^(\d{6})-?(\d{7})$/u;

  for (const line of lines) {
    for (let startIndex = 0; startIndex < line.words.length; startIndex += 1) {
      for (let windowSize = 1; windowSize <= 5 && startIndex + windowSize <= line.words.length; windowSize += 1) {
        const words = line.words.slice(startIndex, startIndex + windowSize);
        const normalizedText = getTextFromNormalizedChars(createNormalizedWordChars(words));
        const match = rrnPattern.exec(normalizedText);

        if (!match) continue;

        const key = `${line.pageNumber}-${getLineId(line)}-${startIndex}-${startIndex + windowSize}-${normalizedText}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const result = createResidentRegistrationDetection({ rule, line, words, startIndex, windowSize, match });
        detections.push(result.detection);

        if (result.maskBoxCandidate) {
          maskBoxCandidates.push(result.maskBoxCandidate);
        }
      }
    }
  }

  return { detections, maskBoxCandidates };
}

function isAddressContinuationLine(lineText) {
  const compactText = lineText.replace(/\s+/gu, '');
  if (!compactText) return false;
  if (/(시|군|구)/u.test(compactText)) return false;
  if (/^\d{6}-?\d{7}$/u.test(compactText)) return false;
  return /(?:\d|로|길|번지|층|동|호|읍|면|리|대로|빌딩|타워|스톤|아파트|오피스텔|주택|일원)/u.test(compactText);
}

function isCloseNextLine(currentLine, nextLine) {
  const currentBottom = Math.max(...currentLine.words.map((word) => word.y + word.height));
  const nextTop = Math.min(...nextLine.words.map((word) => word.y));
  const currentHeight = Math.max(...currentLine.words.map((word) => word.height));
  return nextTop - currentBottom <= currentHeight * 1.8;
}

function createAddressDetectionGroup({ rule, lines, startLineIndex }) {
  const firstLine = lines[startLineIndex];
  const { text: firstLineText, spans: firstLineSpans } = buildLineText(firstLine.words);
  const regex = new RegExp(rule.pattern, 'u');
  const match = regex.exec(firstLineText);
  if (!match) return undefined;

  const firstMaskRange = resolveMaskRange(rule, match[0], match.index);

  if (!hasKnownAdminDistrict(match[0], firstMaskRange.text) || isPublicInstitutionAddress(match[0])) {
    return undefined;
  }

  const groupLines = [firstLine];
  const continuationLimit = Math.min(lines.length, startLineIndex + 3);

  for (let index = startLineIndex + 1; index < continuationLimit; index += 1) {
    const nextLine = lines[index];
    if (nextLine.pageNumber !== firstLine.pageNumber) break;
    const { text: nextLineText } = buildLineText(nextLine.words);
    if (!isCloseNextLine(groupLines[groupLines.length - 1], nextLine) || !isAddressContinuationLine(nextLineText)) break;
    groupLines.push(nextLine);
  }

  const rawText = groupLines.map((line) => buildLineText(line.words).text).join(' ');
  const allWords = groupLines.flatMap((line) => line.words);
  const rect = getBoundingRect(allWords);
  if (isPublicInstitutionAddress(rawText)) {
    return undefined;
  }

  const confidenceValues = allWords.map((word) => word.confidence).filter((confidence) => Number.isFinite(confidence));
  const confidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : undefined;
  const firstMaskRect = getRectForCharacterRange(firstLineSpans, firstMaskRange.start, firstMaskRange.end);
  const lineId = getLineId(firstLine);
  const detectionId = createId('det', [rule.id, firstLine.pageNumber, lineId, 'address-group']);
  const groupId = createId('group', [rule.id, firstLine.pageNumber, lineId]);

  const detection = {
    id: detectionId,
    type: rule.type,
    ruleId: rule.id,
    label: rule.label,
    pageNumber: firstLine.pageNumber,
    rawText,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    confidence,
    source: DEFAULT_SOURCE,
    textRange: { start: 0, end: rawText.length },
    lineText: rawText,
    groupId
  };

  const maskBoxCandidates = [];

  if (firstMaskRect) {
    maskBoxCandidates.push({
      id: createId('mask-candidate', [rule.id, firstLine.pageNumber, lineId, 'address-group', 0]),
      detectionId,
      groupId,
      type: rule.type,
      ruleId: rule.id,
      label: rule.label,
      pageNumber: firstLine.pageNumber,
      x: firstMaskRect.x,
      y: firstMaskRect.y,
      width: firstMaskRect.width,
      height: firstMaskRect.height,
      status: DEFAULT_STATUS,
      source: DEFAULT_SOURCE,
      rawText,
      maskText: firstMaskRange.text,
      confidence,
      policy: rule.maskPolicy?.description
    });
  }

  for (const [offset, continuationLine] of groupLines.slice(1).entries()) {
    const lineRect = getBoundingRect(continuationLine.words);
    const { text: continuationText } = buildLineText(continuationLine.words);
    maskBoxCandidates.push({
      id: createId('mask-candidate', [rule.id, continuationLine.pageNumber, getLineId(continuationLine), 'address-group', offset + 1]),
      detectionId,
      groupId,
      type: rule.type,
      ruleId: rule.id,
      label: rule.label,
      pageNumber: continuationLine.pageNumber,
      x: lineRect.x,
      y: lineRect.y,
      width: lineRect.width,
      height: lineRect.height,
      status: DEFAULT_STATUS,
      source: DEFAULT_SOURCE,
      rawText,
      maskText: continuationText,
      confidence,
      policy: rule.maskPolicy?.description
    });
  }

  return { detection, maskBoxCandidates };
}

function detectAddresses(lines, rule) {
  const detections = [];
  const maskBoxCandidates = [];

  for (const [lineIndex, line] of lines.entries()) {
    const result = createAddressDetectionGroup({ rule, lines, startLineIndex: lineIndex });
    if (!result) continue;

    detections.push(result.detection);
    maskBoxCandidates.push(...result.maskBoxCandidates);
  }

  return { detections, maskBoxCandidates };
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
  const lineId = getLineId(line);
  const detectionId = createId('det', [rule.id, line.pageNumber, lineId, matchIndex, matchStart]);

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
        id: createId('mask-candidate', [rule.id, line.pageNumber, lineId, matchIndex, maskRange.start]),
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

  for (const rule of activeRules) {
    if (rule.type === 'residentRegistrationNumber') {
      const result = detectResidentRegistrationNumbers(lines, rule);
      detections.push(...result.detections);
      maskBoxCandidates.push(...result.maskBoxCandidates);
      continue;
    }

    if (rule.type === 'address') {
      const result = detectAddresses(lines, rule);
      detections.push(...result.detections);
      maskBoxCandidates.push(...result.maskBoxCandidates);
      continue;
    }

    for (const line of lines) {
      const { text: lineText, spans } = buildLineText(line.words);
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

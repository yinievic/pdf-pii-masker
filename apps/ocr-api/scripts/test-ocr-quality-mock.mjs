import assert from 'node:assert/strict';
import { findExpandedNumberCandidates, normalizeLikelyDigitText } from '../src/quality/numberCandidateQuality.mjs';

assert.equal(normalizeLikelyDigitText('9OO1O1-l234S67'), '900101-1234567');

const words = [
  {
    pageNumber: 1,
    text: '9OO1O1-l234S67',
    x: 100,
    y: 120,
    width: 210,
    height: 32,
    confidence: 62,
    blockNumber: 1,
    paragraphNumber: 1,
    lineNumber: 1,
    wordNumber: 1
  },
  {
    pageNumber: 1,
    text: '110-123-456789',
    x: 100,
    y: 180,
    width: 230,
    height: 32,
    confidence: 70,
    blockNumber: 1,
    paragraphNumber: 1,
    lineNumber: 2,
    wordNumber: 1
  }
];

const candidates = findExpandedNumberCandidates(words, new Map([[1, { width: 1000, height: 1400 }]]));
const rrnCandidate = candidates.find((candidate) => candidate.type === 'residentRegistrationNumber');
const accountCandidate = candidates.find((candidate) => candidate.type === 'accountNumber');

assert.equal(rrnCandidate.normalizedText, '900101-1234567');
assert.equal(rrnCandidate.rawText, '9OO1O1-l234S67');
assert.deepEqual(
  {
    x: rrnCandidate.expandedRect.x,
    y: rrnCandidate.expandedRect.y,
    width: rrnCandidate.expandedRect.width,
    height: rrnCandidate.expandedRect.height
  },
  { x: 75, y: 116, width: 260, height: 40 }
);
assert.equal(accountCandidate.normalizedText, '110-123-456789');
assert.equal(accountCandidate.strategy, 'expanded-number-postprocess');

process.stdout.write('OCR quality mock comparison passed\n');

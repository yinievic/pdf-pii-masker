import assert from 'node:assert/strict';
import { detectSensitiveInfo } from '../src/detection/detectSensitiveInfo.mjs';
import { parsePagesParam, parsePdfPageCount, parseTesseractTsv } from '../src/ocr.mjs';

const sampleTsv = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '1\t1\t0\t0\t0\t0\t0\t0\t1200\t1600\t-1\t',
  '5\t1\t1\t1\t1\t1\t128\t244\t220\t36\t91.4\t900101-1234567',
  '5\t1\t1\t1\t2\t1\t96\t420\t54\t32\t88.2\t서울',
  '5\t1\t1\t1\t2\t2\t158\t420\t72\t32\t89.1\t서초구',
  '5\t1\t1\t1\t2\t3\t240\t420\t88\t32\t87.5\t반포대로',
  '5\t1\t1\t1\t2\t4\t338\t420\t48\t32\t86.8\t123',
  '5\t1\t1\t1\t3\t1\t10\t10\t10\t10\t-1\tignored'
].join('\n');

const words = parseTesseractTsv(sampleTsv, 3);
assert.equal(words.length, 5);
assert.deepEqual(words[0], {
  pageNumber: 3,
  text: '900101-1234567',
  x: 128,
  y: 244,
  width: 220,
  height: 36,
  confidence: 91.4,
  blockNumber: 1,
  paragraphNumber: 1,
  lineNumber: 1,
  wordNumber: 1
});

const { detections, maskBoxCandidates } = detectSensitiveInfo(words);
const rrnDetection = detections.find((detection) => detection.type === 'residentRegistrationNumber');
const rrnCandidate = maskBoxCandidates.find((candidate) => candidate.type === 'residentRegistrationNumber');
assert.equal(rrnDetection.rawText, '900101-1234567');
assert.equal(rrnCandidate.maskText, '1234567');
assert.equal(rrnCandidate.status, 'review');
assert.equal(rrnCandidate.x, 238);
assert.equal(rrnCandidate.width, 110);

const addressDetection = detections.find((detection) => detection.type === 'address');
const addressCandidate = maskBoxCandidates.find((candidate) => candidate.type === 'address');
assert.equal(addressDetection.rawText, '서울 서초구 반포대로 123');
assert.equal(addressCandidate.maskText, '반포대로 123');
assert.equal(addressCandidate.status, 'review');
assert.deepEqual(
  {
    x: addressCandidate.x,
    y: addressCandidate.y,
    width: addressCandidate.width,
    height: addressCandidate.height
  },
  { x: 240, y: 420, width: 146, height: 32 }
);

assert.deepEqual(parsePagesParam('1,2,2,abc,4'), [1, 2, 4]);
assert.equal(parsePagesParam('abc'), undefined);
assert.equal(parsePdfPageCount('Title: sample.pdf\nPages:          12\nEncrypted: no'), 12);

process.stdout.write('mock TSV parsing and detection passed\n');

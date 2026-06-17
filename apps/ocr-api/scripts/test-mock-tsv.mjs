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
  '5\t1\t1\t1\t3\t1\t100\t520\t90\t32\t85.5\t900101',
  '5\t1\t1\t1\t3\t2\t198\t520\t12\t32\t84.8\t-',
  '5\t1\t1\t1\t3\t3\t218\t520\t104\t32\t83.7\t1234567',
  '5\t1\t1\t1\t4\t1\t100\t620\t88\t32\t41.5\t９00I0l',
  '5\t1\t1\t1\t4\t2\t196\t620\t12\t32\t39.8\t－',
  '5\t1\t1\t1\t4\t3\t216\t620\t104\t32\t38.7\tI23456O',
  '5\t1\t1\t1\t5\t1\t96\t720\t54\t32\t88.2\t서울',
  '5\t1\t1\t1\t5\t2\t158\t720\t72\t32\t89.1\t서초구',
  '5\t1\t1\t1\t5\t3\t240\t720\t88\t32\t87.5\t서초대로',
  '5\t1\t1\t1\t5\t4\t338\t720\t48\t32\t86.8\t334,',
  '5\t1\t1\t1\t6\t1\t240\t765\t36\t32\t86.8\t2층',
  '5\t1\t1\t1\t6\t2\t286\t765\t118\t32\t86.8\t브라운스톤',
  '5\t1\t1\t1\t7\t1\t100\t840\t72\t32\t88.2\t사용시',
  '5\t1\t1\t1\t7\t2\t182\t840\t48\t32\t88.2\t적용',
  '5\t1\t1\t1\t8\t1\t96\t920\t88\t32\t88.2\t서울특별시',
  '5\t1\t1\t1\t8\t2\t194\t920\t72\t32\t89.1\t서초구',
  '5\t1\t1\t1\t8\t3\t276\t920\t88\t32\t87.5\t서초대로',
  '5\t1\t1\t1\t8\t4\t374\t920\t48\t32\t86.8\t219',
  '5\t1\t1\t1\t9\t1\t96\t1020\t54\t32\t88.2\t서울',
  '5\t1\t1\t1\t9\t2\t160\t1020\t88\t32\t88.2\t영등포구',
  '5\t1\t1\t1\t9\t3\t258\t1020\t100\t32\t88.2\t여의나루로',
  '5\t1\t1\t1\t9\t4\t368\t1020\t32\t32\t88.2\t60',
  '5\t1\t1\t1\t9\t5\t410\t1020\t42\t32\t88.2\t일대',
  '5\t1\t1\t1\t10\t1\t10\t10\t10\t10\t-1\tignored'
].join('\n');

const words = parseTesseractTsv(sampleTsv, 3);
assert.equal(words.length, 28);
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

const rrnDetections = detections.filter((detection) => detection.type === 'residentRegistrationNumber');
const rrnCandidates = maskBoxCandidates.filter((candidate) => candidate.type === 'residentRegistrationNumber');
assert.equal(rrnDetections.length, 3);
assert.equal(rrnCandidates.length, 3);
assert.equal(new Set(detections.map((detection) => detection.id)).size, detections.length);
assert.equal(new Set(maskBoxCandidates.map((candidate) => candidate.id)).size, maskBoxCandidates.length);
assert.equal(detections.some((detection) => detection.rawText === '사용시 적용'), false);
assert.equal(detections.some((detection) => detection.rawText === '서울특별시 서초구 서초대로 219'), false);
assert.equal(detections.some((detection) => detection.rawText === '서울 영등포구 여의나루로 60 일대'), false);
assert.equal(rrnDetections[1].rawText, '900101 - 1234567');
assert.equal(rrnCandidates[1].maskText, '1234567');
assert.deepEqual(
  {
    x: rrnCandidates[1].x,
    y: rrnCandidates[1].y,
    width: rrnCandidates[1].width,
    height: rrnCandidates[1].height
  },
  { x: 218, y: 520, width: 104, height: 32 }
);

const normalizedRrnDetection = rrnDetections.find((detection) => detection.rawText === '９00I0l － I23456O');
const normalizedRrnCandidate = rrnCandidates.find((candidate) => candidate.detectionId === normalizedRrnDetection?.id);
assert.equal(normalizedRrnDetection.normalizedText, '900101-1234560');
assert.equal(normalizedRrnCandidate.maskText, '1234560');
assert.equal(normalizedRrnCandidate.status, 'review');
assert.deepEqual(
  {
    x: normalizedRrnCandidate.x,
    y: normalizedRrnCandidate.y,
    width: normalizedRrnCandidate.width,
    height: normalizedRrnCandidate.height
  },
  { x: 216, y: 620, width: 104, height: 32 }
);

const multilineAddressDetection = detections.find((detection) => detection.rawText === '서울 서초구 서초대로 334, 2층 브라운스톤');
const multilineAddressCandidates = maskBoxCandidates.filter((candidate) => candidate.detectionId === multilineAddressDetection?.id);
assert.equal(multilineAddressCandidates.length, 2);
assert.equal(new Set(multilineAddressCandidates.map((candidate) => candidate.groupId)).size, 1);
assert.deepEqual(
  multilineAddressCandidates.map((candidate) => ({ x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height })),
  [
    { x: 240, y: 720, width: 146, height: 32 },
    { x: 240, y: 765, width: 164, height: 32 }
  ]
);

assert.deepEqual(parsePagesParam('1,2,2,abc,4'), [1, 2, 4]);
assert.equal(parsePagesParam('abc'), undefined);
assert.equal(parsePdfPageCount('Title: sample.pdf\nPages:          12\nEncrypted: no'), 12);

process.stdout.write('mock TSV parsing and detection passed\n');

import assert from 'node:assert/strict';
import { parsePagesParam, parsePdfPageCount, parseTesseractTsv } from '../src/ocr.mjs';

const sampleTsv = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '1\t1\t0\t0\t0\t0\t0\t0\t1200\t1600\t-1\t',
  '5\t1\t1\t1\t1\t1\t128\t244\t220\t36\t91.4\t900101-1234567',
  '5\t1\t1\t1\t1\t2\t96\t420\t260\t32\t88.2\ttest@example.com',
  '5\t1\t1\t1\t1\t3\t10\t10\t10\t10\t-1\tignored'
].join('\n');

const words = parseTesseractTsv(sampleTsv, 3);
assert.equal(words.length, 2);
assert.deepEqual(words[0], {
  pageNumber: 3,
  text: '900101-1234567',
  x: 128,
  y: 244,
  width: 220,
  height: 36,
  confidence: 91.4
});
assert.deepEqual(parsePagesParam('1,2,2,abc,4'), [1, 2, 4]);
assert.equal(parsePagesParam('abc'), undefined);
assert.equal(parsePdfPageCount('Title: sample.pdf\nPages:          12\nEncrypted: no'), 12);

process.stdout.write('mock TSV parsing passed\n');

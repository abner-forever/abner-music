import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseByteRange } from '../../src/shared/range.ts';

describe('local media byte ranges', () => {
  it('supports bounded, open and suffix requests', () => {
    assert.deepEqual(parseByteRange('bytes=44-143', 1000), { start: 44, end: 143 });
    assert.deepEqual(parseByteRange('bytes=400-', 1000), { start: 400, end: 999 });
    assert.deepEqual(parseByteRange('bytes=-200', 1000), { start: 800, end: 999 });
  });
  it('clamps endpoints and suffixes to the actual file size', () => {
    assert.deepEqual(parseByteRange('bytes=400-2000', 1000), { start: 400, end: 999 });
    assert.deepEqual(parseByteRange('bytes=-2000', 1000), { start: 0, end: 999 });
    assert.equal(parseByteRange(null, 1000), undefined);
  });
  it('rejects malformed, inverted, unsafe and unsatisfiable requests', () => {
    for (const value of [
      'bytes=',
      'bytes=-',
      'bytes=-0',
      'bytes=10-5',
      'bytes=1000-',
      'bytes=0-1,5-6',
      'bytes=999999999999999999999-',
      'items=0-10',
    ])
      assert.equal(parseByteRange(value, 1000), 'invalid');
    assert.equal(parseByteRange('bytes=0-', 0), 'invalid');
  });
});

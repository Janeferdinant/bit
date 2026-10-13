import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG,
  BitStuffingError,
  bitStuffing,
  bitDestuffing,
  stuff,
  destuff,
  frame,
  unframe,
  isBitString,
} from '../lib/bitstuff.mjs';

// Every bit string of length 0..n, in order: '', '0', '1', '00', '01', ...
function* allBitStrings(maxLength) {
  for (let len = 0; len <= maxLength; len++) {
    for (let v = 0; v < 2 ** len; v++) {
      yield len === 0 ? '' : v.toString(2).padStart(len, '0');
    }
  }
}

test('worked example from the page: 01111110 -> 011111010 -> 01111110', () => {
  assert.equal(bitStuffing('01111110'), '011111010');
  assert.equal(bitDestuffing('011111010'), '01111110');
});

test('round trip: destuff(stuff(x)) === x for every bit string up to 14 bits', () => {
  let checked = 0;
  for (const bits of allBitStrings(14)) {
    assert.equal(bitDestuffing(bitStuffing(bits)), bits, `round trip failed for "${bits}"`);
    checked++;
  }
  assert.equal(checked, 2 ** 15 - 1);
});

test('stuffed output never contains six 1s in a row, so the flag cannot appear in the data', () => {
  for (const bits of allBitStrings(14)) {
    const out = bitStuffing(bits);
    assert.ok(!out.includes('111111'), `"${bits}" stuffed to "${out}"`);
  }
});

test('runs of five 1s: a 0 is inserted after each complete run of five', () => {
  assert.equal(bitStuffing('1111'), '1111'); // four 1s: nothing to do
  assert.equal(bitStuffing('11111'), '111110'); // exactly five, even at the end
  assert.equal(bitStuffing('111111'), '1111101'); // six
  assert.equal(bitStuffing('1111111111'), '111110111110'); // ten = two runs of five
  assert.equal(bitStuffing('0111110'), '01111100');
  // five 1s -> 111110, then the data 0, then five 1s -> 111110
  assert.equal(bitStuffing('11111011111'), '1111100111110');
});

test('a 0 resets the run of 1s', () => {
  assert.equal(bitStuffing('1111011110'), '1111011110');
  assert.equal(bitStuffing('101010'), '101010');
});

test('stuffing never removes bits and adds exactly floor(run/5) zeros per run', () => {
  const runs = [0, 1, 4, 5, 6, 9, 10, 11, 15, 23];
  for (const n of runs) {
    const bits = '0' + '1'.repeat(n) + '0';
    assert.equal(bitStuffing(bits).length, bits.length + Math.floor(n / 5), `run of ${n}`);
  }
});

test('stuff() reports where each 0 was inserted', () => {
  const { output, inserted, steps } = stuff('1111111111');
  assert.equal(output, '111110111110');
  assert.deepEqual(inserted, [5, 11]);
  for (const i of inserted) assert.equal(output[i], '0');
  assert.equal(steps.length, 10);
  assert.equal(steps.filter((s) => s.stuffedZero).length, 2);
});

test('destuff() reports which input positions were removed', () => {
  const { output, removed } = destuff('111110111110');
  assert.equal(output, '1111111111');
  assert.deepEqual(removed, [5, 11]);
});

test('edge case: empty input stays empty', () => {
  assert.equal(bitStuffing(''), '');
  assert.equal(bitDestuffing(''), '');
});

test('edge case: all zeros and single bits are unchanged', () => {
  for (const bits of ['0', '1', '00000000', '0'.repeat(64)]) {
    assert.equal(bitStuffing(bits), bits);
    assert.equal(bitDestuffing(bits), bits);
  }
});

test('edge case: long input (10,000 ones) round-trips', () => {
  const bits = '1'.repeat(10000);
  const out = bitStuffing(bits);
  assert.equal(out.length, 12000);
  assert.equal(bitDestuffing(out), bits);
});

test('invalid characters are rejected with the position', () => {
  // '2' is at 0-based index 3 (the message says "position 4")
  assert.throws(() => bitStuffing('0102'), (e) => e instanceof BitStuffingError && e.position === 3);
  assert.throws(() => bitStuffing('01 1'), BitStuffingError);
  assert.throws(() => bitDestuffing('abc'), BitStuffingError);
  assert.throws(() => bitStuffing(1011), BitStuffingError);
  assert.equal(isBitString('0101'), true);
  assert.equal(isBitString('01a'), false);
});

test('destuffing rejects streams that stuff() could never produce', () => {
  // Six 1s in a row is a flag/abort, not data.
  assert.throws(() => bitDestuffing('0111111'), (e) => e instanceof BitStuffingError && e.position === 6);
  // Five 1s at the very end with no stuffed 0 after them.
  assert.throws(() => bitDestuffing('011111'), BitStuffingError);
});

test('frame() wraps the stuffed data in flags and unframe() reverses it', () => {
  assert.equal(FLAG, '01111110');
  const data = '01111110';
  const framed = frame(data);
  assert.equal(framed, '01111110' + '011111010' + '01111110');
  assert.equal(unframe(framed), data);
  assert.equal(unframe(frame('')), '');
  assert.throws(() => unframe('0101'), BitStuffingError);
  assert.throws(() => unframe('01111110' + '0' + '01111111'), BitStuffingError);
});

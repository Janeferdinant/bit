// Bit stuffing and destuffing, as used by HDLC-style bit-oriented framing.
//
// A frame starts and ends with the flag 01111110 (six 1s in a row). To make
// sure the flag can never appear inside the data, the SENDER inserts a 0 after
// every run of five consecutive 1s ("stuffing"). The RECEIVER removes the 0
// that follows every run of five 1s ("destuffing").
//
// This module has no dependencies, so it runs in the browser and in Node
// (see test/bitstuff.test.mjs).

export const FLAG = '01111110';
export const MAX_RUN = 5; // after this many consecutive 1s a 0 is stuffed

/** Error thrown for input that is not a valid bit string or stuffed stream. */
export class BitStuffingError extends Error {
  constructor(message, position = null) {
    super(message);
    this.name = 'BitStuffingError';
    this.position = position; // 0-based index in the input, when known
  }
}

/** True when `bits` is a string made only of the characters 0 and 1. */
export function isBitString(bits) {
  return typeof bits === 'string' && /^[01]*$/.test(bits);
}

function assertBitString(bits) {
  if (typeof bits !== 'string') {
    throw new BitStuffingError('Input must be a string of 0s and 1s.');
  }
  const bad = bits.search(/[^01]/);
  if (bad !== -1) {
    throw new BitStuffingError(
      `Invalid character "${bits[bad]}" at position ${bad + 1}: use only 0 and 1.`,
      bad,
    );
  }
}

/**
 * Stuff a bit string.
 * Returns { output, inserted, steps }:
 *   output   - the stuffed bit string
 *   inserted - 0-based positions in `output` of every stuffed 0
 *   steps    - one entry per input bit, for the step-by-step trace
 */
export function stuff(bits) {
  assertBitString(bits);
  let output = '';
  const inserted = [];
  const steps = [];
  let ones = 0; // length of the current run of 1s

  for (let i = 0; i < bits.length; i++) {
    const bit = bits[i];
    output += bit;
    ones = bit === '1' ? ones + 1 : 0;

    let stuffedZero = false;
    if (ones === MAX_RUN) {
      inserted.push(output.length); // index the stuffed 0 will occupy
      output += '0';
      ones = 0;
      stuffedZero = true;
    }
    steps.push({ index: i, bit, run: stuffedZero ? MAX_RUN : ones, stuffedZero, output });
  }
  return { output, inserted, steps };
}

/**
 * Destuff a stuffed bit string.
 * Returns { output, removed, steps }:
 *   output  - the original data bits
 *   removed - 0-based positions in the INPUT of every stuffed 0 that was removed
 *   steps   - one entry per input bit, for the step-by-step trace
 * Throws BitStuffingError when the input could not have come from stuff():
 *   - five 1s followed by another 1 (six 1s in a row is a flag or abort, not data)
 *   - the input ends right after five 1s (the stuffed 0 is missing)
 */
export function destuff(stuffed) {
  assertBitString(stuffed);
  let output = '';
  const removed = [];
  const steps = [];
  let ones = 0;

  for (let i = 0; i < stuffed.length; i++) {
    const bit = stuffed[i];

    if (ones === MAX_RUN) {
      // The bit after five 1s must be the stuffed 0.
      if (bit !== '0') {
        throw new BitStuffingError(
          `Six 1s in a row ending at position ${i + 1}: this is a flag or abort ` +
            'sequence, not stuffed data.',
          i,
        );
      }
      removed.push(i);
      ones = 0;
      steps.push({ index: i, bit, run: 0, removedZero: true, output });
      continue;
    }

    output += bit;
    ones = bit === '1' ? ones + 1 : 0;
    steps.push({ index: i, bit, run: ones, removedZero: false, output });
  }

  if (ones === MAX_RUN) {
    throw new BitStuffingError(
      'The input ends with five 1s but no stuffed 0 after them, so it was not stuffed correctly.',
      stuffed.length - 1,
    );
  }
  return { output, removed, steps };
}

/** Convenience wrappers that return only the bit string. */
export function bitStuffing(bits) {
  return stuff(bits).output;
}

export function bitDestuffing(stuffedBits) {
  return destuff(stuffedBits).output;
}

/** Build a complete frame: FLAG + stuffed data + FLAG. */
export function frame(bits) {
  return FLAG + bitStuffing(bits) + FLAG;
}

/** Take a complete frame apart again and return the original data bits. */
export function unframe(framed) {
  assertBitString(framed);
  if (framed.length < 2 * FLAG.length || !framed.startsWith(FLAG) || !framed.endsWith(FLAG)) {
    throw new BitStuffingError(`A frame must start and end with the flag ${FLAG}.`);
  }
  return bitDestuffing(framed.slice(FLAG.length, framed.length - FLAG.length));
}

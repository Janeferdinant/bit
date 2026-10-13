import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUND_TRIP_SEC,
  MAX_ATTEMPTS,
  parseFrames,
  parseTimeout,
  parseLossPercent,
  runStopAndWait,
} from '../lib/stopwait.mjs';

// Run the simulation instantly, recording every wait and every log line.
async function simulate(options) {
  const waits = [];
  const logs = [];
  const summary = await runStopAndWait({
    sleep: async (sec) => { waits.push(sec); },
    onLog: (entry) => logs.push(entry),
    ...options,
  });
  return { summary, waits, logs, texts: logs.map((l) => `${l.who}: ${l.text}`) };
}

// A random() that returns the given values in order.
const sequence = (...values) => {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('random() called more often than expected');
    return values[i++];
  };
};

test('no loss: frames go out in order, one round trip each', async () => {
  const { summary, texts, logs, waits } = await simulate({ frames: ['1', '2', '3'], timeoutSec: 2, lossRate: 0 });
  assert.deepEqual(texts, [
    'System: Starting Stop-and-Wait Simulation',
    'Sender: Sending frame 1 (seq 0)',
    'Receiver: Frame 1 received, sending ACK 1',
    'Sender: ACK for frame 1 received',
    'Sender: Sending frame 2 (seq 1)',
    'Receiver: Frame 2 received, sending ACK 0',
    'Sender: ACK for frame 2 received',
    'Sender: Sending frame 3 (seq 0)',
    'Receiver: Frame 3 received, sending ACK 1',
    'Sender: ACK for frame 3 received',
    'Sender: All frames sent successfully',
  ]);
  assert.equal(summary.delivered, 3);
  assert.equal(summary.retransmissions, 0);
  assert.equal(summary.totalTimeSec, 3 * ROUND_TRIP_SEC);
  assert.equal(waits.reduce((a, b) => a + b, 0), 3 * ROUND_TRIP_SEC);
  // Paced: the ACK for frame 1 arrives one round trip after it was sent.
  assert.equal(logs[3].t - logs[1].t, ROUND_TRIP_SEC);
});

test('regression: the first frame logged is frame 1 and no label is undefined', async () => {
  const { texts } = await simulate({ frames: ['1', '2', '3'], timeoutSec: 2, lossRate: 0.5, random: () => 0.9 });
  assert.equal(texts[1], 'Sender: Sending frame 1 (seq 0)');
  assert.ok(texts.every((t) => !t.includes('undefined')));
});

test('lost frame: sender waits the full timeout, then retransmits the same frame', async () => {
  // attempt 1: lost (0.1 < 0.3), the frame itself (0.2 < 0.5); attempt 2: delivered (0.9)
  const { summary, texts, logs } = await simulate({
    frames: ['7'], timeoutSec: 3, lossRate: 0.3, random: sequence(0.1, 0.2, 0.9),
  });
  assert.deepEqual(texts.slice(1), [
    'Sender: Sending frame 7 (seq 0)',
    'Channel: Frame 7 lost',
    'Sender: Timeout for frame 7, retransmitting',
    'Sender: Sending frame 7 (seq 0), attempt 2',
    'Receiver: Frame 7 received, sending ACK 1',
    'Sender: ACK for frame 7 received',
    'Sender: All frames sent successfully',
  ]);
  const timeoutLine = logs.find((l) => l.text.startsWith('Timeout'));
  assert.equal(timeoutLine.t, 3); // timeout measured from the first send at t = 0
  assert.equal(summary.retransmissions, 1);
  assert.equal(summary.totalTimeSec, 3 + ROUND_TRIP_SEC);
});

test('lost ACK: receiver discards the duplicate and re-sends the ACK', async () => {
  // attempt 1: lost (0.1), the ACK (0.7 >= 0.5); attempt 2: delivered (0.9)
  const { texts } = await simulate({
    frames: ['5'], timeoutSec: 2, lossRate: 0.3, random: sequence(0.1, 0.7, 0.9),
  });
  assert.deepEqual(texts.slice(1, 7), [
    'Sender: Sending frame 5 (seq 0)',
    'Receiver: Frame 5 received, sending ACK 1',
    'Channel: ACK for frame 5 lost',
    'Sender: Timeout for frame 5, retransmitting',
    'Sender: Sending frame 5 (seq 0), attempt 2',
    'Receiver: Duplicate frame 5 (seq 0) discarded, ACK 1 sent again',
  ]);
});

test('the sender gives up after MAX_ATTEMPTS lost transmissions', async () => {
  const { summary, texts } = await simulate({ frames: ['1', '2'], timeoutSec: 2, lossRate: 0.8, random: () => 0 });
  assert.equal(summary.gaveUp, true);
  assert.equal(summary.delivered, 0);
  assert.equal(summary.transmissions, MAX_ATTEMPTS);
  assert.equal(texts.at(-1), `Sender: Giving up on frame 1 after ${MAX_ATTEMPTS} attempts`);
  assert.equal(texts.at(-2), 'Sender: Timeout for frame 1');
});

test('cancelling stops the run after the current wait', async () => {
  let calls = 0;
  const { summary } = await simulate({
    frames: ['1', '2', '3'], timeoutSec: 2, lossRate: 0, isCancelled: () => ++calls >= 2,
  });
  assert.equal(summary.cancelled, true);
  assert.equal(summary.delivered, 0);
});

test('a timeout that is not longer than the round trip is rejected', async () => {
  await assert.rejects(() => simulate({ frames: ['1'], timeoutSec: ROUND_TRIP_SEC }), RangeError);
});

test('parseFrames accepts comma-separated numbers and explains bad input', () => {
  assert.deepEqual(parseFrames('1,2,3'), { frames: ['1', '2', '3'] });
  assert.deepEqual(parseFrames(' 4 , 5 '), { frames: ['4', '5'] });
  assert.match(parseFrames('').error, /at least one frame/);
  assert.match(parseFrames('1,,2').error, /Empty frame/);
  assert.match(parseFrames('1,a').error, /"a" is not a frame number/);
  assert.match(parseFrames(Array(21).fill('1').join(',')).error, /at most 20/);
});

test('parseTimeout and parseLossPercent enforce the page limits', () => {
  assert.deepEqual(parseTimeout('2'), { timeoutSec: 2 });
  assert.ok(parseTimeout('1').error);
  assert.ok(parseTimeout('2.5').error);
  assert.ok(parseTimeout('').error);
  assert.deepEqual(parseLossPercent('20'), { lossRate: 0.2 });
  assert.ok(parseLossPercent('-1').error);
  assert.ok(parseLossPercent('81').error);
});

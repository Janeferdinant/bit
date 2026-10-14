// Stop-and-wait ARQ simulation.
//
// The sender transmits one frame, then waits. If the ACK comes back before the
// timer expires, it sends the next frame. If the frame or its ACK is lost, the
// timer expires and the sender retransmits the same frame. Frames carry a
// 1-bit sequence number (0, 1, 0, 1, ...) so the receiver can recognise and
// discard a duplicate when only the ACK was lost.
//
// The timing and the randomness are injected, so the browser page runs it in
// real time while the tests in test/stopwait.test.mjs run it instantly and
// deterministically.

export const ROUND_TRIP_SEC = 1; // frame + ACK travel time when nothing is lost
export const MAX_ATTEMPTS = 8; // give up on a frame after this many tries

/**
 * Parse "1, 2, 3" into ['1', '2', '3'].
 * Returns { frames } or { error } (a message for the page).
 */
export function parseFrames(text) {
  const parts = String(text ?? '').split(',').map((p) => p.trim());
  if (parts.length === 1 && parts[0] === '') {
    return { error: 'Enter at least one frame, e.g. 1,2,3.' };
  }
  const bad = parts.find((p) => !/^\d+$/.test(p));
  if (bad !== undefined) {
    return {
      error: bad === ''
        ? 'Empty frame between commas: enter comma-separated numbers, e.g. 1,2,3.'
        : `"${bad}" is not a frame number: enter comma-separated numbers, e.g. 1,2,3.`,
    };
  }
  if (parts.length > 20) return { error: 'Use at most 20 frames.' };
  return { frames: parts };
}

/** Validate the timeout (whole seconds, longer than the round trip). */
export function parseTimeout(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > 10) {
    return { error: 'Timeout must be a whole number of seconds from 2 to 10 (longer than the 1 s round trip).' };
  }
  return { timeoutSec: n };
}

/** Validate the loss probability, given as a percentage 0..80. */
export function parseLossPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 80) {
    return { error: 'Loss probability must be between 0 and 80 percent.' };
  }
  return { lossRate: n / 100 };
}

const realSleep = (sec) => new Promise((resolve) => globalThis.setTimeout(resolve, sec * 1000));

/**
 * Run the simulation.
 * options:
 *   frames      array of frame labels, e.g. ['1', '2', '3']
 *   timeoutSec  sender timeout in seconds (must be > ROUND_TRIP_SEC)
 *   lossRate    probability (0..1) that a transmission is lost
 *   random      () => number in [0, 1)   (default Math.random)
 *   sleep       async (seconds) => void  (default: real time)
 *   onLog       (entry) => void, entry = { t, who, text }
 *   isCancelled () => boolean, checked after every wait
 * Resolves to a summary { delivered, transmissions, retransmissions, totalTimeSec, gaveUp, cancelled }.
 */
export async function runStopAndWait({
  frames,
  timeoutSec,
  lossRate = 0,
  random = Math.random,
  sleep = realSleep,
  onLog = () => {},
  isCancelled = () => false,
}) {
  if (!(timeoutSec > ROUND_TRIP_SEC)) throw new RangeError('timeoutSec must be longer than the round trip');
  let t = 0;
  const log = (who, text) => onLog({ t, who, text });
  const wait = async (sec) => {
    await sleep(sec);
    t = Math.round((t + sec) * 10) / 10;
    return isCancelled();
  };

  const summary = { delivered: 0, transmissions: 0, retransmissions: 0, totalTimeSec: 0, gaveUp: false, cancelled: false };
  const receivedByReceiver = new Set(); // frame indexes the receiver already has
  log('System', 'Starting Stop-and-Wait Simulation');

  for (let i = 0; i < frames.length; i++) {
    const label = frames[i];
    const seq = i % 2;
    let acked = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !acked; attempt++) {
      summary.transmissions++;
      if (attempt > 1) summary.retransmissions++;
      log('Sender', `Sending frame ${label} (seq ${seq})${attempt > 1 ? `, attempt ${attempt}` : ''}`);

      // Decide what (if anything) is lost on this attempt.
      const lost = random() < lossRate ? (random() < 0.5 ? 'frame' : 'ack') : null;

      if (await wait(ROUND_TRIP_SEC / 2)) return { ...summary, totalTimeSec: t, cancelled: true };
      if (lost === 'frame') {
        log('Channel', `Frame ${label} lost`);
      } else {
        if (receivedByReceiver.has(i)) {
          log('Receiver', `Duplicate frame ${label} (seq ${seq}) discarded, ACK ${1 - seq} sent again`);
        } else {
          receivedByReceiver.add(i);
          log('Receiver', `Frame ${label} received, sending ACK ${1 - seq}`);
        }
        if (lost === 'ack') log('Channel', `ACK for frame ${label} lost`);
      }

      if (lost === null) {
        if (await wait(ROUND_TRIP_SEC / 2)) return { ...summary, totalTimeSec: t, cancelled: true };
        log('Sender', `ACK for frame ${label} received`);
        acked = true;
      } else {
        // Nothing comes back: wait for the rest of the timeout, then retransmit.
        if (await wait(timeoutSec - ROUND_TRIP_SEC / 2)) return { ...summary, totalTimeSec: t, cancelled: true };
        log('Sender', attempt < MAX_ATTEMPTS
          ? `Timeout for frame ${label}, retransmitting`
          : `Timeout for frame ${label}`);
      }
    }

    if (!acked) {
      log('Sender', `Giving up on frame ${label} after ${MAX_ATTEMPTS} attempts`);
      summary.gaveUp = true;
      summary.totalTimeSec = t;
      return summary;
    }
    summary.delivered++;
  }

  summary.totalTimeSec = t;
  log('Sender', 'All frames sent successfully');
  return summary;
}

// Stop-and-Wait Protocol demo (React 18, loaded as a UMD global from the CDN).
// Source file: edit this, then run `npm run build` to regenerate js/stop_and_wait.js.
import {
  ROUND_TRIP_SEC,
  MAX_ATTEMPTS,
  parseFrames,
  parseTimeout,
  parseLossPercent,
  runStopAndWait,
} from '../lib/stopwait.mjs';
import { mount } from './mount.jsx';

const WHO_STYLE = {
  Sender: 'bg-blue-100 text-blue-800',
  Receiver: 'bg-green-100 text-green-800',
  Channel: 'bg-red-100 text-red-800',
  System: 'bg-gray-100 text-gray-700',
};

function App() {
  const [frames, setFrames] = React.useState('');
  // Named timeoutSec (not "timeout") so nothing shadows the browser's setTimeout.
  const [timeoutSec, setTimeoutSec] = React.useState('2');
  const [lossPercent, setLossPercent] = React.useState('20');
  const [logs, setLogs] = React.useState([]);
  const [error, setError] = React.useState('');
  const [running, setRunning] = React.useState(false);
  const [summary, setSummary] = React.useState(null);
  const runId = React.useRef(0); // bumping it cancels the current run

  React.useEffect(() => () => { runId.current++; }, []); // cancel when the page unmounts

  const simulate = async () => {
    const f = parseFrames(frames);
    const t = parseTimeout(timeoutSec);
    const l = parseLossPercent(lossPercent);
    const problem = f.error || t.error || l.error;
    setLogs([]);
    setSummary(null);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setRunning(true);
    const id = ++runId.current;
    const result = await runStopAndWait({
      frames: f.frames,
      timeoutSec: t.timeoutSec,
      lossRate: l.lossRate,
      onLog: (entry) => { if (runId.current === id) setLogs((prev) => [...prev, entry]); },
      isCancelled: () => runId.current !== id,
    });
    if (runId.current === id) {
      setSummary({ ...result, total: f.frames.length });
      setRunning(false);
    }
  };

  const stop = () => {
    runId.current++;
    setRunning(false);
    setLogs((prev) => [...prev, { t: prev.length ? prev[prev.length - 1].t : 0, who: 'System', text: 'Simulation stopped' }]);
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      <a href="./" className="text-sm text-blue-700 hover:underline">&larr; All demos</a>
      <h1 className="text-2xl sm:text-3xl font-bold mt-2">Stop-and-Wait Protocol</h1>
      <p className="text-gray-600 mt-1">
        Send frames one at a time over a channel that sometimes loses a frame or an ACK, and watch the
        sender time out and retransmit. The simulation runs in real time: one round trip takes {ROUND_TRIP_SEC} s.
      </p>

      <section className="bg-white shadow rounded-lg p-4 sm:p-6 mt-6" aria-labelledby="setup-h">
        <h2 id="setup-h" className="text-lg font-semibold">Set up the transfer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div className="sm:col-span-3">
            <label htmlFor="frames" className="block text-gray-700 mb-1">Frames (comma-separated)</label>
            <input
              id="frames"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={frames}
              onChange={(e) => setFrames(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 1,2,3,4,5"
              disabled={running}
            />
          </div>
          <div>
            <label htmlFor="timeout" className="block text-gray-700 mb-1">Timeout (seconds)</label>
            <input
              id="timeout"
              type="number"
              min="2"
              max="10"
              step="1"
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={running}
            />
          </div>
          <div>
            <label htmlFor="loss" className="block text-gray-700 mb-1">Loss probability (%)</label>
            <input
              id="loss"
              type="number"
              min="0"
              max="80"
              step="5"
              value={lossPercent}
              onChange={(e) => setLossPercent(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={running}
            />
          </div>
          <div className="flex items-end gap-2">
            {running ? (
              <button type="button" onClick={stop} className="w-full bg-gray-600 text-white p-2 rounded hover:bg-gray-700 transition">
                Stop
              </button>
            ) : (
              <button type="button" onClick={simulate} className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition">
                Simulate
              </button>
            )}
          </div>
        </div>
        <p role="alert" className="text-red-600 text-sm mt-2 min-h-[1.25rem]">{error}</p>

        {logs.length > 0 && (
          <div className="mt-2">
            <h3 className="text-lg font-semibold">Simulation Logs</h3>
            <ol className="mt-2 space-y-1 text-sm" aria-live="polite" data-testid="logs">
              {logs.map((log, index) => (
                <li key={index} className="flex gap-2 items-start">
                  <span className="font-mono text-gray-500 shrink-0 w-14 text-right">t={log.t.toFixed(1)}s</span>
                  <span className={`shrink-0 rounded px-1.5 text-xs leading-5 ${WHO_STYLE[log.who] || ''}`}>{log.who}</span>
                  <span className="min-w-0 break-words" data-testid="log-text">{log.text}</span>
                </li>
              ))}
            </ol>
            {summary && !summary.cancelled && (
              <p className="mt-3 text-sm text-gray-700" data-testid="summary">
                {summary.delivered} of {summary.total} frames delivered with {summary.transmissions} transmissions ({summary.retransmissions} retransmissions)
                in {summary.totalTimeSec.toFixed(1)} s of simulated time.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="bg-white shadow rounded-lg p-4 sm:p-6 mt-6" aria-labelledby="how-h">
        <h2 id="how-h" className="text-xl font-semibold mb-2">How It Works</h2>
        <p className="text-gray-700">
          <strong>Stop-and-Wait Protocol:</strong> The sender sends one frame and waits for an
          acknowledgment (ACK) from the receiver. If the ACK is received, the next frame is sent. If a
          timeout occurs (no ACK), the frame is retransmitted.
        </p>
        <p className="text-gray-700 mt-2">
          Frames carry a 1-bit sequence number (0, 1, 0, 1, ...). When only the ACK is lost, the receiver
          gets the same frame twice; the sequence number lets it discard the duplicate and simply re-send
          the ACK. The sender gives up on a frame after {MAX_ATTEMPTS} attempts.
        </p>
        <h3 className="text-lg font-semibold mt-4">Numerical Example</h3>
        <p className="text-gray-700"><strong>Input Frames:</strong> 1,2,3 &nbsp; <strong>Timeout:</strong> 2 seconds</p>
        <ol className="list-decimal pl-5 text-gray-700 mt-2 space-y-0.5">
          <li>Sender sends frame 1.</li>
          <li>Receiver gets frame 1, sends ACK.</li>
          <li>Sender receives ACK, sends frame 2.</li>
          <li>(Assume the ACK for frame 2 is lost.)</li>
          <li>Sender waits 2 seconds, times out, retransmits frame 2.</li>
          <li>Receiver gets frame 2 again, recognises the duplicate, discards it and re-sends the ACK.</li>
          <li>Sender receives ACK, sends frame 3.</li>
          <li>Receiver gets frame 3, sends ACK.</li>
          <li>Sender receives ACK, ends.</li>
        </ol>
        <p className="text-gray-700 mt-2"><strong>Output:</strong> All frames sent successfully.</p>
      </section>
    </main>
  );
}

mount(App);

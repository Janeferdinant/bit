// Bit Stuffing & Destuffing demo (React 18, loaded as a UMD global from the CDN).
// Source file: edit this, then run `npm run build` to regenerate js/bit_stuff.js.
import { stuff, destuff, FLAG } from '../lib/bitstuff.mjs';
import { mount } from './mount.jsx';


const EXAMPLES = [
  { label: 'Flag pattern', bits: '01111110' },
  { label: 'Long run of 1s', bits: '0111111111111' },
  { label: 'Exactly five 1s', bits: '11111' },
  { label: 'No stuffing needed', bits: '1011001101' },
];

// Show a bit string, highlighting the given positions (the stuffed 0s).
function Bits({ bits, highlight = [], testId }) {
  if (bits === '') return <span className="text-gray-500 italic">(empty)</span>;
  const marked = new Set(highlight);
  return (
    <span className="font-mono break-all tracking-wider" data-testid={testId}>
      {bits.split('').map((b, i) =>
        marked.has(i) ? (
          <mark key={i} className="bg-amber-200 text-amber-900 rounded px-0.5" title="stuffed 0">{b}</mark>
        ) : (
          <span key={i}>{b}</span>
        ),
      )}
    </span>
  );
}

function Trace({ steps, kind }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-blue-700">Show the step-by-step trace</summary>
      <div className="overflow-x-auto mt-2">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Bit</th>
              <th className="py-1 pr-2">1s in a row</th>
              <th className="py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.index} className="border-b border-gray-100">
                <td className="py-1 pr-2 text-gray-500">{s.index + 1}</td>
                <td className="py-1 pr-2 font-mono">{s.bit}</td>
                <td className="py-1 pr-2">{s.run}</td>
                <td className="py-1">
                  {kind === 'stuff'
                    ? s.stuffedZero ? 'copy, then insert 0 (five 1s)' : 'copy'
                    : s.removedZero ? 'remove stuffed 0' : 'copy'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function App() {
  const [input, setInput] = React.useState('');
  const [sent, setSent] = React.useState(null); // { data, result }
  const [sendError, setSendError] = React.useState('');
  const [received, setReceived] = React.useState('');
  const [recv, setRecv] = React.useState(null); // result of destuff()
  const [recvError, setRecvError] = React.useState('');

  const handleStuff = (bits = input) => {
    setRecv(null);
    setRecvError('');
    const data = bits.trim();
    if (data === '') {
      setSent(null);
      setSendError('Enter a binary string, e.g. 01111110.');
      return;
    }
    try {
      const result = stuff(data);
      setSent({ data, result });
      setSendError('');
      setReceived(result.output); // hand the stuffed bits to the receiver
    } catch (e) {
      setSent(null); // never leave a stale result next to an error
      setSendError(e.message);
    }
  };

  const handleDestuff = () => {
    const bits = received.trim();
    if (bits === '') {
      setRecv(null);
      setRecvError('Enter the stuffed bits to destuff.');
      return;
    }
    try {
      setRecv(destuff(bits));
      setRecvError('');
    } catch (e) {
      setRecv(null);
      setRecvError(e.message);
    }
  };

  const tryExample = (bits) => {
    setInput(bits);
    handleStuff(bits);
  };

  const matches = sent && recv && recv.output === sent.data;

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      <a href="./" className="text-sm text-blue-700 hover:underline">&larr; All demos</a>
      <h1 className="text-2xl sm:text-3xl font-bold mt-2">Bit Stuffing &amp; Destuffing</h1>
      <p className="text-gray-600 mt-1">
        Type some data bits. The sender stuffs them so the flag {FLAG} can never appear inside the
        frame; the receiver removes the stuffed 0s again.
      </p>

      <section className="bg-white shadow rounded-lg p-4 sm:p-6 mt-6" aria-labelledby="sender-h">
        <h2 id="sender-h" className="text-lg font-semibold">1. Sender: stuff the data</h2>
        <label htmlFor="data-bits" className="block text-gray-700 mt-3 mb-1">Data bits</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="data-bits"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleStuff(); }}
            className="flex-1 min-w-0 p-2 border rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. 01111110"
            aria-invalid={sendError ? 'true' : 'false'}
            aria-describedby="send-error"
          />
          <button
            type="button"
            onClick={() => handleStuff()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            Stuff
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.bits}
              type="button"
              onClick={() => tryExample(ex.bits)}
              className="text-xs bg-gray-100 border border-gray-300 rounded px-2 py-1 hover:bg-gray-200"
            >
              {ex.label}: <span className="font-mono">{ex.bits}</span>
            </button>
          ))}
        </div>
        <p id="send-error" role="alert" className="text-red-600 text-sm mt-2 min-h-[1.25rem]">{sendError}</p>

        {sent && (
          <div className="mt-2 space-y-2" aria-live="polite">
            <p><strong>Stuffed bits:</strong> <Bits bits={sent.result.output} highlight={sent.result.inserted} testId="stuffed" /></p>
            <p className="text-sm text-gray-600">
              {sent.result.inserted.length === 0
                ? 'No run of five 1s, so nothing was inserted.'
                : `${sent.result.inserted.length} stuffed 0${sent.result.inserted.length > 1 ? 's' : ''} inserted (highlighted): ${sent.data.length} data bits became ${sent.result.output.length} bits.`}
            </p>
            <p className="text-sm">
              <strong>Frame on the wire:</strong>{' '}
              <span className="font-mono break-all">
                <span className="text-blue-700">{FLAG}</span>
                <Bits bits={sent.result.output} highlight={sent.result.inserted} />
                <span className="text-blue-700">{FLAG}</span>
              </span>
            </p>
            <Trace steps={sent.result.steps} kind="stuff" />
          </div>
        )}
      </section>

      <section className="bg-white shadow rounded-lg p-4 sm:p-6 mt-6" aria-labelledby="receiver-h">
        <h2 id="receiver-h" className="text-lg font-semibold">2. Receiver: destuff</h2>
        <label htmlFor="stuffed-bits" className="block text-gray-700 mt-3 mb-1">Stuffed bits (between the flags)</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="stuffed-bits"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={received}
            onChange={(e) => { setReceived(e.target.value); setRecv(null); setRecvError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleDestuff(); }}
            className="flex-1 min-w-0 p-2 border rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="filled in when you press Stuff"
            aria-invalid={recvError ? 'true' : 'false'}
            aria-describedby="recv-error"
          />
          <button
            type="button"
            onClick={handleDestuff}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            Destuff
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Try editing a bit to see how the receiver reacts to a corrupted frame.</p>
        <p id="recv-error" role="alert" className="text-red-600 text-sm mt-2 min-h-[1.25rem]">{recvError}</p>

        {recv && (
          <div className="mt-2 space-y-2" aria-live="polite">
            <p><strong>Destuffed bits:</strong> <Bits bits={recv.output} testId="destuffed" /></p>
            <p className="text-sm text-gray-600">
              {recv.removed.length === 0
                ? 'No stuffed 0s found.'
                : `Removed ${recv.removed.length} stuffed 0${recv.removed.length > 1 ? 's' : ''}.`}
            </p>
            {sent && (
              <p className={matches ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'} data-testid="match">
                {matches ? 'Matches the original data.' : 'Does not match the data the sender stuffed.'}
              </p>
            )}
            <Trace steps={recv.steps} kind="destuff" />
          </div>
        )}
      </section>

      <section className="bg-white shadow rounded-lg p-4 sm:p-6 mt-6" aria-labelledby="how-h">
        <h2 id="how-h" className="text-xl font-semibold mb-2">How It Works</h2>
        <p className="text-gray-700">
          <strong>Bit Stuffing:</strong> After every five consecutive 1s, the sender inserts a 0, so the
          data can never contain six 1s in a row and cannot mimic the flag sequence 01111110.
        </p>
        <p className="text-gray-700 mt-2">
          <strong>Bit Destuffing:</strong> The receiver removes the 0 that follows five 1s to retrieve the
          original data. If it sees six 1s in a row instead, that is a flag (or an abort), not data.
        </p>
        <h3 className="text-lg font-semibold mt-4">Numerical Example</h3>
        <p className="text-gray-700"><strong>Input:</strong> <span className="font-mono">01111110</span></p>
        <ol className="text-gray-700 font-mono text-sm mt-2 space-y-0.5">
          <li>Read 0 &rarr; output 0</li>
          <li>Read 1 (count=1) &rarr; output 01</li>
          <li>Read 1 (count=2) &rarr; output 011</li>
          <li>Read 1 (count=3) &rarr; output 0111</li>
          <li>Read 1 (count=4) &rarr; output 01111</li>
          <li>Read 1 (count=5) &rarr; output 0111110 (insert 0, reset count)</li>
          <li>Read 1 (count=1) &rarr; output 01111101</li>
          <li>Read 0 &rarr; output 011111010</li>
        </ol>
        <p className="text-gray-700 mt-2"><strong>Stuffed output:</strong> <span className="font-mono">011111010</span></p>
        <p className="text-gray-700 mt-2">
          <strong>Destuffing:</strong> read <span className="font-mono">011111</span> (five 1s), skip the next 0,
          then continue with <span className="font-mono">10</span> &rarr; <span className="font-mono">01111110</span>.
        </p>
      </section>
    </main>
  );
}

mount(App);

(() => {
  // lib/stopwait.mjs
  var ROUND_TRIP_SEC = 1;
  var MAX_ATTEMPTS = 8;
  function parseFrames(text) {
    const parts = String(text != null ? text : "").split(",").map((p) => p.trim());
    if (parts.length === 1 && parts[0] === "") {
      return { error: "Enter at least one frame, e.g. 1,2,3." };
    }
    const bad = parts.find((p) => !/^\d+$/.test(p));
    if (bad !== void 0) {
      return {
        error: bad === "" ? "Empty frame between commas: enter comma-separated numbers, e.g. 1,2,3." : `"${bad}" is not a frame number: enter comma-separated numbers, e.g. 1,2,3.`
      };
    }
    if (parts.length > 20) return { error: "Use at most 20 frames." };
    return { frames: parts };
  }
  function parseTimeout(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 2 || n > 10) {
      return { error: "Timeout must be a whole number of seconds from 2 to 10 (longer than the 1 s round trip)." };
    }
    return { timeoutSec: n };
  }
  function parseLossPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 80) {
      return { error: "Loss probability must be between 0 and 80 percent." };
    }
    return { lossRate: n / 100 };
  }
  var realSleep = (sec) => new Promise((resolve) => globalThis.setTimeout(resolve, sec * 1e3));
  async function runStopAndWait({
    frames,
    timeoutSec,
    lossRate = 0,
    random = Math.random,
    sleep = realSleep,
    onLog = () => {
    },
    isCancelled = () => false
  }) {
    if (!(timeoutSec > ROUND_TRIP_SEC)) throw new RangeError("timeoutSec must be longer than the round trip");
    let t = 0;
    const log = (who, text) => onLog({ t, who, text });
    const wait = async (sec) => {
      await sleep(sec);
      t = Math.round((t + sec) * 10) / 10;
      return isCancelled();
    };
    const summary = { delivered: 0, transmissions: 0, retransmissions: 0, totalTimeSec: 0, gaveUp: false, cancelled: false };
    const receivedByReceiver = /* @__PURE__ */ new Set();
    log("System", "Starting Stop-and-Wait Simulation");
    for (let i = 0; i < frames.length; i++) {
      const label = frames[i];
      const seq = i % 2;
      let acked = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !acked; attempt++) {
        summary.transmissions++;
        if (attempt > 1) summary.retransmissions++;
        log("Sender", `Sending frame ${label} (seq ${seq})${attempt > 1 ? `, attempt ${attempt}` : ""}`);
        const lost = random() < lossRate ? random() < 0.5 ? "frame" : "ack" : null;
        if (await wait(ROUND_TRIP_SEC / 2)) return { ...summary, totalTimeSec: t, cancelled: true };
        if (lost === "frame") {
          log("Channel", `Frame ${label} lost`);
        } else {
          if (receivedByReceiver.has(i)) {
            log("Receiver", `Duplicate frame ${label} (seq ${seq}) discarded, ACK ${1 - seq} sent again`);
          } else {
            receivedByReceiver.add(i);
            log("Receiver", `Frame ${label} received, sending ACK ${1 - seq}`);
          }
          if (lost === "ack") log("Channel", `ACK for frame ${label} lost`);
        }
        if (lost === null) {
          if (await wait(ROUND_TRIP_SEC / 2)) return { ...summary, totalTimeSec: t, cancelled: true };
          log("Sender", `ACK for frame ${label} received`);
          acked = true;
        } else {
          if (await wait(timeoutSec - ROUND_TRIP_SEC / 2)) return { ...summary, totalTimeSec: t, cancelled: true };
          log("Sender", attempt < MAX_ATTEMPTS ? `Timeout for frame ${label}, retransmitting` : `Timeout for frame ${label}`);
        }
      }
      if (!acked) {
        log("Sender", `Giving up on frame ${label} after ${MAX_ATTEMPTS} attempts`);
        summary.gaveUp = true;
        summary.totalTimeSec = t;
        return summary;
      }
      summary.delivered++;
    }
    summary.totalTimeSec = t;
    log("Sender", "All frames sent successfully");
    return summary;
  }

  // src/mount.jsx
  function mount(App2) {
    const root = document.getElementById("root");
    if (typeof React === "undefined" || typeof ReactDOM === "undefined") {
      root.innerHTML = '<p style="padding:1rem;font-family:sans-serif">This demo needs React, which is loaded from cdn.jsdelivr.net. Check your internet connection and reload the page.</p>';
      return;
    }
    ReactDOM.createRoot(root).render(/* @__PURE__ */ React.createElement(App2, null));
  }

  // src/stop_and_wait.jsx
  var WHO_STYLE = {
    Sender: "bg-blue-100 text-blue-800",
    Receiver: "bg-green-100 text-green-800",
    Channel: "bg-red-100 text-red-800",
    System: "bg-gray-100 text-gray-700"
  };
  function App() {
    const [frames, setFrames] = React.useState("");
    const [timeoutSec, setTimeoutSec] = React.useState("2");
    const [lossPercent, setLossPercent] = React.useState("20");
    const [logs, setLogs] = React.useState([]);
    const [error, setError] = React.useState("");
    const [running, setRunning] = React.useState(false);
    const [summary, setSummary] = React.useState(null);
    const runId = React.useRef(0);
    React.useEffect(() => () => {
      runId.current++;
    }, []);
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
      setError("");
      setRunning(true);
      const id = ++runId.current;
      const result = await runStopAndWait({
        frames: f.frames,
        timeoutSec: t.timeoutSec,
        lossRate: l.lossRate,
        onLog: (entry) => {
          if (runId.current === id) setLogs((prev) => [...prev, entry]);
        },
        isCancelled: () => runId.current !== id
      });
      if (runId.current === id) {
        setSummary({ ...result, total: f.frames.length });
        setRunning(false);
      }
    };
    const stop = () => {
      runId.current++;
      setRunning(false);
      setLogs((prev) => [...prev, { t: prev.length ? prev[prev.length - 1].t : 0, who: "System", text: "Simulation stopped" }]);
    };
    return /* @__PURE__ */ React.createElement("main", { className: "max-w-3xl mx-auto px-4 py-6 sm:py-10" }, /* @__PURE__ */ React.createElement("a", { href: "./", className: "text-sm text-blue-700 hover:underline" }, "\u2190 All demos"), /* @__PURE__ */ React.createElement("h1", { className: "text-2xl sm:text-3xl font-bold mt-2" }, "Stop-and-Wait Protocol"), /* @__PURE__ */ React.createElement("p", { className: "text-gray-600 mt-1" }, "Send frames one at a time over a channel that sometimes loses a frame or an ACK, and watch the sender time out and retransmit. The simulation runs in real time: one round trip takes ", ROUND_TRIP_SEC, " s."), /* @__PURE__ */ React.createElement("section", { className: "bg-white shadow rounded-lg p-4 sm:p-6 mt-6", "aria-labelledby": "setup-h" }, /* @__PURE__ */ React.createElement("h2", { id: "setup-h", className: "text-lg font-semibold" }, "Set up the transfer"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3" }, /* @__PURE__ */ React.createElement("div", { className: "sm:col-span-3" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "frames", className: "block text-gray-700 mb-1" }, "Frames (comma-separated)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "frames",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value: frames,
        onChange: (e) => setFrames(e.target.value),
        className: "w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
        placeholder: "e.g. 1,2,3,4,5",
        disabled: running
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "timeout", className: "block text-gray-700 mb-1" }, "Timeout (seconds)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "timeout",
        type: "number",
        min: "2",
        max: "10",
        step: "1",
        value: timeoutSec,
        onChange: (e) => setTimeoutSec(e.target.value),
        className: "w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
        disabled: running
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "loss", className: "block text-gray-700 mb-1" }, "Loss probability (%)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "loss",
        type: "number",
        min: "0",
        max: "80",
        step: "5",
        value: lossPercent,
        onChange: (e) => setLossPercent(e.target.value),
        className: "w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
        disabled: running
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "flex items-end gap-2" }, running ? /* @__PURE__ */ React.createElement("button", { type: "button", onClick: stop, className: "w-full bg-gray-600 text-white p-2 rounded hover:bg-gray-700 transition" }, "Stop") : /* @__PURE__ */ React.createElement("button", { type: "button", onClick: simulate, className: "w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition" }, "Simulate"))), /* @__PURE__ */ React.createElement("p", { role: "alert", className: "text-red-600 text-sm mt-2 min-h-[1.25rem]" }, error), logs.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mt-2" }, /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-semibold" }, "Simulation Logs"), /* @__PURE__ */ React.createElement("ol", { className: "mt-2 space-y-1 text-sm", "aria-live": "polite", "data-testid": "logs" }, logs.map((log, index) => /* @__PURE__ */ React.createElement("li", { key: index, className: "flex gap-2 items-start" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono text-gray-500 shrink-0 w-14 text-right" }, "t=", log.t.toFixed(1), "s"), /* @__PURE__ */ React.createElement("span", { className: `shrink-0 rounded px-1.5 text-xs leading-5 ${WHO_STYLE[log.who] || ""}` }, log.who), /* @__PURE__ */ React.createElement("span", { className: "min-w-0 break-words", "data-testid": "log-text" }, log.text)))), summary && !summary.cancelled && /* @__PURE__ */ React.createElement("p", { className: "mt-3 text-sm text-gray-700", "data-testid": "summary" }, summary.delivered, " of ", summary.total, " frames delivered with ", summary.transmissions, " transmissions (", summary.retransmissions, " retransmissions) in ", summary.totalTimeSec.toFixed(1), " s of simulated time."))), /* @__PURE__ */ React.createElement("section", { className: "bg-white shadow rounded-lg p-4 sm:p-6 mt-6", "aria-labelledby": "how-h" }, /* @__PURE__ */ React.createElement("h2", { id: "how-h", className: "text-xl font-semibold mb-2" }, "How It Works"), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700" }, /* @__PURE__ */ React.createElement("strong", null, "Stop-and-Wait Protocol:"), " The sender sends one frame and waits for an acknowledgment (ACK) from the receiver. If the ACK is received, the next frame is sent. If a timeout occurs (no ACK), the frame is retransmitted."), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700 mt-2" }, "Frames carry a 1-bit sequence number (0, 1, 0, 1, ...). When only the ACK is lost, the receiver gets the same frame twice; the sequence number lets it discard the duplicate and simply re-send the ACK. The sender gives up on a frame after ", MAX_ATTEMPTS, " attempts."), /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-semibold mt-4" }, "Numerical Example"), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700" }, /* @__PURE__ */ React.createElement("strong", null, "Input Frames:"), " 1,2,3 \xA0 ", /* @__PURE__ */ React.createElement("strong", null, "Timeout:"), " 2 seconds"), /* @__PURE__ */ React.createElement("ol", { className: "list-decimal pl-5 text-gray-700 mt-2 space-y-0.5" }, /* @__PURE__ */ React.createElement("li", null, "Sender sends frame 1."), /* @__PURE__ */ React.createElement("li", null, "Receiver gets frame 1, sends ACK."), /* @__PURE__ */ React.createElement("li", null, "Sender receives ACK, sends frame 2."), /* @__PURE__ */ React.createElement("li", null, "(Assume the ACK for frame 2 is lost.)"), /* @__PURE__ */ React.createElement("li", null, "Sender waits 2 seconds, times out, retransmits frame 2."), /* @__PURE__ */ React.createElement("li", null, "Receiver gets frame 2 again, recognises the duplicate, discards it and re-sends the ACK."), /* @__PURE__ */ React.createElement("li", null, "Sender receives ACK, sends frame 3."), /* @__PURE__ */ React.createElement("li", null, "Receiver gets frame 3, sends ACK."), /* @__PURE__ */ React.createElement("li", null, "Sender receives ACK, ends.")), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700 mt-2" }, /* @__PURE__ */ React.createElement("strong", null, "Output:"), " All frames sent successfully.")));
  }
  mount(App);
})();

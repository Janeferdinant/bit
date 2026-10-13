(() => {
  // lib/bitstuff.mjs
  var FLAG = "01111110";
  var MAX_RUN = 5;
  var BitStuffingError = class extends Error {
    constructor(message, position = null) {
      super(message);
      this.name = "BitStuffingError";
      this.position = position;
    }
  };
  function assertBitString(bits) {
    if (typeof bits !== "string") {
      throw new BitStuffingError("Input must be a string of 0s and 1s.");
    }
    const bad = bits.search(/[^01]/);
    if (bad !== -1) {
      throw new BitStuffingError(
        `Invalid character "${bits[bad]}" at position ${bad + 1}: use only 0 and 1.`,
        bad
      );
    }
  }
  function stuff(bits) {
    assertBitString(bits);
    let output = "";
    const inserted = [];
    const steps = [];
    let ones = 0;
    for (let i = 0; i < bits.length; i++) {
      const bit = bits[i];
      output += bit;
      ones = bit === "1" ? ones + 1 : 0;
      let stuffedZero = false;
      if (ones === MAX_RUN) {
        inserted.push(output.length);
        output += "0";
        ones = 0;
        stuffedZero = true;
      }
      steps.push({ index: i, bit, run: stuffedZero ? MAX_RUN : ones, stuffedZero, output });
    }
    return { output, inserted, steps };
  }
  function destuff(stuffed) {
    assertBitString(stuffed);
    let output = "";
    const removed = [];
    const steps = [];
    let ones = 0;
    for (let i = 0; i < stuffed.length; i++) {
      const bit = stuffed[i];
      if (ones === MAX_RUN) {
        if (bit !== "0") {
          throw new BitStuffingError(
            `Six 1s in a row ending at position ${i + 1}: this is a flag or abort sequence, not stuffed data.`,
            i
          );
        }
        removed.push(i);
        ones = 0;
        steps.push({ index: i, bit, run: 0, removedZero: true, output });
        continue;
      }
      output += bit;
      ones = bit === "1" ? ones + 1 : 0;
      steps.push({ index: i, bit, run: ones, removedZero: false, output });
    }
    if (ones === MAX_RUN) {
      throw new BitStuffingError(
        "The input ends with five 1s but no stuffed 0 after them, so it was not stuffed correctly.",
        stuffed.length - 1
      );
    }
    return { output, removed, steps };
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

  // src/bit_stuff.jsx
  var EXAMPLES = [
    { label: "Flag pattern", bits: "01111110" },
    { label: "Long run of 1s", bits: "0111111111111" },
    { label: "Exactly five 1s", bits: "11111" },
    { label: "No stuffing needed", bits: "1011001101" }
  ];
  function Bits({ bits, highlight = [], testId }) {
    if (bits === "") return /* @__PURE__ */ React.createElement("span", { className: "text-gray-500 italic" }, "(empty)");
    const marked = new Set(highlight);
    return /* @__PURE__ */ React.createElement("span", { className: "font-mono break-all tracking-wider", "data-testid": testId }, bits.split("").map(
      (b, i) => marked.has(i) ? /* @__PURE__ */ React.createElement("mark", { key: i, className: "bg-amber-200 text-amber-900 rounded px-0.5", title: "stuffed 0" }, b) : /* @__PURE__ */ React.createElement("span", { key: i }, b)
    ));
  }
  function Trace({ steps, kind }) {
    return /* @__PURE__ */ React.createElement("details", { className: "mt-3" }, /* @__PURE__ */ React.createElement("summary", { className: "cursor-pointer text-sm text-blue-700" }, "Show the step-by-step trace"), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto mt-2" }, /* @__PURE__ */ React.createElement("table", { className: "text-sm w-full border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "text-left text-gray-600 border-b" }, /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-2" }, "#"), /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-2" }, "Bit"), /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-2" }, "1s in a row"), /* @__PURE__ */ React.createElement("th", { className: "py-1" }, "Action"))), /* @__PURE__ */ React.createElement("tbody", null, steps.map((s) => /* @__PURE__ */ React.createElement("tr", { key: s.index, className: "border-b border-gray-100" }, /* @__PURE__ */ React.createElement("td", { className: "py-1 pr-2 text-gray-500" }, s.index + 1), /* @__PURE__ */ React.createElement("td", { className: "py-1 pr-2 font-mono" }, s.bit), /* @__PURE__ */ React.createElement("td", { className: "py-1 pr-2" }, s.run), /* @__PURE__ */ React.createElement("td", { className: "py-1" }, kind === "stuff" ? s.stuffedZero ? "copy, then insert 0 (five 1s)" : "copy" : s.removedZero ? "remove stuffed 0" : "copy")))))));
  }
  function App() {
    const [input, setInput] = React.useState("");
    const [sent, setSent] = React.useState(null);
    const [sendError, setSendError] = React.useState("");
    const [received, setReceived] = React.useState("");
    const [recv, setRecv] = React.useState(null);
    const [recvError, setRecvError] = React.useState("");
    const handleStuff = (bits = input) => {
      setRecv(null);
      setRecvError("");
      const data = bits.trim();
      if (data === "") {
        setSent(null);
        setSendError("Enter a binary string, e.g. 01111110.");
        return;
      }
      try {
        const result = stuff(data);
        setSent({ data, result });
        setSendError("");
        setReceived(result.output);
      } catch (e) {
        setSent(null);
        setSendError(e.message);
      }
    };
    const handleDestuff = () => {
      const bits = received.trim();
      if (bits === "") {
        setRecv(null);
        setRecvError("Enter the stuffed bits to destuff.");
        return;
      }
      try {
        setRecv(destuff(bits));
        setRecvError("");
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
    return /* @__PURE__ */ React.createElement("main", { className: "max-w-3xl mx-auto px-4 py-6 sm:py-10" }, /* @__PURE__ */ React.createElement("a", { href: "./", className: "text-sm text-blue-700 hover:underline" }, "\u2190 All demos"), /* @__PURE__ */ React.createElement("h1", { className: "text-2xl sm:text-3xl font-bold mt-2" }, "Bit Stuffing & Destuffing"), /* @__PURE__ */ React.createElement("p", { className: "text-gray-600 mt-1" }, "Type some data bits. The sender stuffs them so the flag ", FLAG, " can never appear inside the frame; the receiver removes the stuffed 0s again."), /* @__PURE__ */ React.createElement("section", { className: "bg-white shadow rounded-lg p-4 sm:p-6 mt-6", "aria-labelledby": "sender-h" }, /* @__PURE__ */ React.createElement("h2", { id: "sender-h", className: "text-lg font-semibold" }, "1. Sender: stuff the data"), /* @__PURE__ */ React.createElement("label", { htmlFor: "data-bits", className: "block text-gray-700 mt-3 mb-1" }, "Data bits"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row gap-2" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "data-bits",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value: input,
        onChange: (e) => setInput(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") handleStuff();
        },
        className: "flex-1 min-w-0 p-2 border rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500",
        placeholder: "e.g. 01111110",
        "aria-invalid": sendError ? "true" : "false",
        "aria-describedby": "send-error"
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => handleStuff(),
        className: "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      },
      "Stuff"
    )), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-2", "aria-label": "Examples" }, EXAMPLES.map((ex) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: ex.bits,
        type: "button",
        onClick: () => tryExample(ex.bits),
        className: "text-xs bg-gray-100 border border-gray-300 rounded px-2 py-1 hover:bg-gray-200"
      },
      ex.label,
      ": ",
      /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, ex.bits)
    ))), /* @__PURE__ */ React.createElement("p", { id: "send-error", role: "alert", className: "text-red-600 text-sm mt-2 min-h-[1.25rem]" }, sendError), sent && /* @__PURE__ */ React.createElement("div", { className: "mt-2 space-y-2", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("p", null, /* @__PURE__ */ React.createElement("strong", null, "Stuffed bits:"), " ", /* @__PURE__ */ React.createElement(Bits, { bits: sent.result.output, highlight: sent.result.inserted, testId: "stuffed" })), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-gray-600" }, sent.result.inserted.length === 0 ? "No run of five 1s, so nothing was inserted." : `${sent.result.inserted.length} stuffed 0${sent.result.inserted.length > 1 ? "s" : ""} inserted (highlighted): ${sent.data.length} data bits became ${sent.result.output.length} bits.`), /* @__PURE__ */ React.createElement("p", { className: "text-sm" }, /* @__PURE__ */ React.createElement("strong", null, "Frame on the wire:"), " ", /* @__PURE__ */ React.createElement("span", { className: "font-mono break-all" }, /* @__PURE__ */ React.createElement("span", { className: "text-blue-700" }, FLAG), /* @__PURE__ */ React.createElement(Bits, { bits: sent.result.output, highlight: sent.result.inserted }), /* @__PURE__ */ React.createElement("span", { className: "text-blue-700" }, FLAG))), /* @__PURE__ */ React.createElement(Trace, { steps: sent.result.steps, kind: "stuff" }))), /* @__PURE__ */ React.createElement("section", { className: "bg-white shadow rounded-lg p-4 sm:p-6 mt-6", "aria-labelledby": "receiver-h" }, /* @__PURE__ */ React.createElement("h2", { id: "receiver-h", className: "text-lg font-semibold" }, "2. Receiver: destuff"), /* @__PURE__ */ React.createElement("label", { htmlFor: "stuffed-bits", className: "block text-gray-700 mt-3 mb-1" }, "Stuffed bits (between the flags)"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row gap-2" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "stuffed-bits",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value: received,
        onChange: (e) => {
          setReceived(e.target.value);
          setRecv(null);
          setRecvError("");
        },
        onKeyDown: (e) => {
          if (e.key === "Enter") handleDestuff();
        },
        className: "flex-1 min-w-0 p-2 border rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500",
        placeholder: "filled in when you press Stuff",
        "aria-invalid": recvError ? "true" : "false",
        "aria-describedby": "recv-error"
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleDestuff,
        className: "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      },
      "Destuff"
    )), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-500 mt-1" }, "Try editing a bit to see how the receiver reacts to a corrupted frame."), /* @__PURE__ */ React.createElement("p", { id: "recv-error", role: "alert", className: "text-red-600 text-sm mt-2 min-h-[1.25rem]" }, recvError), recv && /* @__PURE__ */ React.createElement("div", { className: "mt-2 space-y-2", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("p", null, /* @__PURE__ */ React.createElement("strong", null, "Destuffed bits:"), " ", /* @__PURE__ */ React.createElement(Bits, { bits: recv.output, testId: "destuffed" })), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-gray-600" }, recv.removed.length === 0 ? "No stuffed 0s found." : `Removed ${recv.removed.length} stuffed 0${recv.removed.length > 1 ? "s" : ""}.`), sent && /* @__PURE__ */ React.createElement("p", { className: matches ? "text-green-700 font-medium" : "text-amber-700 font-medium", "data-testid": "match" }, matches ? "Matches the original data." : "Does not match the data the sender stuffed."), /* @__PURE__ */ React.createElement(Trace, { steps: recv.steps, kind: "destuff" }))), /* @__PURE__ */ React.createElement("section", { className: "bg-white shadow rounded-lg p-4 sm:p-6 mt-6", "aria-labelledby": "how-h" }, /* @__PURE__ */ React.createElement("h2", { id: "how-h", className: "text-xl font-semibold mb-2" }, "How It Works"), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700" }, /* @__PURE__ */ React.createElement("strong", null, "Bit Stuffing:"), " After every five consecutive 1s, the sender inserts a 0, so the data can never contain six 1s in a row and cannot mimic the flag sequence 01111110."), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700 mt-2" }, /* @__PURE__ */ React.createElement("strong", null, "Bit Destuffing:"), " The receiver removes the 0 that follows five 1s to retrieve the original data. If it sees six 1s in a row instead, that is a flag (or an abort), not data."), /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-semibold mt-4" }, "Numerical Example"), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700" }, /* @__PURE__ */ React.createElement("strong", null, "Input:"), " ", /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, "01111110")), /* @__PURE__ */ React.createElement("ol", { className: "text-gray-700 font-mono text-sm mt-2 space-y-0.5" }, /* @__PURE__ */ React.createElement("li", null, "Read 0 \u2192 output 0"), /* @__PURE__ */ React.createElement("li", null, "Read 1 (count=1) \u2192 output 01"), /* @__PURE__ */ React.createElement("li", null, "Read 1 (count=2) \u2192 output 011"), /* @__PURE__ */ React.createElement("li", null, "Read 1 (count=3) \u2192 output 0111"), /* @__PURE__ */ React.createElement("li", null, "Read 1 (count=4) \u2192 output 01111"), /* @__PURE__ */ React.createElement("li", null, "Read 1 (count=5) \u2192 output 0111110 (insert 0, reset count)"), /* @__PURE__ */ React.createElement("li", null, "Read 1 (count=1) \u2192 output 01111101"), /* @__PURE__ */ React.createElement("li", null, "Read 0 \u2192 output 011111010")), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700 mt-2" }, /* @__PURE__ */ React.createElement("strong", null, "Stuffed output:"), " ", /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, "011111010")), /* @__PURE__ */ React.createElement("p", { className: "text-gray-700 mt-2" }, /* @__PURE__ */ React.createElement("strong", null, "Destuffing:"), " read ", /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, "011111"), " (five 1s), skip the next 0, then continue with ", /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, "10"), " \u2192 ", /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, "01111110"), ".")));
  }
  mount(App);
})();

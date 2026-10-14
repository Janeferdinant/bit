#!/usr/bin/env python3
"""Generate test/vectors.json from the Python reference implementations in python/src/bitcomm.

The JSON file is the contract between the two implementations. Python produces the expected results; the JavaScript
code that the demos run (lib/bitstuff.mjs, lib/stopwait.mjs) is then checked against them by `npm test`
(test/crossval.test.mjs). The generator is deterministic: the same code always writes the same bytes.

Usage (Python 3.9+, standard library only):
    python scripts/gen_vectors.py            # write test/vectors.json
    python scripts/gen_vectors.py --check    # exit 1 if the committed file is out of date
"""
import argparse
import itertools
import json
import random
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "python" / "src"))

from bitcomm.arq import simulate  # noqa: E402
from bitcomm.bitstuff import BitStuffingError, destuff, frame, stuff, unframe  # noqa: E402
from bitcomm.crc import PRESETS, crc_encode, crc_register, crc_remainder  # noqa: E402

SEED = 20261014
OUT = REPO / "test" / "vectors.json"
EXHAUSTIVE_MAX_LEN = 10  # every bit string of length 0..10 (2,047 strings)


def num(x):
    """Write integral floats as integers (1.0 -> 1) so the JSON reads cleanly in both languages."""
    return int(x) if isinstance(x, float) and x == int(x) else x


def random_bits(rng, length):
    """Bit string with long runs of 1s, which is where stuffing matters."""
    out = []
    while len(out) < length:
        run = rng.choice([1, 1, 2, 3, 4, 5, 5, 6, 7, 9, 12])
        out.extend(["1" if rng.random() < 0.8 else "0"] * run)
        out.extend("0" * rng.choice([1, 1, 2, 3]))
    return "".join(out[:length])


def stuff_vectors(rng):
    exhaustive = []
    for n in range(EXHAUSTIVE_MAX_LEN + 1):
        for bits in itertools.product("01", repeat=n):
            data = "".join(bits)
            exhaustive.append([data, stuff(data).output])
    random_cases = []
    for _ in range(300):
        data = random_bits(rng, rng.randint(16, 80))
        random_cases.append([data, stuff(data).output])

    hand = ["", "0", "1", "11111", "111110", "0111110", "01111110", "1111111111", "11111111111", "111111111111",
            "1111011110", "10111110111110", "0000000000", "1" * 25]
    stuff_cases = []
    for data in hand:
        r = stuff(data)
        stuff_cases.append({
            "input": data, "output": r.output, "inserted": r.inserted,
            "steps": [{"index": s.index, "bit": s.bit, "run": s.run, "stuffedZero": s.stuffed_zero, "output": s.output}
                      for s in r.steps],
        })

    destuff_cases = []
    for data in ["", "0", "111110", "1111100", "011111010", "1111101111101", "11111011111011", "0111110111110"]:
        r = destuff(data)
        destuff_cases.append({
            "input": data, "output": r.output, "removed": r.removed,
            "steps": [{"index": s.index, "bit": s.bit, "run": s.run, "removedZero": s.removed_zero, "output": s.output}
                      for s in r.steps],
        })
    return exhaustive, random_cases, stuff_cases, destuff_cases


def error_case(op, fn, data):
    try:
        fn(data)
    except BitStuffingError as error:
        return {"op": op, "input": data, "message": str(error), "position": error.position}
    raise AssertionError(f"{op}({data!r}) did not raise")


def error_vectors():
    destuff_errors = [error_case("destuff", destuff, d) for d in
                      ["1111111", "01111110", "0111111", "11111", "011111", "1111101111111", "00111111000"]]
    invalid = [error_case("stuff", stuff, d) for d in ["2", "01a", "0 1", "1111x1", " ", "-1"]]
    invalid += [error_case("destuff", destuff, d) for d in ["2", "01a", "11111 0", "abc"]]
    return destuff_errors, invalid


def frame_vectors(rng):
    frames = []
    for data in ["", "0", "1", "0111110", "01111110", "11111", "1111111111", "10101010"]:
        frames.append({"data": data, "framed": frame(data)})
    for _ in range(40):
        data = random_bits(rng, rng.randint(1, 40))
        frames.append({"data": data, "framed": frame(data)})
    errors = []
    for bad in ["", "0111111", "01111110", "1" + "01111110" + "01111110", "01111110" + "00111111",
                "01111110" + "1111111" + "01111110", "01111110" + "11111" + "01111110", "01111110012"]:
        try:
            unframe(bad)
        except BitStuffingError as error:
            errors.append({"input": bad, "message": str(error), "position": error.position})
        else:
            raise AssertionError(f"unframe({bad!r}) did not raise")
    return frames, errors


def arq_case(name, frames, timeout_sec, loss_rate, *, draws=None, seed=None):
    if draws is not None:
        it = iter(draws)
        result = simulate(frames, timeout_sec=timeout_sec, loss_rate=loss_rate, rng=lambda: next(it))
        assert next(it, None) is None, name
    else:
        result = simulate(frames, timeout_sec=timeout_sec, loss_rate=loss_rate, seed=seed)
    s = result.summary
    return {
        "name": name, "frames": list(frames), "timeoutSec": timeout_sec, "lossRate": loss_rate,
        "draws": result.draws,
        "log": [{"t": num(e.t), "who": e.who, "text": e.text} for e in result.log],
        "summary": {"delivered": s.delivered, "transmissions": s.transmissions,
                    "retransmissions": s.retransmissions, "totalTimeSec": num(s.total_time_sec),
                    "gaveUp": s.gave_up, "cancelled": s.cancelled},
    }


def arq_vectors(rng):
    cases = [
        arq_case("no loss, one frame", ["1"], 3, 0.0, draws=[0.9]),
        arq_case("no loss, alternating sequence numbers", ["1", "2", "3"], 3, 0.0, draws=[0.9, 0.9, 0.9]),
        arq_case("frame lost once", ["1"], 3, 0.5, draws=[0.0, 0.2, 0.9]),
        arq_case("ACK lost once, duplicate discarded", ["1"], 3, 0.5, draws=[0.1, 0.7, 0.9]),
        arq_case("ACK lost on the second frame", ["1", "2"], 4, 0.5, draws=[0.9, 0.3, 0.8, 0.9]),
        arq_case("sender gives up", ["7", "8"], 3, 1.0, draws=[0.0, 0.0] * 8),
        arq_case("gives up on the second frame", ["1", "2"], 2, 0.5, draws=[0.9] + [0.0, 0.9] * 8),
        arq_case("long timeout", ["4"], 10, 0.5, draws=[0.0, 0.0, 0.9]),
        arq_case("empty frame list", [], 3, 0.0, draws=[]),
        arq_case("loss then loss then success", ["5", "6"], 3, 0.6, draws=[0.1, 0.1, 0.2, 0.9, 0.9, 0.9]),
    ]
    timeouts = [2, 3, 4, 5, 10]
    losses = [0.0, 0.1, 0.25, 0.4, 0.6, 0.8, 1.0]
    for i in range(50):
        frames = [str(rng.randint(0, 999)) for _ in range(rng.randint(1, 8))]
        cases.append(arq_case(f"seeded run {i}", frames, rng.choice(timeouts), rng.choice(losses),
                              seed=SEED + i))
    return cases


def crc_vectors(rng):
    generators = ["11", "101", "1001", "1011", "10011", "11001", "110101", "100000111", "1000100000100001"]
    bits_cases = []
    for data, gen in [("1101011011", "10011"), ("101110", "1001"), ("100100", "1001"), ("", "1011")]:
        bits_cases.append({"data": data, "generator": gen, "remainder": crc_remainder(data, gen),
                           "codeword": crc_encode(data, gen)})
    for _ in range(150):
        gen = rng.choice(generators)
        data = "".join(rng.choice("01") for _ in range(rng.randint(1, 32)))
        bits_cases.append({"data": data, "generator": gen, "remainder": crc_remainder(data, gen),
                           "codeword": crc_encode(data, gen)})
    register_cases = []
    inputs = [b"123456789", b"", b"a", b"The quick brown fox jumps over the lazy dog"]
    inputs += [bytes(rng.randrange(256) for _ in range(rng.randint(1, 40))) for _ in range(12)]
    for algo in sorted(PRESETS):
        for data in inputs:
            register_cases.append({"algo": algo, "hex": data.hex(), "crc": crc_register(data, **PRESETS[algo])})
    return bits_cases, register_cases


def build_vectors():
    rng = random.Random(SEED)
    exhaustive, random_cases, stuff_cases, destuff_cases = stuff_vectors(rng)
    destuff_errors, invalid_input = error_vectors()
    frames, unframe_errors = frame_vectors(rng)
    arq = arq_vectors(rng)
    crc_bits, crc_reg = crc_vectors(rng)
    sections = {
        "stuff_exhaustive": exhaustive,
        "stuff_random": random_cases,
        "stuff_cases": stuff_cases,
        "destuff_cases": destuff_cases,
        "destuff_errors": destuff_errors,
        "invalid_input": invalid_input,
        "frames": frames,
        "unframe_errors": unframe_errors,
        "arq": arq,
        "crc_bits": crc_bits,
        "crc_register": crc_reg,
    }
    counts = {name: len(items) for name, items in sections.items()}
    counts["total"] = sum(counts.values())
    return {
        "format": 1,
        "generator": "scripts/gen_vectors.py",
        "seed": SEED,
        "note": "Expected results produced by the Python reference implementation in python/src/bitcomm. "
                "Do not edit by hand; run `python scripts/gen_vectors.py`.",
        "counts": counts,
        **sections,
    }


def render(vectors):
    """One line per top-level key keeps the file diff-friendly without being huge."""
    lines = [f"{json.dumps(key)}:{json.dumps(value, separators=(',', ':'), ensure_ascii=False)}"
             for key, value in vectors.items()]
    return "{\n" + ",\n".join(lines) + "\n}\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="do not write; exit 1 if the file is out of date")
    parser.add_argument("--out", type=Path, default=OUT, help="output path (default test/vectors.json)")
    args = parser.parse_args()
    text = render(build_vectors())
    if args.check:
        current = args.out.read_text(encoding="utf-8") if args.out.exists() else None
        if current != text:
            print(f"{args.out} is out of date: run python scripts/gen_vectors.py", file=sys.stderr)
            return 1
        print(f"{args.out} is up to date")
        return 0
    args.out.write_text(text, encoding="utf-8", newline="\n")
    counts = json.loads(text)["counts"]
    print(f"wrote {args.out} ({len(text):,} bytes)")
    for key, value in counts.items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Command-line interface: ``python -m bitcomm <command>`` (or ``bitcomm <command>`` after ``pip install``)."""
from __future__ import annotations

import argparse
import json
import sys
import time
from typing import List, Optional

from .arq import MAX_ATTEMPTS, ROUND_TRIP_SEC, simulate
from .bitstuff import BitStuffingError, destuff, frame, stuff, unframe
from .crc import PRESETS, CRCError, crc_check, crc_encode, crc_register, crc_remainder


def _fmt_t(t: float) -> str:
    return f"{t:g}"


def _print_entry(entry) -> None:
    print(f"[{_fmt_t(entry.t):>5} s] {entry.who}: {entry.text}", flush=True)


def _cmd_stuff(args: argparse.Namespace) -> int:
    result = stuff(args.bits)
    if args.trace:
        for step in result.steps:
            note = "  <- stuffed 0 inserted" if step.stuffed_zero else ""
            print(f"bit {step.index + 1:>3} = {step.bit}  run of 1s: {step.run}  output: {step.output}{note}")
    print(frame(args.bits) if args.frame else result.output)
    return 0


def _cmd_destuff(args: argparse.Namespace) -> int:
    if args.unframe:
        print(unframe(args.bits))
        return 0
    result = destuff(args.bits)
    if args.trace:
        for step in result.steps:
            note = "  <- stuffed 0 removed" if step.removed_zero else ""
            print(f"bit {step.index + 1:>3} = {step.bit}  run of 1s: {step.run}  output: {step.output}{note}")
    print(result.output)
    return 0


def _cmd_crc(args: argparse.Namespace) -> int:
    if args.algo:
        data = args.text.encode("utf-8")
        value = crc_register(data, **PRESETS[args.algo])
        width = PRESETS[args.algo]["width"]
        print(f"{args.algo} of {len(data)} bytes: 0x{value:0{width // 4}X}")
        return 0
    if args.check:
        ok = crc_check(args.bits, args.generator)
        print("valid: the codeword divides evenly" if ok else "invalid: the CRC does not match, the frame is damaged")
        return 0 if ok else 1
    print(f"remainder: {crc_remainder(args.bits, args.generator)}")
    print(f"codeword: {crc_encode(args.bits, args.generator)}")
    return 0


def _cmd_arq(args: argparse.Namespace) -> int:
    live = _print_entry if (args.realtime and not args.json) else None
    result = simulate(
        args.frames,
        timeout_sec=args.timeout,
        loss_rate=args.loss / 100,
        seed=args.seed,
        max_attempts=args.max_attempts,
        sleep=time.sleep if args.realtime else None,
        on_log=live,
    )
    s = result.summary
    if args.json:
        print(json.dumps({
            "log": [{"t": e.t, "who": e.who, "text": e.text} for e in result.log],
            "summary": {
                "delivered": s.delivered, "transmissions": s.transmissions, "retransmissions": s.retransmissions,
                "totalTimeSec": s.total_time_sec, "gaveUp": s.gave_up, "cancelled": s.cancelled,
            },
            "draws": result.draws,
        }, indent=2))
        return 0
    if live is None:
        for entry in result.log:
            _print_entry(entry)
    print()
    print(f"delivered: {s.delivered} of {len(args.frames)}")
    print(f"transmissions: {s.transmissions}")
    print(f"retransmissions: {s.retransmissions}")
    print(f"total time: {_fmt_t(s.total_time_sec)} s")
    if s.gave_up:
        print("gave up: yes")
    return 0


def _frames(text: str) -> List[str]:
    parts = [p.strip() for p in text.split(",")]
    if parts == [""]:
        raise argparse.ArgumentTypeError("enter at least one frame, e.g. 1,2,3")
    bad = [p for p in parts if not (p.isascii() and p.isdigit())]
    if bad:
        raise argparse.ArgumentTypeError(f'"{bad[0]}" is not a frame number: enter comma-separated numbers, e.g. 1,2,3')
    return parts


def _number(text: str) -> float:
    try:
        return float(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"{text!r} is not a number")


def _timeout(text: str) -> float:
    value = _number(text)
    if not value > ROUND_TRIP_SEC:
        raise argparse.ArgumentTypeError(f"the timeout must be longer than the {ROUND_TRIP_SEC} s round trip")
    return value


def _percent(text: str) -> float:
    value = _number(text)
    if not 0 <= value <= 100:
        raise argparse.ArgumentTypeError("the loss probability must be between 0 and 100 percent")
    return value


def _positive_int(text: str) -> int:
    try:
        value = int(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"{text!r} is not a whole number")
    if value < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bitcomm",
        description="Bit stuffing, CRC and a stop-and-wait ARQ simulator (Python reference implementations).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("stuff", help="stuff a bit string (insert a 0 after every five 1s)")
    p.add_argument("bits", help="bit string, e.g. 0111110")
    p.add_argument("--frame", action="store_true", help="wrap the result in the flag 01111110")
    p.add_argument("--trace", action="store_true", help="print one line per input bit")
    p.set_defaults(func=_cmd_stuff)

    p = sub.add_parser("destuff", help="destuff a bit string (remove the 0 after every five 1s)")
    p.add_argument("bits", help="stuffed bit string")
    p.add_argument("--unframe", action="store_true", help="the input is a complete frame with flags")
    p.add_argument("--trace", action="store_true", help="print one line per input bit")
    p.set_defaults(func=_cmd_destuff)

    p = sub.add_parser("crc", help="compute or check a CRC")
    p.add_argument("bits", nargs="?", help="data bits (or the received codeword with --check)")
    p.add_argument("--generator", help="generator polynomial as bits, e.g. 10011 for x^4 + x + 1")
    p.add_argument("--check", action="store_true", help="treat BITS as a received codeword; exit 1 if damaged")
    p.add_argument("--algo", choices=sorted(PRESETS), help="named CRC computed over --text")
    p.add_argument("--text", help="text to checksum with --algo (UTF-8)")
    p.set_defaults(func=_cmd_crc)

    p = sub.add_parser("arq", help="simulate stop-and-wait ARQ")
    p.add_argument("--frames", type=_frames, default=_frames("1,2,3,4,5"), help="comma-separated frame numbers")
    p.add_argument("--timeout", type=_timeout, default=3.0, help="timeout in seconds (> 1, default 3)")
    p.add_argument("--loss", type=_percent, default=20.0, help="loss probability in percent (default 20)")
    p.add_argument("--seed", type=int, default=None, help="random seed (default: random)")
    p.add_argument("--max-attempts", type=_positive_int, default=MAX_ATTEMPTS,
                   help=f"tries per frame (default {MAX_ATTEMPTS})")
    p.add_argument("--realtime", action="store_true", help="wait in real time and print as it happens")
    p.add_argument("--json", action="store_true", help="print the log, summary and random draws as JSON")
    p.set_defaults(func=_cmd_arq)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "crc":
        if args.algo:
            if args.text is None:
                parser.error("--algo needs --text")
        elif args.bits is None or args.generator is None:
            parser.error("crc needs BITS with --generator, or --algo with --text")
    try:
        return args.func(args)
    except (BitStuffingError, CRCError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

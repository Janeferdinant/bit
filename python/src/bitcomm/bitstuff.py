"""Bit stuffing and destuffing, as used by HDLC-style bit-oriented framing.

A frame starts and ends with the flag 01111110 (six 1s in a row). To make sure the flag can never appear inside the
data, the SENDER inserts a 0 after every run of five consecutive 1s ("stuffing"). The RECEIVER removes the 0 that
follows every run of five 1s ("destuffing").

This is the Python reference for ``lib/bitstuff.mjs``. The two behave identically, including error messages and
positions; ``scripts/gen_vectors.py`` records this module's results in ``test/vectors.json`` and the JavaScript test
suite checks the browser code against them.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List

FLAG = "01111110"
MAX_RUN = 5  # after this many consecutive 1s a 0 is stuffed

_NOT_BIT = re.compile(r"[^01]")


class BitStuffingError(ValueError):
    """Raised for input that is not a bit string, or a stuffed stream that stuff() could not have produced."""

    def __init__(self, message: str, position: int | None = None):
        super().__init__(message)
        self.position = position  # 0-based index in the input, when known


@dataclass(frozen=True)
class StuffStep:
    index: int
    bit: str
    run: int
    stuffed_zero: bool
    output: str


@dataclass(frozen=True)
class DestuffStep:
    index: int
    bit: str
    run: int
    removed_zero: bool
    output: str


@dataclass(frozen=True)
class StuffResult:
    output: str
    inserted: List[int] = field(default_factory=list)  # 0-based positions in `output` of every stuffed 0
    steps: List[StuffStep] = field(default_factory=list)


@dataclass(frozen=True)
class DestuffResult:
    output: str
    removed: List[int] = field(default_factory=list)  # 0-based positions in the INPUT of every removed 0
    steps: List[DestuffStep] = field(default_factory=list)


def is_bit_string(bits: object) -> bool:
    """True when `bits` is a string made only of the characters 0 and 1."""
    return isinstance(bits, str) and _NOT_BIT.search(bits) is None


def _assert_bit_string(bits: object) -> None:
    if not isinstance(bits, str):
        raise BitStuffingError("Input must be a string of 0s and 1s.")
    match = _NOT_BIT.search(bits)
    if match:
        bad = match.start()
        raise BitStuffingError(f'Invalid character "{bits[bad]}" at position {bad + 1}: use only 0 and 1.', bad)


def stuff(bits: str) -> StuffResult:
    """Stuff a bit string; returns the output, the positions of the stuffed 0s and a per-bit trace."""
    _assert_bit_string(bits)
    output = ""
    inserted: List[int] = []
    steps: List[StuffStep] = []
    ones = 0  # length of the current run of 1s

    for i, bit in enumerate(bits):
        output += bit
        ones = ones + 1 if bit == "1" else 0
        stuffed_zero = False
        if ones == MAX_RUN:
            inserted.append(len(output))  # index the stuffed 0 will occupy
            output += "0"
            ones = 0
            stuffed_zero = True
        steps.append(StuffStep(i, bit, MAX_RUN if stuffed_zero else ones, stuffed_zero, output))
    return StuffResult(output, inserted, steps)


def destuff(stuffed: str) -> DestuffResult:
    """Destuff a stuffed bit string.

    Raises BitStuffingError when the input could not have come from stuff():
      * five 1s followed by another 1 (six 1s in a row is a flag or abort, not data)
      * the input ends right after five 1s (the stuffed 0 is missing)
    """
    _assert_bit_string(stuffed)
    output = ""
    removed: List[int] = []
    steps: List[DestuffStep] = []
    ones = 0

    for i, bit in enumerate(stuffed):
        if ones == MAX_RUN:
            # The bit after five 1s must be the stuffed 0.
            if bit != "0":
                raise BitStuffingError(
                    f"Six 1s in a row ending at position {i + 1}: this is a flag or abort sequence, "
                    "not stuffed data.",
                    i,
                )
            removed.append(i)
            ones = 0
            steps.append(DestuffStep(i, bit, 0, True, output))
            continue
        output += bit
        ones = ones + 1 if bit == "1" else 0
        steps.append(DestuffStep(i, bit, ones, False, output))

    if ones == MAX_RUN:
        raise BitStuffingError(
            "The input ends with five 1s but no stuffed 0 after them, so it was not stuffed correctly.",
            len(stuffed) - 1,
        )
    return DestuffResult(output, removed, steps)


def bit_stuffing(bits: str) -> str:
    """Convenience wrapper that returns only the stuffed bit string."""
    return stuff(bits).output


def bit_destuffing(stuffed_bits: str) -> str:
    """Convenience wrapper that returns only the destuffed bit string."""
    return destuff(stuffed_bits).output


def frame(bits: str) -> str:
    """Build a complete frame: FLAG + stuffed data + FLAG."""
    return FLAG + bit_stuffing(bits) + FLAG


def unframe(framed: str) -> str:
    """Take a complete frame apart again and return the original data bits."""
    _assert_bit_string(framed)
    if len(framed) < 2 * len(FLAG) or not framed.startswith(FLAG) or not framed.endswith(FLAG):
        raise BitStuffingError(f"A frame must start and end with the flag {FLAG}.")
    return bit_destuffing(framed[len(FLAG): len(framed) - len(FLAG)])

"""Cyclic redundancy check (CRC).

Two views of the same idea:

* Textbook CRC on bit strings (``crc_remainder``, ``crc_encode``, ``crc_check``): the sender appends n zeros to the
  data, divides by the generator polynomial with XOR (modulo-2 division) and sends the data followed by the n-bit
  remainder. The receiver divides what arrives; a non-zero remainder means the frame was damaged.
* Register-based CRC on bytes (``crc_register``) with the usual parameters (width, polynomial, initial value,
  input and output reflection, final XOR), and presets for CRC-8, CRC-16/CCITT-FALSE, CRC-16/ARC and CRC-32.

The generator is written as a bit string whose first bit is the highest power, for example ``10011`` for
x^4 + x + 1.
"""
from __future__ import annotations

import re
from typing import Dict, Union

_BITS = re.compile(r"[01]*")


class CRCError(ValueError):
    """Raised for invalid data, generator or parameters."""


def _check_bits(value: object, what: str) -> str:
    if not isinstance(value, str) or _BITS.fullmatch(value) is None:
        raise CRCError(f"{what} must be a string of 0s and 1s.")
    return value


def _check_generator(generator: object) -> str:
    gen = _check_bits(generator, "The generator")
    if len(gen) < 2 or gen[0] != "1":
        raise CRCError("The generator must have at least two bits and start with 1, for example 10011.")
    return gen


def _divide(bits: str, generator: str) -> str:
    """Modulo-2 long division of `bits` by `generator`; returns the remainder (len(generator) - 1 bits)."""
    work = list(bits)
    n = len(generator) - 1
    for i in range(len(work) - n):
        if work[i] == "1":
            for j, g in enumerate(generator):
                if g == "1":
                    work[i + j] = "0" if work[i + j] == "1" else "1"
    return "".join(work[len(work) - n:])


def crc_remainder(data: str, generator: str) -> str:
    """The CRC of `data`: the remainder of data followed by n zeros, divided by the generator."""
    data = _check_bits(data, "The data")
    generator = _check_generator(generator)
    return _divide(data + "0" * (len(generator) - 1), generator)


def crc_encode(data: str, generator: str) -> str:
    """The codeword to transmit: the data followed by its CRC."""
    return data + crc_remainder(data, generator)


def crc_check(codeword: str, generator: str) -> bool:
    """True when the received codeword divides evenly by the generator (no error detected)."""
    codeword = _check_bits(codeword, "The codeword")
    generator = _check_generator(generator)
    if len(codeword) < len(generator) - 1:
        raise CRCError("The codeword is shorter than the CRC itself.")
    return "1" not in _divide(codeword, generator)


# ----- register-based CRC on bytes ---------------------------------------------------------------

def _reflect(value: int, width: int) -> int:
    out = 0
    for _ in range(width):
        out = (out << 1) | (value & 1)
        value >>= 1
    return out


def crc_register(
    data: bytes,
    width: int,
    poly: int,
    init: int = 0,
    refin: bool = False,
    refout: bool = False,
    xorout: int = 0,
) -> int:
    """CRC of `data` for the given parameters (bitwise implementation)."""
    if not isinstance(data, (bytes, bytearray)):
        raise CRCError("The data must be bytes.")
    if not isinstance(width, int) or width < 1:
        raise CRCError("The width must be a positive integer.")
    mask = (1 << width) - 1
    if not 0 < poly <= mask:
        raise CRCError(f"The polynomial must fit in {width} bits.")
    top = 1 << (width - 1)
    register = init & mask
    for byte in data:
        if refin:
            byte = _reflect(byte, 8)
        register ^= byte << (width - 8) if width >= 8 else byte >> (8 - width)
        for _ in range(8):
            register = ((register << 1) ^ poly) & mask if register & top else (register << 1) & mask
    if refout:
        register = _reflect(register, width)
    return (register ^ xorout) & mask


CRC8 = dict(width=8, poly=0x07, init=0x00, refin=False, refout=False, xorout=0x00)
CRC16_CCITT_FALSE = dict(width=16, poly=0x1021, init=0xFFFF, refin=False, refout=False, xorout=0x0000)
CRC16_ARC = dict(width=16, poly=0x8005, init=0x0000, refin=True, refout=True, xorout=0x0000)
CRC32 = dict(width=32, poly=0x04C11DB7, init=0xFFFFFFFF, refin=True, refout=True, xorout=0xFFFFFFFF)

PRESETS: Dict[str, Dict[str, Union[int, bool]]] = {
    "crc8": CRC8,
    "crc16-ccitt-false": CRC16_CCITT_FALSE,
    "crc16-arc": CRC16_ARC,
    "crc32": CRC32,
}

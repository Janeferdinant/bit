"""bitcomm: reference implementations for data-link-layer teaching demos.

* bitcomm.bitstuff  bit stuffing, destuffing and framing (reference for lib/bitstuff.mjs)
* bitcomm.crc       cyclic redundancy check on bit strings and on bytes
* bitcomm.arq       stop-and-wait ARQ simulator with configurable loss and timeout (reference for lib/stopwait.mjs)
* bitcomm.cli       command-line interface (``python -m bitcomm --help``)
"""
from .arq import MAX_ATTEMPTS, ROUND_TRIP_SEC, simulate
from .bitstuff import FLAG, BitStuffingError, bit_destuffing, bit_stuffing, destuff, frame, stuff, unframe
from .crc import PRESETS, CRCError, crc_check, crc_encode, crc_register, crc_remainder

__all__ = [
    "FLAG", "BitStuffingError", "bit_destuffing", "bit_stuffing", "destuff", "frame", "stuff", "unframe",
    "PRESETS", "CRCError", "crc_check", "crc_encode", "crc_register", "crc_remainder",
    "MAX_ATTEMPTS", "ROUND_TRIP_SEC", "simulate",
]
__version__ = "1.0.0"

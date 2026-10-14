"""Stop-and-wait ARQ simulator.

The sender transmits one frame, then waits. If the ACK comes back before the timer expires, it sends the next frame.
If the frame or its ACK is lost, the timer expires and the sender retransmits the same frame. Frames carry a 1-bit
sequence number (0, 1, 0, 1, ...) so the receiver can recognise and discard a duplicate when only the ACK was lost.

This is the Python reference for ``lib/stopwait.mjs``. Loss and timeout are configurable. The random numbers can be
injected (``rng``) so a run can be replayed exactly; every number the run consumed is returned in ``draws``.
``scripts/gen_vectors.py`` records runs in ``test/vectors.json`` and the JavaScript test suite replays them.

Per transmission attempt the simulator draws one random number r1. If r1 < loss_rate something is lost, and a second
draw r2 decides what: r2 < 0.5 loses the frame, otherwise the ACK. Time is simulated; pass ``sleep=time.sleep`` to
run in real time.
"""
from __future__ import annotations

import math
import random as _random
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Sequence

ROUND_TRIP_SEC = 1  # frame + ACK travel time when nothing is lost
MAX_ATTEMPTS = 8  # give up on a frame after this many tries


@dataclass(frozen=True)
class LogEntry:
    t: float
    who: str
    text: str


@dataclass(frozen=True)
class Summary:
    delivered: int = 0
    transmissions: int = 0
    retransmissions: int = 0
    total_time_sec: float = 0
    gave_up: bool = False
    cancelled: bool = False


@dataclass(frozen=True)
class SimulationResult:
    summary: Summary
    log: List[LogEntry] = field(default_factory=list)
    draws: List[float] = field(default_factory=list)  # every random number the run consumed, in order


def _round1(x: float) -> float:
    """Round to one decimal like JavaScript's Math.round(x * 10) / 10 (halves go up)."""
    return math.floor(x * 10 + 0.5) / 10


def simulate(
    frames: Sequence[str],
    timeout_sec: float,
    loss_rate: float = 0.0,
    rng: Optional[Callable[[], float]] = None,
    seed: Optional[int] = None,
    max_attempts: int = MAX_ATTEMPTS,
    sleep: Optional[Callable[[float], None]] = None,
    on_log: Optional[Callable[[LogEntry], None]] = None,
    is_cancelled: Optional[Callable[[], bool]] = None,
) -> SimulationResult:
    """Run the simulation and return the summary, the log and the random numbers used.

    frames       frame labels, e.g. ["1", "2", "3"]
    timeout_sec  sender timeout in seconds; must be longer than the 1 s round trip
    loss_rate    probability (0..1) that a transmission is lost
    rng          () -> float in [0, 1); default is random.Random(seed).random
    seed         seed for the default generator (ignored when rng is given)
    max_attempts give up on a frame after this many tries
    sleep        called with the seconds of every wait (default: none, time is only simulated)
    on_log       called with every log entry as it is produced
    is_cancelled checked after every wait; True stops the run
    """
    if not timeout_sec > ROUND_TRIP_SEC:
        raise ValueError("timeout_sec must be longer than the round trip")
    if not (isinstance(loss_rate, (int, float)) and 0 <= loss_rate <= 1):
        raise ValueError("loss_rate must be between 0 and 1")
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    source = rng if rng is not None else _random.Random(seed).random
    draws: List[float] = []

    def random() -> float:
        value = source()
        draws.append(value)
        return value

    log: List[LogEntry] = []
    clock = 0.0

    def say(who: str, text: str) -> None:
        entry = LogEntry(clock, who, text)
        log.append(entry)
        if on_log:
            on_log(entry)

    def wait(sec: float) -> bool:
        nonlocal clock
        if sleep:
            sleep(sec)
        clock = _round1(clock + sec)
        return bool(is_cancelled and is_cancelled())

    delivered = transmissions = retransmissions = 0

    def result(gave_up: bool = False, cancelled: bool = False) -> SimulationResult:
        summary = Summary(delivered, transmissions, retransmissions, clock, gave_up, cancelled)
        return SimulationResult(summary, log, draws)

    received = set()  # frame indexes the receiver already has
    say("System", "Starting Stop-and-Wait Simulation")

    for i, label in enumerate(frames):
        seq = i % 2
        acked = False
        attempt = 0
        while attempt < max_attempts and not acked:
            attempt += 1
            transmissions += 1
            if attempt > 1:
                retransmissions += 1
            say("Sender", f"Sending frame {label} (seq {seq})" + (f", attempt {attempt}" if attempt > 1 else ""))

            lost = None
            if random() < loss_rate:
                lost = "frame" if random() < 0.5 else "ack"

            if wait(ROUND_TRIP_SEC / 2):
                return result(cancelled=True)
            if lost == "frame":
                say("Channel", f"Frame {label} lost")
            else:
                if i in received:
                    say("Receiver", f"Duplicate frame {label} (seq {seq}) discarded, ACK {1 - seq} sent again")
                else:
                    received.add(i)
                    say("Receiver", f"Frame {label} received, sending ACK {1 - seq}")
                if lost == "ack":
                    say("Channel", f"ACK for frame {label} lost")

            if lost is None:
                if wait(ROUND_TRIP_SEC / 2):
                    return result(cancelled=True)
                say("Sender", f"ACK for frame {label} received")
                acked = True
            else:
                # Nothing comes back: wait for the rest of the timeout, then retransmit.
                if wait(timeout_sec - ROUND_TRIP_SEC / 2):
                    return result(cancelled=True)
                say(
                    "Sender",
                    f"Timeout for frame {label}, retransmitting" if attempt < max_attempts
                    else f"Timeout for frame {label}",
                )

        if not acked:
            say("Sender", f"Giving up on frame {label} after {max_attempts} attempts")
            return result(gave_up=True)
        delivered += 1

    say("Sender", "All frames sent successfully")
    return result()

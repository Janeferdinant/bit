"""Tests for the shared test-vector file that the JavaScript suite also checks (written before the implementation)."""
import importlib.util
import json
from pathlib import Path

import pytest

from bitcomm.arq import simulate
from bitcomm.bitstuff import BitStuffingError, destuff, frame, stuff, unframe

REPO = Path(__file__).resolve().parents[2]
VECTORS = REPO / "test" / "vectors.json"
GENERATOR = REPO / "scripts" / "gen_vectors.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("gen_vectors", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def vectors():
    return json.loads(VECTORS.read_text(encoding="utf-8"))


def test_committed_vectors_are_what_the_generator_produces_now():
    generated = load_generator().build_vectors()
    assert json.loads(json.dumps(generated)) == json.loads(VECTORS.read_text(encoding="utf-8"))


def test_the_committed_file_is_byte_identical_to_the_generator_output():
    module = load_generator()
    assert module.render(module.build_vectors()) == VECTORS.read_text(encoding="utf-8")


def test_generation_is_deterministic():
    module = load_generator()
    assert module.render(module.build_vectors()) == module.render(module.build_vectors())


def test_vector_file_has_the_expected_sections_and_sizes(vectors):
    assert vectors["format"] == 1
    assert vectors["generator"] == "scripts/gen_vectors.py"
    counts = vectors["counts"]
    assert counts["stuff_exhaustive"] == 2 ** 11 - 1  # every bit string up to 10 bits
    assert counts["total"] == sum(v for k, v in counts.items() if k != "total")
    assert counts["total"] >= 2200
    assert len(vectors["stuff_exhaustive"]) == counts["stuff_exhaustive"]
    assert len(vectors["arq"]) == counts["arq"] >= 40


def test_python_agrees_with_every_stuffing_vector(vectors):
    for data, stuffed in vectors["stuff_exhaustive"] + vectors["stuff_random"]:
        assert stuff(data).output == stuffed
        assert destuff(stuffed).output == data
    for case in vectors["stuff_cases"]:
        result = stuff(case["input"])
        assert result.output == case["output"] and result.inserted == case["inserted"]
        assert [s.output for s in result.steps] == [s["output"] for s in case["steps"]]
    for case in vectors["destuff_cases"]:
        result = destuff(case["input"])
        assert result.output == case["output"] and result.removed == case["removed"]
    for case in vectors["destuff_errors"] + vectors["invalid_input"]:
        fn = destuff if case["op"] == "destuff" else stuff
        with pytest.raises(BitStuffingError) as excinfo:
            fn(case["input"])
        assert str(excinfo.value) == case["message"]
        assert excinfo.value.position == case["position"]
    for case in vectors["frames"]:
        assert frame(case["data"]) == case["framed"]
        assert unframe(case["framed"]) == case["data"]
    for case in vectors["unframe_errors"]:
        with pytest.raises(BitStuffingError) as excinfo:
            unframe(case["input"])
        assert str(excinfo.value) == case["message"]


def test_python_agrees_with_every_arq_vector(vectors):
    for case in vectors["arq"]:
        draws = iter(case["draws"])
        result = simulate(
            case["frames"], timeout_sec=case["timeoutSec"], loss_rate=case["lossRate"], rng=lambda: next(draws)
        )
        assert [{"t": e.t, "who": e.who, "text": e.text} for e in result.log] == case["log"]
        s = result.summary
        assert {
            "delivered": s.delivered,
            "transmissions": s.transmissions,
            "retransmissions": s.retransmissions,
            "totalTimeSec": s.total_time_sec,
            "gaveUp": s.gave_up,
            "cancelled": s.cancelled,
        } == case["summary"]
        assert next(draws, None) is None  # every recorded draw was used, none left over


def test_crc_vectors_are_present_and_correct(vectors):
    from bitcomm.crc import PRESETS, crc_encode, crc_register, crc_remainder

    assert len(vectors["crc_bits"]) >= 100
    for case in vectors["crc_bits"]:
        assert crc_remainder(case["data"], case["generator"]) == case["remainder"]
        assert crc_encode(case["data"], case["generator"]) == case["codeword"]
    for case in vectors["crc_register"]:
        assert crc_register(bytes.fromhex(case["hex"]), **PRESETS[case["algo"]]) == case["crc"]

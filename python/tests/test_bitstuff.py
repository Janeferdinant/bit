"""Tests for bit stuffing and destuffing (written before the implementation)."""
import itertools
import re

import pytest

from bitcomm.bitstuff import (
    FLAG,
    BitStuffingError,
    bit_destuffing,
    bit_stuffing,
    destuff,
    frame,
    is_bit_string,
    stuff,
    unframe,
)


def all_bit_strings(max_len):
    for n in range(max_len + 1):
        for bits in itertools.product("01", repeat=n):
            yield "".join(bits)


# ----- stuffing ---------------------------------------------------------------------------------

@pytest.mark.parametrize(
    "data, expected",
    [
        ("", ""),
        ("0", "0"),
        ("1", "1"),
        ("11111", "111110"),
        ("111110", "1111100"),
        ("0111110", "01111100"),
        ("01111110", "011111010"),  # the flag itself, as data
        ("1111111111", "11111011111" + "0"),  # ten 1s: a 0 after each group of five
        ("11111111111", "1111101111101"),  # eleven 1s
        ("1111011110", "1111011110"),  # runs of four never trigger
    ],
)
def test_known_stuffing_examples(data, expected):
    assert bit_stuffing(data) == expected


def test_stuff_reports_positions_of_inserted_zeros_in_the_output():
    result = stuff("111111111111")  # twelve 1s
    assert result.output == "11111011111011"
    assert result.inserted == [5, 11]
    for position in result.inserted:
        assert result.output[position] == "0"


def test_stuff_trace_has_one_step_per_input_bit():
    result = stuff("0111110")
    assert len(result.steps) == 7
    first, last = result.steps[0], result.steps[-1]
    assert (first.index, first.bit, first.run, first.stuffed_zero, first.output) == (0, "0", 0, False, "0")
    assert last.output == result.output
    fifth_one = result.steps[5]
    assert fifth_one.stuffed_zero is True
    assert fifth_one.run == 5
    assert fifth_one.output == "0111110"  # the stuffed 0 is already appended


def test_stuffed_output_never_contains_six_ones_in_a_row():
    for bits in all_bit_strings(12):
        assert "111111" not in bit_stuffing(bits), bits


def test_stuffing_only_adds_zeros():
    for bits in all_bit_strings(10):
        stuffed = bit_stuffing(bits)
        assert len(stuffed) - len(bits) == len(stuff(bits).inserted)
        assert stuffed.count("1") == bits.count("1")


# ----- destuffing -------------------------------------------------------------------------------

@pytest.mark.parametrize(
    "stuffed, expected",
    [
        ("", ""),
        ("111110", "11111"),
        ("1111100", "111110"),
        ("011111010", "01111110"),
        ("1111101111101", "11111111111"),
    ],
)
def test_known_destuffing_examples(stuffed, expected):
    assert bit_destuffing(stuffed) == expected


def test_destuff_reports_positions_of_removed_zeros_in_the_input():
    result = destuff("11111011111011")
    assert result.output == "111111111111"
    assert result.removed == [5, 11]


def test_destuff_trace_marks_removed_zeros():
    result = destuff("1111100")
    assert [s.removed_zero for s in result.steps] == [False] * 5 + [True, False]
    assert result.steps[-1].output == result.output


def test_round_trip_for_every_bit_string_up_to_14_bits():
    count = 0
    for bits in all_bit_strings(14):
        assert bit_destuffing(bit_stuffing(bits)) == bits
        count += 1
    assert count == 2 ** 15 - 1


def test_six_ones_in_a_row_is_rejected_with_its_position():
    with pytest.raises(BitStuffingError) as excinfo:
        destuff("1111111")
    assert excinfo.value.position == 5
    assert "Six 1s in a row ending at position 6" in str(excinfo.value)


def test_missing_stuffed_zero_at_the_end_is_rejected():
    with pytest.raises(BitStuffingError) as excinfo:
        destuff("011111")
    assert excinfo.value.position == 5
    assert "ends with five 1s" in str(excinfo.value)


def test_a_flag_inside_a_stream_is_rejected():
    with pytest.raises(BitStuffingError):
        destuff("0" + FLAG + "0")


# ----- validation -------------------------------------------------------------------------------

@pytest.mark.parametrize("bad", ["2", "01a", "0 1", "٠١"])
def test_invalid_characters_are_rejected_with_position(bad):
    with pytest.raises(BitStuffingError) as excinfo:
        stuff(bad)
    match = re.search(r"position (\d+)", str(excinfo.value))
    assert match and excinfo.value.position == int(match.group(1)) - 1
    with pytest.raises(BitStuffingError):
        destuff(bad)


def test_non_string_input_is_rejected():
    for bad in (None, 101, ["1", "0"], b"101"):
        with pytest.raises(BitStuffingError):
            stuff(bad)


def test_is_bit_string():
    assert is_bit_string("") and is_bit_string("0110")
    assert not is_bit_string("012") and not is_bit_string(None) and not is_bit_string(101)


# ----- frames -----------------------------------------------------------------------------------

def test_flag_is_six_ones_between_zeros():
    assert FLAG == "01111110"


def test_frame_and_unframe_round_trip():
    for bits in all_bit_strings(10):
        framed = frame(bits)
        assert framed.startswith(FLAG) and framed.endswith(FLAG)
        assert FLAG not in framed[len(FLAG):-len(FLAG)]  # the flag cannot occur inside the body
        assert unframe(framed) == bits


def test_frame_example():
    assert frame("0111110") == FLAG + "01111100" + FLAG


@pytest.mark.parametrize("bad", ["", "0111111", FLAG, "1" + FLAG + FLAG, FLAG + "0" + "0111111"])
def test_unframe_rejects_things_that_are_not_frames(bad):
    with pytest.raises(BitStuffingError):
        unframe(bad)

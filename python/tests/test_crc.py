"""Tests for the CRC implementations (written before the implementation)."""
import binascii
import itertools
import random
import zlib

import pytest

from bitcomm.crc import (
    CRC8,
    CRC16_ARC,
    CRC16_CCITT_FALSE,
    CRC32,
    PRESETS,
    CRCError,
    crc_check,
    crc_encode,
    crc_register,
    crc_remainder,
)

CHECK_INPUT = b"123456789"  # the standard CRC "check" string


# ----- textbook division on bit strings ----------------------------------------------------------

def test_textbook_example_from_the_classic_worked_problem():
    # Data 1101011011, generator x^4 + x + 1 (10011): remainder 1110, transmitted 11010110111110.
    assert crc_remainder("1101011011", "10011") == "1110"
    assert crc_encode("1101011011", "10011") == "11010110111110"


def test_second_worked_example():
    # Data 101110, generator x^3 + 1 (1001): remainder 011 (the worked example in Kurose and Ross).
    assert crc_remainder("101110", "1001") == "011"
    assert crc_encode("101110", "1001") == "101110011"
    # Data that already contains the generator, followed by zeros, divides evenly.
    assert crc_remainder("100100", "1001") == "000"


def test_empty_data_has_zero_remainder():
    assert crc_remainder("", "1011") == "000"


def test_remainder_has_generator_degree_bits():
    for generator in ("11", "101", "1011", "10011", "100000111"):
        assert len(crc_remainder("1011001", generator)) == len(generator) - 1


def test_encoded_codeword_checks_clean_for_every_data_up_to_10_bits():
    for n in range(0, 11):
        for bits in itertools.product("01", repeat=n):
            data = "".join(bits)
            assert crc_check(crc_encode(data, "10011"), "10011") is True


def test_every_single_bit_error_is_detected():
    codeword = crc_encode("110100111010", "10011")
    for i in range(len(codeword)):
        flipped = codeword[:i] + ("1" if codeword[i] == "0" else "0") + codeword[i + 1:]
        assert crc_check(flipped, "10011") is False, i


def test_every_burst_error_up_to_the_generator_degree_is_detected():
    generator = "10011"  # degree 4
    codeword = crc_encode("1011001110100101", generator)
    for length in range(1, 5):
        for start in range(len(codeword) - length + 1):
            for pattern in itertools.product("01", repeat=length):
                if pattern[0] != "1" or pattern[-1] != "1":
                    continue  # a burst of length L starts and ends with an error bit
                bad = list(codeword)
                for k, flip in enumerate(pattern):
                    if flip == "1":
                        bad[start + k] = "1" if bad[start + k] == "0" else "0"
                assert crc_check("".join(bad), generator) is False


def test_check_matches_division_of_codeword():
    rng = random.Random(1)
    for _ in range(200):
        data = "".join(rng.choice("01") for _ in range(rng.randint(1, 40)))
        assert crc_check(data + crc_remainder(data, "1101"), "1101")


@pytest.mark.parametrize("bad_data", ["12", "0 1", None, 101])
def test_invalid_data_is_rejected(bad_data):
    with pytest.raises(CRCError):
        crc_remainder(bad_data, "1011")


@pytest.mark.parametrize("bad_generator", ["", "1", "0", "0110", "10a", None])
def test_invalid_generators_are_rejected(bad_generator):
    with pytest.raises(CRCError):
        crc_remainder("1011", bad_generator)


def test_check_rejects_a_codeword_shorter_than_the_remainder():
    with pytest.raises(CRCError):
        crc_check("10", "10011")


# ----- register-based CRC on bytes ---------------------------------------------------------------

@pytest.mark.parametrize(
    "preset, check",
    [(CRC8, 0xF4), (CRC16_CCITT_FALSE, 0x29B1), (CRC16_ARC, 0xBB3D), (CRC32, 0xCBF43926)],
)
def test_standard_check_values(preset, check):
    assert crc_register(CHECK_INPUT, **preset) == check


def test_presets_are_listed_by_name():
    assert set(PRESETS) == {"crc8", "crc16-ccitt-false", "crc16-arc", "crc32"}
    assert PRESETS["crc32"] is CRC32


def test_crc32_matches_zlib_for_random_data():
    rng = random.Random(7)
    for _ in range(100):
        data = bytes(rng.randrange(256) for _ in range(rng.randint(0, 64)))
        assert crc_register(data, **CRC32) == zlib.crc32(data)


def test_ccitt_false_matches_binascii_crc_hqx():
    rng = random.Random(8)
    for _ in range(100):
        data = bytes(rng.randrange(256) for _ in range(rng.randint(0, 64)))
        assert crc_register(data, **CRC16_CCITT_FALSE) == binascii.crc_hqx(data, 0xFFFF)


def test_empty_input_returns_init_xor_xorout():
    assert crc_register(b"", **CRC32) == 0
    assert crc_register(b"", **CRC16_CCITT_FALSE) == 0xFFFF
    assert crc_register(b"", **CRC8) == 0


def test_bit_string_division_agrees_with_the_crc8_register():
    # CRC-8 has poly 0x07 (generator 100000111), init 0, no reflection, no final xor.
    rng = random.Random(9)
    for _ in range(100):
        data = bytes(rng.randrange(256) for _ in range(rng.randint(1, 8)))
        bits = "".join(f"{byte:08b}" for byte in data)
        assert int(crc_remainder(bits, "100000111"), 2) == crc_register(data, **CRC8)


def test_register_rejects_bad_parameters():
    with pytest.raises(CRCError):
        crc_register("text", width=8, poly=0x07)  # str, not bytes
    with pytest.raises(CRCError):
        crc_register(b"x", width=0, poly=0x07)
    with pytest.raises(CRCError):
        crc_register(b"x", width=8, poly=0x1FF)  # does not fit in 8 bits

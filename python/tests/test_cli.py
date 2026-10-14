"""Tests for the command-line interface (written before the implementation)."""
import json
import subprocess
import sys

import pytest

from bitcomm.cli import main


def run(capsys, *argv):
    code = main(list(argv))
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def test_stuff(capsys):
    code, out, _ = run(capsys, "stuff", "0111110")
    assert code == 0 and out.strip() == "01111100"


def test_stuff_as_a_frame(capsys):
    code, out, _ = run(capsys, "stuff", "0111110", "--frame")
    assert code == 0 and out.strip() == "01111110" + "01111100" + "01111110"


def test_stuff_trace_marks_the_stuffed_zero(capsys):
    code, out, _ = run(capsys, "stuff", "111110", "--trace")
    assert code == 0
    assert "stuffed 0" in out
    assert out.strip().splitlines()[-1] == "1111100"


def test_destuff_and_unframe(capsys):
    assert run(capsys, "destuff", "011111010")[1].strip() == "01111110"
    framed = "01111110" + "011111010" + "01111110"
    assert run(capsys, "destuff", framed, "--unframe")[1].strip() == "01111110"


def test_invalid_input_exits_1_with_a_message(capsys):
    code, out, err = run(capsys, "stuff", "012")
    assert code == 1 and out == "" and "Invalid character" in err
    code, _, err = run(capsys, "destuff", "1111111")
    assert code == 1 and "Six 1s" in err


def test_crc_remainder_and_codeword(capsys):
    code, out, _ = run(capsys, "crc", "1101011011", "--generator", "10011")
    assert code == 0
    assert "remainder: 1110" in out and "codeword: 11010110111110" in out


def test_crc_check_exit_codes(capsys):
    assert run(capsys, "crc", "11010110111110", "--generator", "10011", "--check")[0] == 0
    code, out, _ = run(capsys, "crc", "11010110111111", "--generator", "10011", "--check")
    assert code == 1 and "invalid" in out


def test_crc_named_algorithm_on_text(capsys):
    code, out, _ = run(capsys, "crc", "--algo", "crc32", "--text", "123456789")
    assert code == 0 and "0xCBF43926" in out
    code, out, _ = run(capsys, "crc", "--algo", "crc16-ccitt-false", "--text", "123456789")
    assert "0x29B1" in out


def test_crc_needs_either_bits_with_generator_or_algo_with_text(capsys):
    with pytest.raises(SystemExit) as excinfo:
        main(["crc", "1011"])
    assert excinfo.value.code == 2


def test_arq_runs_and_prints_a_summary(capsys):
    code, out, _ = run(capsys, "arq", "--frames", "1,2,3", "--timeout", "3", "--loss", "0", "--seed", "1")
    assert code == 0
    assert "All frames sent successfully" in out
    assert "delivered: 3" in out and "retransmissions: 0" in out


def test_arq_is_deterministic_for_a_seed(capsys):
    args = ("arq", "--frames", "1,2,3,4,5", "--timeout", "3", "--loss", "40", "--seed", "9")
    assert run(capsys, *args)[1] == run(capsys, *args)[1]


def test_arq_json_output(capsys):
    code, out, _ = run(capsys, "arq", "--frames", "1,2", "--loss", "0", "--seed", "1", "--json")
    data = json.loads(out)
    assert code == 0
    assert data["summary"]["delivered"] == 2 and data["log"][0]["who"] == "System"


@pytest.mark.parametrize(
    "bad",
    [
        ["arq", "--frames", "1,x"],
        ["arq", "--frames", ""],
        ["arq", "--timeout", "1"],
        ["arq", "--loss", "101"],
        ["arq", "--loss", "-1"],
        ["arq", "--max-attempts", "0"],
    ],
)
def test_arq_rejects_bad_options(bad):
    with pytest.raises(SystemExit) as excinfo:
        main(bad)
    assert excinfo.value.code == 2


def test_module_entry_point_runs():
    done = subprocess.run(
        [sys.executable, "-m", "bitcomm", "stuff", "11111"], capture_output=True, text=True, check=False
    )
    assert done.returncode == 0 and done.stdout.strip() == "111110"

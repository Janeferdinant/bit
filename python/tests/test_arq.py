"""Tests for the stop-and-wait ARQ simulator (written before the implementation)."""
import pytest

from bitcomm.arq import MAX_ATTEMPTS, ROUND_TRIP_SEC, simulate


def scripted(draws):
    """A fake random() that returns the given numbers in order and fails if asked for more."""
    iterator = iter(draws)

    def random():
        try:
            return next(iterator)
        except StopIteration:
            raise AssertionError("simulator asked for more random numbers than the test supplied")

    return random


def lines(result):
    return [(e.t, e.who, e.text) for e in result.log]


def test_constants_match_the_web_demo():
    assert ROUND_TRIP_SEC == 1
    assert MAX_ATTEMPTS == 8


def test_no_loss_delivers_every_frame_with_one_round_trip_each():
    result = simulate(["1", "2"], timeout_sec=3, loss_rate=0, rng=scripted([0.9, 0.9]))
    assert lines(result) == [
        (0, "System", "Starting Stop-and-Wait Simulation"),
        (0, "Sender", "Sending frame 1 (seq 0)"),
        (0.5, "Receiver", "Frame 1 received, sending ACK 1"),
        (1, "Sender", "ACK for frame 1 received"),
        (1, "Sender", "Sending frame 2 (seq 1)"),
        (1.5, "Receiver", "Frame 2 received, sending ACK 0"),
        (2, "Sender", "ACK for frame 2 received"),
        (2, "Sender", "All frames sent successfully"),
    ]
    s = result.summary
    assert (s.delivered, s.transmissions, s.retransmissions, s.total_time_sec) == (2, 2, 0, 2)
    assert (s.gave_up, s.cancelled) == (False, False)


def test_a_lost_frame_is_retransmitted_after_the_timeout():
    # first draw 0.0 < 0.5: something is lost; second draw 0.2 < 0.5: it is the frame.
    result = simulate(["1"], timeout_sec=3, loss_rate=0.5, rng=scripted([0.0, 0.2, 0.9]))
    assert lines(result) == [
        (0, "System", "Starting Stop-and-Wait Simulation"),
        (0, "Sender", "Sending frame 1 (seq 0)"),
        (0.5, "Channel", "Frame 1 lost"),
        (3, "Sender", "Timeout for frame 1, retransmitting"),
        (3, "Sender", "Sending frame 1 (seq 0), attempt 2"),
        (3.5, "Receiver", "Frame 1 received, sending ACK 1"),
        (4, "Sender", "ACK for frame 1 received"),
        (4, "Sender", "All frames sent successfully"),
    ]
    s = result.summary
    assert (s.delivered, s.transmissions, s.retransmissions, s.total_time_sec) == (1, 2, 1, 4)


def test_a_lost_ack_makes_the_receiver_discard_the_duplicate():
    # first draw 0.1 < 0.5: loss; second draw 0.7 >= 0.5: it is the ACK.
    result = simulate(["1"], timeout_sec=3, loss_rate=0.5, rng=scripted([0.1, 0.7, 0.9]))
    assert lines(result) == [
        (0, "System", "Starting Stop-and-Wait Simulation"),
        (0, "Sender", "Sending frame 1 (seq 0)"),
        (0.5, "Receiver", "Frame 1 received, sending ACK 1"),
        (0.5, "Channel", "ACK for frame 1 lost"),
        (3, "Sender", "Timeout for frame 1, retransmitting"),
        (3, "Sender", "Sending frame 1 (seq 0), attempt 2"),
        (3.5, "Receiver", "Duplicate frame 1 (seq 0) discarded, ACK 1 sent again"),
        (4, "Sender", "ACK for frame 1 received"),
        (4, "Sender", "All frames sent successfully"),
    ]
    assert result.summary.delivered == 1


def test_the_sender_gives_up_after_the_maximum_number_of_attempts():
    draws = [0.0, 0.0] * MAX_ATTEMPTS  # every attempt loses the frame
    result = simulate(["7", "8"], timeout_sec=3, loss_rate=1, rng=scripted(draws))
    s = result.summary
    assert s.gave_up is True
    assert (s.delivered, s.transmissions, s.retransmissions) == (0, MAX_ATTEMPTS, MAX_ATTEMPTS - 1)
    assert s.total_time_sec == 3 * MAX_ATTEMPTS
    texts = [e.text for e in result.log]
    assert texts[-2:] == ["Timeout for frame 7", f"Giving up on frame 7 after {MAX_ATTEMPTS} attempts"]
    assert not any("frame 8" in t for t in texts)  # never moves on to the next frame
    assert result.draws == draws


def test_max_attempts_can_be_configured():
    result = simulate(["1"], timeout_sec=2, loss_rate=1, max_attempts=3, rng=scripted([0.0, 0.0] * 3))
    assert result.summary.transmissions == 3
    assert result.log[-1].text == "Giving up on frame 1 after 3 attempts"


def test_the_timeout_controls_how_long_a_loss_costs():
    fast = simulate(["1"], timeout_sec=2, loss_rate=0.5, rng=scripted([0.0, 0.0, 0.9]))
    slow = simulate(["1"], timeout_sec=10, loss_rate=0.5, rng=scripted([0.0, 0.0, 0.9]))
    assert fast.summary.total_time_sec == 3
    assert slow.summary.total_time_sec == 11


def test_the_simulator_consumes_one_draw_per_attempt_and_a_second_only_on_loss():
    result = simulate(["1", "2", "3"], timeout_sec=3, loss_rate=0.5, rng=scripted([0.9, 0.9, 0.9]))
    assert result.draws == [0.9, 0.9, 0.9]
    result = simulate(["1"], timeout_sec=3, loss_rate=0.5, rng=scripted([0.0, 0.2, 0.9]))
    assert result.draws == [0.0, 0.2, 0.9]


def test_same_seed_gives_the_same_run_and_different_seeds_differ():
    a = simulate(list("123456"), timeout_sec=3, loss_rate=0.4, seed=11)
    b = simulate(list("123456"), timeout_sec=3, loss_rate=0.4, seed=11)
    c = simulate(list("123456"), timeout_sec=3, loss_rate=0.4, seed=12)
    assert lines(a) == lines(b) and a.summary == b.summary and a.draws == b.draws
    assert lines(a) != lines(c)


def test_without_loss_no_frame_is_ever_retransmitted_whatever_the_seed():
    for seed in range(20):
        s = simulate(list("12345"), timeout_sec=2, loss_rate=0, seed=seed).summary
        assert (s.retransmissions, s.delivered, s.total_time_sec) == (0, 5, 5)


def test_sleep_hook_receives_the_waiting_times():
    waits = []
    simulate(["1"], timeout_sec=3, loss_rate=0.5, rng=scripted([0.0, 0.0, 0.9]), sleep=waits.append)
    assert waits == [0.5, 2.5, 0.5, 0.5]


def test_log_callback_sees_every_entry_in_order():
    seen = []
    result = simulate(["1"], timeout_sec=3, rng=scripted([0.9]), on_log=seen.append)
    assert seen == result.log


def test_cancellation_stops_the_run_after_the_current_wait():
    calls = {"n": 0}

    def cancel():
        calls["n"] += 1
        return calls["n"] >= 1  # cancel after the very first wait

    result = simulate(["1", "2"], timeout_sec=3, rng=scripted([0.9]), is_cancelled=cancel)
    assert result.summary.cancelled is True
    assert result.summary.total_time_sec == 0.5
    assert result.summary.delivered == 0


@pytest.mark.parametrize("timeout", [1, 0.5, 0, -3])
def test_timeout_must_exceed_the_round_trip(timeout):
    with pytest.raises(ValueError):
        simulate(["1"], timeout_sec=timeout)


@pytest.mark.parametrize("loss", [-0.1, 1.1, float("nan")])
def test_loss_rate_must_be_a_probability(loss):
    with pytest.raises(ValueError):
        simulate(["1"], timeout_sec=3, loss_rate=loss)


def test_large_runs_always_finish_and_account_for_every_frame():
    result = simulate([str(i) for i in range(20)], timeout_sec=3, loss_rate=0.3, seed=5)
    s = result.summary
    assert s.delivered + (1 if s.gave_up else 0) <= 20
    assert s.transmissions == s.delivered + s.retransmissions + (1 if s.gave_up else 0)

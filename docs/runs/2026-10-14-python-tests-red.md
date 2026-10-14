# Run log 2026-10-14: Python tests written first (red)

The pytest suites in `python/tests/` (bit stuffing, CRC, ARQ simulator, CLI, shared vectors) were written before the `bitcomm` package existed.

Command (Python 3.10.6, pytest 9.1.1): `cd python && python -m pytest -q`

Result: collection failed for all five modules with `ModuleNotFoundError: No module named 'bitcomm'` (5 errors, 0 tests run).

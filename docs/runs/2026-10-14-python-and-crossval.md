# Run log 2026-10-14: Python package and cross-validation

Environment: Windows 11, Node.js v22.20.0, Python 3.10.6, pytest 9.1.1, Playwright 1.59.1 (Chromium). Branch `audit/2026-10-b`.

Order of work: the pytest suites were written first and run red (`2026-10-14-python-tests-red.md`: 5 collection errors, no module `bitcomm`), then the package was written.

## Python tests, `cd python && python -m pytest -q`
115 passed, 0 failed. By file: bit stuffing (round trip for every bit string up to 14 bits, no six 1s in any stuffed output up to 12 bits, error positions), CRC (textbook worked examples, every single-bit error and every burst up to the generator degree detected, standard check values 0xF4 / 0x29B1 / 0xBB3D / 0xCBF43926, agreement with `zlib.crc32` and `binascii.crc_hqx`), ARQ (scripted draws for lost frame, lost ACK, duplicate, give-up; seeds; cancellation; validation), CLI, vectors.

## Vectors, `python scripts/gen_vectors.py`
Seed 20261014. Total 2,720: stuff_exhaustive 2,047, stuff_random 300, stuff_cases 14, destuff_cases 8, destuff_errors 7, invalid_input 10, frames 48, unframe_errors 8, arq 60, crc_bits 154, crc_register 64. File size 251,165 bytes. `--check` reports it up to date; generation is deterministic (pytest compares bytes).

## JavaScript against the vectors, `npm test`
32 passed, 0 failed (23 existing unit tests and 9 cross-validation tests). Printed: `cross-validated against Python: 2502 vectors` (all sections except the 218 CRC vectors, which have no JavaScript counterpart).

Mutation check (temporary edits, reverted with `git checkout`): MAX_RUN 5 to 6 in `lib/bitstuff.mjs` made 7 of 9 cross-validation tests fail; changing the frame-versus-ACK split from 0.5 to 0.4 in `lib/stopwait.mjs` made 2 of 9 fail.

## Playwright, `npm run test:e2e`, 390 px and 1280 px
6 passed, 0 failed (working copy and a fresh clone of the pushed branch).

## Fresh clone of the pushed branch (new venv, README commands)
`npm install`, `npm test` (32 pass), `pip install -e ".[dev]"` in `python/`, `python -m pytest` (115 passed), `bitcomm stuff 0111110 --frame` printed `011111100111110001111110`, `bitcomm crc 1101011011 --generator 10011` printed remainder 1110, `bitcomm arq ... --seed 1` ended with `delivered: 3 of 3`, `python scripts/gen_vectors.py --check` reported up to date.

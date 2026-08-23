## Leaderboard

| harness | model | n | H [95% CI] | M | N | L | $/life |
|---|---|--:|---|--:|--:|--:|--:|
| mock:sensible | mock | 6 | 0.598 [0.571, 0.612] | 0.440 | 0.944 | 0.600 | $0.0000 |
| claude-code | claude-sonnet-5 | 6 | 0.578 [0.416, 0.665] | 0.457 | 1.000 | 0.383 | $2.9550 |
| mock:goldfish | mock | 6 | 0.287 [0.287, 0.287] | 0.000 | 0.667 | 0.600 | $0.0000 |
| mock:random | mock | 6 | 0.234 [0.031, 0.793] | 0.254 | — | 0.180 | $0.0000 |

## Memory pass rate by delay (raw; chance 0.33 from default (2 mock:random probes, need 8))

| harness | model | 1 season | 1 year | 10 years | 25 years | M | negatives |
|---|---|--:|--:|--:|--:|--:|--:|
| mock:sensible | mock | 0.50 | 0.50 | 1.00 | 0.50 | 0.440 | 17/18 |
| claude-code | claude-sonnet-5 | 0.50 | 0.71 | 1.00 | 0.00 | 0.457 | 7/7 |
| mock:goldfish | mock | 0.00 | 0.00 | 0.00 | 0.00 | 0.000 | 12/18 |
| mock:random | mock | — | 0.50 | — | — | 0.254 | 0/0 |

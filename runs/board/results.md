## Leaderboard

| harness | model | n | H [95% CI] | M | N | L | $/life |
|---|---|--:|---|--:|--:|--:|--:|
| mock:sensible | mock | 6 | 0.598 [0.571, 0.612] | 0.440 | 0.944 | 0.600 | $0.0000 |
| claude-code | claude-sonnet-5 | 12 | 0.581 [0.535, 0.633] | 0.449 | 1.000 | 0.421 | $1.4775 |
| claude-code/caterina | claude-sonnet-5 | 2 | 0.437 [0.437, 0.641] | 0.189 | 1.000 | 0.416 | $0.0000 |
| mock:goldfish | mock | 6 | 0.287 [0.287, 0.287] | 0.000 | 0.667 | 0.600 | $0.0000 |
| claude-code | claude-opus-5 | 1 | 0.284 [0.284, 0.284] | 0.254 | — | 0.368 | $0.0000 |
| mock:random | mock | 6 | 0.234 [0.031, 0.793] | 0.254 | — | 0.180 | $0.0000 |

## Memory pass rate by delay (raw; chance 0.33 from default (2 mock:random probes, need 8))

| harness | model | 1 season | 1 year | 10 years | 25 years | M | negatives |
|---|---|--:|--:|--:|--:|--:|--:|
| mock:sensible | mock | 0.50 | 0.50 | 1.00 | 0.50 | 0.440 | 17/18 |
| claude-code | claude-sonnet-5 | 0.43 | 0.76 | 1.00 | 0.00 | 0.449 | 20/20 |
| claude-code/caterina | claude-sonnet-5 | 0.25 | 0.67 | 0.50 | 0.00 | 0.189 | 4/4 |
| mock:goldfish | mock | 0.00 | 0.00 | 0.00 | 0.00 | 0.000 | 12/18 |
| claude-code | claude-opus-5 | — | 0.50 | — | — | 0.254 | 0/0 |
| mock:random | mock | — | 0.50 | — | — | 0.254 | 0/0 |

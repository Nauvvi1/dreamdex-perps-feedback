# dreamDEX Perps — Feedback Track

I reviewed the official dreamDEX Perps Bot Kit and documented issues in its trading examples and testnet documentation. These are reproducible source-level findings, not claims of observed on-chain losses.

| # | Finding | Area | Proposed severity | Verification |
|---|---|---|---|---|
| [001](feedback/001-short-tp-sl.md) | SHORT TP/SL percentages are switched | app | major | Offline calculation reproduction |
| [002](feedback/002-invalid-perp-side.md) | Invalid side silently defaults to LONG | app | normal | Offline configuration reproduction |
| [003](feedback/003-stop-token-name.md) | Stop-order token name in documentation | docs | normal | Source/documentation comparison |
| [004](feedback/004-existing-stops-cancelled.md) | Starter cancels stops it did not create | app | major | Original strategy code + controlled dependency mocks |
| [005](feedback/005-stale-quantity-in-close.md) | Close uses an earlier quantity after a newer position read | app | major | Original helper code + control case |
| [006](feedback/006-flatten-removes-stops-before-close.md) | Flatten cancels stops before checking close result | app | major | Original strategy code + simulated failed close |

## Run the reproductions

Node.js 20+ is required. No wallet, RPC endpoint, or testnet funds are needed.

The original three reports can be reproduced with no installation:

```bash
node tests/reproduce.mjs
```

The additional reports execute original TypeScript source snapshots (loaded into a VM with mocked SDK/network dependencies):

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run test:additions
```

To run both sets: `npm test`.

Saved output: [`evidence/offline-test-output.txt`](evidence/offline-test-output.txt) and [`evidence/004-006-local-run.txt`](evidence/004-006-local-run.txt).

## Reproducibility and limits

- Source: [somnia-chain/dreamdex-bot-kit](https://github.com/somnia-chain/dreamdex-bot-kit).
- Both source files are copied unmodified into `fixtures/` under the upstream MIT license.
- The Bot Kit ZIP was downloaded on November 10, 2026 and contains no Git history, so no upstream commit ID is claimed.
- `perp-starter` source SHA-256: `3e0158ab088489fbd63ff4a0e1a38174d6c5be6a3fee1fd85c4ea19065f731b1`.
- `perp-core/orders.ts` source SHA-256: `a9ed57032c74315deafaea99a9ce349875b5bcd4b6eb0d09e2c5065c9402c583`.
- Tests are offline, against the original function bodies and mocked external dependencies. They do **not** prove a real fill, unintended position reversal, user loss, or accepted bounty classification.
- Intended network: Somnia Tokyo / Hideki testnet, chain ID 50383.

These reports concern the Bot Kit rather than proven defects in deployed contracts or the Markets SDK. The organizer decides whether they are in scope, unique, and eligible for a payout. Security vulnerabilities should be reported privately, not published here.

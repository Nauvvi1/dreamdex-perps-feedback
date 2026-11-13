# dreamDEX Perps — Feedback Track

I reviewed the official dreamDEX Perps Bot Kit and Markets SDK 0.32.1 and documented issues in the trading examples, SDK wallet-link classification, and testnet documentation. These are reproducible source-level findings, not claims of observed on-chain losses.

| # | Finding | Area | Proposed severity | Verification |
|---|---|---|---|---|
| [001](feedback/001-short-tp-sl.md) | SHORT TP/SL percentages are switched | app | major | Offline calculation reproduction |
| [002](feedback/002-invalid-perp-side.md) | Invalid side silently defaults to LONG | app | normal | Offline configuration reproduction |
| [003](feedback/003-stop-token-name.md) | Stop-order token name in documentation | docs | normal | Source/documentation comparison |
| [004](feedback/004-existing-stops-cancelled.md) | Starter cancels stops it did not create | app | major | Original strategy code + controlled dependency mocks |
| [005](feedback/005-stale-quantity-in-close.md) | Close uses an earlier quantity after a newer position read | app | major | Original helper code + control case |
| [006](feedback/006-flatten-removes-stops-before-close.md) | Flatten cancels stops before checking close result | app | major | Original strategy code + simulated failed close |
| [007](feedback/007-maker-orders-left-after-refresh-failure.md) | Maker exits without cancelling live quotes on market refresh failure | app | major | Original strategy code + failure/control scenarios |
| [008](feedback/008-guard-unhandled-margin-read.md) | Risk Guard exits after a transient margin health RPC error, skipping remaining positions | app | normal | Original strategy + Bot Kit margin helper + SDK 0.32.1; real child-process exit codes |
| [009](feedback/009-linked-wallet-address-case.md) | Linked-wallet role depends on EVM address letter case | SDK | normal | Original SDK 0.32.1 functions, controlled contract responses, checksum/lowercase regression |

## Run the reproductions

Node.js 22.16+ is recommended (required for the 007 reproducer). No wallet, RPC endpoint, or testnet funds are needed.

The original calculation/configuration reports (001–002) can be reproduced with no installation:

```bash
node tests/reproduce.mjs
```

Reports 004–006 execute original TypeScript source snapshots (loaded into a VM with mocked SDK/network dependencies):

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run test:additions
```

Report 007 separately reproduces the market-refresh failure and normal-shutdown control using Node.js built-in TypeScript stripping:

```bash
npm run test:007
```

Report 008 reproduces the original `perp-guard` strategy, Bot Kit margin helper and SDK 0.32.1 margin method with controlled RPC responses and two real Node child-process exits:

```bash
npm run test:008
```

Report 009 checks the original SDK linked-wallet functions with identical mocked contract responses and checksummed versus lowercase forms of the same EVM address:

```bash
npm run test:009
```

To run every executable reproduction (001–002 and 004–009): `npm test`. Report 003 is a documentation comparison, not an automated runtime test.

Saved outputs: [`evidence/offline-test-output.txt`](evidence/offline-test-output.txt), [`evidence/004-006-local-run.txt`](evidence/004-006-local-run.txt), [`evidence/007-maker-refresh-failure.json`](evidence/007-maker-refresh-failure.json), [`evidence/full-suite-local-run.txt`](evidence/full-suite-local-run.txt) (the earlier 001–007 run), and [`evidence/008-guard-margin-read.json`](evidence/008-guard-margin-read.json) with [`evidence/008-guard-runtime.txt`](evidence/008-guard-runtime.txt); for 009 see [`evidence/009-reproduction.json`](evidence/009-reproduction.json), [`evidence/009-local-run.txt`](evidence/009-local-run.txt), and [`evidence/009-source-sha256.txt`](evidence/009-source-sha256.txt).

## Reproducibility and limits

- Bot Kit source: [somnia-chain/dreamdex-bot-kit](https://github.com/somnia-chain/dreamdex-bot-kit).
- SDK source: `@somnia-chain/markets-sdk@0.32.1` release archive; the exact `linkedWallet.ts` snapshot is included for report 009.
- The pinned upstream TypeScript source snapshots are copied unmodified into `fixtures/` under the upstream MIT license.
- The Bot Kit ZIP snapshots were inspected on November 10–11, 2026 and contain no Git history, so no upstream commit ID is claimed.
- `perp-starter` source SHA-256: `3e0158ab088489fbd63ff4a0e1a38174d6c5be6a3fee1fd85c4ea19065f731b1`.
- `perp-core/orders.ts` source SHA-256: `a9ed57032c74315deafaea99a9ce349875b5bcd4b6eb0d09e2c5065c9402c583`.
- `perp-maker` source SHA-256: `ed8ccfafe233796f9764ea6f946c8450fd732754f3abcc853f74dd46a9c62e32`.
- Report 008 also includes unchanged snapshots of `perp-guard`, Bot Kit `margin.ts` and SDK 0.32.1 `margin.ts`; their hashes are listed in [`evidence/008-upstream-source-sha256.txt`](evidence/008-upstream-source-sha256.txt).
- Report 009 includes the unchanged SDK 0.32.1 `linkedWallet.ts` snapshot. Its SHA-256 is recorded in [`evidence/009-source-sha256.txt`](evidence/009-source-sha256.txt).
- Tests are offline, against the original function bodies and mocked external dependencies. They do **not** prove a real fill, unintended position reversal, user loss, or accepted bounty classification.
- Intended network: Somnia Tokyo / Hideki testnet, chain ID 50383.

Reports 001–008 concern the Bot Kit and related documentation; report 009 concerns a reproducible SDK wallet-link classification error. None proves a defect in deployed contracts or an on-chain loss. The organizer decides whether the findings are in scope, unique, and eligible for a payout. Security vulnerabilities should be reported privately, not published here.

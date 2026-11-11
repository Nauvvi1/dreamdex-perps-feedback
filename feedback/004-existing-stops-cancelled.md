# perp-starter cancels existing stops it did not create

Severity: major (proposed)
Area: app

## What I found

`perp-starter` can manage an already open position instead of opening a new one. If that account already has stop orders on the selected market, the bot leaves them alone at startup. But when the bot is stopped, it fetches **all** pending stops for the account and market and cancels them, without checking which stops it created.

This also happens when the bot never created a single stop itself. A user can start the example against an existing position with manually configured protection and then lose that protection just by stopping the bot.

## Steps to reproduce

1. From this repository, run `npm install --ignore-scripts --no-audit --no-fund` (Node.js 20+).
2. Run `npm run test:additions`.
3. Find the `QA-004 PASS` line. The test executes the original `perp-starter` entry point from `fixtures/perp-starter-index.ts`, substituting only SDK/core calls and the shutdown signal.
4. The mocked account has an existing LONG position and two pending stops with IDs `77` and `88`. The mock records whether the bot armed any stops and which IDs it attempted to cancel.

## Expected

When the bot did not create any stop orders, stopping the bot should not cancel stops that were already on the account. At minimum, it should track and cancel only its own IDs, or require explicit consent to cancel all stops for a market.

## Actual

The bot calls `cancelStops()` with both pre-existing IDs, `77` and `88`, even though `armBracket()` was never called.

```text
QA-004 PASS | no stops created by bot | cancelStops called with existing IDs 77,88
```

## Why it matters

A trader using `perp-starter` to monitor an existing position can unintentionally remove manually armed take-profit/stop-loss orders for that position. It is the **same wallet's** orders, not another user's orders, but those stops were not placed or tracked by this bot.

## Source and evidence

- Original `strategies/perp-starter/src/index.ts`: position adoption at lines 121–124; existing-stop handling at lines 165–168; shutdown cancellation at lines 233–239.
- Reproducer: [`tests/reproduce-additions.cjs`](../tests/reproduce-additions.cjs) (`QA-004`).
- Captured output: [`evidence/004-006-local-run.txt`](../evidence/004-006-local-run.txt).
- Pinned original source: [`fixtures/perp-starter-index.ts`](../fixtures/perp-starter-index.ts), SHA-256 `3e0158ab088489fbd63ff4a0e1a38174d6c5be6a3fee1fd85c4ea19065f731b1`.

## Environment and limits

- dreamDEX Bot Kit snapshot: downloaded November 10, 2026 (ZIP contains no Git commit metadata).
- Node.js 22, TypeScript transpilation, mocked exchange/core dependencies.
- Target deployment: Somnia Tokyo / Hideki, chain ID 50383.
- **Offline reproduction only.** This proves that the strategy passes the IDs to its cancellation helper. No live cancel transaction was submitted.

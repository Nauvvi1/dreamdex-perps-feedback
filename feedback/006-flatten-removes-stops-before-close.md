# Flatten-on-exit removes protective stops before confirming the position is closed

Severity: major (proposed)
Area: app

## What I found

With `PERP_FLATTEN_ON_EXIT=true`, the `perp-starter` shutdown path first cancels pending stops and only then calls `closePosition()`. The code does not check whether the close was actually sent or filled before leaving the shutdown path.

This is risky because `closePosition()` can return `sent: false` (for example, when the book has no counterparty or a valid close size cannot be determined). The position may remain open after the bot has already removed its protection.

## Steps to reproduce

1. Run `npm install --ignore-scripts --no-audit --no-fund` (Node.js 20+).
2. Run `npm run test:additions`.
3. Locate `QA-006 PASS`. The test executes the original strategy module with `PERP_FLATTEN_ON_EXIT=true` and a controlled shutdown request.
4. The exchange mock presents an existing LONG position. On startup the bot arms a bracket. At shutdown, pending stops `501` and `502` are returned. The `closePosition()` mock responds `{ sent: false, filled: 0n }`.
5. Inspect the recorded call sequence.

## Expected

A requested flatten should not leave a still-open position unexpectedly unprotected when the close attempt fails. It should confirm the closing outcome before finalizing stop cancellation, or restore/retain protection and warn clearly.

## Actual

The code calls `cancelStops()` before `closePosition()`. After an unsuccessful close result it exits without restoring any stops.

```text
QA-006 PASS | armBracket -> cancelStops(501,502) -> closePosition(sent:false)
```

## Why it matters

A user who asks the bot to flatten on exit may instead end up with an open position and no active stop-loss/take-profit orders after an unsuccessful close. The example's shutdown path does not verify success or repair the protection.

This is distinct from report 004: here the problem exists even for stops the bot **did** create, because the operations are in the wrong order for a failed close.

## Source and evidence

- Original `strategies/perp-starter/src/index.ts`, lines 233–245.
- Original `packages/perp-core/src/orders.ts`, lines 240–298 (documents several non-error `sent: false` outcomes).
- Reproducer: [`tests/reproduce-additions.cjs`](../tests/reproduce-additions.cjs) (`QA-006`).
- Captured output: [`evidence/004-006-local-run.txt`](../evidence/004-006-local-run.txt).
- Pinned source snapshots: [`fixtures/perp-starter-index.ts`](../fixtures/perp-starter-index.ts) and [`fixtures/perp-core-orders.ts`](../fixtures/perp-core-orders.ts).

## Environment and limits

- dreamDEX Bot Kit snapshot: November 10, 2026; no original Git commit ID in ZIP.
- Node.js 22, offline TypeScript source execution with mocked dependencies.
- Target network: Somnia Tokyo / Hideki, chain ID 50383.
- **Offline reproduction only.** The call order and ignored `sent: false` result are confirmed, but no live stops were cancelled and no live position was left open in this test.

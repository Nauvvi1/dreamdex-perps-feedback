# closePosition uses the old close quantity after fetching a newer position

Severity: major (proposed)
Area: app

## What I found

`closePosition()` in `packages/perp-core/src/orders.ts` sizes its close using `previewPerpClosePnl().closedQuantity`. Later it fetches the current position again, but only uses that newer result to choose BUY or SELL. The order quantity is still calculated from the earlier preview.

If the position shrinks between those two reads, the example can submit a larger close order than the remaining position. The `placePerp()` helper sends an ordinary `MARKET` order with no `reduceOnly` field.

## Steps to reproduce

1. Run `npm install --ignore-scripts --no-audit --no-fund` (Node.js 20+).
2. Run `npm run test:additions`.
3. Find the `QA-005 PASS` line. The test loads the actual original `closePosition()` and `placePerp()` implementations from `fixtures/perp-core-orders.ts`.
4. The mocked close preview returns `closedQuantity = 10e18`, while the subsequent `fetchPositions()` returns a LONG position of only 2 contracts. The order-book mock supplies a bid.
5. The test records the order arguments passed to `trader.placePerpOrder()` and checks the ordinary, unchanged-position control case too.

## Expected

After reading the current position, a close order should not be larger than the remaining quantity. If a reduce-only order mechanism is available, closing should use it to prevent an unintended increase or reversal.

For the test case, the requested SELL quantity should be at most 2 contracts.

## Actual

The helper sends an ordinary SELL market order for **10** contracts even though the newer position read reports **2**.

```text
QA-005 PASS | preview 10 -> latest position 2 -> SELL 10e18 (normal MARKET order, no reduceOnly field)
QA-005 CONTROL PASS | preview 2 -> latest position 2 -> SELL 2e18
```

## Why it matters

The size can become stale if another order fills, a stop triggers, or another client reduces the position between the two reads. Depending on the protocol's order validation and matching rules, the excessive close may revert, be partially filled, or create unintended exposure. **This report does not claim that an on-chain position reversal was observed.**

## Source and evidence

- Original `packages/perp-core/src/orders.ts`: `placePerp()` builds ordinary order arguments at lines 170–175; close preview at lines 240–258; later position read at lines 276–282; placement at lines 289–297.
- Reproducer: [`tests/reproduce-additions.cjs`](../tests/reproduce-additions.cjs) (`QA-005` and control case).
- Captured output: [`evidence/004-006-local-run.txt`](../evidence/004-006-local-run.txt).
- Pinned original source: [`fixtures/perp-core-orders.ts`](../fixtures/perp-core-orders.ts), SHA-256 `a9ed57032c74315deafaea99a9ce349875b5bcd4b6eb0d09e2c5065c9402c583`.

## Environment and limits

- dreamDEX Bot Kit snapshot: November 10, 2026 (no commit metadata in ZIP).
- `@somnia-chain/markets-sdk@0.32.1` inspected for integration context.
- Node.js 22; the external SDK/exchange responses are mocked.
- Target network: Somnia Tokyo / Hideki, chain ID 50383.
- **Offline reproduction only.** The oversized order argument is confirmed, not its eventual execution on the chain.

# perp-maker exits on a market refresh error without cancelling its resting quotes

Severity: major (proposed)  
Area: app (Bot Kit)

## What happened

I checked what happens when `perp-maker` has already placed a bid and an ask, and the next market refresh fails. The strategy exits with an error without calling the cancellation helper for either order.

The cleanup at the bottom of the strategy only runs when the polling loop ends normally. It is not in a `finally` block. A temporary failure from `requireMarket(..., { reload: true })` therefore skips it completely.

This is not a failed cancellation request: **no cancellation request is attempted**.

## Steps to reproduce

1. Use Node.js 22 or newer.
2. From the repository root, run:

   `node --experimental-vm-modules tests/repro-007.cjs`

3. The test runs the original `perp-maker` strategy in `fixtures/perp-maker-index.ts`, stripping only TypeScript syntax. It substitutes external services with controlled responses. The strategy logic is not changed.
4. In the first cycle, both orders are accepted and given IDs 101 and 102. On the next market refresh, a mock throws `Indexer RPC timeout`.
5. Compare that result with the control scenario, which stops the same strategy normally after the two orders are placed.

## Expected

If the maker exits unexpectedly after placing quotes, it should attempt to cancel its tracked orders before stopping, or explicitly report that the orders might still be open.

## Actual

**Refresh failure scenario:**

- Placement returned order IDs `101` and `102`.
- `requireMarket` threw on the next refresh.
- The top-level error handler called `process.exit(1)`.
- There were **zero calls to `cancelQuietly`**.

**Normal shutdown control:** the same two IDs were passed to `cancelQuietly`, and the strategy exited with code 0.

## Why this matters

Resting quotes do not automatically disappear because the client process exits. If still open on the exchange, these orders can fill after the bot has stopped managing them. A temporary indexer failure should not bypass the existing cleanup path.

I did not submit live orders and cannot claim that any particular order remained open or filled on-chain. What this test proves is that the source code makes no attempt to cancel the tracked orders on this error path.

## Evidence

- Original source snapshot: [fixtures/perp-maker-index.ts](../fixtures/perp-maker-index.ts)
- Reproduction: [tests/repro-007.cjs](../tests/repro-007.cjs)
- Captured output: [evidence/007-maker-refresh-failure.json](../evidence/007-maker-refresh-failure.json)
- Source: `strategies/perp-maker/src/index.ts`:
  - Lines 106–134: market reload is outside the placement catch
  - Lines 151–186: exception handling covers only the placement of new quotes
  - Lines 190–196: cancellations are attempted only after normal loop exit
  - Lines 199–205: unhandled exceptions exit with code 1

## Environment

- dreamDEX Bot Kit archive `dreamdex-bot-kit-main(7).zip`, received November 11, 2026
- SHA-256 of original `strategies/perp-maker/src/index.ts`: `ed8ccfafe233796f9764ea6f946c8450fd732754f3abcc853f74dd46a9c62e32`
- Node.js 22, offline test with mocked external services
- No wallet, RPC requests, or transactions

## Suggested fix

Put the maker's main loop inside `try/finally` and attempt to cancel tracked orders in `finally`. If cancellation cannot be confirmed, print the outstanding order IDs and retain the failure status.

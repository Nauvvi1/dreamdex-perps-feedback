# SHORT take-profit and stop-loss percentages are switched

Severity: major
Area: app

## What happened

I was checking how `perp-starter` sets exit prices for a short position. The bot reads two separate settings, `PERP_TAKE_PROFIT_PCT` and `PERP_STOP_LOSS_PCT`, but applies them the wrong way around when the side is `short`.

For example, with a mark price of 100, take profit set to 2% and stop loss to 1%, the bot sets TP at 99 and SL at 102. I would expect TP at 98 and SL at 101.

The long-side calculation works as expected. The short-side calculation does not.

## Steps to reproduce

1. Open `strategies/perp-starter/src/index.ts` in the Bot Kit, lines 173–177 (a pinned copy is in `fixtures/perp-starter-index.ts`).
2. From the root of this report repository, run `node tests/reproduce.mjs`.
3. Look at the `001` output. The test evaluates the four price-calculation lines from the original strategy with mark=100, TP=2%, SL=1%, for both long and short.

## Expected

- Long: TP 102, SL 99.
- Short: TP 98, SL 101.

## Actual

- Long: TP 102, SL 99.
- Short: **TP 99, SL 102**.

## Why this matters

The strategy tells the user it is using the configured 2% profit target and 1% loss limit, but short positions get a 1% profit target and a 2% loss threshold instead. That changes the intended risk/reward setup, even if the orders are otherwise valid.

## Evidence

- Exact reproduction: [`tests/reproduce.mjs`](../tests/reproduce.mjs)
- Recorded output: [`evidence/offline-test-output.txt`](../evidence/offline-test-output.txt)
- Upstream source: `strategies/perp-starter/src/index.ts`, lines 173–177.
- In that block, `up` uses `TAKE_PROFIT_PCT`, `down` uses `STOP_LOSS_PCT`, and for short the code assigns `down` to `takeProfit` and `up` to `stopLoss`.

## Environment

- Source: official dreamDEX Bot Kit ZIP snapshot inspected 2026-11-10; SHA-256 in README.
- Reproduction: Node.js 22, offline, no wallet or transaction.
- Intended target: Somnia Tokyo / Hideki testnet (50383).

I have not broadcast a short order. The result above is a source-level reproduction of the exit-price calculation, not evidence of an executed trade or actual financial loss.

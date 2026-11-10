# Perp-starter calls the testnet stop-order deposit SOMI, not STT

Severity: normal
Area: docs

## What happened

The `perp-starter` README says each pending stop holds 0.15 SOMI, and the strategy log also calls the token SOMI. But the dreamDEX Perps **testnet** orders guide names the deposit token STT, at 0.15 STT per stop.

Because the example defaults to the Hideki testnet, this may send developers looking for the wrong token when trying to fund a stop-loss or take-profit order.

## Steps to reproduce

1. Open `strategies/perp-starter/README.md`, around lines 19–21. It calls the deposit “SOMI”.
2. Open `strategies/perp-starter/src/index.ts`, around lines 99–100 and 162–163. The log/comments also use “SOMI”.
3. Compare with the official [Perps testnet Orders guide](https://app.testnet.dreamdex.io/docs/trading/perps-testnet/orders), under “TP and SL hold a little STT”. The guide states 0.15 STT for each pending TP/SL.

## Expected

The README and runtime text should say STT when describing the Hideki testnet. If SOMI is used on another network, the displayed symbol should depend on the active network.

## Actual

The Bot Kit labels the required asset SOMI in the testnet workflow.

## Why this matters

A developer can follow the example, fund the right collateral token and still be confused about why stop orders need a different asset. This is a documentation and messaging mismatch, not evidence of a contract bug.

## Evidence

- Original README excerpt and strategy messages: [`evidence/003-source-comparison.txt`](../evidence/003-source-comparison.txt)
- [Official Perps testnet Orders guide](https://app.testnet.dreamdex.io/docs/trading/perps-testnet/orders)

## Environment

- dreamDEX Bot Kit ZIP snapshot inspected 2026-11-10.
- Official testnet guide checked 2026-11-10.
- Network discussed: Somnia Tokyo / Hideki (50383).
- No wallet or transaction involved.

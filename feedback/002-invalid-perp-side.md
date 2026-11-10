# A typo in PERP_SIDE silently selects LONG

Severity: normal
Area: app

## What happened

I tried an invalid side setting in the `perp-starter` example. The config line accepts `short` as short, but treats every other value as long. So `PERP_SIDE=shrot` (an easy typo) is silently interpreted as `long`.

## Steps to reproduce

1. Open `strategies/perp-starter/src/index.ts`, line 57 (or the pinned copy in `fixtures/`).
2. Run `node tests/reproduce.mjs` from this repository.
3. Read the `002` line in the output: the test evaluates the original config expression with `PERP_SIDE=shrot`.

## Expected

The bot should reject an unsupported side value with a clear configuration error before it can submit an order. Valid values are `long` and `short`.

## Actual

`PERP_SIDE=shrot` resolves to `long`. There is no validation error in this expression.

## Why this matters

The difference is not cosmetic. Someone trying to open a short position could accidentally configure the example to take the opposite direction. It is particularly risky if the bot is started with live order submission enabled.

## Evidence

- Reproduction: [`tests/reproduce.mjs`](../tests/reproduce.mjs)
- Output: [`evidence/offline-test-output.txt`](../evidence/offline-test-output.txt)
- Source: `strategies/perp-starter/src/index.ts`, line 57.

## Environment

- Official Bot Kit ZIP snapshot inspected 2026-11-10; SHA-256 in README.
- Node.js 22; offline reproduction, no wallet and no transaction.
- Intended target: Somnia Tokyo / Hideki (50383).

I only tested the config parsing. I did not submit an order based on the invalid value.

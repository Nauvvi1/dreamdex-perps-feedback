# perp-guard exits on a transient margin RPC error and stops monitoring remaining positions

Severity: normal
Area: app

## Summary

The `perp-guard` strategy is intended to monitor open perp positions and reduce/close exposure when margin health crosses configured thresholds. A failed margin read is not handled inside the strategy's per-market error boundary. Even a **single transient** `getAccountHealth` RPC error causes `main()` to reject, and its top-level handler calls `process.exit(1)`.

This means all subsequent position monitoring stops until an external supervisor restarts the bot. If the guard is not supervised, it stays stopped. A strategy intended to react to risky positions should be resilient to temporary read failures.

## Steps to reproduce

1. Use the files in this repository: `fixtures/perp-guard-index.ts`, `fixtures/perp-core-margin.ts`, and `fixtures/sdk-perp-margin-0.32.1.ts`. Their SHA-256 hashes match unchanged files from the supplied upstream Bot Kit archive and Markets SDK `0.32.1` package (see `evidence/008-upstream-source-sha256.txt`).
2. From the repository root, install the TypeScript dev dependency (`npm install --ignore-scripts --no-audit --no-fund`) and run:

   ```bash
   node tests/repro-008-guard-margin-read.cjs
   ```

3. The test uses the original `perp-guard` strategy, original Bot Kit `marginSnapshot()` and `healthRatio()`, and the original SDK `getMarginAccount()` implementation. Only exchange/network responses, other strategy dependencies, and the stop trigger are controlled. No code inside these original functions is modified.
4. It starts a fresh Node child process for each of two scenarios with an account holding BTC-PERP and ETH-PERP positions against the same cross-margin bank:
   - **Control:** all margin reads succeed.
   - **Fault:** only the **first** `getAccountHealth` request fails with an injected RPC timeout. The mock is configured so any later health read would succeed.
5. Compare real child-process exit statuses, margin read counts, position-close calls, and cleanup events. Results are saved as JSON and readable text in `evidence/`.

## Expected

A temporary margin read failure should be logged without permanently stopping the protective monitor. The guard should retry after a delay and/or safely continue to other positions when reliable data is available. It must **not** treat a failed health read as healthy or issue blind close orders.

## Actual

The control scenario checks both positions, attempts both close actions and calls normal `shutdown()`. The fault scenario exits with status **1** before attempting any close action or reaching the second position. Normal shutdown is not called.

| Observation | All reads succeed | One-time `getAccountHealth` error |
| --- | --- | --- |
| Actual Node process exit status | `0` | **`1`** |
| Health reads attempted | `2` | **`1`** |
| `closePosition()` calls | BTC-PERP, ETH-PERP | **None** |
| `shutdown()` called | Yes | **No** |
| Error logged | None | `RPC timeout at getAccountHealth (once)` |

Note: the close action itself is a test stub, not an on-chain trade. The test isolates the guard's handling of a failed health-read call.

## Root cause

- `strategies/perp-guard/src/index.ts`, **line 137**: `await marginSnapshot(...)` is executed **before** the per-market `try/catch` at lines **153–163**.
- `packages/perp-core/src/margin.ts`, **line 44**: `marginSnapshot()` directly awaits the SDK `exchange.client.getMarginAccount(...)`, without handling a failed call.
- `@somnia-chain/markets-sdk@0.32.1`, `src/perp/margin.ts`, **lines 75–101**: `getMarginAccount()` awaits four reads in `Promise.all`, so a failed `getAccountHealth` read rejects the entire operation.
- `strategies/perp-guard/src/index.ts`, **lines 173–178**: the rejected `main()` promise reaches the top-level handler, which logs the error and exits with code 1.

This is distinct from a failure inside `closePosition()`, which **is** caught by the existing per-market `try/catch`.

## Evidence

- **Runnable independent reproduction:** [`tests/repro-008-guard-margin-read.cjs`](../tests/repro-008-guard-margin-read.cjs).
- **Full traces of both child processes (including real exit statuses):** [`evidence/008-guard-margin-read.json`](../evidence/008-guard-margin-read.json).
- **Human-readable successful test output:** [`evidence/008-guard-runtime.txt`](../evidence/008-guard-runtime.txt).
- **Upstream source hashes:** [`evidence/008-upstream-source-sha256.txt`](../evidence/008-upstream-source-sha256.txt).
- **Original Bot Kit strategy:** [`fixtures/perp-guard-index.ts`](../fixtures/perp-guard-index.ts).
- **Original Bot Kit margin module:** [`fixtures/perp-core-margin.ts`](../fixtures/perp-core-margin.ts).
- **Original SDK 0.32.1 margin implementation:** [`fixtures/sdk-perp-margin-0.32.1.ts`](../fixtures/sdk-perp-margin-0.32.1.ts).

## Environment

- Source: dreamDEX Bot Kit public source ZIP (no Git commit metadata in archive); Markets SDK `@somnia-chain/markets-sdk@0.32.1`.
- Runtime: Node.js 22, TypeScript transpilation of original source (version printed in evidence).
- Target chain: Somnia Tokyo / Hideki testnet, chain ID `50383`.
- **Reproduction performed offline** with deterministic mocked RPC responses. No calls were sent to Somnia Tokyo and no transaction was submitted.
- Wallet: a fake test-only account, `0x00000000000000000000000000000000000000ab`. No real wallet was used.
- **Proof boundary:** the reproduction establishes an unhandled error and loss of further monitoring in this Node process. It does **not** establish liquidation, monetary loss or real transactions. An external process manager could restart the strategy, which is outside the bot code tested here.

## Suggested fix

Put the entire read-and-action iteration, not just the order action, inside a per-market failure boundary. Log failures, apply bounded retry/backoff, and continue monitoring safely. Add a regression test where one health-read RPC call fails once and a later call succeeds; verify that monitoring survives without assuming missing health data is safe.

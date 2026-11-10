# dreamDEX Perps — Feedback Track

I reviewed the public `perp-starter` example in the dreamDEX Bot Kit. The reports below describe two source-level issues I reproduced locally and one testnet documentation mismatch. No live orders were placed.

| Report | Area | Proposed severity | Evidence |
|---|---|---|---|
| [001 — SHORT TP/SL percentages](feedback/001-short-tp-sl.md) | app | major | Executable reproduction + output |
| [002 — Invalid side becomes LONG](feedback/002-invalid-perp-side.md) | app | normal | Executable reproduction + output |
| [003 — Stop-order token label](feedback/003-stop-token-name.md) | docs | normal | Original text compared with testnet docs |

## Reproduce

Requires Node.js 18 or later, no package installation, wallet or testnet funds.

```bash
node tests/reproduce.mjs
```

Expected output is saved in [`evidence/offline-test-output.txt`](evidence/offline-test-output.txt). The full original `perp-starter` strategy file and README used for these checks are pinned in `fixtures/` solely to make the reproductions stable. They retain the upstream MIT license notice.

## Source version

- Source: [somnia-chain/dreamdex-bot-kit](https://github.com/somnia-chain/dreamdex-bot-kit)
- ZIP snapshot inspected: 2026-11-10; archive has no Git metadata, so no commit hash is claimed.
- `strategies/perp-starter/src/index.ts` SHA-256: `3e0158ab088489fbd63ff4a0e1a38174d6c5be6a3fee1fd85c4ea19065f731b1`
- `strategies/perp-starter/README.md` SHA-256: `942be08a8d25e729fd117d224d267b2a0debf22a4d5b1637478a4b9fd3ab5cf3`
- Intended network: Somnia Tokyo / Hideki testnet, chain ID 50383. All executable checks are **offline**.

These are reports about the official Bot Kit example, not confirmed problems in the Markets SDK or deployed contracts. Severity, duplicate status, scope and payment are subject to the organizers' review.

Potential security vulnerabilities should be reported privately to `security@dreamdex.io`, not published here.

# Linked-wallet role changes when the same EVM address has different casing

Severity: normal  
Area: SDK

## Summary

`getPerpWalletLinkage()` and `quotePerpFundingPayer()` compare Ethereum addresses with case-sensitive JavaScript string equality. Calling either SDK method with the same valid EVM address in EIP-55 checksum form versus lowercase changes the returned wallet role while the underlying contract state is identical.

A main wallet with linked children can be reported as a child (`isChild: true`, `isMain: false`) and as `unlinked` rather than `isMain`. This can mislead wallet-linking and funding UI or automation. This is a read/classification issue; no wrong fund transfer or failed transaction is claimed.

## Root cause

`src/perp/linkedWallet.ts`, SDK 0.32.1:

- Around line 220: `main === account ? "isMain" : "unlinked"`.
- Around lines 297–298: `main !== wallet`, `main === wallet`.

Ethereum address identity is case-insensitive; both representations refer to the same 20-byte address. The public client forwards caller-supplied addresses to these functions unchanged (`src/createClient.ts`, lines 1451–1456).

## Steps to reproduce

1. Install Node.js 22+ and TypeScript (`npm install` in the existing feedback repository, which already has `typescript` as a devDependency).
2. From repository root, run `node tests/repro-009.cjs`.
3. The script loads the unmodified upstream SDK 0.32.1 TypeScript module from `fixtures/sdk-perp-linkedWallet-0.32.1.ts`. Only its imports and `readContract` RPC dependency are stubbed.
4. The mocked registry returns the same main `0x52908400098527886E0F7030069857D2E4169EE7` with an existing child. Call the SDK twice: once with the checksummed main address, once with the same address in lowercase.
5. Repeat for `quotePerpFundingPayer()`: linked-wallet rail enabled, `quoteFundingPayer()` returns the zero address, `mainOf()` returns the same main.

## Expected

The role/reason must be invariant to the letter case of an EVM address. Both inputs should return `isMain: true, isChild: false` and `reason: "isMain"`.

## Actual

| SDK call | Checksummed main address | Same address, lowercase |
|---|---|---|
| `getPerpWalletLinkage()` | `isMain: true, isChild: false` | **`isMain: false, isChild: true`** |
| `quotePerpFundingPayer()` | `reason: "isMain"` | **`reason: "unlinked"`** |

All contract results are identical. The only change is the letter case of the caller-supplied address.

## Evidence

- `tests/repro-009.cjs`: executable assertions calling the original SDK functions.
- `evidence/009-reproduction.json`: full captured control and failure output.
- `evidence/009-local-run.txt`: output from rerunning the reproduction against this repository.
- `evidence/009-source-sha256.txt`: original source digest.
- `fixtures/sdk-perp-linkedWallet-0.32.1.ts`: untouched SDK source, included with its original MIT license.

**Limitation:** deterministic, offline source-code reproduction using mocked contract responses. No live linked-wallet testnet transaction, real wallet balance change, or security impact is claimed.

## Environment

- SDK: `@somnia-chain/markets-sdk@0.32.1` (source archive)
- Intended network: Somnia Tokyo testnet; actual reproduction is fully offline
- Wallets: public example EIP-55 main address and synthetic child, not real funded testnet wallets
- Node: 22.16.0; TypeScript: local installed compiler

## Suggested correction

Normalize both addresses before equality tests (e.g. `main.toLowerCase() === wallet.toLowerCase()`), or use a canonical address normalizer consistently. Regression-test both methods with checksummed and lowercase inputs.

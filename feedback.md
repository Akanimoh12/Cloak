# Nox Developer Feedback — CLOAK team

> ⭐⭐ Judged deliverable. Updated at the end of every build session — not retroactively.

## Session 1 — 2026-07-24 (scaffolding & API verification)

**Setup experience**

- The `nox-hardhat-starter` repo referenced in community materials 404s
  (`github.com/iExec-Nox/nox-hardhat-starter`). We scaffolded a Hardhat 3
  project manually instead. A public starter would have saved ~an hour.
- All three npm packages installed cleanly (`nox-hardhat-plugin@0.1.0`,
  `nox-protocol-contracts@0.2.4`, `handle@0.1.0-beta.13`).
- 👍 `Nox.sol` resolves the NoxCompute address by `block.chainid` (local 31337,
  Arbitrum Sepolia, ETH Sepolia) — zero config on our side. Nice.
- 👍 The docs' warning about transient ACL clearing at end-of-tx is prominent
  enough that we designed around it from day one.

**API surface findings (v0.2.4)**

- `Nox.mul` exists for `euint256`/`eint256` — the docs' arithmetic reference
  could state this more loudly; we had planned a client-side fallback assuming
  it might not.
- Signed `eint256` + `externalEint256` work, so signed rebalance deltas need
  no direction-flag encoding. The JS-side type restriction list
  (bool/uint16/uint256/int16/int256) matches.
- `Nox.publicDecrypt(handle, decryptionProof)` doing on-chain proof
  verification is exactly the settlement primitive a vault needs — but it's
  the least-documented piece. An end-to-end "reveal and act on-chain" example
  in the docs would help a lot.

**Open questions / to verify in session 2**

- Behavior of `allowPublicDecryption` latency: how quickly after the tx is the
  gateway willing to serve `publicDecrypt`?
- Whether `addViewer` vs `allow` is the intended primitive for auditor-style
  scoped read access.

## Session 2 — 2026-07-24 (live Sepolia deployment)

**Everything worked on the first attempt against production Nox infra.**

- Full confidential epoch ran live on ETH Sepolia: two encrypted intents
  (+500 / −200 tUSDC) submitted via the Handle Gateway, aggregated on-chain
  with `Nox.add`, manager decrypted the running total gaslessly, epoch closed,
  `publicDecrypt` returned the net (300) with a proof, and
  `executeRebalance` verified the proof on-chain and settled through the
  canonical Uniswap V3 SwapRouter02. Zero Nox-related failures.
- 👍 Gateway latency was low; `publicDecrypt` was servable immediately after
  the `closeEpoch` transaction confirmed — no polling loop needed.
- 👍 `createViemHandleClient` works unchanged with a `privateKeyToAccount`
  server-side wallet client — same code path for browser and keeper.
- Friction: Hardhat 3's `configVariable` doesn't read `.env` files, and the
  Nox docs' script examples assume env vars are exported. A one-liner in the
  quickstart ("`set -a; source .env`") would save newcomers a stumble.
- Friction: scripts using plain viem alongside the plugin need `viem` added
  as an explicit dependency — the toolbox only exposes it transitively.

Vault: `0x5471bab4fc78a946cdc3142d852e54cbd83c181e` (Sepolia).

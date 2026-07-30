# Cloak Contracts

Hardhat 3 project in [`contracts/`](../contracts). Solidity 0.8.35, viem toolbox, iExec Nox plugin.

## Contracts

| File | Purpose |
|---|---|
| `CloakVault.sol` | The vault. ERC-20 shares, public deposit/withdraw/NAV, encrypted intent aggregation, epoch settlement through Uniswap V3, auditor ACL. |
| `TestUSDC.sol` | Base asset. 6-decimal ERC-20 with a public `faucet(amount)` capped at 10,000 per call. |
| `interfaces/IV3SwapRouter.sol` | SwapRouter02 interface (no deadline field). |
| `interfaces/IUniswapV3PoolMinimal.sol` | `slot0`/`token0`/`token1`, used for NAV pricing. |
| `mocks/MockSwapRouter.sol` | Local tests only. 1:1 fill from its own inventory. |

## How CloakVault works

**Public side.** `deposit(assets)` mints shares pro-rata, `withdraw(shares)` burns and pays out from idle base. `totalAssets()` values target holdings at the pool's spot price (`slot0`), so NAV and `sharePrice()` are verifiable by anyone.

**Confidential side.** The manager calls `submitIntent(handle, proof)` with an encrypted signed delta (`externalEint256`, base-asset units, positive = buy target). The contract verifies the proof with `Nox.fromExternal` and folds it into the epoch's `_netDelta` with `Nox.add` — the sum happens on encrypted values inside the TEE. After every handle-producing statement the contract calls `Nox.allowThis` + `Nox.allow(manager)`, because transient ACL access is cleared at end-of-tx.

**Epoch lifecycle.** The keeper calls `closeEpoch()`, which marks the net delta publicly decryptable (`Nox.allowPublicDecryption`). Off-chain, the keeper fetches the plaintext and a decryption proof from the Nox gateway, then calls `executeRebalance(decryptionProof, amountOutMinimum)`. The contract verifies the proof on-chain with `Nox.publicDecrypt` — the keeper cannot forge the value — and settles the delta as one swap through the canonical SwapRouter02. The epoch counter increments and `_netDelta` resets to a fresh encrypted zero.

**Compliance.** `grantAuditor(addr)` gives an address ACL decrypt access to the strategy handle and current net delta. `revokeAuditor` stops future grants; per-handle grants are immutable by design.

## Roles

| Role | Powers |
|---|---|
| `owner` | `setRoles`, `grantAuditor`, `revokeAuditor` |
| `manager` | `submitIntent`, `submitStrategyState` |
| `keeper` | `closeEpoch`, `executeRebalance` |

## Run

```bash
pnpm install               # from repo root
cd contracts

pnpm compile
pnpm test                  # needs Docker running; boots the local Nox stack
```

The first `pnpm test` pulls the Nox stack images (KMS, gateway, runner) — slow once, cached after.

## Deploy to Sepolia

```bash
cp .env.example .env       # set SEPOLIA_RPC and PK (funded with Sepolia ETH)

npx hardhat run scripts/00-deploy-testUSDC.ts --network sepolia
npx hardhat run scripts/01-create-pool.ts     --network sepolia
npx hardhat run scripts/02-seed-liquidity.ts  --network sepolia
npx hardhat run scripts/03-deploy-cloak.ts    --network sepolia

# optional: split roles to separate wallets
MANAGER=0x... KEEPER=0x... npx hardhat run scripts/04-wire-roles.ts --network sepolia
```

Each script writes its addresses to `deployments/sepolia.json`; later scripts read from it. Script 02 wraps 0.03 ETH into WETH and pairs it with 3,000 tUSDC at the 100,000 tUSDC/WETH init price, so the deployer wallet needs roughly 0.05 Sepolia ETH including gas.

Redeploying the vault invalidates every existing handle — Nox handles are bound to the contract address they were encrypted for.

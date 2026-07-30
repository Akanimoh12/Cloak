# CLOAK

**The vault that shows its returns, never its hand.**

🎥 [Demo video](https://youtu.be/REPLACE_ME) · 🌐 [Live app](https://cloak-vault.vercel.app) · 📄 [Architecture](docs/CLOAK-ARCHITECTURE.md)

Cloak is an on-chain vault where performance is public and the strategy is cryptographically private. LPs see NAV, TVL, and share price on-chain like any vault. The manager's rebalance intents are encrypted in the browser, aggregated **while still encrypted** inside a TEE (iExec Nox), and only the net batch delta is revealed at epoch close — then settled as one swap on **unmodified Uniswap V3** (ETH Sepolia).

Two intents go in. One number comes out. Attribution is gone.

```
encrypt → aggregate in TEE → reveal net only → swap on Uniswap
```

## Deployed on Sepolia

| Contract | Address |
|---|---|
| CloakVault | [`0x5471bab4fc78a946cdc3142d852e54cbd83c181e`](https://sepolia.etherscan.io/address/0x5471bab4fc78a946cdc3142d852e54cbd83c181e) |
| TestUSDC (tUSDC) | [`0x565cbe7d87042f8bb80cc0aa754063d73a369414`](https://sepolia.etherscan.io/address/0x565cbe7d87042f8bb80cc0aa754063d73a369414) |
| tUSDC/WETH Uniswap V3 pool (0.3%) | [`0x99D4A2d48b010BaeA7924953B5bd2a76569fb2b7`](https://sepolia.etherscan.io/address/0x99D4A2d48b010BaeA7924953B5bd2a76569fb2b7) |

A full confidential epoch has already settled live: two encrypted intents (+500 / −200 tUSDC) aggregated on-chain, only the net (300) revealed, then swapped through the canonical router — [settlement tx](https://sepolia.etherscan.io/tx/0x89fc176bd8b9d551735a6e9cc2b28536d57e1af61a441b3215ddf750cfb63b38).

## Why

On-chain vaults leak everything: weights are copy-traded, rebalances are front-run, strategies are reverse-engineered from history. That leak is the #1 reason serious capital won't run strategies on-chain. Cloak keeps the trust properties of a transparent vault and removes only the part that bleeds alpha.

## What's in the box

- **`CloakVault.sol`** — ERC-20 shares, public deposit/withdraw/NAV, encrypted intent aggregation (`Nox.add` on `eint256` handles), epoch settlement with on-chain decryption-proof verification, auditor ACL for scoped compliance access.
- **Web app** — landing with live on-chain stats, LP dashboard, manager console (watch your intent encrypt, then compare the opaque calldata with your private decrypted view), auditor view, keeper cron.
- **Real infrastructure, zero mocks** — canonical Uniswap V3 factory/router, a real tUSDC/WETH pool we created and seeded, the production Nox stack run by iExec.

## Quick start

```bash
pnpm install
pnpm contracts:compile
pnpm contracts:test        # local end-to-end against the dockerized Nox stack
pnpm web                   # frontend on http://localhost:3000
```

Full guides: [contracts](docs/CONTRACTS.md) · [frontend](docs/FRONTEND.md)

## Built vs. borrowed

Built for this hackathon: the vault contract, test token, deploy pipeline, tests, the entire frontend, and the keeper. Pre-existing and unmodified: Uniswap V3 (canonical Sepolia deployment), the Nox protocol + off-chain stack, OpenZeppelin.

## Roadmap

Multi-asset encrypted weights · cross-vault netting (privacy compounds with adoption) · ERC-7984 confidential share class · randomized settlement timing.

---

Built for the **iExec WTF Hackathon — Summer Edition** · [feedback.md](feedback.md) tracks our Nox developer-experience notes.

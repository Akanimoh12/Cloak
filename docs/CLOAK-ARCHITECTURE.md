# CLOAK — Architecture & Build Plan

> **The vault that shows its returns, never its hand.**
> A confidential strategy vault built on iExec Nox for the WTF Hackathon (Summer Edition).
> Deposits, NAV, and TVL are public and verifiable. The manager's allocation strategy — weights, rebalance timing, trade intents — is encrypted end-to-end and never touches the chain in plaintext. Trades settle through **unmodified Uniswap V3** on ETH Sepolia.

---

## 1. Product Summary

| | |
|---|---|
| **Problem** | On-chain vaults leak the manager's strategy: weights are readable, rebalances are front-run, alpha is copy-traded to death. This is the #1 blocker for serious capital running strategies on-chain. |
| **Solution** | Strategy lives as Nox encrypted handles. Rebalance intents are submitted encrypted, aggregated inside the contract using Nox encrypted arithmetic, and only the **net batch delta** is revealed at epoch close — then executed as one Uniswap swap. Observers see a batch trade; they cannot attribute it to a strategy or reconstruct weights. |
| **Why it wins on the judging criteria** | Creativity ⭐⭐⭐ (strategy privacy, not user privacy — inverts the obvious pitch) · End-to-end, no mocks ⭐⭐⭐ (real Nox handles, real Uniswap pool on Sepolia) · Sepolia ⭐⭐ · Clean Nox integration ⭐ (uses handles, ACL viewers for auditors, public decryption for settlement — three distinct Nox features) · Deployable-by-a-company story is native to the product. |
| **Nox alignment** | This is literally the "cVault: Encrypted Strategy" use case in the Nox docs — but the docs only describe the concept. Nobody has shipped it. We ship it. |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS APP (Vercel)                       │
│                                                                     │
│  Landing ── /app (LP dashboard) ── /manage (strategist) ── /audit   │
│                        │                                            │
│         wagmi v2 + viem v2 (wallet, reads, writes)                  │
│         @iexec-nox/handle  (encryptInput / decrypt / viewACL)       │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ encrypted handles + proofs   │ plain deposits/withdraws
               ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLOAK CONTRACTS (ETH Sepolia)                    │
│                                                                     │
│  CloakVault.sol                                                     │
│   ├─ ERC-20 share token (public balances — LP side is transparent)  │
│   ├─ deposit()/withdraw() in base asset (public, standard)          │
│   ├─ submitIntent(externalEuint256 handle, bytes proof)  [manager]  │
│   │    └─ Nox.fromExternal → Nox.add into epoch netDelta (euint256) │
│   ├─ closeEpoch()  → marks netDelta publicly decryptable            │
│   ├─ executeRebalance(plainDelta) [keeper] → Uniswap V3 swap        │
│   └─ ACL: Nox.allow(auditor) — scoped read access for compliance    │
│                                                                     │
│  Talks to (UNMODIFIED):                                             │
│   • Nox protocol contracts (handle verification, ACL, TEE compute)  │
│   • Uniswap V3 SwapRouter (canonical Sepolia deployment)            │
└──────────────┬──────────────────────────────────────────────────────┘
               │ Nox ops executed in Intel TDX TEE (iExec infra)
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│        NOX OFF-CHAIN STACK (run by iExec — we just call it)         │
│   Handle Gateway (encrypt, store ciphertext) · Runner (TEE compute) │
│   · KMS · Ingestor                                                  │
└─────────────────────────────────────────────────────────────────────┘

  KEEPER (tiny Node script or Vercel cron): closes epochs, calls
  publicDecrypt() on netDelta, submits executeRebalance().
```

**The privacy trick in one sentence:** individual intents enter encrypted and are summed *while still encrypted* (Nox arithmetic runs in the TEE); only the aggregate net number is ever decrypted, so per-intent attribution is mathematically gone before anything touches Uniswap.

---

## 3. Stack — Exact Packages (verified against docs, July 2026)

### 3.1 Contracts

| Tool | Package / Version | Notes |
|---|---|---|
| Hardhat | **Hardhat 3** (⚠️ not 2 — the Nox plugin requires v3's `defineConfig`) | |
| Nox Hardhat plugin | `@iexec-nox/nox-hardhat-plugin` (devDep) | Boots a local Nox stack in **Docker** for tests |
| Nox Solidity lib | `@iexec-nox/nox-protocol-contracts` | Import path: `@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol` |
| Toolbox | `@nomicfoundation/hardhat-toolbox-viem` (pick viem, matches frontend) | Plugin auto-detects viem vs ethers |
| OpenZeppelin | `@openzeppelin/contracts` ^5.x | ERC-20 shares, Ownable, ReentrancyGuard |
| Uniswap | `@uniswap/v3-periphery` (interfaces only: `ISwapRouter`) | We call the canonical deployment; we do NOT redeploy Uniswap |
| Solidity | `0.8.35` in hardhat config (contracts `pragma ^0.8.27`) | Per Nox Hardhat guide + Hello World |
| Node | **22+** | Hard requirement of the Nox plugin |
| Docker | Required locally | Nox test stack runs in containers; first `hardhat test` pulls images (slow once) |

Starter to clone: `github.com/iExec-Nox/nox-hardhat-starter` — start here, don't scaffold from scratch.
Also useful: the confidential contracts wizard at `cdefi-wizard.iex.ec` to sanity-check patterns.

### 3.2 Frontend

| Tool | Package | Why |
|---|---|---|
| Framework | `next@15` (App Router) | |
| Wallet/chain | `wagmi@2` + `viem@2` + `@rainbow-me/rainbowkit@2` | Nox SDK's `createViemHandleClient` accepts a viem `WalletClient` — wagmi's `useWalletClient()` hands you exactly that. Zero adapter code. |
| Nox JS SDK | **`@iexec-nox/handle`** | `createViemHandleClient`, `encryptInput`, `decrypt`, `publicDecrypt`, `viewACL` |
| Data fetching | `@tanstack/react-query@5` | Already a wagmi peer dep |
| Charts | `recharts` | NAV/TVL history chart on dashboard |
| Styling | `tailwindcss@3` + our CSS variables | Design theme in §7 |
| Fonts | `next/font/google` → Space Grotesk, Syne (700/800), Space Mono (400/700) | No layout shift, no external CSS |
| Icons | `lucide-react` | |
| Toasts | `sonner` | Tx pending/confirmed states |

### 3.3 Infra

- **Frontend:** Vercel (free tier fine; prize covers a year of hosting per the rules).
- **Keeper:** Vercel Cron hitting an API route (`/api/keeper`) that holds a keeper key in env, OR a 40-line Node script on any box. Keep it dumb.
- **RPC:** Alchemy or Infura Sepolia key. Public RPCs will drop you mid-demo — don't risk it.
- **Contracts:** ETH Sepolia (hackathon requirement, and Nox supports it — `sepolia` from `viem/chains` appears in official SDK examples).

---

## 4. Nox Integration — The Real API (from docs, so we don't guess)

### 4.1 Solidity side

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Nox, euint256, externalEuint256}
    from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
```

Confirmed primitives we use:

| Primitive | Use in Cloak |
|---|---|
| `Nox.toEuint256(0)` | Initialize encrypted state in constructor. **euint256 does NOT default to 0 like uint256 — uninitialized = broken handle.** |
| `Nox.fromExternal(handle, proof)` | Verify + import the manager's encrypted intent |
| `Nox.add(a, b)` / `Nox.sub(a, b)` | Aggregate intents into epoch `netDelta` (wrapping arithmetic) |
| `Nox.safeAdd` / `Nox.safeSub` + `Nox.select` | Production-grade path: handle over/underflow without leaking info |
| Comparisons (`Nox.gt`, etc. — see Comparisons ref) | Optional: encrypted sanity bounds on intents |
| `Nox.allowThis(handle)` | Let the **contract** reuse the handle next tx |
| `Nox.allow(handle, addr)` | Let manager/auditor decrypt off-chain |
| Public decryption (see "Manage Public Decryption" guide) | Mark `netDelta` publicly decryptable at epoch close → keeper reads it |

> **🔥 THE #1 NOX BUG (verbatim warning from their docs):** transient access is cleared at end-of-tx. **Every function that produces a new handle must call `Nox.allowThis(...)` (and `Nox.allow(...)` for off-chain readers) before returning**, or the handle is unusable in the next transaction. Constructor, `submitIntent`, everything. Make this a code-review checklist item.

### 4.2 JS side

```ts
import { createViemHandleClient } from '@iexec-nox/handle';
import { useWalletClient } from 'wagmi';

const { data: walletClient } = useWalletClient();
const handleClient = await createViemHandleClient(walletClient); // async!

// Manager submits an encrypted intent:
const { handle, handleProof } = await handleClient.encryptInput(
  deltaAmount,          // bigint, e.g. 250_000_000n
  'uint256',            // ⚠️ see type restriction below
  CLOAK_VAULT_ADDRESS   // handle is BOUND to this contract
);
// then: writeContract({ fn: 'submitIntent', args: [handle, handleProof] })

// Manager/auditor reads their own encrypted data (gasless, EIP-712 sig):
const { value } = await handleClient.decrypt(handle);

// Keeper reads the revealed net delta after closeEpoch():
const { value, decryptionProof } = await handleClient.publicDecrypt(netDeltaHandle);
```

**Hard constraints from the docs — design around these, don't discover them at 2am:**

1. **Encryptable types today: `bool`, `uint16`, `uint256`, `int16`, `int256` only.** Everything else says "coming soon." So: encode signed deltas as `int256`, or use uint256 with a direction flag. No `uint8` weights, no encrypted `address`.
2. **Handles are contract-bound.** `encryptInput(..., applicationContract)` locks the handle to that address. Encrypt against the deployed CloakVault address — a handle encrypted for contract A cannot be verified by contract B. (Redeploy vault ⇒ re-encrypt everything.)
3. **Handles are immutable** — every operation yields a NEW handle. Store the latest, re-grant permissions on it (see #1 bug above).
4. **Gateway rate limit** ≈ 100 concurrent `encryptInput` calls → 429s. Irrelevant at our scale, but batch with `Promise.allSettled` (docs' recommended pattern) if encrypting several values.
5. **`decrypt()` is gasless** (EIP-712 signature + ACL check) — nice UX detail to mention in the demo.

### 4.3 The multiplication question (de-risked)

Percent-weight strategies need `weight × totalAssets` on encrypted values. The Arithmetic reference page exists but we've only confirmed add/sub/safeAdd/safeSub/select from fetched pages.

**→ Day-1 task: check the Arithmetic ref for `Nox.mul` / test in the local Hardhat stack.**
**→ Fallback that removes the dependency entirely:** the manager's app computes target *deltas* client-side (it knows the weights and can read public totalAssets) and submits **encrypted absolute deltas**, not percentages. The contract then only needs `add`/`sub` — which are confirmed. Same privacy guarantee, simpler contract. **Build the fallback as the default; upgrade to on-chain weight math only if `mul` works and time permits.**

---

## 5. Contract Design

### 5.1 `CloakVault.sol` (the only contract that matters)

```
State
─────
IERC20  public immutable baseAsset;     // e.g. test USDC
IERC20  public immutable targetAsset;   // e.g. WETH (Sepolia canonical)
ISwapRouter public immutable router;    // canonical Uniswap V3 SwapRouter
address public manager;                 // strategist
address public keeper;                  // epoch executor
uint256 public epoch;                   // current epoch id
euint256 private netDelta;              // 🔒 encrypted aggregate intent (this epoch)
euint256 private strategyState;         // 🔒 optional: encrypted weights blob
mapping(address => bool) public auditors;

Public (LP-facing, fully transparent)
─────────────────────────────────────
deposit(uint256 assets) → mints shares        // standard, ERC-4626-style math
withdraw(uint256 shares) → returns assets
totalAssets() → base balance + target balance valued via pool price  // public NAV
sharePrice() → public

Confidential (manager-facing)
─────────────────────────────
submitIntent(externalEuint256 h, bytes proof) onlyManager {
    euint256 delta = Nox.fromExternal(h, proof);
    netDelta = Nox.add(netDelta, delta);        // encrypted aggregation
    Nox.allowThis(netDelta);                    // ← the bug-preventer
    Nox.allow(netDelta, manager);
}

Epoch lifecycle
───────────────
closeEpoch() onlyKeeper {
    // mark netDelta publicly decryptable (per "Manage Public Decryption" guide)
    // emit EpochClosed(epoch, netDeltaHandle)
}

executeRebalance(uint256 plainDelta, bool direction, ...) onlyKeeper {
    // keeper obtained plainDelta via publicDecrypt(netDeltaHandle)
    // verify against handle per public-decryption guide's on-chain pattern
    // swap via router.exactInputSingle(...)  ← REAL Uniswap, unmodified
    // reset: netDelta = Nox.toEuint256(0); allowThis; allow(manager);
    // epoch++
}

Compliance (the judge-pleaser)
──────────────────────────────
grantAuditor(address a)  → Nox.allow(strategyState, a)   // scoped, revocable
revokeAuditor(address a) → per "Manage Viewers" guide
```

**Design notes**

- **LP privacy is explicitly NOT the product.** Deposits/shares public = trust + composability (LP tokens are plain ERC-20, usable anywhere). Strategy privacy is the product. Say this out loud in the demo — it shows you understand the design space.
- MVP = **one trading pair** (base↔target). Multi-asset is a `mapping(assetId => euint256)` extension — mention it in README as roadmap, don't build it.
- Reset `netDelta` to a fresh encrypted zero every epoch, with fresh permissions.
- **Multiple sub-strategies** submitting into one epoch = the aggregation privacy story ("confidentiality by aggregation" — the docs' own framing). Demo this with 2–3 intents per epoch.

### 5.2 Deployment reality check (no-mock rule)

Uniswap V3 **is** canonically deployed on Sepolia, but liquidity is garbage. The professional move: **create our own real V3 pool** (test USDC / WETH), seed it with liquidity from the deployer wallet, and trade against it. This is 100% real infrastructure — real factory, real pool contract, real swaps, zero mocks — we're just also the LP. One deploy script does it:

```
scripts/
  00-deploy-testUSDC.ts      // plain ERC-20, mintable faucet function
  01-create-pool.ts          // factory.createPool + initialize price
  02-seed-liquidity.ts       // NonfungiblePositionManager.mint
  03-deploy-cloak.ts         // CloakVault
  04-wire-roles.ts           // set keeper, manager
```

Canonical Sepolia addresses (⚠️ **verify against docs.uniswap.org/contracts/v3/reference/deployments before hardcoding** — do not trust this table blindly):

| Contract | Address (commonly listed for Sepolia) |
|---|---|
| WETH9 | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |
| V3 Factory | `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` |
| SwapRouter02 | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` |
| NonfungiblePositionManager | `0x1238536071E1c677A632429e3655c799b22cDA52` |

---

## 6. Frontend — Pages & Flows

### 6.1 Route map

```
/                → Landing (marketing, the "wow")
/app             → LP dashboard: deposit / withdraw / NAV chart
/manage          → Manager console: strategy editor, submit encrypted intents
/audit           → Auditor view: decrypt what you're permitted to see
/api/keeper      → Cron endpoint (closeEpoch + executeRebalance)
```

### 6.2 Landing page (`/`) — sell it in one screen + three scrolls

1. **Hero** — `.grid-bg` texture, Syne 800 headline: *"Shows its returns. Never its hand."* Sub (Space Grotesk): "The first vault where performance is public and strategy is cryptographically private. Built on iExec Nox × Uniswap." Two CTAs: `.btn-accent` **Launch App** → `/app`, `.btn-outline` **Watch 60s Demo** (anchor to embedded video). Live stat strip below: TVL · NAV · Current Epoch · # encrypted intents this epoch (all real reads from Sepolia — a landing page with live on-chain data is an instant credibility win with judges).
2. **The problem** — three `.card-dark` cards: *Copy-traded* / *Front-run* / *Reverse-engineered*, each one sentence.
3. **How it works** — horizontal 4-step diagram with mono labels: `encrypt → aggregate (TEE) → reveal net only → swap on Uniswap`. Show a real 32-byte handle in an `.address-badge` as decoration.
4. **Trust section** — "Public where it builds trust, private where it protects alpha" split panel: left column (green badges) NAV, TVL, share price, epochs; right column (accent badges) weights, intents, timing, attribution. Plus auditor-access card: "Regulators get scoped, revocable read access via on-chain ACL."
5. **Footer** — GitHub, X post link, "Built for iExec WTF Hackathon" badge, Sepolia contract address in mono.

### 6.3 LP dashboard (`/app`)

- Header: wallet connect (RainbowKit themed to our palette), network guard → force Sepolia.
- NAV/share-price chart (recharts `AreaChart`, indigo gradient fill, sampled from on-chain events or a tiny indexed history in the API route).
- Deposit / Withdraw card (`.card-glow`): input (`.input-dark`), approve→deposit two-step with clear tx state via sonner toasts.
- Position card: your shares, value, % of vault.
- **Epoch ticker**: "Epoch 12 · 3 encrypted intents received · settles in 04:32" — this makes the invisible visible and is the demo's heartbeat.

### 6.4 Manager console (`/manage`) — the money screen for the demo video

- Gate by `manager` address.
- Strategy panel: set target allocation (slider, e.g. 60/40) — **client-side only**, never leaves the browser unencrypted.
- "Submit Encrypted Intent" flow with **staged visual states** (this is your demo's climax, invest UI effort here):
  1. `computing delta locally…`
  2. `encrypting via Nox Handle Gateway (TEE)…` → then render the returned handle in an `.address-badge` with a lock icon
  3. `submitting handle on-chain…` → tx link to Etherscan
  4. `✓ intent aggregated — plaintext never left your browser`
- Side panel: "What the chain sees" — show the actual Etherscan calldata (opaque bytes) next to "What you see" (your decrypted intent via `handleClient.decrypt()`). **This split-screen is the single most persuasive artifact in the entire project.**

### 6.5 Auditor view (`/audit`)

- Connect wallet → call `viewACL` / attempt `decrypt` on strategy handles.
- If permitted: render decrypted strategy with a green `COMPLIANCE ACCESS` badge. If not: locked state with `.badge-muted`.
- One-click role-play in the demo: manager grants auditor on-screen, auditor refreshes, data appears. Selective disclosure in 10 seconds of video.

### 6.6 State & data conventions

- Contract reads: wagmi `useReadContract` + `watch` where cheap; events via `useWatchContractEvent` for the epoch ticker.
- One module `lib/nox.ts` exporting a memoized `getHandleClient(walletClient)` — the factory is async; never construct it inside render.
- One module `lib/contracts.ts` with addresses + ABIs (typed via `as const` for viem inference).
- `.env.local`: `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_VAULT_ADDRESS`, `KEEPER_PRIVATE_KEY` (server-only, keeper route).

---

## 7. Design System Implementation

### 7.1 Fonts (layout.tsx)

```ts
import { Space_Grotesk, Syne, Space_Mono } from 'next/font/google';

const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const syne = Syne({ subsets: ['latin'], weight: ['700','800'], variable: '--font-display' });
const mono = Space_Mono({ subsets: ['latin'], weight: ['400','700'], variable: '--font-mono' });
// <body className={`${grotesk.variable} ${syne.variable} ${mono.variable}`}>
```

### 7.2 globals.css (the agreed theme, verbatim)

```css
:root {
  --bg: #09090b; --surface: #111113; --surface-2: #1a1a1f;
  --border: #27272a; --border-subtle: #18181b;
  --accent: #6366f1; --accent-hover: #4f46e5; --accent-glow: rgba(99,102,241,0.15);
  --text-primary: #fafafa; --text-secondary: #a1a1aa; --text-muted: #52525b;
  --green: #22c55e; --red: #ef4444;
}
body { background: var(--bg); color: var(--text-primary); font-family: var(--font-body), sans-serif; }
h1,h2,h3 { font-family: var(--font-display), sans-serif; }
code, .mono { font-family: var(--font-mono), monospace; }

.btn-accent { @apply rounded-xl px-5 py-2.5 font-medium transition-all duration-200;
  background: var(--accent); }
.btn-accent:hover { background: var(--accent-hover); box-shadow: 0 0 24px var(--accent-glow); }
.btn-outline { @apply rounded-xl px-5 py-2.5 border transition-colors duration-200;
  border-color: var(--border); }
.btn-ghost { @apply rounded-xl px-4 py-2 transition-colors duration-200; color: var(--text-secondary); }
.card-dark { @apply rounded-2xl border p-6; background: var(--surface); border-color: var(--border); }
.card-glow { @apply card-dark transition-shadow duration-300; }
.card-glow:hover { box-shadow: 0 0 32px var(--accent-glow); border-color: var(--accent); }
.input-dark { @apply rounded-xl border bg-transparent px-4 py-2.5 outline-none transition-colors;
  background: var(--surface-2); border-color: var(--border); }
.input-dark:focus { border-color: var(--accent); }
.badge-accent { @apply rounded-full px-2.5 py-0.5 text-xs; background: var(--accent-glow); color: var(--accent); }
.badge-green  { @apply rounded-full px-2.5 py-0.5 text-xs; background: rgba(34,197,94,.12); color: var(--green); }
.badge-muted  { @apply rounded-full px-2.5 py-0.5 text-xs; background: var(--surface-2); color: var(--text-muted); }
.address-badge { @apply rounded-lg px-2 py-1 text-xs; font-family: var(--font-mono); background: var(--surface-2); border: 1px solid var(--border-subtle); }
.error-banner { @apply rounded-xl border px-4 py-3 text-sm; border-color: var(--red); background: rgba(239,68,68,.08); color: var(--red); }
.grid-bg { background-image:
  linear-gradient(var(--accent-glow) 1px, transparent 1px),
  linear-gradient(90deg, var(--accent-glow) 1px, transparent 1px);
  background-size: 48px 48px; }
```

RainbowKit: use `darkTheme({ accentColor: '#6366f1', borderRadius: 'large' })` so the modal doesn't break the aesthetic.

---

## 8. Repo Structure (monorepo, pnpm workspaces)

```
cloak/
├── contracts/                  # Hardhat 3 project (clone nox-hardhat-starter)
│   ├── contracts/CloakVault.sol
│   ├── contracts/TestUSDC.sol
│   ├── scripts/00..04-*.ts
│   ├── test/CloakVault.test.ts        # uses `nox` helper from the plugin
│   └── hardhat.config.ts              # solidity 0.8.35, noxPlugin, toolbox-viem
├── web/                        # Next.js 15 app
│   ├── app/{page,app,manage,audit}/
│   ├── app/api/keeper/route.ts
│   ├── lib/{nox,contracts,format}.ts
│   ├── components/
│   └── globals.css
├── feedback.md                 # ⭐⭐ judged deliverable — WRITE AS YOU GO
├── README.md                   # install, deploy, usage, architecture diagram
└── demo/script.md              # 4-min video shot list
```

`hardhat.config.ts` skeleton (from the official guide):

```ts
import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem';
import { defineConfig } from 'hardhat/config';
import noxPlugin from '@iexec-nox/nox-hardhat-plugin';

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, noxPlugin],
  solidity: '0.8.35',
  networks: {
    default: { type: 'edr-simulated', chainType: 'op' },   // local Nox stack
    sepolia: { type: 'http', url: process.env.SEPOLIA_RPC!, accounts: [process.env.PK!] },
  },
});
```

Local test pattern (real, from docs):

```ts
import { nox } from '@iexec-nox/nox-hardhat-plugin';
const { viem } = await nox.connect();
const vault = await viem.deployContract('CloakVault', [...]);
const { handle, handleProof } = await nox.encryptInput(500n, 'uint256', vault.address);
await vault.write.submitIntent([handle, handleProof]);
const { value } = await nox.publicDecrypt(netDeltaHandle);  // after closeEpoch
```

---

## 9. Build Order (aggressive but honest)

| Phase | Deliverable | Exit criterion |
|---|---|---|
| **0 · Spike (day 1)** | Clone `nox-hardhat-starter`, Docker up, run their tests. Encrypt→submit→decrypt a value against a toy contract on **Sepolia**, not just local. Check `Nox.mul` availability (→ §4.3 decision). | A handle round-trips on Sepolia. If this fails, ask in the iExec Discord immediately — it's a judged hackathon, support is the point. |
| **1 · Vault core** | CloakVault: deposit/withdraw/shares + `submitIntent` with encrypted aggregation. Local tests green. | `nox.decrypt(netDelta)` returns the sum of intents. |
| **2 · Settlement** | Test USDC + own V3 pool on Sepolia, seeded. `closeEpoch` public-decryption flow + `executeRebalance` swap. | Full epoch settles on Sepolia; swap visible on Etherscan. **This is the risky phase — the public-decryption on-chain verification pattern is the least-documented piece. Budget slack here.** |
| **3 · Frontend** | All four routes, wallet flows, encrypted-intent UX with staged states, split-screen "chain vs manager" view. | A stranger can deposit and the manager flow feels magical. |
| **4 · Polish** | Landing page, NAV chart, auditor grant/revoke demo, `feedback.md`, README, keeper cron. | — |
| **5 · Ship** | Deploy Vercel, record 4-min video, X post tagging `@iEx_ec` (description + video + repo link), submit on DoraHacks. | — |

**Team split (if 3+):** ① contracts+keeper ② frontend ③ design/video/docs/feedback.md. Phases 1 and 3 run in parallel against a stubbed ABI.

---

## 10. Bug Prevention Checklist (every item traced to official docs)

- [ ] `Nox.allowThis` + `Nox.allow` after **every** handle-producing statement (docs' #1 bug)
- [ ] Every `euint256` initialized with `Nox.toEuint256(0)` — never assume default
- [ ] Encrypt only `bool | uint16 | uint256 | int16 | int256`; deltas as `int256` or uint+flag
- [ ] `encryptInput`'s third arg = **deployed vault address**; re-encrypt after any redeploy
- [ ] Handles are immutable — always store and re-permission the newest handle
- [ ] Node 22+, Docker running, Hardhat **3** (v2 configs will not load the plugin)
- [ ] `createViemHandleClient` is async — await it, memoize it, keep it out of render
- [ ] `Promise.allSettled` for multi-encrypt; stay under ~100 concurrent (Gateway 429s)
- [ ] Sepolia only — SDK examples support `sepolia` from `viem/chains`; hackathon requires it
- [ ] Verify Uniswap Sepolia addresses against official deployments page before hardcoding
- [ ] Own RPC key for the demo; public endpoints rate-limit at the worst moment
- [ ] `feedback.md` updated at the end of every session, not written retroactively (⭐⭐)
- [ ] README states exactly what pre-existed (Uniswap, Nox, OZ) vs. what we built (submission rule)

---

## 11. 4-Minute Demo Script (draft)

| Time | Beat |
|---|---|
| 0:00–0:30 | Problem: screen-record a real public vault on Etherscan — "every weight, every rebalance, public. This is why funds don't run strategies on-chain." |
| 0:30–1:00 | Cloak landing page. One-liner. Live TVL/NAV pulled from Sepolia. |
| 1:00–1:45 | LP flow: deposit, get shares, watch NAV. "Everything an LP needs is public." |
| 1:45–3:00 | **The core:** manager console. Set allocation → encrypt (show the handle appear) → submit → **split-screen: Etherscan calldata (opaque bytes) vs manager's decrypted view.** Submit a second intent. Epoch closes → keeper reveals only the net → real Uniswap swap on Etherscan. "Two intents went in. One number came out. Attribution is gone." |
| 3:00–3:30 | Auditor: locked view → manager grants ACL access → decrypted strategy appears with compliance badge. "Selective disclosure, on-chain, revocable." |
| 3:30–4:00 | Architecture slide (this doc's diagram) + roadmap (multi-asset, multi-vault netting) + "unmodified Uniswap, unmodified wallets, built on Nox." |

---

## 12. Post-Hackathon Roadmap (README material — shows "real product" intent)

1. Multi-asset strategies (`mapping` of encrypted weights, per-asset net orders)
2. Cross-vault netting — multiple Cloak vaults batch into one settlement (privacy compounds with adoption, per the Nox thesis)
3. ERC-7984 confidential share class for LPs who also want position privacy
4. TEE-attested NAV feed as a standalone oracle product
5. Randomized settlement timing within an epoch window (kill timing inference)

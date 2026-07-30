# Cloak Frontend

Next.js 15 (App Router) in [`web/`](../web). wagmi v2 + viem v2 + RainbowKit for wallets, `@iexec-nox/handle` for encryption, Tailwind 3 with a custom dark theme.

## Routes

| Route | What it does |
|---|---|
| `/` | Landing page with a live stat strip (TVL, share price, epoch, intent count) read straight from Sepolia. |
| `/app` | LP dashboard. Approve + deposit tUSDC, withdraw shares, see your position and the epoch ticker. |
| `/manage` | Manager console. Enter a signed delta, watch it encrypt in the browser via the Nox Handle Gateway, submit the handle on-chain, and compare "what the chain sees" (opaque bytes) with your gasless decrypted view. |
| `/audit` | Auditor view. Attempts to decrypt the strategy handle; succeeds only if the vault owner granted your wallet via the on-chain ACL. |
| `/api/keeper` | Cron endpoint. Closes the epoch, publicly decrypts the net delta, calls `executeRebalance`. Scheduled daily via `vercel.json` (Vercel Hobby allows one run per day); trigger it manually with curl for on-demand settlement. |

## Key modules

- `lib/contracts.ts` — vault address + ABIs typed `as const` for viem inference.
- `lib/nox.ts` — memoized async `getHandleClient(walletClient)`; never constructed in render.
- `lib/format.ts` — USDC formatting, hash shortening, Etherscan links.
- `app/providers.tsx` — wagmi config (Sepolia only), RainbowKit dark theme, react-query, toasts.

## Run locally

```bash
pnpm install                       # from repo root
cp web/.env.example web/.env.local
pnpm web                           # http://localhost:3000
```

`.env.local` values:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Sepolia RPC (Alchemy/Infura key recommended) |
| `NEXT_PUBLIC_VAULT_ADDRESS` | From `contracts/deployments/sepolia.json` after deploy |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect Cloud project id |
| `KEEPER_PRIVATE_KEY` | Server-only. Wallet with the keeper role + Sepolia ETH |
| `CRON_SECRET` | Optional bearer token protecting `/api/keeper` |

## Deploy to Vercel

```bash
cd web && npx vercel --prod
```

Set the same env vars in the Vercel project settings. The cron in `vercel.json` starts hitting `/api/keeper` automatically; set `CRON_SECRET` so nobody else can trigger settlement.

## Manual keeper run

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/keeper
```

Returns the epoch, the revealed net delta, and the settlement tx hash.

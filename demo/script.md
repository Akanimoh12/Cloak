# Cloak — 2-minute demo video script

Everything below is live on Sepolia — no mocks, no cuts that hide waiting. Pre-open four tabs: the app, Etherscan on the vault address, MetaMask with the manager wallet, and a second browser profile with the auditor wallet.

## 0:00–0:15 — The hook

Landing page, slow scroll.

> "This is Cloak. TVL, share price, epoch — all of this is live from Sepolia. What you will never see on this chain is the strategy. Let me show you why that's hard."

## 0:15–0:35 — LP deposit

Go to **Vault**, connect, deposit 1,000 tUSDC (approve + deposit, show both toasts).

> "As an LP I deposit like in any vault. I get ERC-20 shares, I can verify NAV on-chain. Nothing about my experience is private — that's the point."

## 0:35–1:15 — The core: encrypted intents

Go to **Manage**. Type `500`, hit **Encrypt & submit**. Let the staged states play on screen: `computing delta locally… → encrypting via Nox Handle Gateway (TEE)… → submitting handle on-chain… → ✓ intent aggregated`.

> "I'm the strategist. I want to buy 500 more of the target. Watch — the number is encrypted in my browser, and what goes on-chain is this handle."

Click the Etherscan tx link, point at the calldata.

> "This is all the chain ever sees. Opaque bytes."

Back in the app, submit a second intent: `-200`. Then click **Decrypt net delta** in the split panel.

> "Second intent: sell 200. Only I can decrypt the running total — plus 300 — gaslessly, because the contract gave my address ACL access. Nobody else can."

## 1:15–1:40 — Settlement

Trigger the keeper (curl the `/api/keeper` endpoint on camera or run it pre-recorded). Show the JSON response, then the Uniswap swap on Etherscan.

> "At epoch close the keeper reveals exactly one number: the net, plus 300. It proves that decryption on-chain — it can't lie — and settles it as a single swap on real, unmodified Uniswap. Two intents went in. One number came out. Attribution is mathematically gone."

## 1:40–2:00 — Compliance + close

Switch to the auditor profile on **Audit**: locked state. Grant the auditor from the owner wallet, refresh, decrypt — green COMPLIANCE ACCESS badge appears.

> "And when a regulator needs to look? Scoped, revocable read access, on-chain. Public where it builds trust, private where it protects alpha. Cloak — built on iExec Nox and Uniswap for the WTF Hackathon."

End card: repo link + live app URL.

## Recording checklist

- [ ] Fresh epoch with 0 intents before recording
- [ ] Own RPC key (public endpoints rate-limit mid-demo)
- [ ] Manager + auditor wallets pre-funded and pre-connected
- [ ] Keeper cron paused; trigger manually for timing
- [ ] Etherscan tabs pre-loaded on vault + pool

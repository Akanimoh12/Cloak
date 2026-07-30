'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { parseUnits } from 'viem';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Nav } from '@/components/Nav';
import { VAULT_ADDRESS, cloakVaultAbi, erc20Abi } from '@/lib/contracts';
import { formatUsdc } from '@/lib/format';

export default function VaultPage() {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');

  const { data: tvl, refetch: refetchTvl } = useReadContract({ address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'totalAssets' });
  const { data: shares, refetch: refetchShares } = useReadContract({
    address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });
  const { data: supply } = useReadContract({ address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'totalSupply' });
  const { data: baseAsset } = useReadContract({ address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'baseAsset' });
  const { data: epoch } = useReadContract({ address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'epoch' });
  const { data: intents } = useReadContract({
    address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'epochIntentCount',
    args: epoch !== undefined ? [epoch] : undefined,
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  useWaitForTransactionReceipt({ hash: pendingHash });

  async function deposit() {
    if (!baseAsset) return;
    try {
      const assets = parseUnits(amount, 6);
      const approveHash = await writeContractAsync({
        address: baseAsset, abi: erc20Abi, functionName: 'approve',
        args: [VAULT_ADDRESS, assets],
      });
      setPendingHash(approveHash);
      toast.info('Approval submitted…');
      const depositHash = await writeContractAsync({
        address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'deposit',
        args: [assets],
      });
      setPendingHash(depositHash);
      toast.success('Deposit submitted');
      refetchTvl();
      refetchShares();
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 120) : 'Transaction failed');
    }
  }

  async function withdraw() {
    try {
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'withdraw',
        args: [parseUnits(amount, 6)],
      });
      setPendingHash(hash);
      toast.success('Withdrawal submitted');
      refetchTvl();
      refetchShares();
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 120) : 'Transaction failed');
    }
  }

  const pct = shares && supply && supply > 0n ? Number((shares * 10000n) / supply) / 100 : 0;

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mono mb-8 flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span className="badge-accent">Epoch {epoch?.toString() ?? '—'}</span>
          <span>{intents?.toString() ?? '0'} encrypted intents received</span>
          <span style={{ color: 'var(--text-muted)' }}>· settles at next keeper run</span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="card-glow">
            <h2 className="mb-4 text-xl">Deposit / Withdraw</h2>
            <input
              className="input-dark w-full"
              placeholder="Amount (tUSDC)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
            <div className="mt-4 flex gap-3">
              <button className="btn-accent flex-1" onClick={deposit} disabled={isPending || !address || !amount}>
                Deposit
              </button>
              <button className="btn-outline flex-1" onClick={withdraw} disabled={isPending || !address || !amount}>
                Withdraw
              </button>
            </div>
          </div>

          <div className="card-dark">
            <h2 className="mb-4 text-xl">Your position</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Vault TVL" value={`$${formatUsdc(tvl)}`} />
              <Row label="Your shares" value={formatUsdc(shares)} />
              <Row label="Share of vault" value={`${pct}%`} />
            </dl>
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt style={{ color: 'var(--text-secondary)' }}>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

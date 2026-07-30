'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAccount, useReadContract, useWalletClient } from 'wagmi';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Nav } from '@/components/Nav';
import { VAULT_ADDRESS, cloakVaultAbi } from '@/lib/contracts';
import { getHandleClient } from '@/lib/nox';

export default function AuditPage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [decrypted, setDecrypted] = useState<string>();
  const [denied, setDenied] = useState(false);

  const { data: isAuditor } = useReadContract({
    address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'isAuditor',
    args: address ? [address] : undefined,
  });
  const { data: strategyHandle } = useReadContract({
    address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'strategyStateHandle',
  });

  async function tryDecrypt() {
    if (!walletClient || !strategyHandle) return;
    setDenied(false);
    try {
      const client = await getHandleClient(walletClient);
      const { value } = await client.decrypt(strategyHandle);
      setDecrypted(value.toString());
    } catch {
      setDenied(true);
      toast.error('ACL check failed — no viewer access for this wallet');
    }
  }

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="card-dark text-center">
          {decrypted ? (
            <>
              <span className="badge-green inline-flex items-center gap-1">
                <ShieldCheck size={12} /> COMPLIANCE ACCESS
              </span>
              <p className="mono mt-6 text-lg">{decrypted}</p>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                decrypted strategy state (raw encoded blob)
              </p>
            </>
          ) : (
            <>
              <LockKeyhole size={32} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
              <h2 className="mt-4 text-xl">Strategy is encrypted</h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {isAuditor
                  ? 'Your wallet is registered as an auditor. Decrypt to view.'
                  : 'Only ACL-approved auditors can view the strategy. Access is scoped and revocable.'}
              </p>
              {denied && <div className="error-banner mt-4">Access denied by on-chain ACL.</div>}
              <button className="btn-accent mt-6" onClick={tryDecrypt} disabled={!address}>
                Attempt decrypt
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

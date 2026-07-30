'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { parseUnits } from 'viem';
import { useAccount, useReadContract, useWalletClient, useWriteContract } from 'wagmi';
import { Lock, ShieldCheck } from 'lucide-react';
import { Nav } from '@/components/Nav';
import { VAULT_ADDRESS, cloakVaultAbi } from '@/lib/contracts';
import { getHandleClient } from '@/lib/nox';
import { etherscanTx, shortHash } from '@/lib/format';

type Stage = 'idle' | 'computing' | 'encrypting' | 'submitting' | 'done';

const STAGE_LABEL: Record<Exclude<Stage, 'idle'>, string> = {
  computing: 'computing delta locally…',
  encrypting: 'encrypting via Nox Handle Gateway (TEE)…',
  submitting: 'submitting handle on-chain…',
  done: '✓ intent aggregated — plaintext never left your browser',
};

export default function ManagePage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const { data: manager } = useReadContract({ address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'manager' });
  const isManager = !!address && !!manager && address.toLowerCase() === manager.toLowerCase();

  const [delta, setDelta] = useState(''); // signed tUSDC delta, e.g. "250" or "-100"
  const [stage, setStage] = useState<Stage>('idle');
  const [handleHex, setHandleHex] = useState<string>();
  const [txHash, setTxHash] = useState<string>();
  const [decryptedView, setDecryptedView] = useState<string>();

  async function submitIntent() {
    if (!walletClient) return;
    try {
      setStage('computing');
      // positive buys the target asset, negative sells it back to base
      const signedDelta = BigInt(parseUnits(delta, 6));

      setStage('encrypting');
      const client = await getHandleClient(walletClient);
      const { handle, handleProof } = await client.encryptInput(signedDelta, 'int256', VAULT_ADDRESS);
      setHandleHex(handle as string);

      setStage('submitting');
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: cloakVaultAbi,
        functionName: 'submitIntent',
        args: [handle as `0x${string}`, handleProof as `0x${string}`],
      });
      setTxHash(hash);
      setStage('done');
      toast.success('Encrypted intent aggregated on-chain');
    } catch (err) {
      setStage('idle');
      toast.error(err instanceof Error ? err.message.slice(0, 120) : 'Intent failed');
    }
  }

  async function decryptNetDelta() {
    if (!walletClient) return;
    try {
      const client = await getHandleClient(walletClient);
      const netHandle = await fetchNetDeltaHandle();
      const { value } = await client.decrypt(netHandle);
      setDecryptedView(value.toString());
    } catch (err) {
      toast.error('Decrypt failed — are you the manager?');
    }
  }

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-12">
        {!isManager && (
          <div className="error-banner mb-8">
            Connected wallet is not the vault manager — read-only view.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="card-glow">
            <h2 className="mb-1 text-xl">Submit encrypted intent</h2>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Signed delta in tUSDC. Positive buys the target, negative sells.
            </p>
            <input
              className="input-dark w-full"
              placeholder="e.g. 250 or -100"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
            <button
              className="btn-accent mt-4 w-full"
              onClick={submitIntent}
              disabled={!isManager || !delta || (stage !== 'idle' && stage !== 'done')}
            >
              Encrypt & submit
            </button>

            {stage !== 'idle' && (
              <div className="mono mt-6 space-y-2 text-xs">
                {(Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[]).map((s) => (
                  <div
                    key={s}
                    style={{
                      color: stage === s ? 'var(--accent)' : stageReached(stage, s) ? 'var(--green)' : 'var(--text-muted)',
                    }}
                  >
                    {STAGE_LABEL[s]}
                  </div>
                ))}
                {handleHex && (
                  <div className="address-badge mt-3 flex items-center gap-2">
                    <Lock size={12} style={{ color: 'var(--accent)' }} />
                    {shortHash(handleHex, 10)}
                  </div>
                )}
                {txHash && (
                  <a href={etherscanTx(txHash)} target="_blank" className="block underline" style={{ color: 'var(--accent)' }}>
                    view tx on Etherscan
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="card-dark">
            <h2 className="mb-4 text-xl">Chain vs. you</h2>
            <div className="space-y-4 text-sm">
              <div>
                <span className="badge-muted">what the chain sees</span>
                <p className="mono mt-2 break-all text-xs" style={{ color: 'var(--text-muted)' }}>
                  {handleHex ?? 'opaque 32-byte handle + proof — submit an intent to see it'}
                </p>
              </div>
              <div>
                <span className="badge-accent">what you see</span>
                <p className="mono mt-2 text-xs">
                  {decryptedView !== undefined ? `net delta: ${decryptedView} (raw base units)` : '—'}
                </p>
                <button className="btn-outline mt-3 text-sm" onClick={decryptNetDelta} disabled={!isManager}>
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={14} /> Decrypt net delta (gasless)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function stageReached(current: Stage, target: Stage): boolean {
  const order: Stage[] = ['idle', 'computing', 'encrypting', 'submitting', 'done'];
  return order.indexOf(current) > order.indexOf(target);
}

async function fetchNetDeltaHandle(): Promise<`0x${string}`> {
  const { createPublicClient, http } = await import('viem');
  const { sepolia } = await import('viem/chains');
  const client = createPublicClient({ chain: sepolia, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });
  return client.readContract({ address: VAULT_ADDRESS, abi: cloakVaultAbi, functionName: 'netDeltaHandle' });
}

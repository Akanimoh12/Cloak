import { NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createViemHandleClient } from '@iexec-nox/handle';
import { VAULT_ADDRESS, cloakVaultAbi } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// keeper cron: close the epoch, publicly decrypt the net delta, settle on Uniswap
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pk = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) return NextResponse.json({ error: 'KEEPER_PRIVATE_KEY not set' }, { status: 500 });

  const account = privateKeyToAccount(pk);
  const transport = http(process.env.NEXT_PUBLIC_RPC_URL);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });

  const vault = { address: VAULT_ADDRESS, abi: cloakVaultAbi } as const;
  const [epoch, epochClosed] = await Promise.all([
    publicClient.readContract({ ...vault, functionName: 'epoch' }),
    publicClient.readContract({ ...vault, functionName: 'epochClosed' }),
  ]);
  const intents = await publicClient.readContract({
    ...vault, functionName: 'epochIntentCount', args: [epoch],
  });

  if (!epochClosed && intents === 0n) {
    return NextResponse.json({ epoch: epoch.toString(), action: 'noop, no intents' });
  }

  if (!epochClosed) {
    const hash = await walletClient.writeContract({ ...vault, functionName: 'closeEpoch' });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  const netHandle = await publicClient.readContract({ ...vault, functionName: 'netDeltaHandle' });
  const handleClient = await createViemHandleClient(walletClient);
  const { value, decryptionProof } = await handleClient.publicDecrypt(netHandle);

  const hash = await walletClient.writeContract({
    ...vault,
    functionName: 'executeRebalance',
    args: [decryptionProof as `0x${string}`, 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return NextResponse.json({
    epoch: epoch.toString(),
    netDelta: value?.toString(),
    settlementTx: hash,
  });
}

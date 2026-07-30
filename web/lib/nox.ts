import { createViemHandleClient, type HandleClient } from '@iexec-nox/handle';
import type { WalletClient } from 'viem';

// memoized per account, the factory is async and must stay out of render
let cached: { key: string; client: Promise<HandleClient> } | undefined;

export function getHandleClient(walletClient: WalletClient): Promise<HandleClient> {
  const key = walletClient.account?.address ?? 'anonymous';
  if (!cached || cached.key !== key) {
    cached = { key, client: createViemHandleClient(walletClient) };
  }
  return cached.client;
}

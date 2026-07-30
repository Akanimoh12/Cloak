import { formatUnits } from 'viem';

export function formatUsdc(value: bigint | undefined, digits = 2): string {
  if (value === undefined) return '—';
  return Number(formatUnits(value, 6)).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

export function shortHash(hash: string, chars = 6): string {
  if (!hash || hash.length < 2 * chars + 2) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function etherscanTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export function etherscanAddress(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}

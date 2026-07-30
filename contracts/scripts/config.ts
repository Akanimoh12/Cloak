import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// canonical Uniswap V3 deployments on ETH Sepolia
export const UNISWAP_SEPOLIA = {
  WETH9: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  V3_FACTORY: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
  SWAP_ROUTER_02: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
  POSITION_MANAGER: '0x1238536071E1c677A632429e3655c799b22cDA52',
} as const;

export const POOL_FEE = 3000;

const deploymentsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'deployments',
  'sepolia.json',
);

export interface Deployments {
  testUSDC?: `0x${string}`;
  pool?: `0x${string}`;
  liquidityTokenId?: string;
  cloakVault?: `0x${string}`;
  manager?: `0x${string}`;
  keeper?: `0x${string}`;
}

export function readDeployments(): Deployments {
  if (!existsSync(deploymentsPath)) return {};
  return JSON.parse(readFileSync(deploymentsPath, 'utf8'));
}

export function saveDeployments(update: Partial<Deployments>): Deployments {
  const next = { ...readDeployments(), ...update };
  mkdirSync(dirname(deploymentsPath), { recursive: true });
  writeFileSync(deploymentsPath, JSON.stringify(next, null, 2) + '\n');
  console.log('deployments/sepolia.json updated:', update);
  return next;
}

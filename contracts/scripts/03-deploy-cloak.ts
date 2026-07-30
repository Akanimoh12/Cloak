import { network } from 'hardhat';
import { POOL_FEE, UNISWAP_SEPOLIA, readDeployments, saveDeployments } from './config.js';

const { viem } = await network.connect();

const { testUSDC, pool } = readDeployments();
if (!testUSDC || !pool) throw new Error('Run scripts 00-02 first');

const [wallet] = await viem.getWalletClients();
const deployer = wallet.account.address;

const vault = await viem.deployContract('CloakVault', [
  testUSDC,
  UNISWAP_SEPOLIA.WETH9,
  UNISWAP_SEPOLIA.SWAP_ROUTER_02,
  pool,
  POOL_FEE,
  deployer,
  deployer,
]);

console.log('CloakVault deployed at', vault.address);
saveDeployments({ cloakVault: vault.address, manager: deployer, keeper: deployer });
console.log('Set NEXT_PUBLIC_VAULT_ADDRESS in web/.env.local to', vault.address);

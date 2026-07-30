import { network } from 'hardhat';
import { saveDeployments } from './config.js';

const { viem } = await network.connect();

const usdc = await viem.deployContract('TestUSDC', []);
console.log('TestUSDC deployed at', usdc.address);

const [wallet] = await viem.getWalletClients();
await usdc.write.mint([wallet.account.address, 1_000_000_000_000n]);
console.log('Minted 1,000,000 tUSDC to deployer');

saveDeployments({ testUSDC: usdc.address });

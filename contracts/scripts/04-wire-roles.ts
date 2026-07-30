import { network } from 'hardhat';
import { readDeployments, saveDeployments } from './config.js';

const { viem } = await network.connect();

const { cloakVault } = readDeployments();
if (!cloakVault) throw new Error('Run 03-deploy-cloak first');

const manager = process.env.MANAGER as `0x${string}` | undefined;
const keeper = process.env.KEEPER as `0x${string}` | undefined;
if (!manager || !keeper) throw new Error('Set MANAGER and KEEPER env vars');

const vault = await viem.getContractAt('CloakVault', cloakVault);
await vault.write.setRoles([manager, keeper]);

console.log('Roles wired, manager:', manager, 'keeper:', keeper);
saveDeployments({ manager, keeper });

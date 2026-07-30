import { createPublicClient, createWalletClient, http, formatUnits, parseAbi, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createViemHandleClient } from '@iexec-nox/handle';
import { readDeployments } from './config.ts';

// full live epoch on Sepolia: deposit, two encrypted intents, close, settle on Uniswap

const rpc = process.env.SEPOLIA_RPC;
const pk = process.env.PK as `0x${string}` | undefined;
if (!rpc || !pk) throw new Error('Set SEPOLIA_RPC and PK');

const { testUSDC, cloakVault } = readDeployments();
if (!testUSDC || !cloakVault) throw new Error('Run scripts 00-03 first');

const account = privateKeyToAccount(pk);
const transport = http(rpc);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });

const vaultAbi = parseAbi([
  'function deposit(uint256 assets) returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function sharePrice() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function epoch() view returns (uint256)',
  'function epochIntentCount(uint256) view returns (uint256)',
  'function submitIntent(bytes32 handle, bytes handleProof)',
  'function netDeltaHandle() view returns (bytes32)',
  'function closeEpoch()',
  'function executeRebalance(bytes decryptionProof, uint256 amountOutMinimum)',
]);
const erc20Abi = parseAbi([
  'function approve(address, uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

async function write(label: string, args: Parameters<typeof walletClient.writeContract>[0]) {
  const hash = await walletClient.writeContract(args);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${label}: ${receipt.status} ${hash}`);
  return receipt;
}

const depositAmount = parseUnits('1000', 6);
await write('approve tUSDC', {
  address: testUSDC, abi: erc20Abi, functionName: 'approve',
  args: [cloakVault, depositAmount], account, chain: sepolia,
});
await write('deposit 1000 tUSDC', {
  address: cloakVault, abi: vaultAbi, functionName: 'deposit',
  args: [depositAmount], account, chain: sepolia,
});
console.log('totalAssets:', formatUnits(await publicClient.readContract({
  address: cloakVault, abi: vaultAbi, functionName: 'totalAssets' }), 6), 'tUSDC');

const handleClient = await createViemHandleClient(walletClient);

for (const delta of [500_000_000n, -200_000_000n]) {
  console.log(`encrypting intent ${formatUnits(delta, 6)} tUSDC via Nox gateway...`);
  const { handle, handleProof } = await handleClient.encryptInput(delta, 'int256', cloakVault);
  console.log('  handle:', handle);
  await write(`submitIntent ${formatUnits(delta, 6)}`, {
    address: cloakVault, abi: vaultAbi, functionName: 'submitIntent',
    args: [handle as `0x${string}`, handleProof as `0x${string}`], account, chain: sepolia,
  });
}

const epoch = await publicClient.readContract({ address: cloakVault, abi: vaultAbi, functionName: 'epoch' });
const intents = await publicClient.readContract({ address: cloakVault, abi: vaultAbi, functionName: 'epochIntentCount', args: [epoch] });
console.log(`epoch ${epoch}: ${intents} encrypted intents aggregated`);

const netHandle = await publicClient.readContract({ address: cloakVault, abi: vaultAbi, functionName: 'netDeltaHandle' });
const { value: managerView } = await handleClient.decrypt(netHandle);
console.log('manager private decrypt of net delta:', formatUnits(managerView as bigint, 6), 'tUSDC');

await write('closeEpoch', {
  address: cloakVault, abi: vaultAbi, functionName: 'closeEpoch', account, chain: sepolia,
});

const { value: revealed, decryptionProof } = await handleClient.publicDecrypt(netHandle);
console.log('publicly revealed net delta:', formatUnits(revealed as bigint, 6), 'tUSDC');

await write('executeRebalance (Uniswap swap)', {
  address: cloakVault, abi: vaultAbi, functionName: 'executeRebalance',
  args: [decryptionProof as `0x${string}`, 0n], account, chain: sepolia,
});

const [newEpoch, totalAssets, sharePrice] = await Promise.all([
  publicClient.readContract({ address: cloakVault, abi: vaultAbi, functionName: 'epoch' }),
  publicClient.readContract({ address: cloakVault, abi: vaultAbi, functionName: 'totalAssets' }),
  publicClient.readContract({ address: cloakVault, abi: vaultAbi, functionName: 'sharePrice' }),
]);
console.log(`settled. now in epoch ${newEpoch}`);
console.log('vault NAV:', formatUnits(totalAssets, 6), 'tUSDC | share price:', formatUnits(sharePrice, 6));

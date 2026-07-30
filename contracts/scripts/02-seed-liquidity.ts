import { network } from 'hardhat';
import { parseAbi, parseEther } from 'viem';
import { POOL_FEE, UNISWAP_SEPOLIA, readDeployments, saveDeployments } from './config.js';

const { viem } = await network.connect();

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);
const wethAbi = parseAbi(['function deposit() payable']);
const npmAbi = parseAbi([
  'struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }',
  'function mint(MintParams params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
]);
const poolAbi = parseAbi(['function token0() view returns (address)']);

const { testUSDC, pool } = readDeployments();
if (!testUSDC || !pool) throw new Error('Run scripts 00 and 01 first');

const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();
const me = wallet.account.address;
const weth = UNISWAP_SEPOLIA.WETH9 as `0x${string}`;
const npm = UNISWAP_SEPOLIA.POSITION_MANAGER as `0x${string}`;

const usdcAmount = 3_000_000_000n;
const wethAmount = parseEther('0.03');

const wethBal = await publicClient.readContract({ address: weth, abi: erc20Abi, functionName: 'balanceOf', args: [me] });
if (wethBal < wethAmount) {
  const hash = await wallet.writeContract({ address: weth, abi: wethAbi, functionName: 'deposit', value: wethAmount - wethBal });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Wrapped ETH to WETH');
}

for (const [token, amount] of [[testUSDC, usdcAmount], [weth, wethAmount]] as const) {
  const hash = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [npm, amount] });
  await publicClient.waitForTransactionReceipt({ hash });
}
console.log('Approvals done');

const token0 = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: 'token0' });
const usdcIsToken0 = token0.toLowerCase() === testUSDC.toLowerCase();
const [amount0Desired, amount1Desired] = usdcIsToken0 ? [usdcAmount, wethAmount] : [wethAmount, usdcAmount];

// full range for the 0.3% fee tier
const tickLower = -887220;
const tickUpper = 887220;

const hash = await wallet.writeContract({
  address: npm,
  abi: npmAbi,
  functionName: 'mint',
  args: [{
    token0: usdcIsToken0 ? testUSDC : weth,
    token1: usdcIsToken0 ? weth : testUSDC,
    fee: POOL_FEE,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: me,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
  }],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log('Liquidity minted, tx', receipt.transactionHash);

saveDeployments({ liquidityTokenId: 'see-tx-' + receipt.transactionHash });

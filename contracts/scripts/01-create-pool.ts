import { network } from 'hardhat';
import { parseAbi, zeroAddress } from 'viem';
import { POOL_FEE, UNISWAP_SEPOLIA, readDeployments, saveDeployments } from './config.js';

const { viem } = await network.connect();

const factoryAbi = parseAbi([
  'function createPool(address tokenA, address tokenB, uint24 fee) returns (address pool)',
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
]);
const poolAbi = parseAbi([
  'function initialize(uint160 sqrtPriceX96)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function token0() view returns (address)',
]);

const { testUSDC } = readDeployments();
if (!testUSDC) throw new Error('Run 00-deploy-testUSDC first');

const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();
const factory = UNISWAP_SEPOLIA.V3_FACTORY as `0x${string}`;
const weth = UNISWAP_SEPOLIA.WETH9 as `0x${string}`;

let pool = await publicClient.readContract({
  address: factory,
  abi: factoryAbi,
  functionName: 'getPool',
  args: [testUSDC, weth, POOL_FEE],
});

if (pool === zeroAddress) {
  const hash = await wallet.writeContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'createPool',
    args: [testUSDC, weth, POOL_FEE],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  pool = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'getPool',
    args: [testUSDC, weth, POOL_FEE],
  });
}
console.log('Pool at', pool);

const [sqrtPriceX96] = await publicClient.readContract({
  address: pool,
  abi: poolAbi,
  functionName: 'slot0',
});

if (sqrtPriceX96 === 0n) {
  const token0 = await publicClient.readContract({
    address: pool,
    abi: poolAbi,
    functionName: 'token0',
  });
  const usdcIsToken0 = token0.toLowerCase() === testUSDC.toLowerCase();
  // init price: 1 WETH = 100000 tUSDC, adjusted for 6 vs 18 decimals
  const priceX192 = usdcIsToken0
    ? ((1n << 192n) * 1_000_000_000_000n) / 100_000n
    : ((1n << 192n) * 100_000n * 1_000_000n) / 10n ** 18n;
  const sqrtX96 = bigintSqrt(priceX192);
  const hash = await wallet.writeContract({
    address: pool,
    abi: poolAbi,
    functionName: 'initialize',
    args: [sqrtX96],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Pool initialized, sqrtPriceX96 =', sqrtX96.toString());
} else {
  console.log('Pool already initialized');
}

saveDeployments({ pool });

function bigintSqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

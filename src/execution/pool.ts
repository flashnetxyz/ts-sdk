/**
 * Uniswap V3 Pool Queries
 *
 * Read-only queries for pool existence, state, and pricing using viem.
 *
 * @example
 * ```typescript
 * const poolAddr = await getPoolAddress(rpcUrl, factoryAddr, tokenA, tokenB, 3000);
 * if (poolAddr) {
 *   const info = await fetchPoolInfo(rpcUrl, poolAddr);
 *   console.log(`Price: sqrtPriceX96=${info.sqrtPriceX96}`);
 * }
 * ```
 */

import { zeroAddress, type Address } from "viem";
import { uniswapV3FactoryAbi, uniswapV3PoolAbi } from "./abis/uniswapV3";
import { getClient } from "./rpc";

// Types

export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
}

// Public API

/** Canonical token sorting (lower address first). */
export function sortTokens(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

/**
 * Look up a Uniswap V3 pool address via the Factory contract.
 * Returns null if no pool exists for the given pair and fee.
 */
export async function getPoolAddress(
  rpcUrl: string,
  factoryAddress: string,
  tokenA: string,
  tokenB: string,
  fee: number
): Promise<string | null> {
  const client = getClient(rpcUrl);
  const pool = await client.readContract({
    address: factoryAddress as Address,
    abi: uniswapV3FactoryAbi,
    functionName: "getPool",
    args: [tokenA as Address, tokenB as Address, fee],
  });

  if (pool === zeroAddress) return null;
  return pool;
}

/**
 * Fetch pool state (price, tick, liquidity, tokens) via multicall.
 */
export async function fetchPoolInfo(
  rpcUrl: string,
  poolAddress: string
): Promise<PoolInfo> {
  const client = getClient(rpcUrl);
  const addr = poolAddress as Address;

  const results = await client.multicall({
    contracts: [
      { address: addr, abi: uniswapV3PoolAbi, functionName: "slot0" },
      { address: addr, abi: uniswapV3PoolAbi, functionName: "liquidity" },
      { address: addr, abi: uniswapV3PoolAbi, functionName: "token0" },
      { address: addr, abi: uniswapV3PoolAbi, functionName: "token1" },
    ],
  });

  // All four multicall results must succeed. Falling back to "" or 0n on
  // failure would mask RPC errors behind values that look like a real
  // zero-liquidity / uninitialized pool, and empty-string addresses feed
  // invalid data into downstream swap routing.
  if (results[0].status !== "success") {
    throw new Error(`Failed to read slot0 from pool ${poolAddress}`);
  }
  if (results[1].status !== "success") {
    throw new Error(`Failed to read liquidity from pool ${poolAddress}`);
  }
  if (results[2].status !== "success") {
    throw new Error(`Failed to read token0 from pool ${poolAddress}`);
  }
  if (results[3].status !== "success") {
    throw new Error(`Failed to read token1 from pool ${poolAddress}`);
  }

  const [sqrtPriceX96, tick] = results[0].result;

  return {
    address: poolAddress,
    token0: results[2].result,
    token1: results[3].result,
    sqrtPriceX96,
    tick,
    liquidity: results[1].result,
  };
}

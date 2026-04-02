/**
 * Uniswap V3 Pool Query Helpers
 *
 * Zero-dependency pool query utilities using raw JSON-RPC calls.
 * Provides pool existence checks, state queries, and token sorting.
 *
 * @example
 * ```typescript
 * import { getPoolAddress, fetchPoolInfo, sortTokens } from "@flashnet/sdk/execution";
 *
 * const pool = await getPoolAddress(rpcUrl, factory, tokenA, tokenB, 3000);
 * if (pool) {
 *   const info = await fetchPoolInfo(rpcUrl, pool);
 *   console.log(`Price: sqrtPriceX96=${info.sqrtPriceX96}`);
 * }
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Uniswap V3 pool state snapshot. */
export interface PoolInfo {
  /** Pool contract address. */
  address: string;
  /** Lower-sorted token address. */
  token0: string;
  /** Higher-sorted token address. */
  token1: string;
  /** Current sqrtPriceX96 (Q64.96 fixed-point). */
  sqrtPriceX96: bigint;
  /** Current tick index. */
  tick: number;
  /** Current in-range liquidity. */
  liquidity: bigint;
}

// ---------------------------------------------------------------------------
// ABI selectors
// ---------------------------------------------------------------------------

/** keccak256("getPool(address,address,uint24)") */
const SEL_GET_POOL = "0x1698ee82";
/** keccak256("slot0()") */
const SEL_SLOT0 = "0x3850c7bd";
/** keccak256("liquidity()") */
const SEL_LIQUIDITY = "0x1a686502";
/** keccak256("token0()") */
const SEL_TOKEN0 = "0x0dfe1681";
/** keccak256("token1()") */
const SEL_TOKEN1 = "0xd21220a7";

// ---------------------------------------------------------------------------
// Raw JSON-RPC
// ---------------------------------------------------------------------------

let rpcIdCounter = 10000;

async function ethCall(
  rpcUrl: string,
  to: string,
  data: string
): Promise<string> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcIdCounter++,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });

  const json = (await resp.json()) as {
    result?: string;
    error?: { message: string };
  };
  if (json.error) {
    throw new Error(`eth_call failed: ${json.error.message}`);
  }
  return json.result ?? "0x";
}

// ---------------------------------------------------------------------------
// ABI encoding/decoding
// ---------------------------------------------------------------------------

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function padAddress(address: string): string {
  const clean = address.startsWith("0x") ? address.slice(2) : address;
  return clean.toLowerCase().padStart(64, "0");
}

function padUint24(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function decodeAddress(hex: string, offset: number): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.substring(offset * 2 + 24, offset * 2 + 64);
}

function decodeUint(hex: string, offset: number): bigint {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const word = clean.substring(offset * 2, offset * 2 + 64);
  return BigInt("0x" + (word.replace(/^0+/, "") || "0"));
}

function decodeInt(hex: string, offset: number): number {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const word = clean.substring(offset * 2, offset * 2 + 64);
  const value = BigInt("0x" + word);
  // Handle signed int24: if bit 23 is set, value is negative
  if (value >= 1n << 255n) {
    return Number(value - (1n << 256n));
  }
  return Number(value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sort two token addresses into Uniswap's canonical order (lower address first).
 *
 * @param a - First token address
 * @param b - Second token address
 * @returns Tuple of [token0, token1] in sorted order
 */
export function sortTokens(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

/**
 * Look up the Uniswap V3 pool address for a token pair and fee tier.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param factoryAddress - Uniswap V3 Factory contract address
 * @param tokenA - First token address
 * @param tokenB - Second token address
 * @param fee - Fee tier (e.g. 500, 3000, 10000)
 * @returns Pool address, or null if no pool exists
 */
export async function getPoolAddress(
  rpcUrl: string,
  factoryAddress: string,
  tokenA: string,
  tokenB: string,
  fee: number
): Promise<string | null> {
  const data =
    SEL_GET_POOL + padAddress(tokenA) + padAddress(tokenB) + padUint24(fee);
  const result = await ethCall(rpcUrl, factoryAddress, data);
  const pool = decodeAddress(result, 0);
  if (pool === ZERO_ADDRESS) return null;
  return pool;
}

/**
 * Fetch current state of a Uniswap V3 pool (price, tick, liquidity, tokens).
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param poolAddress - Pool contract address
 * @returns Pool state snapshot
 */
export async function fetchPoolInfo(
  rpcUrl: string,
  poolAddress: string
): Promise<PoolInfo> {
  const [slot0Hex, liquidityHex, token0Hex, token1Hex] = await Promise.all([
    ethCall(rpcUrl, poolAddress, SEL_SLOT0),
    ethCall(rpcUrl, poolAddress, SEL_LIQUIDITY),
    ethCall(rpcUrl, poolAddress, SEL_TOKEN0),
    ethCall(rpcUrl, poolAddress, SEL_TOKEN1),
  ]);

  return {
    address: poolAddress,
    token0: decodeAddress(token0Hex, 0),
    token1: decodeAddress(token1Hex, 0),
    sqrtPriceX96: decodeUint(slot0Hex, 0),
    tick: decodeInt(slot0Hex, 32),
    liquidity: decodeUint(liquidityHex, 0),
  };
}

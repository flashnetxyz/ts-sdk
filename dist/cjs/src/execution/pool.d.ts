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
export interface PoolInfo {
    address: string;
    token0: string;
    token1: string;
    sqrtPriceX96: bigint;
    tick: number;
    liquidity: bigint;
}
/** Canonical token sorting (lower address first). */
export declare function sortTokens(a: string, b: string): [string, string];
/**
 * Look up a Uniswap V3 pool address via the Factory contract.
 * Returns null if no pool exists for the given pair and fee.
 */
export declare function getPoolAddress(rpcUrl: string, factoryAddress: string, tokenA: string, tokenB: string, fee: number): Promise<string | null>;
/**
 * Fetch pool state (price, tick, liquidity, tokens) via multicall.
 */
export declare function fetchPoolInfo(rpcUrl: string, poolAddress: string): Promise<PoolInfo>;
//# sourceMappingURL=pool.d.ts.map
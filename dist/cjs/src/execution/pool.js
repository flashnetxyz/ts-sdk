'use strict';

var viem = require('viem');
var uniswapV3 = require('./abis/uniswapV3.js');
var rpc = require('./rpc.js');

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
// Public API
/** Canonical token sorting (lower address first). */
function sortTokens(a, b) {
    return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}
/**
 * Look up a Uniswap V3 pool address via the Factory contract.
 * Returns null if no pool exists for the given pair and fee.
 */
async function getPoolAddress(rpcUrl, factoryAddress, tokenA, tokenB, fee) {
    const client = rpc.getClient(rpcUrl);
    const pool = await client.readContract({
        address: factoryAddress,
        abi: uniswapV3.uniswapV3FactoryAbi,
        functionName: "getPool",
        args: [tokenA, tokenB, fee],
    });
    if (pool === viem.zeroAddress)
        return null;
    return pool;
}
/**
 * Fetch pool state (price, tick, liquidity, tokens) via multicall.
 */
async function fetchPoolInfo(rpcUrl, poolAddress) {
    const client = rpc.getClient(rpcUrl);
    const addr = poolAddress;
    const results = await client.multicall({
        contracts: [
            { address: addr, abi: uniswapV3.uniswapV3PoolAbi, functionName: "slot0" },
            { address: addr, abi: uniswapV3.uniswapV3PoolAbi, functionName: "liquidity" },
            { address: addr, abi: uniswapV3.uniswapV3PoolAbi, functionName: "token0" },
            { address: addr, abi: uniswapV3.uniswapV3PoolAbi, functionName: "token1" },
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

exports.fetchPoolInfo = fetchPoolInfo;
exports.getPoolAddress = getPoolAddress;
exports.sortTokens = sortTokens;
//# sourceMappingURL=pool.js.map

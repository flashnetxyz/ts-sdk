'use strict';

var viem = require('viem');
var conductorPoolCreation = require('./abis/conductorPoolCreation.js');
var pool = require('./pool.js');
var priceMath = require('./price-math.js');

/**
 * Conductor Pool Creation Helpers
 *
 * ABI encoding for Conductor.createBTCPool() using viem.
 *
 * @example
 * ```typescript
 * import { encodeCreateBTCPool } from "@flashnet/sdk/execution";
 *
 * const { calldata, wbtcAmountWei } = encodeCreateBTCPool({
 *   wbtcAddress: "0x...", otherTokenAddress: "0x...",
 *   fee: 3000, tickSpacing: 60, sqrtPriceX96: 79228162514264337593543950336n,
 *   wbtcAmount: 1000000000000000000n, otherAmount: 1000000000000000000n,
 *   hostId: "0x...", feeRecipient: "0x...",
 *   permit: { value: 1000n, deadline: 9999999999n, v: 27, r: "0x...", s: "0x..." },
 * });
 * ```
 */
// Public API
/**
 * Encode calldata for Conductor.createBTCPool().
 * Handles token sorting, full-range tick calculation, and permit struct encoding.
 */
function encodeCreateBTCPool(params) {
    const [token0, token1] = pool.sortTokens(params.wbtcAddress, params.otherTokenAddress);
    const wbtcIsToken0 = token0.toLowerCase() === params.wbtcAddress.toLowerCase();
    const amount0Desired = wbtcIsToken0 ? params.wbtcAmount : params.otherAmount;
    const amount1Desired = wbtcIsToken0 ? params.otherAmount : params.wbtcAmount;
    const { tickLower, tickUpper } = priceMath.fullRangeTicks(params.tickSpacing);
    const calldata = viem.encodeFunctionData({
        abi: conductorPoolCreation.conductorPoolCreationAbi,
        functionName: "createBTCPool",
        args: [
            {
                token0: token0,
                token1: token1,
                fee: params.fee,
                sqrtPriceX96: params.sqrtPriceX96,
                tickLower,
                tickUpper,
                amount0Desired,
                amount1Desired,
                amount0Min: 0n,
                amount1Min: 0n,
                hostId: params.hostId,
                feeRecipient: params.feeRecipient,
            },
            {
                value: params.permit.value,
                deadline: params.permit.deadline,
                v: params.permit.v,
                r: params.permit.r,
                s: params.permit.s,
            },
        ],
    });
    return { calldata, wbtcAmountWei: params.wbtcAmount };
}
/**
 * Encode pool parameters for Conductor.createPool() (ERC20-only pools via Permit2).
 * Returns sorted token info for the caller to build the full Permit2 transaction.
 */
function encodeCreatePoolParams(params) {
    const [token0, token1] = pool.sortTokens(params.tokenA, params.tokenB);
    const isSwapped = token0.toLowerCase() !== params.tokenA.toLowerCase();
    const { tickLower, tickUpper } = priceMath.fullRangeTicks(params.tickSpacing);
    return {
        token0,
        token1,
        amount0Desired: isSwapped ? params.amountB : params.amountA,
        amount1Desired: isSwapped ? params.amountA : params.amountB,
        tickLower,
        tickUpper,
    };
}

exports.encodeCreateBTCPool = encodeCreateBTCPool;
exports.encodeCreatePoolParams = encodeCreatePoolParams;
//# sourceMappingURL=pool-creation.js.map

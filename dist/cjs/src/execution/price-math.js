'use strict';

/**
 * Uniswap V3 Price Math Utilities
 *
 * Conversion functions between human-readable prices and Uniswap V3's
 * sqrtPriceX96 / tick representations. Zero dependencies.
 *
 * @example
 * ```typescript
 * import { priceToSqrtPriceX96, sqrtPriceX96ToPrice, fullRangeTicks } from "@flashnet/sdk/execution";
 *
 * const sqrtPrice = priceToSqrtPriceX96(1.5, 18, 8); // 1.5 token1 per token0
 * const price = sqrtPriceX96ToPrice(sqrtPrice, 18, 8);
 * const { tickLower, tickUpper } = fullRangeTicks(60);
 * ```
 */
/** Uniswap V3 fee tiers with their tick spacings. */
const FEE_TIERS = [
    { fee: 500, label: "0.05%", tickSpacing: 10 },
    { fee: 3000, label: "0.3%", tickSpacing: 60 },
    { fee: 10000, label: "1%", tickSpacing: 200 },
];
/** Q96 constant: 2^96 */
const Q96 = 1n << 96n;
/**
 * Convert a human-readable price to Uniswap V3 sqrtPriceX96.
 *
 * @param price - Price of token1 in terms of token0 (e.g. 1.5 means 1 token0 = 1.5 token1)
 * @param decimals0 - Decimals of token0
 * @param decimals1 - Decimals of token1
 * @returns sqrtPriceX96 as bigint (Q64.96 fixed-point)
 */
function priceToSqrtPriceX96(price, decimals0, decimals1) {
    const PRECISION = 1e15;
    const decDiff = decimals0 - decimals1;
    if (decDiff >= 0) {
        const sqrtPrice = Math.sqrt(price);
        const sqrtScale = Math.sqrt(10 ** Math.min(decDiff, 30));
        const sPrecise = BigInt(Math.round(sqrtPrice * PRECISION));
        const scalePrecise = BigInt(Math.round(sqrtScale * PRECISION));
        const PREC = BigInt(PRECISION);
        return (sPrecise * scalePrecise * Q96) / (PREC * PREC);
    }
    else {
        const sqrtPrice = Math.sqrt(price);
        const sqrtScale = BigInt(Math.round(Math.sqrt(10 ** Math.min(-decDiff, 30)) * PRECISION));
        const sPrecise = BigInt(Math.round(sqrtPrice * PRECISION));
        return (sPrecise * Q96) / sqrtScale;
    }
}
/**
 * Convert Uniswap V3 sqrtPriceX96 back to a human-readable price.
 *
 * @param sqrtPriceX96 - sqrtPriceX96 (Q64.96 fixed-point)
 * @param decimals0 - Decimals of token0
 * @param decimals1 - Decimals of token1
 * @returns Human-readable price (token1 per token0)
 */
function sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1) {
    const SCALE = 10n ** 18n;
    const raw = Number((sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96));
    return (raw / 1e18) * 10 ** (decimals1 - decimals0);
}
/**
 * Compute full-range tick bounds for a given tick spacing.
 *
 * @param tickSpacing - The pool's tick spacing (e.g. 10, 60, 200)
 * @returns { tickLower, tickUpper } aligned to the tick spacing
 */
function fullRangeTicks(tickSpacing) {
    const MIN_TICK = -887272;
    const MAX_TICK = 887272;
    const tickLower = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
    return { tickLower, tickUpper };
}

exports.FEE_TIERS = FEE_TIERS;
exports.fullRangeTicks = fullRangeTicks;
exports.priceToSqrtPriceX96 = priceToSqrtPriceX96;
exports.sqrtPriceX96ToPrice = sqrtPriceX96ToPrice;
//# sourceMappingURL=price-math.js.map

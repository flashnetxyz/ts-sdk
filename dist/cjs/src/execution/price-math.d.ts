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
export declare const FEE_TIERS: readonly [{
    readonly fee: 500;
    readonly label: "0.05%";
    readonly tickSpacing: 10;
}, {
    readonly fee: 3000;
    readonly label: "0.3%";
    readonly tickSpacing: 60;
}, {
    readonly fee: 10000;
    readonly label: "1%";
    readonly tickSpacing: 200;
}];
/**
 * Convert a human-readable price to Uniswap V3 sqrtPriceX96.
 *
 * @param price - Price of token1 in terms of token0 (e.g. 1.5 means 1 token0 = 1.5 token1)
 * @param decimals0 - Decimals of token0
 * @param decimals1 - Decimals of token1
 * @returns sqrtPriceX96 as bigint (Q64.96 fixed-point)
 */
export declare function priceToSqrtPriceX96(price: number, decimals0: number, decimals1: number): bigint;
/**
 * Convert Uniswap V3 sqrtPriceX96 back to a human-readable price.
 *
 * @param sqrtPriceX96 - sqrtPriceX96 (Q64.96 fixed-point)
 * @param decimals0 - Decimals of token0
 * @param decimals1 - Decimals of token1
 * @returns Human-readable price (token1 per token0)
 */
export declare function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number;
/**
 * Compute full-range tick bounds for a given tick spacing.
 *
 * @param tickSpacing - The pool's tick spacing (e.g. 10, 60, 200)
 * @returns { tickLower, tickUpper } aligned to the tick spacing
 */
export declare function fullRangeTicks(tickSpacing: number): {
    tickLower: number;
    tickUpper: number;
};
//# sourceMappingURL=price-math.d.ts.map
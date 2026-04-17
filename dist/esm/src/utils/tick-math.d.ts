/**
 * V3 Concentrated Liquidity Tick Math Utilities
 *
 * In V3 AMMs, price is represented as ticks where: price = 1.0001^tick
 * Each tick represents a 0.01% (1 basis point) price change.
 *
 * Pool price convention: "amount of asset B per 1 unit of asset A" (in smallest units)
 * For a USDB/BTC pool (A=USDB, B=BTC): price = sats per microUSDB
 */
/**
 * Convert a raw pool price to a tick.
 *
 * @param price - Pool price (amount of asset B per unit of asset A in smallest units)
 * @returns The tick value
 *
 * @example
 * // For USDB/BTC pool at ~$90k: price = 0.00111 sats per microUSDB
 * priceToTick(0.00111) // returns approximately -68038
 */
export declare function priceToTick(price: number | string): number;
/**
 * Convert a tick to a raw pool price.
 *
 * @param tick - The tick value
 * @returns Pool price as a string (for precision)
 *
 * @example
 * tickToPrice(-68038) // returns "0.001109..." (sats per microUSDB)
 */
export declare function tickToPrice(tick: number): string;
/**
 * Round a tick down to the nearest valid tick (multiple of tick spacing).
 *
 * @param tick - The tick to round
 * @param tickSpacing - The pool's tick spacing (e.g., 60)
 * @returns Rounded tick
 */
export declare function roundTickDown(tick: number, tickSpacing: number): number;
/**
 * Round a tick up to the nearest valid tick (multiple of tick spacing).
 *
 * @param tick - The tick to round
 * @param tickSpacing - The pool's tick spacing (e.g., 60)
 * @returns Rounded tick
 */
export declare function roundTickUp(tick: number, tickSpacing: number): number;
/**
 * Round a tick to the nearest valid tick (multiple of tick spacing).
 *
 * @param tick - The tick to round
 * @param tickSpacing - The pool's tick spacing (e.g., 60)
 * @returns Rounded tick
 */
export declare function roundTick(tick: number, tickSpacing: number): number;
export interface HumanPriceToTickOptions {
    /**
     * Human-readable price (e.g., 90000 for "$90,000 per BTC")
     * Expressed as "quote units per base unit"
     */
    humanPrice: number;
    /**
     * Decimals of the base token (the token being priced, e.g., BTC = 8)
     */
    baseDecimals: number;
    /**
     * Decimals of the quote token (the unit of measurement, e.g., USD = 6)
     */
    quoteDecimals: number;
    /**
     * Whether the base token is asset A in the pool.
     * - false (default): base is asset B (e.g., BTC/USD where BTC is B and USD is A)
     * - true: base is asset A (e.g., USD/BTC where USD is A and BTC is B)
     *
     * Most pools have the "main" asset (BTC, ETH) as asset B and the quote (USD) as asset A.
     */
    baseIsAssetA?: boolean;
    /**
     * Optional tick spacing to round the result to a valid tick.
     */
    tickSpacing?: number;
}
/**
 * Convert a human-readable price to a V3 tick.
 *
 * This is the most user-friendly function for calculating ticks.
 * Express your price as "quote per base" (e.g., "$90,000 per BTC").
 *
 * @example
 * // BTC at $90,000, pool has USDB (6 decimals) as A, BTC (8 decimals) as B
 * humanPriceToTick({
 *   humanPrice: 90000,
 *   baseDecimals: 8,      // BTC
 *   quoteDecimals: 6,     // USD
 *   baseIsAssetA: false,  // BTC is asset B (default)
 *   tickSpacing: 60
 * }) // returns -68040
 *
 * @example
 * // Get tick range for $80,000 to $100,000
 * const tickLower = humanPriceToTick({ humanPrice: 100000, baseDecimals: 8, quoteDecimals: 6, tickSpacing: 60 });
 * const tickUpper = humanPriceToTick({ humanPrice: 80000, baseDecimals: 8, quoteDecimals: 6, tickSpacing: 60 });
 * // Note: higher price = lower tick for this pool configuration
 */
export declare function humanPriceToTick(options: HumanPriceToTickOptions): number;
export interface TickToHumanPriceOptions {
    /**
     * The tick value
     */
    tick: number;
    /**
     * Decimals of the base token (the token being priced, e.g., BTC = 8)
     */
    baseDecimals: number;
    /**
     * Decimals of the quote token (the unit of measurement, e.g., USD = 6)
     */
    quoteDecimals: number;
    /**
     * Whether the base token is asset A in the pool.
     * - false (default): base is asset B
     * - true: base is asset A
     */
    baseIsAssetA?: boolean;
}
/**
 * Convert a V3 tick to a human-readable price.
 *
 * @example
 * // Tick -68040 in a USDB/BTC pool
 * tickToHumanPrice({
 *   tick: -68040,
 *   baseDecimals: 8,      // BTC
 *   quoteDecimals: 6,     // USD
 *   baseIsAssetA: false   // BTC is asset B
 * }) // returns approximately 90000 (dollars per BTC)
 */
export declare function tickToHumanPrice(options: TickToHumanPriceOptions): number;
export interface TickRangeFromPricesOptions {
    /**
     * Lower price bound in human-readable format (e.g., 80000 for $80k)
     */
    priceLower: number;
    /**
     * Upper price bound in human-readable format (e.g., 100000 for $100k)
     */
    priceUpper: number;
    /**
     * Decimals of the base token
     */
    baseDecimals: number;
    /**
     * Decimals of the quote token
     */
    quoteDecimals: number;
    /**
     * Whether the base token is asset A in the pool (default: false)
     */
    baseIsAssetA?: boolean;
    /**
     * The pool's tick spacing (required for valid tick boundaries)
     */
    tickSpacing: number;
}
export interface TickRange {
    tickLower: number;
    tickUpper: number;
    /**
     * Actual price at tickLower (after rounding)
     */
    actualPriceLower: number;
    /**
     * Actual price at tickUpper (after rounding)
     */
    actualPriceUpper: number;
}
/**
 * Get a tick range from human-readable price bounds.
 *
 * Automatically handles the conversion and ensures tickLower < tickUpper.
 *
 * @example
 * // Get tick range for $80,000 to $100,000 BTC price
 * const range = tickRangeFromPrices({
 *   priceLower: 80000,
 *   priceUpper: 100000,
 *   baseDecimals: 8,
 *   quoteDecimals: 6,
 *   tickSpacing: 60
 * });
 * // returns { tickLower: -69120, tickUpper: -66840, actualPriceLower: 80180, actualPriceUpper: 99820 }
 */
export declare function tickRangeFromPrices(options: TickRangeFromPricesOptions): TickRange;
/**
 * Calculate the pool price needed for a given position configuration.
 *
 * @param humanPrice - Human-readable price (e.g., 90000 for $90k/BTC)
 * @param baseDecimals - Decimals of base token
 * @param quoteDecimals - Decimals of quote token
 * @param baseIsAssetA - Whether base is asset A (default: false)
 * @returns Pool price string suitable for createConcentratedPool's initialPrice
 */
export declare function humanPriceToPoolPrice(humanPrice: number, baseDecimals: number, quoteDecimals: number, baseIsAssetA?: boolean): string;
/**
 * Convert pool price to human-readable price.
 *
 * @param poolPrice - Pool price (amount of B per unit of A in smallest units)
 * @param baseDecimals - Decimals of base token
 * @param quoteDecimals - Decimals of quote token
 * @param baseIsAssetA - Whether base is asset A (default: false)
 * @returns Human-readable price
 */
export declare function poolPriceToHumanPrice(poolPrice: number | string, baseDecimals: number, quoteDecimals: number, baseIsAssetA?: boolean): number;
/**
 * V3 tick math utilities namespace for cleaner imports.
 *
 * @example
 * import { V3TickMath } from "@flashnet/sdk";
 *
 * const tick = V3TickMath.fromHumanPrice({
 *   humanPrice: 90000,
 *   baseDecimals: 8,
 *   quoteDecimals: 6,
 *   tickSpacing: 60
 * });
 */
export declare const V3TickMath: {
    priceToTick: typeof priceToTick;
    tickToPrice: typeof tickToPrice;
    roundTickDown: typeof roundTickDown;
    roundTickUp: typeof roundTickUp;
    roundTick: typeof roundTick;
    fromHumanPrice: typeof humanPriceToTick;
    toHumanPrice: typeof tickToHumanPrice;
    rangeFromPrices: typeof tickRangeFromPrices;
    humanPriceToPoolPrice: typeof humanPriceToPoolPrice;
    poolPriceToHumanPrice: typeof poolPriceToHumanPrice;
    MIN_TICK: number;
    MAX_TICK: number;
};
//# sourceMappingURL=tick-math.d.ts.map
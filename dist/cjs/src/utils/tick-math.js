'use strict';

/**
 * V3 Concentrated Liquidity Tick Math Utilities
 *
 * In V3 AMMs, price is represented as ticks where: price = 1.0001^tick
 * Each tick represents a 0.01% (1 basis point) price change.
 *
 * Pool price convention: "amount of asset B per 1 unit of asset A" (in smallest units)
 * For a USDB/BTC pool (A=USDB, B=BTC): price = sats per microUSDB
 */
// Constants
const LOG_BASE = Math.log(1.0001);
const MIN_TICK = -887272;
const MAX_TICK = 887272;
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
function priceToTick(price) {
    const priceNum = typeof price === "string" ? parseFloat(price) : price;
    if (priceNum <= 0) {
        throw new Error("Price must be positive");
    }
    const tick = Math.log(priceNum) / LOG_BASE;
    return Math.round(tick);
}
/**
 * Convert a tick to a raw pool price.
 *
 * @param tick - The tick value
 * @returns Pool price as a string (for precision)
 *
 * @example
 * tickToPrice(-68038) // returns "0.001109..." (sats per microUSDB)
 */
function tickToPrice(tick) {
    if (tick < MIN_TICK || tick > MAX_TICK) {
        throw new Error(`Tick must be between ${MIN_TICK} and ${MAX_TICK}`);
    }
    const price = 1.0001 ** tick;
    return price.toString();
}
/**
 * Round a tick down to the nearest valid tick (multiple of tick spacing).
 *
 * @param tick - The tick to round
 * @param tickSpacing - The pool's tick spacing (e.g., 60)
 * @returns Rounded tick
 */
function roundTickDown(tick, tickSpacing) {
    return Math.floor(tick / tickSpacing) * tickSpacing;
}
/**
 * Round a tick up to the nearest valid tick (multiple of tick spacing).
 *
 * @param tick - The tick to round
 * @param tickSpacing - The pool's tick spacing (e.g., 60)
 * @returns Rounded tick
 */
function roundTickUp(tick, tickSpacing) {
    return Math.ceil(tick / tickSpacing) * tickSpacing;
}
/**
 * Round a tick to the nearest valid tick (multiple of tick spacing).
 *
 * @param tick - The tick to round
 * @param tickSpacing - The pool's tick spacing (e.g., 60)
 * @returns Rounded tick
 */
function roundTick(tick, tickSpacing) {
    return Math.round(tick / tickSpacing) * tickSpacing;
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
function humanPriceToTick(options) {
    const { humanPrice, baseDecimals, quoteDecimals, baseIsAssetA = false, tickSpacing, } = options;
    if (humanPrice <= 0) {
        throw new Error("Human price must be positive");
    }
    // Pool price is "amount of B per unit of A" in smallest units
    // Human price is "quote per base"
    // If base is asset B (common case: BTC/USD pool where BTC is B):
    //   pool_price = 10^(baseDecimals - quoteDecimals) / humanPrice
    // If base is asset A:
    //   pool_price = humanPrice * 10^(quoteDecimals - baseDecimals)
    let poolPrice;
    if (baseIsAssetA) {
        // Base is A, so human price is "B per A" which is the same direction as pool price
        poolPrice = humanPrice * 10 ** (quoteDecimals - baseDecimals);
    }
    else {
        // Base is B, so human price is "A per B", need to invert
        poolPrice = 10 ** (baseDecimals - quoteDecimals) / humanPrice;
    }
    let tick = priceToTick(poolPrice);
    if (tickSpacing) {
        tick = roundTick(tick, tickSpacing);
    }
    return tick;
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
function tickToHumanPrice(options) {
    const { tick, baseDecimals, quoteDecimals, baseIsAssetA = false } = options;
    const poolPrice = parseFloat(tickToPrice(tick));
    // Reverse the conversion from humanPriceToTick
    if (baseIsAssetA) {
        return poolPrice / 10 ** (quoteDecimals - baseDecimals);
    }
    else {
        return 10 ** (baseDecimals - quoteDecimals) / poolPrice;
    }
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
function tickRangeFromPrices(options) {
    const { priceLower, priceUpper, baseDecimals, quoteDecimals, baseIsAssetA = false, tickSpacing, } = options;
    if (priceLower >= priceUpper) {
        throw new Error("priceLower must be less than priceUpper");
    }
    const tick1 = humanPriceToTick({
        humanPrice: priceLower,
        baseDecimals,
        quoteDecimals,
        baseIsAssetA,
        tickSpacing,
    });
    const tick2 = humanPriceToTick({
        humanPrice: priceUpper,
        baseDecimals,
        quoteDecimals,
        baseIsAssetA,
        tickSpacing,
    });
    // Ensure tickLower < tickUpper (tick direction depends on baseIsAssetA)
    const tickLower = Math.min(tick1, tick2);
    const tickUpper = Math.max(tick1, tick2);
    // Calculate actual prices at the rounded ticks
    const actualPriceLower = tickToHumanPrice({
        tick: baseIsAssetA ? tickLower : tickUpper,
        baseDecimals,
        quoteDecimals,
        baseIsAssetA,
    });
    const actualPriceUpper = tickToHumanPrice({
        tick: baseIsAssetA ? tickUpper : tickLower,
        baseDecimals,
        quoteDecimals,
        baseIsAssetA,
    });
    return {
        tickLower,
        tickUpper,
        actualPriceLower,
        actualPriceUpper,
    };
}
//
// Pool Price Calculation from Amount
//
/**
 * Calculate the pool price needed for a given position configuration.
 *
 * @param humanPrice - Human-readable price (e.g., 90000 for $90k/BTC)
 * @param baseDecimals - Decimals of base token
 * @param quoteDecimals - Decimals of quote token
 * @param baseIsAssetA - Whether base is asset A (default: false)
 * @returns Pool price string suitable for createConcentratedPool's initialPrice
 */
function humanPriceToPoolPrice(humanPrice, baseDecimals, quoteDecimals, baseIsAssetA = false) {
    if (humanPrice <= 0) {
        throw new Error("Human price must be positive");
    }
    let poolPrice;
    if (baseIsAssetA) {
        poolPrice = humanPrice * 10 ** (quoteDecimals - baseDecimals);
    }
    else {
        poolPrice = 10 ** (baseDecimals - quoteDecimals) / humanPrice;
    }
    return poolPrice.toPrecision(10);
}
/**
 * Convert pool price to human-readable price.
 *
 * @param poolPrice - Pool price (amount of B per unit of A in smallest units)
 * @param baseDecimals - Decimals of base token
 * @param quoteDecimals - Decimals of quote token
 * @param baseIsAssetA - Whether base is asset A (default: false)
 * @returns Human-readable price
 */
function poolPriceToHumanPrice(poolPrice, baseDecimals, quoteDecimals, baseIsAssetA = false) {
    const price = typeof poolPrice === "string" ? parseFloat(poolPrice) : poolPrice;
    if (baseIsAssetA) {
        return price / 10 ** (quoteDecimals - baseDecimals);
    }
    else {
        return 10 ** (baseDecimals - quoteDecimals) / price;
    }
}
//
// Convenience exports
//
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
const V3TickMath = {
    // Core conversions
    priceToTick,
    tickToPrice,
    // Tick spacing
    roundTickDown,
    roundTickUp,
    roundTick,
    // Human-readable conversions
    fromHumanPrice: humanPriceToTick,
    toHumanPrice: tickToHumanPrice,
    rangeFromPrices: tickRangeFromPrices,
    // Pool price conversions
    humanPriceToPoolPrice,
    poolPriceToHumanPrice,
    // Constants
    MIN_TICK,
    MAX_TICK,
};

exports.V3TickMath = V3TickMath;
exports.humanPriceToPoolPrice = humanPriceToPoolPrice;
exports.humanPriceToTick = humanPriceToTick;
exports.poolPriceToHumanPrice = poolPriceToHumanPrice;
exports.priceToTick = priceToTick;
exports.roundTick = roundTick;
exports.roundTickDown = roundTickDown;
exports.roundTickUp = roundTickUp;
exports.tickRangeFromPrices = tickRangeFromPrices;
exports.tickToHumanPrice = tickToHumanPrice;
exports.tickToPrice = tickToPrice;
//# sourceMappingURL=tick-math.js.map

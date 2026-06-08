/**
 * Pure fee / slippage / price-impact math for client-side swap quoting.
 *
 * Ported verbatim from the gateway's removed `quote.rs` handler (the
 * authoritative spec). All amounts are `bigint`; integer division floors,
 * matching the Rust `U256` truncating division the gateway used. Keep these
 * free of RPC/viem so they stay unit-testable in isolation.
 */

/** Denominator for basis-point math. */
export const BPS_DENOMINATOR = 10_000n;
/**
 * Per-component fee cap (basis points), mirroring the Conductor's
 * `MAX_FEE_RATE_BPS`. Bounds each of `hostFeeBps`, `protocolFeeBps`, and
 * `integratorBps`: a larger value either reverts on-chain (integrator) or is
 * corrupt upstream data (host/protocol).
 */
export const MAX_FEE_RATE_BPS = 1_000n;
/** Default slippage tolerance (basis points) when the caller omits one. */
export const DEFAULT_SLIPPAGE_BPS = 50;
/** Inclusive upper bound for the Uniswap V3 `fee` tier (uint24 max). */
export const UINT24_MAX = 0x00ff_ffff;

/**
 * The Conductor fee skim, mirroring `Conductor._swap`:
 * `fee = amount * totalBps / (10_000 + totalBps)` (floored).
 */
export function conductorSkim(amount: bigint, totalFeeBps: bigint): bigint {
  if (totalFeeBps === 0n) return 0n;
  return (amount * totalFeeBps) / (BPS_DENOMINATOR + totalFeeBps);
}

/**
 * The amount actually swapped on Uniswap after the Conductor's input-side skim.
 * Output-side fees don't touch the input, so the full amount is swapped.
 */
export function effectiveSwapInput(
  amountIn: bigint,
  totalFeeBps: bigint,
  inputSide: boolean
): bigint {
  return inputSide ? amountIn - conductorSkim(amountIn, totalFeeBps) : amountIn;
}

/**
 * Resolve the fee asset, mirroring `Conductor._feeAsset`: WBTC if either leg is
 * WBTC, else USDB if either leg is USDB, else the output token. Addresses are
 * compared case-insensitively since they arrive from RPC/params with mixed
 * casing; the returned value preserves the caller's casing of the chosen leg.
 */
export function resolveFeeAsset(
  tokenIn: string,
  tokenOut: string,
  wbtc: string,
  usdb: string
): string {
  const ti = tokenIn.toLowerCase();
  const to = tokenOut.toLowerCase();
  const w = wbtc.toLowerCase();
  const u = usdb.toLowerCase();
  if (ti === w || to === w) return wbtc;
  if (ti === u || to === u) return usdb;
  return tokenOut;
}

/**
 * Apply a basis-point slippage haircut to an output amount (floored).
 * `slippageBps` is clamped to `[0, 10_000]`, so 100% slippage floors at zero.
 */
export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  const clamped = Math.min(Math.max(Math.trunc(slippageBps), 0), 10_000);
  return (amountOut * (BPS_DENOMINATOR - BigInt(clamped))) / BPS_DENOMINATOR;
}

/**
 * Pool mid-price move in basis points from the sqrt prices before/after the
 * swap (`price = sqrtPrice^2`): `|1 - (after/before)^2| * 10_000`, rounded and
 * clamped to a uint32. An advisory UX figure computed in float — not a
 * settlement value; the exact amounts elsewhere are integer-precise. Returns
 * `undefined` when the pre-trade price is zero or unusable.
 */
export function priceImpactBps(
  sqrtBefore: bigint,
  sqrtAfter: bigint
): number | undefined {
  if (sqrtBefore <= 0n) return undefined;
  const before = Number(sqrtBefore);
  const after = Number(sqrtAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) {
    return undefined;
  }
  const ratio = after / before;
  const impact = Math.abs(1 - ratio * ratio) * Number(BPS_DENOMINATOR);
  if (!Number.isFinite(impact)) return undefined;
  return Math.min(Math.max(Math.round(impact), 0), 0xffff_ffff);
}

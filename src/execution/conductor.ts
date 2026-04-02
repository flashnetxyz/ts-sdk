/**
 * Conductor Contract ABI Helpers
 *
 * Encodes calldata for the Conductor contract's swap functions.
 * Use with ExecutionClient.submitExecute() to build deposit-and-swap intents.
 *
 * @example
 * ```typescript
 * import { ExecutionClient, Conductor } from "@flashnet/sdk/execution";
 *
 * const calldata = Conductor.encodeSwap({
 *   tokenIn: "0x...",
 *   tokenOut: "0x...",
 *   fee: 3000,
 *   amountIn: 100000000000000000n,
 *   minAmountOut: 90000000000000000n,
 * });
 * ```
 */

/** Parameters for Conductor.swap() — ERC20 to ERC20. */
export interface SwapParams {
  /** Input token address (0x-prefixed). */
  tokenIn: string;
  /** Output token address (0x-prefixed). */
  tokenOut: string;
  /** Uniswap V3 fee tier (500, 3000, or 10000). */
  fee: number;
  /** Amount of tokenIn to swap (in wei/smallest unit). */
  amountIn: bigint;
  /** Minimum acceptable output amount (slippage protection). */
  minAmountOut: bigint;
  /** Integrator address (optional, defaults to zero address). Captured in event for future fees. */
  integrator?: string;
}

/** Parameters for Conductor.swapBTC() — native BTC to ERC20. */
export interface SwapBTCParams {
  /** Output token address (0x-prefixed). */
  tokenOut: string;
  /** Uniswap V3 fee tier (500, 3000, or 10000). */
  fee: number;
  /** Minimum acceptable output amount (slippage protection). */
  minAmountOut: bigint;
  /** Integrator address (optional, defaults to zero address). */
  integrator?: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Function selectors (keccak256 of canonical signature, first 4 bytes)
// cast sig "swap(address,address,uint24,uint256,uint256,address)" → 0xfb408d07
const SWAP_SELECTOR = "fb408d07";
// cast sig "swapBTC(address,uint24,uint256,address)" → 0xad78c51c
const SWAP_BTC_SELECTOR = "ad78c51c";

/**
 * Conductor contract ABI encoding helpers.
 *
 * These functions produce calldata that can be used as the `signedTx.data` field
 * when building an EVM transaction targeting the Conductor contract address.
 */
export const Conductor = {
  /**
   * Encode calldata for Conductor.swap().
   *
   * The caller must have approved the Conductor contract for `amountIn` of `tokenIn`
   * before the transaction executes.
   */
  encodeSwap(params: SwapParams): string {
    const integrator = params.integrator ?? ZERO_ADDRESS;
    return (
      "0x" +
      SWAP_SELECTOR +
      abiEncodeAddress(params.tokenIn) +
      abiEncodeAddress(params.tokenOut) +
      abiEncodeUint(BigInt(params.fee), 256) +
      abiEncodeUint(params.amountIn, 256) +
      abiEncodeUint(params.minAmountOut, 256) +
      abiEncodeAddress(integrator)
    );
  },

  /**
   * Encode calldata for Conductor.swapBTC().
   *
   * The caller sends native BTC as msg.value (set as the transaction's `value` field).
   * The Conductor wraps it to WBTC and executes the swap.
   */
  encodeSwapBTC(params: SwapBTCParams): string {
    const integrator = params.integrator ?? ZERO_ADDRESS;
    return (
      "0x" +
      SWAP_BTC_SELECTOR +
      abiEncodeAddress(params.tokenOut) +
      abiEncodeUint(BigInt(params.fee), 256) +
      abiEncodeUint(params.minAmountOut, 256) +
      abiEncodeAddress(integrator)
    );
  },

  /** The function selector for swap(address,address,uint24,uint256,uint256,address). */
  SWAP_SELECTOR: `0x${SWAP_SELECTOR}` as const,

  /** The function selector for swapBTC(address,uint24,uint256,address). */
  SWAP_BTC_SELECTOR: `0x${SWAP_BTC_SELECTOR}` as const,
};

// ---------------------------------------------------------------------------
// ABI encoding helpers (minimal, no dependencies)
// ---------------------------------------------------------------------------

function abiEncodeAddress(addr: string): string {
  const clean = addr.startsWith("0x") ? addr.slice(2) : addr;
  return clean.toLowerCase().padStart(64, "0");
}

function abiEncodeUint(value: bigint, bits: number): string {
  const max = (1n << BigInt(bits)) - 1n;
  if (value < 0n || value > max) {
    throw new Error(
      `abiEncodeUint: value ${value} out of range for uint${bits}`
    );
  }
  return value.toString(16).padStart(64, "0");
}

/**
 * Conductor Contract SDK
 *
 * Low-level ABI encoding helpers plus high-level swap functions that handle
 * calldata construction, EVM transaction building, intent wrapping, and
 * gateway submission — so the partner calls one function and gets a result.
 *
 * @example Low-level (calldata only):
 * ```typescript
 * const calldata = Conductor.encodeSwap({ tokenIn, tokenOut, fee, amountIn, minAmountOut });
 * ```
 *
 * @example High-level (SDK does everything):
 * ```typescript
 * import { ExecutionClient, swap } from "@flashnet/sdk/execution";
 *
 * const result = await swap(client, conductorConfig, {
 *   tokenIn: "0x...", tokenOut: "0x...", fee: 3000,
 *   amountIn: 1000000n, minAmountOut: 900000n,
 * }, deposits, intentSigner, evmSigner);
 * ```
 */

import type { ExecutionClient } from "./client";
import type { Deposit, ExecuteResponse } from "./types";
import { fetchNonce } from "./evm";

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

// ---------------------------------------------------------------------------
// High-level types
// ---------------------------------------------------------------------------

/** Configuration for Conductor contract interactions. */
export interface ConductorConfig {
  /** Conductor proxy contract address (0x-prefixed). */
  conductorAddress: string;
  /** WBTC address used by Conductor for native BTC wrapping. */
  wbtcAddress: string;
  /** Uniswap V3 Factory address (for pool lookups). */
  factoryAddress: string;
  /** JSON-RPC endpoint for EVM read queries. */
  rpcUrl: string;
  /** Chain ID of the Flashnet EVM. */
  chainId: number;
}

/** Signer that can produce signed EVM transactions. */
export interface EvmTransactionSigner {
  /** Sign a raw EVM transaction and return the RLP-encoded signed tx as 0x-prefixed hex. */
  signTransaction(tx: UnsignedTransaction): Promise<string>;
  /** Get the EVM address for this signer (0x-prefixed). */
  getAddress(): Promise<string>;
}

/** Unsigned EVM transaction fields. */
export interface UnsignedTransaction {
  /** Target contract address (0x-prefixed). */
  to: string;
  /** Calldata (0x-prefixed hex). */
  data: string;
  /** Native value in wei. */
  value: bigint;
  /** Chain ID. */
  chainId: number;
  /** Sender nonce (fetched automatically if omitted). */
  nonce?: number;
  /** Gas limit (defaults to 500_000 if omitted). */
  gasLimit?: bigint;
  /** Max fee per gas in wei (defaults to 0 for Flashnet's pinned base fee). */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas in wei (defaults to 0). */
  maxPriorityFeePerGas?: bigint;
}

/** Result of a high-level swap operation. */
export interface SwapResult {
  /** Unique handle for this submission attempt. */
  submissionId: string;
  /** Canonical identifier of the logical intent content. */
  intentId: string;
  /** Current status of the intent. */
  status: string;
}

/** Request for a high-level ERC20-to-ERC20 swap. */
export interface SwapRequest {
  /** Input token address (0x-prefixed). */
  tokenIn: string;
  /** Output token address (0x-prefixed). */
  tokenOut: string;
  /** Uniswap V3 fee tier (500, 3000, or 10000). */
  fee: number;
  /** Amount of tokenIn to swap (in base units). */
  amountIn: bigint;
  /** Minimum acceptable output amount (slippage protection). */
  minAmountOut: bigint;
  /** Integrator address for future fee capture (optional). */
  integrator?: string;
}

/** Request for a high-level native-BTC-to-ERC20 swap. */
export interface SwapBTCRequest {
  /** Output token address (0x-prefixed). */
  tokenOut: string;
  /** Uniswap V3 fee tier (500, 3000, or 10000). */
  fee: number;
  /** Amount of native BTC to swap (in wei). */
  amountIn: bigint;
  /** Minimum acceptable output amount (slippage protection). */
  minAmountOut: bigint;
  /** Integrator address for future fee capture (optional). */
  integrator?: string;
}

// ---------------------------------------------------------------------------
// High-level swap functions
// ---------------------------------------------------------------------------

/**
 * Execute an ERC20-to-ERC20 swap through the Conductor contract.
 *
 * This is the batteries-included swap method. It:
 * 1. Encodes Conductor.swap() calldata
 * 2. Fetches the sender's nonce
 * 3. Builds and signs an EVM transaction via evmSigner
 * 4. Wraps it in a deposit-and-execute intent
 * 5. Submits to the execution gateway
 *
 * The caller provides deposits (Spark transfers funding the intent),
 * an intent signer (for canonical message signing), and an EVM signer
 * (for signing the raw EVM transaction).
 *
 * @param client - Authenticated ExecutionClient
 * @param config - Conductor and chain configuration
 * @param request - Swap parameters (tokenIn, tokenOut, fee, amounts)
 * @param deposits - Spark deposits funding this intent
 * @param evmSigner - Signs the raw EVM transaction
 * @returns Submission result from the execution gateway
 */
export async function swap(
  client: ExecutionClient,
  config: ConductorConfig,
  request: SwapRequest,
  deposits: Deposit[],
  evmSigner: EvmTransactionSigner
): Promise<SwapResult> {
  const calldata = Conductor.encodeSwap({
    tokenIn: request.tokenIn,
    tokenOut: request.tokenOut,
    fee: request.fee,
    amountIn: request.amountIn,
    minAmountOut: request.minAmountOut,
    integrator: request.integrator,
  });

  const senderAddress = await evmSigner.getAddress();
  const nonce = await fetchNonce(config.rpcUrl, senderAddress);

  const signedTx = await evmSigner.signTransaction({
    to: config.conductorAddress,
    data: calldata,
    value: 0n,
    chainId: config.chainId,
    nonce,
    gasLimit: 500_000n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  });

  const response: ExecuteResponse = await client.submitExecute({
    chainId: config.chainId,
    deposits,
    signedTx,
  });

  return {
    submissionId: response.submissionId,
    intentId: response.intentId,
    status: response.status,
  };
}

/**
 * Execute a native-BTC-to-ERC20 swap through the Conductor contract.
 *
 * Same batteries-included approach as swap(), but sends native BTC
 * as msg.value (Conductor wraps it to WBTC internally).
 *
 * @param client - Authenticated ExecutionClient
 * @param config - Conductor and chain configuration
 * @param request - Swap parameters (tokenOut, fee, amountIn as native BTC, minAmountOut)
 * @param deposits - Spark deposits funding this intent
 * @param evmSigner - Signs the raw EVM transaction
 * @returns Submission result from the execution gateway
 */
export async function swapBTC(
  client: ExecutionClient,
  config: ConductorConfig,
  request: SwapBTCRequest,
  deposits: Deposit[],
  evmSigner: EvmTransactionSigner
): Promise<SwapResult> {
  const calldata = Conductor.encodeSwapBTC({
    tokenOut: request.tokenOut,
    fee: request.fee,
    minAmountOut: request.minAmountOut,
    integrator: request.integrator,
  });

  const senderAddress = await evmSigner.getAddress();
  const nonce = await fetchNonce(config.rpcUrl, senderAddress);

  const signedTx = await evmSigner.signTransaction({
    to: config.conductorAddress,
    data: calldata,
    value: request.amountIn,
    chainId: config.chainId,
    nonce,
    gasLimit: 500_000n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  });

  const response: ExecuteResponse = await client.submitExecute({
    chainId: config.chainId,
    deposits,
    signedTx,
  });

  return {
    submissionId: response.submissionId,
    intentId: response.intentId,
    status: response.status,
  };
}

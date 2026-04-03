/**
 * Conductor Contract SDK
 *
 * ABI encoding via viem plus high-level swap functions that handle
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
 * const result = await swapWithApproval(client, conductorConfig, {
 *   tokenIn, tokenOut, fee: 3000, amountIn: 1000000n, minAmountOut: 0n,
 * }, [], evmSigner);
 * ```
 */

import { encodeFunctionData } from "viem";
import { conductorAbi } from "./abis/conductor";
import { erc20Abi } from "./abis/erc20";
import type { ExecutionClient } from "./client";
import type { Deposit, ExecuteResponse } from "./types";
import { fetchAllowance, fetchNonce } from "./evm";

/** Parameters for Conductor.swap() — ERC20 to ERC20. */
export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  integrator?: string;
}

/** Parameters for Conductor.swapBTC() — native BTC to ERC20. */
export interface SwapBTCParams {
  tokenOut: string;
  fee: number;
  minAmountOut: bigint;
  integrator?: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT256 = (1n << 256n) - 1n;
const DEFAULT_SWAP_GAS_LIMIT = 1_000_000n;
const DEFAULT_APPROVE_GAS_LIMIT = 100_000n;

/**
 * Conductor contract ABI encoding helpers.
 */
export const Conductor = {
  /** Encode calldata for Conductor.swap(). */
  encodeSwap(params: SwapParams): string {
    return encodeFunctionData({
      abi: conductorAbi,
      functionName: "swap",
      args: [
        params.tokenIn as `0x${string}`,
        params.tokenOut as `0x${string}`,
        params.fee,
        params.amountIn,
        params.minAmountOut,
        (params.integrator ?? ZERO_ADDRESS) as `0x${string}`,
      ],
    });
  },

  /** Encode calldata for Conductor.swapBTC(). */
  encodeSwapBTC(params: SwapBTCParams): string {
    return encodeFunctionData({
      abi: conductorAbi,
      functionName: "swapBTC",
      args: [
        params.tokenOut as `0x${string}`,
        params.fee,
        params.minAmountOut,
        (params.integrator ?? ZERO_ADDRESS) as `0x${string}`,
      ],
    });
  },

  /** Encode calldata for ERC20 approve(spender, amount). */
  encodeApprove(spender: string, amount: bigint): string {
    return encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender as `0x${string}`, amount],
    });
  },
};

// High-level types

export interface ConductorConfig {
  conductorAddress: string;
  wbtcAddress: string;
  factoryAddress: string;
  rpcUrl: string;
  chainId: number;
}

export interface EvmTransactionSigner {
  signTransaction(tx: UnsignedTransaction): Promise<string>;
  getAddress(): Promise<string>;
}

export interface UnsignedTransaction {
  to: string;
  data: string;
  value: bigint;
  chainId: number;
  nonce?: number;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

export interface SwapResult {
  submissionId: string;
  intentId: string;
  status: string;
}

export interface SwapRequest {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  integrator?: string;
}

export interface SwapBTCRequest {
  tokenOut: string;
  fee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  integrator?: string;
}

// High-level swap functions

/** Execute an ERC20-to-ERC20 swap through the Conductor contract. */
export async function swap(
  client: ExecutionClient,
  config: ConductorConfig,
  request: SwapRequest,
  deposits: Deposit[],
  evmSigner: EvmTransactionSigner
): Promise<SwapResult> {
  const calldata = Conductor.encodeSwap(request);
  const senderAddress = await evmSigner.getAddress();
  const nonce = await fetchNonce(config.rpcUrl, senderAddress);

  const signedTx = await evmSigner.signTransaction({
    to: config.conductorAddress,
    data: calldata,
    value: 0n,
    chainId: config.chainId,
    nonce,
    gasLimit: DEFAULT_SWAP_GAS_LIMIT,
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

/** Execute a native-BTC-to-ERC20 swap through the Conductor contract. */
export async function swapBTC(
  client: ExecutionClient,
  config: ConductorConfig,
  request: SwapBTCRequest,
  deposits: Deposit[],
  evmSigner: EvmTransactionSigner
): Promise<SwapResult> {
  const calldata = Conductor.encodeSwapBTC(request);
  const senderAddress = await evmSigner.getAddress();
  const nonce = await fetchNonce(config.rpcUrl, senderAddress);

  const signedTx = await evmSigner.signTransaction({
    to: config.conductorAddress,
    data: calldata,
    value: request.amountIn,
    chainId: config.chainId,
    nonce,
    gasLimit: DEFAULT_SWAP_GAS_LIMIT,
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

// Approve + swap helpers

/** Submit an ERC20 approve transaction via an execute intent. */
export async function approveToken(
  client: ExecutionClient,
  config: ConductorConfig,
  token: string,
  spender: string,
  evmSigner: EvmTransactionSigner,
  amount: bigint = MAX_UINT256
): Promise<SwapResult> {
  const calldata = Conductor.encodeApprove(spender, amount);
  const senderAddress = await evmSigner.getAddress();
  const nonce = await fetchNonce(config.rpcUrl, senderAddress);

  const signedTx = await evmSigner.signTransaction({
    to: token,
    data: calldata,
    value: 0n,
    chainId: config.chainId,
    nonce,
    gasLimit: DEFAULT_APPROVE_GAS_LIMIT,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  });

  const response: ExecuteResponse = await client.submitExecute({
    chainId: config.chainId,
    deposits: [],
    signedTx,
  });

  return {
    submissionId: response.submissionId,
    intentId: response.intentId,
    status: response.status,
  };
}

/**
 * Execute an ERC20-to-ERC20 swap with automatic approval handling.
 * Checks allowance, approves if needed, then swaps.
 */
export async function swapWithApproval(
  client: ExecutionClient,
  config: ConductorConfig,
  request: SwapRequest,
  deposits: Deposit[],
  evmSigner: EvmTransactionSigner,
  approvalWaitMs: number = 3000
): Promise<SwapResult> {
  const senderAddress = await evmSigner.getAddress();
  const allowance = await fetchAllowance(
    config.rpcUrl,
    request.tokenIn,
    senderAddress,
    config.conductorAddress
  );

  if (allowance < request.amountIn) {
    await approveToken(
      client,
      config,
      request.tokenIn,
      config.conductorAddress,
      evmSigner
    );
    await new Promise((resolve) => setTimeout(resolve, approvalWaitMs));
  }

  return swap(client, config, request, deposits, evmSigner);
}

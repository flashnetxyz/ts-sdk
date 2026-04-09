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

import { encodeFunctionData } from "viem";
import { conductorPoolCreationAbi } from "./abis/conductorPoolCreation";
import { sortTokens } from "./pool";
import { fullRangeTicks } from "./price-math";

// Types

/** EIP-2612 permit signature data for Conductor pool creation. */
export interface PermitSignature {
  value: bigint;
  deadline: bigint;
  v: number;
  r: string;
  s: string;
}

/** Parameters for creating a BTC + ERC-20 pool via Conductor. */
export interface CreateBTCPoolParams {
  wbtcAddress: string;
  otherTokenAddress: string;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: bigint;
  wbtcAmount: bigint;
  otherAmount: bigint;
  hostId: string;
  feeRecipient: string;
  permit: PermitSignature;
}

/** Parameters for creating an ERC-20 only pool via Conductor (Permit2). */
export interface CreatePoolParams {
  tokenA: string;
  tokenB: string;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: bigint;
  amountA: bigint;
  amountB: bigint;
  hostId: string;
  feeRecipient: string;
}

// Public API

/**
 * Encode calldata for Conductor.createBTCPool().
 * Handles token sorting, full-range tick calculation, and permit struct encoding.
 */
export function encodeCreateBTCPool(params: CreateBTCPoolParams): {
  calldata: string;
  wbtcAmountWei: bigint;
} {
  const [token0, token1] = sortTokens(
    params.wbtcAddress,
    params.otherTokenAddress
  );
  const wbtcIsToken0 =
    token0.toLowerCase() === params.wbtcAddress.toLowerCase();

  const amount0Desired = wbtcIsToken0 ? params.wbtcAmount : params.otherAmount;
  const amount1Desired = wbtcIsToken0 ? params.otherAmount : params.wbtcAmount;

  const { tickLower, tickUpper } = fullRangeTicks(params.tickSpacing);

  const calldata = encodeFunctionData({
    abi: conductorPoolCreationAbi,
    functionName: "createBTCPool",
    args: [
      {
        token0: token0 as `0x${string}`,
        token1: token1 as `0x${string}`,
        fee: params.fee,
        sqrtPriceX96: params.sqrtPriceX96,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min: 0n,
        amount1Min: 0n,
        hostId: params.hostId as `0x${string}`,
        feeRecipient: params.feeRecipient as `0x${string}`,
      },
      {
        value: params.permit.value,
        deadline: params.permit.deadline,
        v: params.permit.v,
        r: params.permit.r as `0x${string}`,
        s: params.permit.s as `0x${string}`,
      },
    ],
  });

  return { calldata, wbtcAmountWei: params.wbtcAmount };
}

/**
 * Encode pool parameters for Conductor.createPool() (ERC20-only pools via Permit2).
 * Returns sorted token info for the caller to build the full Permit2 transaction.
 */
export function encodeCreatePoolParams(params: CreatePoolParams): {
  token0: string;
  token1: string;
  amount0Desired: bigint;
  amount1Desired: bigint;
  tickLower: number;
  tickUpper: number;
} {
  const [token0, token1] = sortTokens(params.tokenA, params.tokenB);
  const isSwapped = token0.toLowerCase() !== params.tokenA.toLowerCase();

  const { tickLower, tickUpper } = fullRangeTicks(params.tickSpacing);

  return {
    token0,
    token1,
    amount0Desired: isSwapped ? params.amountB : params.amountA,
    amount1Desired: isSwapped ? params.amountA : params.amountB,
    tickLower,
    tickUpper,
  };
}

/**
 * Conductor Contract ABI Encoding
 *
 * Low-level calldata encoding for the Conductor contract.
 * Used internally by TradingClient — consumers should use TradingClient.swap() instead.
 */

import { encodeFunctionData } from "viem";
import { conductorAbi } from "./abis/conductor";

/** Parameters for Conductor.swap() — ERC20 to ERC20. */
export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  integrator?: string;
  /** Integrator fee in basis points (0..=1000). Defaults to 0. */
  integratorBps?: number;
  /** Absolute unix-seconds on-chain deadline. Defaults to now + 30 minutes. */
  deadline?: bigint;
}

/** Parameters for Conductor.swapBTC() — native BTC to ERC20. */
export interface SwapBTCParams {
  tokenOut: string;
  fee: number;
  minAmountOut: bigint;
  integrator?: string;
  /** Integrator fee in basis points (0..=1000). Defaults to 0. */
  integratorBps?: number;
  /** Absolute unix-seconds on-chain deadline. Defaults to now + 30 minutes. */
  deadline?: bigint;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
        params.integratorBps ?? 0,
        params.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 30 * 60),
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
        params.integratorBps ?? 0,
        params.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 30 * 60),
      ],
    });
  },
};

/** AMM-specific configuration (Conductor and Uniswap addresses). */
export interface ConductorConfig {
  conductorAddress: string;
  wbtcAddress: string;
  factoryAddress: string;
  rpcUrl: string;
  chainId: number;
}

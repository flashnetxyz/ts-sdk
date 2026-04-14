/**
 * Conductor Contract ABI Encoding
 *
 * Low-level calldata encoding for the Conductor contract.
 * Used internally by AMMClient — consumers should use AMMClient.swap() instead.
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
}

/** Parameters for Conductor.swapBTC() — native BTC to ERC20. */
export interface SwapBTCParams {
  tokenOut: string;
  fee: number;
  minAmountOut: bigint;
  integrator?: string;
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
};

/** AMM-specific configuration (Conductor and Uniswap addresses). */
export interface ConductorConfig {
  conductorAddress: string;
  wbtcAddress: string;
  factoryAddress: string;
  rpcUrl: string;
  chainId: number;
}

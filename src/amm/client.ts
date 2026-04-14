/**
 * Flashnet AMM Client
 *
 * High-level client for DEX operations through the Conductor contract.
 * Wraps ExecutionClient for intent submission and EVM signing.
 *
 * @example
 * ```typescript
 * import { ExecutionClient } from "@flashnet/sdk";
 * import { AMMClient } from "@flashnet/sdk/amm";
 *
 * const execClient = new ExecutionClient(sparkWallet, { ... });
 * await execClient.authenticate();
 *
 * const amm = new AMMClient(execClient, {
 *   conductorAddress: "0x...",
 *   wbtcAddress: "0x...",
 *   factoryAddress: "0x...",
 * });
 *
 * await amm.swap({
 *   assetInAddress: "btc",
 *   assetOutAddress: "0x...",
 *   amountIn: "1000",
 *   maxSlippageBps: 500,
 *   minAmountOut: "0",
 * });
 * ```
 */

import { encodeFunctionData } from "viem";
import type { ExecutionClient } from "../execution/client";
import type { ExecuteResponse } from "../execution/types";
import { conductorAbi } from "../execution/abis/conductor";
import { fetchNonce, fetchAllowance } from "../execution/evm";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT256 = (1n << 256n) - 1n;
const DEFAULT_SWAP_GAS_LIMIT = 1_000_000n;
const DEFAULT_APPROVE_GAS_LIMIT = 100_000n;

/** Conversion factor: 1 sat = 10^10 wei on Flashnet's EVM. */
const WEI_PER_SAT = 10_000_000_000n;

/**
 * AMM-specific configuration (Conductor and Uniswap addresses).
 */
export interface AMMConfig {
  /** Conductor proxy contract address. */
  conductorAddress: string;
  /** WBTC (wrapped native BTC) token address. */
  wbtcAddress: string;
  /** Uniswap V3 Factory address. */
  factoryAddress: string;
}

/** Parameters for a swap. */
export interface SwapParams {
  /** Input asset address, or "btc" for native BTC. */
  assetInAddress: string;
  /** Output asset address, or "btc" for native BTC. */
  assetOutAddress: string;
  /** Amount in (sats if BTC, base units if token). String to match FlashnetClient convention. */
  amountIn: string;
  /** Maximum slippage in basis points. */
  maxSlippageBps: number;
  /** Minimum acceptable output amount (base units). String. */
  minAmountOut: string;
  /** Uniswap V3 fee tier (500, 3000, 10000). */
  fee: number;
  /** Integrator fee rate in basis points (optional). */
  integratorFeeRateBps?: number;
  /** Integrator public key for fee collection (optional). */
  integratorPublicKey?: string;
  /** Whether to withdraw output back to Spark. Default true. */
  withdraw?: boolean;
}

/** Result of a swap operation. */
export interface SwapResult {
  submissionId: string;
  intentId: string;
  status: string;
}

/**
 * High-level AMM client for Flashnet DEX operations.
 *
 * Wraps the Conductor contract interactions and delegates to
 * ExecutionClient for intent submission and EVM signing.
 */
export class AMMClient {
  private readonly execClient: ExecutionClient;
  private readonly config: AMMConfig;

  constructor(execClient: ExecutionClient, config: AMMConfig) {
    this.execClient = execClient;
    this.config = config;
  }

  /**
   * Execute a swap through the Conductor contract.
   *
   * Detects BTC input/output from `assetInAddress === "btc"` and routes
   * to the appropriate Conductor function. If `withdraw` is true (default),
   * uses the `*AndWithdraw` variants to send output back to Spark.
   */
  async swap(params: SwapParams): Promise<SwapResult> {
    const isBtcIn = params.assetInAddress.toLowerCase() === "btc";
    const isBtcOut = params.assetOutAddress.toLowerCase() === "btc";
    const withdraw = params.withdraw ?? true;
    const integrator = params.integratorPublicKey ?? ZERO_ADDRESS;
    const amountIn = BigInt(params.amountIn);
    const minAmountOut = BigInt(params.minAmountOut);
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();

    if (isBtcIn) {
      // Native BTC → Token
      const calldata = this.encodeBtcSwap(
        params.assetOutAddress,
        params.fee,
        minAmountOut,
        integrator,
        withdraw
      );
      const nonce = await fetchNonce(execConfig.rpcUrl, account.address);
      const signedTx = await account.signTransaction({
        to: this.config.conductorAddress as `0x${string}`,
        data: calldata as `0x${string}`,
        value: amountIn * WEI_PER_SAT,
        chainId: execConfig.chainId,
        nonce,
        gas: DEFAULT_SWAP_GAS_LIMIT,
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        type: "eip1559" as const,
      });

      return this.submitSwapIntent(signedTx);
    }

    // ERC20 input — check and handle approval
    await this.ensureAllowance(params.assetInAddress, amountIn);

    if (isBtcOut) {
      // Token → native BTC
      const calldata = this.encodeTokenToBtcSwap(
        params.assetInAddress,
        params.fee,
        amountIn,
        minAmountOut,
        integrator,
        withdraw
      );
      const nonce = await fetchNonce(execConfig.rpcUrl, account.address);
      const signedTx = await account.signTransaction({
        to: this.config.conductorAddress as `0x${string}`,
        data: calldata as `0x${string}`,
        value: 0n,
        chainId: execConfig.chainId,
        nonce,
        gas: DEFAULT_SWAP_GAS_LIMIT,
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        type: "eip1559" as const,
      });

      return this.submitSwapIntent(signedTx);
    }

    // Token → Token
    const calldata = this.encodeTokenSwap(
      params.assetInAddress,
      params.assetOutAddress,
      params.fee,
      amountIn,
      minAmountOut,
      integrator,
      withdraw
    );
    const nonce = await fetchNonce(execConfig.rpcUrl, account.address);
    const signedTx = await account.signTransaction({
      to: this.config.conductorAddress as `0x${string}`,
      data: calldata as `0x${string}`,
      value: 0n,
      chainId: execConfig.chainId,
      nonce,
      gas: DEFAULT_SWAP_GAS_LIMIT,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      type: "eip1559" as const,
    });

    return this.submitSwapIntent(signedTx);
  }

  // ── Private helpers ────────────────────────────────────────

  private async submitSwapIntent(signedTx: string): Promise<SwapResult> {
    const result = await this.execClient.execute({
      deposits: [],
      signedTx,
    });
    return {
      submissionId: result.submissionId,
      intentId: result.intentId,
      status: result.status,
    };
  }

  /**
   * Ensure the Conductor has sufficient allowance for the input token.
   * If not, submits an approve intent and waits briefly for inclusion.
   */
  private async ensureAllowance(
    tokenAddress: string,
    amountIn: bigint,
    waitMs: number = 3000
  ): Promise<void> {
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
    const allowance = await fetchAllowance(
      execConfig.rpcUrl,
      tokenAddress,
      account.address,
      this.config.conductorAddress
    );

    if (allowance >= amountIn) return;

    // Submit approve intent
    const calldata = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ],
      functionName: "approve",
      args: [
        this.config.conductorAddress as `0x${string}`,
        MAX_UINT256,
      ],
    });

    const nonce = await fetchNonce(execConfig.rpcUrl, account.address);
    const signedTx = await account.signTransaction({
      to: tokenAddress as `0x${string}`,
      data: calldata as `0x${string}`,
      value: 0n,
      chainId: execConfig.chainId,
      nonce,
      gas: DEFAULT_APPROVE_GAS_LIMIT,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      type: "eip1559" as const,
    });

    await this.execClient.execute({ deposits: [], signedTx });
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // ── Calldata encoding ──────────────────────────────────────

  private encodeBtcSwap(
    tokenOut: string,
    fee: number,
    minAmountOut: bigint,
    integrator: string,
    withdraw: boolean
  ): string {
    if (withdraw) {
      // TODO: Use swapBTCAndWithdraw once Conductor ABI is updated
      return encodeFunctionData({
        abi: conductorAbi,
        functionName: "swapBTC",
        args: [
          tokenOut as `0x${string}`,
          fee,
          minAmountOut,
          integrator as `0x${string}`,
        ],
      });
    }
    return encodeFunctionData({
      abi: conductorAbi,
      functionName: "swapBTC",
      args: [
        tokenOut as `0x${string}`,
        fee,
        minAmountOut,
        integrator as `0x${string}`,
      ],
    });
  }

  private encodeTokenToBtcSwap(
    tokenIn: string,
    fee: number,
    amountIn: bigint,
    minAmountOut: bigint,
    integrator: string,
    withdraw: boolean
  ): string {
    // Token → BTC uses the regular swap with WBTC as output,
    // or swapAndWithdrawBTC when withdraw is true.
    // TODO: Use swapAndWithdrawBTC once Conductor ABI is updated
    return encodeFunctionData({
      abi: conductorAbi,
      functionName: "swap",
      args: [
        tokenIn as `0x${string}`,
        this.config.wbtcAddress as `0x${string}`,
        fee,
        amountIn,
        minAmountOut,
        integrator as `0x${string}`,
      ],
    });
  }

  private encodeTokenSwap(
    tokenIn: string,
    tokenOut: string,
    fee: number,
    amountIn: bigint,
    minAmountOut: bigint,
    integrator: string,
    withdraw: boolean
  ): string {
    // TODO: Use swapAndWithdraw once Conductor ABI is updated
    return encodeFunctionData({
      abi: conductorAbi,
      functionName: "swap",
      args: [
        tokenIn as `0x${string}`,
        tokenOut as `0x${string}`,
        fee,
        amountIn,
        minAmountOut,
        integrator as `0x${string}`,
      ],
    });
  }
}

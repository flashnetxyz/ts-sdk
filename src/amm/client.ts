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
 *   // Compute minAmountOut from your own quote + slippage tolerance.
 *   // The SDK does not provide slippage protection automatically.
 *   minAmountOut: "950000",
 *   fee: 3000,
 * });
 * ```
 */

import { encodeFunctionData, type Hex } from "viem";
import type { ExecutionClient } from "../execution/client";
import type { ExecuteResponse } from "../execution/types";
import { conductorAbi } from "../execution/abis/conductor";
import { fetchNonce, fetchAllowance, fetchEip1559Fees } from "../execution/evm";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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
  /**
   * Permit2 contract address. Required when `approvalMode` is `"permit2"`.
   * On Uniswap's canonical deployments this is
   * `0x000000000022D473030F116dDEE9F6B43aC78BA3` but localnet deploys its
   * own so callers must supply it.
   */
  permit2Address?: string;
  /**
   * How to authorize the Conductor to pull input tokens for ERC-20 swaps.
   *
   * - `"exact"` (default): submit a one-off `approve(conductor, amountIn)`
   *   intent before the swap and poll until it lands. Two intents per swap
   *   (one approve + one swap) but no extra trust assumption beyond "the
   *   Conductor proxy will behave correctly for exactly one swap".
   * - `"permit2"`: sign an EIP-712 `PermitTransferFrom` with the identity
   *   key and pass it to `swap*WithPermit2`. One intent per swap, no
   *   standing allowance. Requires `permit2Address` to be configured.
   */
  approvalMode?: "exact" | "permit2";
  /**
   * Gas limit for swap transactions. Defaults to 1_000_000 — generous for
   * a single-pool swap-and-withdraw. Adjust if your Conductor deployment
   * includes additional hooks.
   */
  swapGasLimit?: bigint;
  /**
   * Gas limit for ERC-20 approval transactions. Defaults to 100_000.
   */
  approveGasLimit?: bigint;
}

/** Parameters for a swap. */
export interface SwapParams {
  /** Input asset address, or "btc" for native BTC. */
  assetInAddress: string;
  /** Output asset address, or "btc" for native BTC. */
  assetOutAddress: string;
  /** Amount in (sats if BTC, base units if token). String to match FlashnetClient convention. */
  amountIn: string;
  /**
   * Minimum acceptable output amount (base units). String.
   *
   * The caller is responsible for computing this from their own quote
   * and slippage tolerance — the SDK does not fetch quotes on your
   * behalf. `"0"` disables slippage protection and exposes you to
   * sandwich attacks; set a realistic bound for any non-test code.
   */
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

    // BTC → BTC is a no-op the Conductor can't express. Reject explicitly
    // so callers don't get a downstream "invalid address" error from
    // viem when the SDK tries to ABI-encode "btc" as a 20-byte address.
    if (isBtcIn && isBtcOut) {
      throw new Error(
        'swap: BTC → BTC is not a valid swap. Both assetInAddress and ' +
          'assetOutAddress are "btc".'
      );
    }

    // Token → BTC with withdraw:false has no clean semantics: the SDK
    // cannot mint native BTC to the caller's EVM address (only wrapped
    // WBTC). Rather than silently returning WBTC (surprising), reject
    // the combination. If a caller genuinely wants WBTC, they should
    // pass assetOutAddress: wbtcAddress explicitly.
    if (isBtcOut && !withdraw) {
      throw new Error(
        'swap: assetOutAddress="btc" with withdraw=false is ambiguous. ' +
          'Use withdraw=true to bridge native BTC back to Spark, or pass ' +
          "the WBTC contract address explicitly if you want wrapped BTC " +
          "to stay on EVM."
      );
    }

    const integrator = params.integratorPublicKey ?? ZERO_ADDRESS;
    const amountIn = BigInt(params.amountIn);
    const minAmountOut = BigInt(params.minAmountOut);
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
    // sparkRecipient is only needed for *AndWithdraw variants.
    const sparkRecipient = withdraw
      ? await this.execClient.getSparkRecipientHex()
      : "";

    if (isBtcIn) {
      const calldata = this.encodeBtcSwap(
        params.assetOutAddress, params.fee, minAmountOut, integrator, withdraw, sparkRecipient
      );
      const signedTx = await this.signConductorTx(calldata, amountIn * WEI_PER_SAT);
      return this.submitSwapIntent(signedTx);
    }

    // ERC20 input. Two paths depending on approvalMode:
    //   - "exact" (default): pre-approve exact amountIn, then call the
    //     plain *AndWithdraw variant.
    //   - "permit2": sign a PermitTransferFrom with the identity key and
    //     call the *WithPermit2 variant — no allowance left on-chain.
    const approvalMode = this.config.approvalMode ?? "exact";
    if (approvalMode === "permit2" && withdraw) {
      // Permit2 path is only wired for the withdraw=true variants today.
      // If caller wants permit2 without withdraw, fall through to exact.
      const permit = await this.buildPermit2Signature(
        params.assetInAddress,
        amountIn
      );
      const calldata = isBtcOut
        ? encodeFunctionData({
            abi: conductorAbi,
            functionName: "swapAndWithdrawBTCWithPermit2",
            args: [
              params.assetInAddress as `0x${string}`,
              params.fee,
              amountIn,
              minAmountOut,
              sparkRecipient as `0x${string}`,
              integrator as `0x${string}`,
              permit.permitTransfer,
              permit.signature,
            ],
          })
        : encodeFunctionData({
            abi: conductorAbi,
            functionName: "swapAndWithdrawWithPermit2",
            args: [
              params.assetInAddress as `0x${string}`,
              params.assetOutAddress as `0x${string}`,
              params.fee,
              amountIn,
              minAmountOut,
              sparkRecipient as `0x${string}`,
              integrator as `0x${string}`,
              permit.permitTransfer,
              permit.signature,
            ],
          });
      const signedTx = await this.signConductorTx(calldata, 0n);
      return this.submitSwapIntent(signedTx);
    }

    // Exact-approval path
    await this.ensureAllowance(params.assetInAddress, amountIn);

    if (isBtcOut) {
      const calldata = this.encodeTokenToBtcSwap(
        params.assetInAddress, params.fee, amountIn, minAmountOut, integrator, withdraw, sparkRecipient
      );
      const signedTx = await this.signConductorTx(calldata, 0n);
      return this.submitSwapIntent(signedTx);
    }

    const calldata = this.encodeTokenSwap(
      params.assetInAddress, params.assetOutAddress, params.fee,
      amountIn, minAmountOut, integrator, withdraw, sparkRecipient
    );
    const signedTx = await this.signConductorTx(calldata, 0n);
    return this.submitSwapIntent(signedTx);
  }

  /**
   * Build a Permit2 `PermitTransferFrom` struct + EIP-712 signature that
   * authorizes the Conductor to pull `amountIn` of `tokenAddress` from the
   * identity-derived EVM address.
   *
   * Nonce is sourced from the low bits of the deadline to avoid needing a
   * dedicated nonce oracle — Permit2 treats nonces as a 256-bit bitmap,
   * so collisions are vanishingly unlikely at human timescales.
   */
  private async buildPermit2Signature(
    tokenAddress: string,
    amountIn: bigint
  ): Promise<{
    permitTransfer: {
      permitted: { token: `0x${string}`; amount: bigint };
      nonce: bigint;
      deadline: bigint;
    };
    signature: Hex;
  }> {
    if (!this.config.permit2Address) {
      throw new Error(
        "approvalMode='permit2' requires permit2Address in AMMConfig. " +
          "Pass the deployed Permit2 contract address."
      );
    }
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 30); // 30 min
    // Use a time-derived nonce: Permit2 nonces are a 256-bit bitmap keyed
    // on the owner, so uniqueness within 1ms is sufficient.
    const nonce = BigInt(Date.now());

    const permitted = {
      token: tokenAddress as `0x${string}`,
      amount: amountIn,
    };
    const permitTransfer = { permitted, nonce, deadline };

    const signature = await account.signTypedData({
      domain: {
        name: "Permit2",
        chainId: execConfig.chainId,
        verifyingContract: this.config.permit2Address as `0x${string}`,
      },
      types: {
        PermitTransferFrom: [
          { name: "permitted", type: "TokenPermissions" },
          { name: "spender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
        TokenPermissions: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
      primaryType: "PermitTransferFrom",
      message: {
        permitted,
        spender: this.config.conductorAddress as `0x${string}`,
        nonce,
        deadline,
      },
    });

    return { permitTransfer, signature };
  }

  /**
   * Sign a transaction to the Conductor contract with current fee params.
   * Queries nonce and EIP-1559 fees from the RPC rather than hardcoding 0.
   */
  private async signConductorTx(calldata: string, value: bigint): Promise<string> {
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
    const [nonce, fees] = await Promise.all([
      fetchNonce(execConfig.rpcUrl, account.address),
      fetchEip1559Fees(execConfig.rpcUrl),
    ]);
    return account.signTransaction({
      to: this.config.conductorAddress as `0x${string}`,
      data: calldata as `0x${string}`,
      value,
      chainId: execConfig.chainId,
      nonce,
      gas: this.config.swapGasLimit ?? DEFAULT_SWAP_GAS_LIMIT,
      ...fees,
      type: "eip1559" as const,
    });
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
  /**
   * Approve the Conductor for `amountIn` of `tokenAddress` if allowance
   * is insufficient, then poll `fetchAllowance` until the on-chain state
   * reflects the approval or a timeout fires.
   *
   * Uses exact-amount approval (not `MAX_UINT256`) so the Conductor proxy
   * — which is owner-upgradeable — does not retain a standing infinite
   * allowance between swaps. Partners concerned about trust can also use
   * the Conductor's Permit2 variants (not yet wired into this client).
   */
  private async ensureAllowance(
    tokenAddress: string,
    amountIn: bigint,
    timeoutMs: number = 30_000
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

    // Exact-amount approval — intentionally NOT infinite.
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
      args: [this.config.conductorAddress as `0x${string}`, amountIn],
    });

    const [nonce, fees] = await Promise.all([
      fetchNonce(execConfig.rpcUrl, account.address),
      fetchEip1559Fees(execConfig.rpcUrl),
    ]);
    const signedTx = await account.signTransaction({
      to: tokenAddress as `0x${string}`,
      data: calldata as `0x${string}`,
      value: 0n,
      chainId: execConfig.chainId,
      nonce,
      gas: this.config.approveGasLimit ?? DEFAULT_APPROVE_GAS_LIMIT,
      ...fees,
      type: "eip1559" as const,
    });

    await this.execClient.execute({ deposits: [], signedTx });

    // Poll until the approval lands on-chain instead of a hardcoded sleep.
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = await fetchAllowance(
        execConfig.rpcUrl,
        tokenAddress,
        account.address,
        this.config.conductorAddress
      );
      if (current >= amountIn) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(
      `Approval for ${tokenAddress} did not land within ${timeoutMs}ms — ` +
        `check the intent was accepted and the sequencer is producing blocks.`
    );
  }

  // ── Calldata encoding ──────────────────────────────────────

  private encodeBtcSwap(
    tokenOut: string,
    fee: number,
    minAmountOut: bigint,
    integrator: string,
    withdraw: boolean,
    sparkRecipient: string
  ): string {
    if (withdraw) {
      return encodeFunctionData({
        abi: conductorAbi,
        functionName: "swapBTCAndWithdraw",
        args: [
          tokenOut as `0x${string}`,
          fee,
          minAmountOut,
          sparkRecipient as `0x${string}`,
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
    withdraw: boolean,
    sparkRecipient: string
  ): string {
    if (withdraw) {
      return encodeFunctionData({
        abi: conductorAbi,
        functionName: "swapAndWithdrawBTC",
        args: [
          tokenIn as `0x${string}`,
          fee,
          amountIn,
          minAmountOut,
          sparkRecipient as `0x${string}`,
          integrator as `0x${string}`,
        ],
      });
    }
    // When not withdrawing, swap tokenIn → WBTC and leave the WBTC in the
    // user's account on the EVM side.
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
    withdraw: boolean,
    sparkRecipient: string
  ): string {
    if (withdraw) {
      return encodeFunctionData({
        abi: conductorAbi,
        functionName: "swapAndWithdraw",
        args: [
          tokenIn as `0x${string}`,
          tokenOut as `0x${string}`,
          fee,
          amountIn,
          minAmountOut,
          sparkRecipient as `0x${string}`,
          integrator as `0x${string}`,
        ],
      });
    }
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

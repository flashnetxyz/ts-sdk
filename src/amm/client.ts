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

import {
  encodeFunctionData,
  bytesToHex,
  hexToBigInt,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import type { ExecutionClient } from "../execution/client";
import type { Deposit, ExecuteResponse } from "../execution/types";
import { conductorAbi } from "../execution/abis/conductor";
import { fetchNonce, fetchAllowance, fetchEip1559Fees } from "../execution/evm";
import {
  decodeSparkHumanReadableTokenIdentifier,
  type SparkHumanReadableTokenIdentifier,
} from "../utils/tokenAddress";
import type { SparkNetworkType } from "../types";

/**
 * Normalize a Spark token identifier into its two required forms.
 *
 * The Spark SDK's `wallet.transferTokens` takes the human-readable
 * bech32m form (`btknrt1...` / `btkn1...`), while the execution
 * gateway's `/execute` endpoint validates the `tokenId` in the deposit
 * payload as a 64-char lowercase hex string (32 bytes, no `0x` prefix).
 *
 * We require the bech32m form as input: given a hex string we could
 * re-encode to bech32m only if we knew the Spark network, and the AMM
 * client intentionally doesn't carry that. The bech32m prefix
 * (`btkn`/`btknt`/`btkns`/`btknrt`) tells us the network unambiguously.
 */
function normalizeSparkTokenIdentifier(
  input: string
): { bech32m: SparkHumanReadableTokenIdentifier; hex: string } {
  const trimmed = input.trim();
  if (!trimmed.startsWith("btkn")) {
    throw new Error(
      `assetInSparkTokenId must be the bech32m form (btkn...). ` +
        `Got "${trimmed.slice(0, 10)}...". If you only have the hex ` +
        `token id, re-encode to bech32m with ` +
        `encodeSparkHumanReadableTokenIdentifier(hex, sparkNetwork).`
    );
  }
  // Detect network from the prefix. Longer prefixes must match first —
  // otherwise `btknrt` would match `btkn` too early.
  const network: SparkNetworkType = trimmed.startsWith("btknrt")
    ? "REGTEST"
    : trimmed.startsWith("btkns")
      ? "SIGNET"
      : trimmed.startsWith("btknt")
        ? "TESTNET"
        : "MAINNET";
  const decoded = decodeSparkHumanReadableTokenIdentifier(
    trimmed as SparkHumanReadableTokenIdentifier,
    network
  );
  return {
    bech32m: trimmed as SparkHumanReadableTokenIdentifier,
    hex: decoded.tokenIdentifier,
  };
}
import { getClient } from "../execution/rpc";

/** Minimal ERC-2612 ABI surface needed to build a Permit signature. */
const ERC20_PERMIT_READ_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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
   * Spark address of the bridge custody. Required when a caller uses
   * `useAvailableBalance: true` so AMMClient can make the Spark transfer
   * that funds the bundled deposit.
   */
  bridgeCustodySparkAddress?: string;
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
  /**
   * When true, AMMClient sources `amountIn` from the caller's Spark
   * balance: it makes the Spark transfer to `bridgeCustodySparkAddress`
   * and bundles the resulting `transferId` into the execute intent as a
   * `deposit`. This is the single-intent "round-trip" path — nothing is
   * expected to sit on the caller's EVM address before or after.
   *
   * For `assetInAddress: "btc"` this uses `swapBTCAndWithdraw` (no
   * allowance needed). For ERC-20 inputs it uses the EIP-2612 variants
   * (`swapAndWithdrawWithEIP2612` / `swapAndWithdrawBTCWithEIP2612`), so
   * `assetInAddress` must point to a token that implements ERC20Permit —
   * BridgedSparkToken does. No prior on-chain approve is required.
   *
   * Requires `withdraw` to be true (the default) and
   * `config.bridgeCustodySparkAddress` to be set. Ignored by the legacy
   * no-deposit swap paths.
   */
  useAvailableBalance?: boolean;
  /**
   * Spark token identifier (issuer-sdk `tokenIdentifier`) corresponding
   * to `assetInAddress` on the EVM side. Required when
   * `useAvailableBalance` is true and the input is a token; ignored for
   * BTC inputs.
   */
  assetInSparkTokenId?: string;
}

/** Result of a swap operation. */
export interface SwapResult {
  submissionId: string;
  intentId: string;
  status: string;
  /**
   * Keccak-256 hash of the signed EVM transaction, for linking to a
   * block explorer. Deterministic — recoverable from the RLP-encoded
   * signed tx — but returning it here saves callers the re-derivation.
   */
  evmTxHash: string;
  /**
   * Spark transfer id of the inbound (caller → bridge custody) transfer
   * that funded the bundled deposit. Set only when
   * `useAvailableBalance` was true on the originating call; undefined
   * for the legacy no-deposit paths.
   */
  inboundSparkTransferId?: string;
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

    // Round-trip path: AMMClient owns the full Spark→EVM→Spark dance in
    // one intent. Dispatch to the dedicated helper so the classic paths
    // below stay readable.
    if (params.useAvailableBalance) {
      return this.swapWithSparkDeposit(params, isBtcIn, isBtcOut);
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
   * Nonce is a 256-bit CSPRNG value so same-millisecond calls can't
   * collide and an attacker can't predict a future nonce to pre-burn
   * it with a cheap reverting swap. Permit2 treats nonces as a 256-bit
   * bitmap keyed on the owner, so random selection from the full space
   * has negligible collision probability.
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
    // 256-bit CSPRNG nonce — unpredictable and non-colliding across
    // concurrent calls. Time-derived nonces collide within 1ms and let
    // attackers pre-burn the next nonce word with a cheap revert.
    const nonce = hexToBigInt(bytesToHex(crypto.getRandomValues(new Uint8Array(32))));

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

  private async submitSwapIntent(
    signedTx: string,
    deposits: Deposit[] = [],
    inboundSparkTransferId?: string
  ): Promise<SwapResult> {
    const result = await this.execClient.execute({ deposits, signedTx });
    return {
      submissionId: result.submissionId,
      intentId: result.intentId,
      status: result.status,
      evmTxHash: keccak256(signedTx as `0x${string}`),
      inboundSparkTransferId,
    };
  }

  /**
   * Bundle a Spark-side deposit with the swap+withdraw in ONE execute
   * intent.
   *
   * Flow:
   *   1. Make a Spark transfer from the caller to
   *      `bridgeCustodySparkAddress`. This produces a `transferId` that
   *      authorizes the gateway to apply the deposit to the caller's
   *      EVM identity address before the signed tx runs.
   *   2. Build the swap calldata. For BTC in we use `swapBTCAndWithdraw`
   *      (msg.value funded by the deposit, no allowance needed). For
   *      ERC-20 in we use the `*WithEIP2612` variants and sign an
   *      EIP-2612 permit so the Conductor can pull the freshly-minted
   *      bridged tokens in the same tx — no standing allowance required.
   *   3. Sign the EVM tx with the identity key and submit a single
   *      execute intent containing both the deposit and the signed tx.
   */
  private async swapWithSparkDeposit(
    params: SwapParams,
    isBtcIn: boolean,
    isBtcOut: boolean
  ): Promise<SwapResult> {
    const withdraw = params.withdraw ?? true;
    if (!withdraw) {
      throw new Error(
        "swap: useAvailableBalance requires withdraw=true — the " +
          "round-trip path always sends output back to Spark."
      );
    }
    if (!this.config.bridgeCustodySparkAddress) {
      throw new Error(
        "swap: useAvailableBalance requires config.bridgeCustodySparkAddress " +
          "so AMMClient knows where to send the Spark transfer that funds " +
          "the bundled deposit."
      );
    }
    if (!isBtcIn && !params.assetInSparkTokenId) {
      throw new Error(
        "swap: useAvailableBalance with an ERC-20 input requires " +
          "assetInSparkTokenId (the Spark-side tokenIdentifier matching " +
          "assetInAddress)."
      );
    }

    const integrator = params.integratorPublicKey ?? ZERO_ADDRESS;
    const amountIn = BigInt(params.amountIn);
    const minAmountOut = BigInt(params.minAmountOut);
    const sparkRecipient = await this.execClient.getSparkRecipientHex();
    const custody = this.config.bridgeCustodySparkAddress;

    // For ERC-20 inputs, normalize the Spark token id into both forms:
    // bech32m for the Spark SDK's transferTokens call, hex for the
    // deposit payload the gateway validates.
    const tokenIdForms = isBtcIn
      ? null
      : normalizeSparkTokenIdentifier(params.assetInSparkTokenId!);

    // Step 1: Spark transfer → bridge custody.
    const transferId = await this.sparkTransferForDeposit(
      isBtcIn,
      amountIn,
      tokenIdForms?.bech32m,
      custody
    );

    const deposits: Deposit[] = isBtcIn
      ? [{ sparkTransferId: transferId, amount: amountIn, asset: { type: "btc" } }]
      : [
          {
            sparkTransferId: transferId,
            amount: amountIn,
            asset: { type: "token", tokenId: tokenIdForms!.hex },
          },
        ];

    // Step 2: build calldata.
    let calldata: string;
    let value: bigint = 0n;
    if (isBtcIn) {
      // BTC in: the gateway credits native BTC to our EVM address via the
      // deposit, then swapBTCAndWithdraw consumes it as msg.value. No
      // permit needed.
      calldata = encodeFunctionData({
        abi: conductorAbi,
        functionName: "swapBTCAndWithdraw",
        args: [
          params.assetOutAddress as `0x${string}`,
          params.fee,
          minAmountOut,
          sparkRecipient as `0x${string}`,
          integrator as `0x${string}`,
        ],
      });
      value = amountIn * WEI_PER_SAT;
    } else {
      // ERC-20 in: sign an EIP-2612 permit against the freshly-minted
      // bridged token and use the *WithEIP2612 Conductor variants so
      // no standing allowance is required.
      const permit = await this.signEip2612Permit(
        params.assetInAddress,
        amountIn
      );
      if (isBtcOut) {
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "swapAndWithdrawBTCWithEIP2612",
          args: [
            params.assetInAddress as `0x${string}`,
            params.fee,
            amountIn,
            minAmountOut,
            sparkRecipient as `0x${string}`,
            integrator as `0x${string}`,
            permit,
          ],
        });
      } else {
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "swapAndWithdrawWithEIP2612",
          args: [
            params.assetInAddress as `0x${string}`,
            params.assetOutAddress as `0x${string}`,
            params.fee,
            amountIn,
            minAmountOut,
            sparkRecipient as `0x${string}`,
            integrator as `0x${string}`,
            permit,
          ],
        });
      }
    }

    // Step 3: sign + submit bundled intent.
    const signedTx = await this.signConductorTx(calldata, value);
    return this.submitSwapIntent(signedTx, deposits, transferId);
  }

  /**
   * Make the Spark-side transfer that funds a bundled deposit, returning
   * the transferId. Accepts both BTC (sats) and Spark-issued tokens.
   *
   * The Spark SDK's `wallet.transfer` / `wallet.transferTokens` return
   * UUID-style ids for BTC transfers (e.g. `019d97f2-c32b-99c5-...`). The
   * execution gateway's `/api/v1/execute` endpoint only accepts pure-hex
   * transfer ids, so we normalize (strip dashes and a possible `0x`
   * prefix) before bundling into the deposit payload. Matches the
   * behavior of the localnet-ui's `normalizeTransferId` helper.
   */
  private async sparkTransferForDeposit(
    isBtcIn: boolean,
    amountIn: bigint,
    assetInSparkTokenId: string | undefined,
    receiverSparkAddress: string
  ): Promise<string> {
    const wallet = this.execClient.getSparkWallet() as unknown as {
      transfer: (args: {
        amountSats: number;
        receiverSparkAddress: string;
      }) => Promise<{ id: string }>;
      transferTokens: (args: {
        tokenIdentifier: string;
        tokenAmount: bigint;
        receiverSparkAddress: string;
      }) => Promise<string>;
    };

    let rawId: string;
    if (isBtcIn) {
      // SparkWallet.transfer expects `amountSats: number`. The Spark SDK's
      // own signature caps this at Number.MAX_SAFE_INTEGER (2^53-1). That
      // ceiling is >> 21e14 (total BTC supply in sats), so it's safe for
      // any real balance — but we still validate to turn a silent overflow
      // into an actionable error.
      if (amountIn > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(
          `swap: amountIn ${amountIn} exceeds SparkWallet.transfer's ` +
            `number precision cap (2^53-1). Use a smaller value.`
        );
      }
      const transfer = await wallet.transfer({
        amountSats: Number(amountIn),
        receiverSparkAddress,
      });
      rawId = transfer.id;
    } else {
      rawId = await wallet.transferTokens({
        tokenIdentifier: assetInSparkTokenId!,
        tokenAmount: amountIn,
        receiverSparkAddress,
      });
    }

    // Normalize: strip UUID dashes and optional 0x prefix to match the
    // gateway's hex-only transfer-id format.
    const stripped = rawId.replace(/-/g, "").trim();
    return stripped.startsWith("0x") || stripped.startsWith("0X")
      ? stripped.slice(2)
      : stripped;
  }

  /**
   * Sign an EIP-2612 Permit granting the Conductor a one-shot allowance
   * of `amountIn` on `tokenAddress`. Returns the (value, deadline, v, r, s)
   * tuple shape the Conductor's `*WithEIP2612` functions expect.
   *
   * Reads `name()` and `nonces(owner)` from the token contract for the
   * EIP-712 domain and message. Uses the execution client's identity
   * account for signing — by construction this matches the EVM address
   * the bridged tokens will be minted to.
   */
  private async signEip2612Permit(
    tokenAddress: string,
    amountIn: bigint
  ): Promise<{
    value: bigint;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  }> {
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();

    // Read token.name() and token.nonces(owner) via the shared viem client
    // — matches the approach in src/execution/evm.ts helpers.
    const client = getClient(execConfig.rpcUrl);
    const [tokenName, nonce] = await Promise.all([
      client.readContract({
        address: tokenAddress as Address,
        abi: ERC20_PERMIT_READ_ABI,
        functionName: "name",
      }),
      client.readContract({
        address: tokenAddress as Address,
        abi: ERC20_PERMIT_READ_ABI,
        functionName: "nonces",
        args: [account.address],
      }),
    ]);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 30); // 30 min

    const signature = await account.signTypedData({
      domain: {
        name: tokenName,
        version: "1",
        chainId: execConfig.chainId,
        verifyingContract: tokenAddress as `0x${string}`,
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: account.address,
        spender: this.config.conductorAddress as `0x${string}`,
        value: amountIn,
        nonce,
        deadline,
      },
    });

    const r = ("0x" + signature.slice(2, 66)) as Hex;
    const s = ("0x" + signature.slice(66, 130)) as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    return { value: amountIn, deadline, v, r, s };
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

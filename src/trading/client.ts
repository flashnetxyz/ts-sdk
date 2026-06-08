/**
 * Flashnet Trading Client
 *
 * High-level client for DEX operations through the Conductor contract.
 * Wraps ExecutionClient for intent submission and EVM signing.
 *
 * @example
 * ```typescript
 * import { ExecutionClient, TradingClient } from "@flashnet/sdk";
 *
 * const execClient = new ExecutionClient(sparkWallet, { ... });
 * await execClient.authenticate();
 *
 * // Use a built-in environment preset (addresses baked into the SDK):
 * const trading = new TradingClient(execClient, "regtest");
 *
 * // Or pass an explicit config (e.g. for localnet / custom deploys):
 * const trading = new TradingClient(execClient, {
 *   conductorAddress: "0x...",
 * });
 *
 * await trading.swap({
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
  isAddress,
  keccak256,
  BaseError,
  ContractFunctionRevertedError,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { ExecutionClient } from "../execution/client";
import type {
  ClawbackResult,
  ClawbackSummary,
  Deposit,
  ExecuteResponse,
} from "../execution/types";
import { conductorAbi } from "../execution/abis/conductor";
import { nonfungiblePositionManagerAbi } from "../execution/abis/nonfungiblePositionManager";
import { fetchNonce, fetchAllowance, fetchEip1559Fees } from "../execution/evm";
import { getPoolAddress } from "../execution/pool";
import {
  uniswapV3PoolAbi,
  uniswapV3QuoterV2Abi,
} from "../execution/abis/uniswapV3";
import {
  applySlippage,
  conductorSkim,
  effectiveSwapInput,
  priceImpactBps,
  resolveFeeAsset,
  DEFAULT_SLIPPAGE_BPS,
  MAX_FEE_RATE_BPS,
  UINT24_MAX,
} from "./quote-math";
import {
  decodeSparkHumanReadableTokenIdentifier,
  type SparkHumanReadableTokenIdentifier,
} from "../utils/tokenAddress";
import type { ClientEnvironment, SparkNetworkType } from "../types";

/**
 * Normalize a Spark token identifier into its two required forms.
 *
 * The Spark SDK's `wallet.transferTokens` takes the human-readable
 * bech32m form (`btknrt1...` / `btkn1...`), while the execution
 * gateway's `/execute` endpoint validates the `tokenId` in the deposit
 * payload as a 64-char lowercase hex string (32 bytes, no `0x` prefix).
 *
 * We require the bech32m form as input: given a hex string we could
 * re-encode to bech32m only if we knew the Spark network, and the trading
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
        : trimmed.startsWith("btknl")
          ? "LOCAL"
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
const DEFAULT_LP_GAS_LIMIT = 1_500_000n;

/** Conversion factor: 1 sat = 10^10 wei on Flashnet's EVM. */
const WEI_PER_SAT = 10_000_000_000n;

/**
 * Resolve the optional integrator fee recipient to a checked 20-byte EVM
 * address, defaulting to the zero address (no integrator). Rejects malformed
 * input up front so a mistaken 33-byte pubkey can't be silently encoded into
 * the Conductor's `address` slot.
 */
function resolveIntegratorAddress(integratorAddress?: string): string {
  if (integratorAddress === undefined) return ZERO_ADDRESS;
  if (!isAddress(integratorAddress)) {
    throw new Error(
      `integratorAddress must be a 20-byte EVM address (0x...), got "${integratorAddress}".`
    );
  }
  return integratorAddress;
}

/** Default validity window for permit / on-chain deadlines (30 minutes). */
const DEFAULT_DEADLINE_SECONDS = 30 * 60;

/** Max uint256 — Permit2 spend approval that never needs re-granting. */
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Split a 65-byte `0x`-prefixed ECDSA signature into the `(v, r, s)` tuple the
 * Solidity `permit` functions expect. `v` is the recovery id (27 / 28).
 */
function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const r = ("0x" + signature.slice(2, 66)) as Hex;
  const s = ("0x" + signature.slice(66, 130)) as Hex;
  const v = parseInt(signature.slice(130, 132), 16);
  return { v, r, s };
}

/**
 * Parse a base-10 integer amount returned by the gateway, rejecting anything
 * non-numeric. The result is used as an on-chain `minAmountOut` floor, so a
 * malformed response must fail loudly here rather than slip through or blow
 * up far from its cause.
 */
function parseQuoteAmount(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`quote: gateway returned a non-numeric ${field}.`);
  }
  return BigInt(value);
}

/**
 * Configuration for the {@link TradingClient}.
 *
 * For known networks pass a preset name (see {@link ClientEnvironment})
 * instead of building this object by hand.
 */
export interface TradingConfig {
  /** Conductor proxy contract address. */
  conductorAddress: string;
  /**
   * Permit2 contract address. Required when `approvalMode` is `"permit2"`.
   * On Uniswap's canonical deployments this is
   * `0x000000000022D473030F116dDEE9F6B43aC78BA3` but localnet deploys its
   * own so callers must supply it.
   *
   * Required for every liquidity-management method (the Conductor pulls ERC20
   * legs via Permit2) and for `approvalMode: "permit2"` swaps.
   */
  permit2Address?: string;
  /**
   * Wrapped-BTC (WBTC) contract address. Required for BTC-paired liquidity
   * operations: the SDK matches `token0`/`token1` against this to detect the
   * BTC leg, route to the Conductor's `*BTC` entry point, and fund `msg.value`.
   * WBTC is 1:1 with native wei on Flashnet (1 sat = 1e10 wei).
   */
  wbtcAddress?: string;
  /**
   * Uniswap V3 Factory address. Used by pool read helpers (`getPoolAddress`).
   * A trading-stack address, so it lives here rather than on `NetworkInfo`.
   */
  factoryAddress?: string;
  /**
   * Uniswap V3 `QuoterV2` address. Required by {@link TradingClient.quote},
   * which reads `quoteExactInputSingle` directly over RPC (the gateway no
   * longer proxies quotes). A trading-stack address, like `factoryAddress`.
   */
  quoterV2Address?: string;
  /**
   * NonfungiblePositionManager (NPM) address. Required for every
   * liquidity-management method: read paths (`getPosition`, `listPositions`)
   * query it directly, and existing-position writes read `positions(tokenId)`
   * for the Permit2 token binding and sign the ERC-721 `permit` against it.
   */
  positionManagerAddress?: string;
  /**
   * Gas limit for liquidity-management transactions. Defaults to 1_500_000 —
   * LP entry points bundle a permit, an NPM call, and one or two Spark
   * withdrawals, so they need more headroom than a single-pool swap.
   */
  lpGasLimit?: bigint;
  // NOTE: the Spark deposit address used when `useAvailableBalance: true`
  // is no longer configured here. TradingClient resolves it at call time via
  // `executionClient.getNetworkInfo()` so consumers always track the
  // gateway's current view.
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
   * Minimum acceptable output amount (base units; sats if the output is
   * BTC). String.
   *
   * Compute it with {@link TradingClient.quote}, which returns a ready-to-use
   * `minAmountOut` for your slippage tolerance, or supply your own. `"0"`
   * disables slippage protection and exposes you to sandwich attacks; set a
   * realistic bound for any non-test code.
   */
  minAmountOut: string;
  /** Uniswap V3 fee tier (500, 3000, 10000). */
  fee: number;
  /** Integrator fee rate in basis points (optional). */
  integratorFeeRateBps?: number;
  /**
   * Integrator EVM address that receives the integrator fee — a 20-byte
   * `0x...` address, not a Spark public key. Optional; defaults to the zero
   * address (no integrator).
   */
  integratorAddress?: string;
  /** Whether to withdraw output back to Spark. Default true. */
  withdraw?: boolean;
  /**
   * When true, TradingClient sources `amountIn` from the caller's Spark
   * balance: it makes the Spark transfer to the gateway-advertised
   * deposit address (resolved via `executionClient.getNetworkInfo()`) and
   * bundles the resulting `transferId` into the execute intent as a
   * `deposit`. This is the single-intent "round-trip" path — nothing is
   * expected to sit on the caller's EVM address before or after.
   *
   * For `assetInAddress: "btc"` this uses `swapBTCAndWithdraw` (no
   * allowance needed). For ERC-20 inputs it uses the EIP-2612 variants
   * (`swapAndWithdrawWithEIP2612` / `swapAndWithdrawBTCWithEIP2612`), so
   * `assetInAddress` must point to a token that implements ERC20Permit —
   * SparkToken does. No prior on-chain approve is required.
   *
   * Requires `withdraw` to be true (the default). Ignored by the legacy
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
   * Spark transfer id of the inbound (caller → deposit address) transfer
   * that funded the bundled deposit. Set only when
   * `useAvailableBalance` was true on the originating call; undefined
   * for the legacy no-deposit paths.
   */
  inboundSparkTransferId?: string;
}

/** Parameters for {@link TradingClient.quote}. */
export interface QuoteParams {
  /** Input asset address, or "btc" for native BTC. */
  assetInAddress: string;
  /** Output asset address, or "btc" for native BTC. */
  assetOutAddress: string;
  /**
   * Amount in. Sats if the input is BTC, base units if a token. String, to
   * match {@link SwapParams.amountIn}.
   */
  amountIn: string;
  /** Uniswap V3 fee tier (500, 3000, 10000). */
  fee: number;
  /**
   * Slippage tolerance in basis points, used to derive `minAmountOut`. Omit
   * to use the gateway's default. Must be between 0 and 10000.
   */
  slippageBps?: number;
  /**
   * Integrator fee in basis points the Conductor will charge on this swap.
   * Folded into the quote so `amountOut`/`minAmountOut` stay net of it. Must
   * be 0..=1000. Only applied when the gateway has the Conductor address.
   */
  integratorBps?: number;
}

/** Result of {@link TradingClient.quote}. */
export interface QuoteResult {
  /**
   * Estimated output the caller receives, net of the Conductor fee. Sats if
   * the output is BTC, base units if a token. Exact per the on-chain QuoterV2
   * at quote time.
   */
  amountOut: string;
  /**
   * `amountOut` reduced by the slippage tolerance. Pass straight to
   * {@link SwapParams.minAmountOut}.
   */
  minAmountOut: string;
  /**
   * Pool mid-price move caused by the swap, in basis points. Undefined when
   * the gateway could not read the pool's pre-trade price (e.g. its factory
   * address is unconfigured).
   */
  priceImpactBps?: number;
  /** Effective slippage tolerance applied (basis points). */
  slippageBps: number;
  /** Echoed Uniswap V3 fee tier. */
  fee: number;
  /**
   * Total Conductor fee folded into `amountOut`, in basis points
   * (host + integrator + protocol). 0 when no Conductor fee applies (or the
   * gateway has no Conductor address configured).
   */
  conductorFeeBps: number;
  /**
   * The Conductor fee amount. For the WBTC fee asset this is whole sats
   * (floored) to match `amountOut`'s units; for any other asset it is that
   * token's base units. "0" when no fee applies.
   */
  conductorFeeAmount: string;
  /**
   * Asset the Conductor fee is denominated in (0x address). Undefined when no
   * fee applies.
   */
  conductorFeeAsset?: string;
}

/**
 * Client-side computed swap quote, in `tokenIn`/`tokenOut` base units. Replaces
 * the old gateway-proxied response shape; {@link TradingClient.quote} applies
 * the BTC↔sats glue on top.
 */
interface ComputedSwapQuote {
  amountOut: string;
  minAmountOut: string;
  priceImpactBps?: number;
  feeTier: number;
  slippageBps: number;
  conductorFeeBps: number;
  conductorFeeAmount: string;
  conductorFeeAsset?: string;
}

// ── Liquidity management ───────────────────────────────────────

/** Convert satoshis to Flashnet EVM wei (1 sat = 1e10 wei). */
export function satsToWei(sats: bigint | number | string): bigint {
  return BigInt(sats) * WEI_PER_SAT;
}

/** Convert Flashnet EVM wei to whole satoshis (floors any sub-sat remainder). */
export function weiToSats(wei: bigint | number | string): bigint {
  return BigInt(wei) / WEI_PER_SAT;
}

/**
 * Result of a liquidity-management intent.
 *
 * Like {@link SwapResult}, this carries the submission handles plus the
 * signed-tx hash — NOT the on-chain return values (`tokenId`, `liquidity`,
 * `used0/1`, collected amounts). Those are only knowable after the intent
 * executes; read them from the transaction receipt or the Conductor's LP
 * events (`LiquidityAdded`, `LiquidityIncreased`, `LiquidityDecreased`,
 * `FeesCollected`, `PositionModified`) once the intent reaches
 * `INCLUDED_PENDING_FINALITY`.
 */
export interface LpWriteResult {
  submissionId: string;
  intentId: string;
  status: string;
  /** Keccak-256 hash of the signed EVM transaction, for explorer linking. */
  evmTxHash: string;
  /**
   * Spark transfer ids of the inbound transfers that funded the bundled
   * deposits. Set only on the `useAvailableBalance` path. Ordered by sorted
   * leg (token0 first, then token1), BTC leg included in its slot.
   */
  inboundSparkTransferIds?: string[];
}

/** Result of `addLiquidity` / `modifyPosition` — a new position NFT is minted. */
export type MintResult = LpWriteResult;
/** Result of `increaseLiquidity`. */
export type IncreaseResult = LpWriteResult;
/** Result of `decreaseLiquidity` / `collectFees` — proceeds route to Spark. */
export type WithdrawResult = LpWriteResult;

/**
 * Inputs shared by the two-sided liquidity-providing methods
 * (`addLiquidity`, `increaseLiquidity`, `modifyPosition`).
 *
 * Token amounts are in each token's base units. **The WBTC leg is in wei**
 * (1 sat = 1e10 wei) — use {@link satsToWei} to convert. Strings match the
 * swap API's `amountIn` convention.
 *
 * For BTC-paired pools, set the BTC leg's token to the configured WBTC
 * address; the SDK detects it, routes to the Conductor's `*BTC` entry point,
 * and funds `msg.value` from the WBTC-leg desired amount.
 */
interface LpFundingInputs {
  /** Absolute unix-seconds on-chain deadline. Default: now + 30 minutes. */
  deadline?: number;
  /**
   * Spark recipient (0x-prefixed compressed pubkey) for refunded dust.
   * Defaults to the identity key's Spark recipient.
   */
  sparkRecipient?: string;
  /**
   * Source the ERC20/BTC inputs from the caller's Spark balance, bundling the
   * funding transfer(s) + the Conductor call into a single intent (mirrors
   * `swap`'s `useAvailableBalance`). ERC20 legs are pulled via Permit2, so the
   * token must already have a standing Permit2 approval from the caller's EVM
   * address — see {@link TradingClient.ensurePermit2Approval}.
   */
  useAvailableBalance?: boolean;
  /**
   * Spark token identifier (bech32m `btkn…`) for the token0 leg. Required when
   * `useAvailableBalance` is set and token0 is an ERC20 (not the WBTC leg).
   */
  token0SparkId?: string;
  /** Spark token identifier (bech32m) for the token1 leg. See `token0SparkId`. */
  token1SparkId?: string;
}

/** Parameters for {@link TradingClient.addLiquidity} (mint a new position). */
export interface AddLiquidityParams extends LpFundingInputs {
  /** Pair tokens, sorted so `token0 < token1` (lowercase address compare). Use the WBTC address for the BTC leg. */
  token0: string;
  token1: string;
  /** Uniswap V3 fee tier (500 | 3000 | 10000). */
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
}

/** Parameters for {@link TradingClient.increaseLiquidity} (grow an existing position). */
export interface IncreaseLiquidityParams extends LpFundingInputs {
  /** The position NFT id. */
  tokenId: bigint | string;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
}

/** Parameters for {@link TradingClient.decreaseLiquidity}. */
export interface DecreaseLiquidityParams {
  /** The position NFT id. */
  tokenId: bigint | string;
  /** Liquidity units to remove. */
  liquidity: bigint | string;
  /** Minimum token0 to recover (slippage floor), in token0 base units; the WBTC leg is in wei. */
  amount0Min: string;
  /** Minimum token1 to recover (slippage floor), in token1 base units; the WBTC leg is in wei. */
  amount1Min: string;
  /** Absolute unix-seconds on-chain deadline. Default: now + 30 minutes. */
  deadline?: number;
  /** Spark recipient (0x pubkey hex) for the withdrawn proceeds. Default: identity key. */
  sparkRecipient?: string;
}

/** Parameters for {@link TradingClient.collectFees}. */
export interface CollectFeesParams {
  /** The position NFT id. */
  tokenId: bigint | string;
  /** Absolute unix-seconds deadline for the NFT permit. Default: now + 30 minutes. */
  deadline?: number;
  /** Spark recipient (0x pubkey hex) for the collected fees. Default: identity key. */
  sparkRecipient?: string;
}

/** Parameters for {@link TradingClient.modifyPosition} (reposition to a new tick range). */
export interface ModifyPositionParams extends LpFundingInputs {
  /** The position NFT id to reposition. */
  tokenId: bigint | string;
  newTickLower: number;
  newTickUpper: number;
  /** Min amounts recovered from the OLD position on full decrease. */
  amount0Min: string;
  amount1Min: string;
  /** Optional extra capital added alongside recovered principal (base units; WBTC leg in wei). */
  additionalAmount0Desired?: string;
  additionalAmount1Desired?: string;
  /** Min amounts consumed minting the NEW position. */
  newAmount0Min: string;
  newAmount1Min: string;
}

/** A Uniswap V3 position as read from the NonfungiblePositionManager. */
export interface PositionInfo {
  tokenId: bigint;
  nonce: bigint;
  operator: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

/**
 * Built-in AMM environment presets — addresses for known Flashnet
 * deployments, keyed by {@link ClientEnvironment} to mirror
 * {@link CLIENT_NETWORK_CONFIGS}.
 *
 * Populate an entry once a network's contracts are deployed and stable;
 * until then callers must pass an explicit {@link TradingConfig}. Note: the
 * "staging" environment lives under `regtest` here.
 */
const TRADING_ENVIRONMENT_CONFIGS: Partial<Record<ClientEnvironment, TradingConfig>> = {
  // Populate once contracts are deployed:
  // regtest: { conductorAddress: "0x..." },
};

/**
 * Thrown when a Spark-funded operation (swap round-trip, or LP add / increase
 * / modify with `useAvailableBalance`) fails AFTER its funding transfer(s)
 * committed. The SDK automatically attempts to claw the committed transfer(s)
 * back to the caller's Spark balance; `clawbackSummary` reports which were
 * recovered and which are still at risk. `transferIds` are the committed
 * transfers; `cause` is the underlying failure.
 */
export class StrandedFundingError extends Error {
  readonly transferIds: string[];
  readonly clawbackSummary: ClawbackSummary;
  constructor(
    transferIds: string[],
    clawbackSummary: ClawbackSummary,
    cause: unknown
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const { recoveredTransferIds, unrecoveredTransferIds } = clawbackSummary;
    const recovery =
      unrecoveredTransferIds.length === 0
        ? `All ${transferIds.length} funding transfer(s) were automatically clawed back.`
        : `Auto-clawback recovered ${recoveredTransferIds.length}/${transferIds.length}; still at risk: ${unrecoveredTransferIds.join(", ")}.`;
    super(
      `funding transfer(s) ${transferIds.join(", ")} committed but the ` +
        `operation then failed: ${reason}. ${recovery}`,
      { cause }
    );
    this.name = "StrandedFundingError";
    this.transferIds = transferIds;
    this.clawbackSummary = clawbackSummary;
  }
}

/**
 * High-level trading client for Flashnet DEX operations.
 *
 * Wraps the Conductor contract interactions and delegates to
 * ExecutionClient for intent submission and EVM signing.
 */
export class TradingClient {
  private readonly execClient: ExecutionClient;
  private readonly config: TradingConfig;

  constructor(
    execClient: ExecutionClient,
    environmentOrConfig: ClientEnvironment | TradingConfig
  ) {
    this.execClient = execClient;
    this.config =
      typeof environmentOrConfig === "string"
        ? TradingClient.resolveEnvironment(environmentOrConfig)
        : environmentOrConfig;
  }

  private static resolveEnvironment(env: ClientEnvironment): TradingConfig {
    const preset = TRADING_ENVIRONMENT_CONFIGS[env];
    if (!preset) {
      const deployed = Object.keys(TRADING_ENVIRONMENT_CONFIGS);
      throw new Error(
        `TradingClient: no AMM deployment for environment "${env}". ` +
          (deployed.length === 0
            ? "No environments have AMM contracts deployed yet — pass an explicit TradingConfig."
            : `Deployed: ${deployed.join(", ")}. Pass an explicit TradingConfig for others.`)
      );
    }
    return preset;
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
          'Use withdraw=true to withdraw native BTC back to Spark, or pass ' +
          "the WBTC contract address explicitly if you want wrapped BTC " +
          "to stay on EVM."
      );
    }

    // Integrator fee (bps) the Conductor charges on this swap. Validate up
    // front so both the classic and round-trip (useAvailableBalance) paths get
    // a checked value. Must match the Conductor's per-component 1000 bps cap.
    const integratorBps = params.integratorFeeRateBps ?? 0;
    if (
      !Number.isInteger(integratorBps) ||
      integratorBps < 0 ||
      integratorBps > 1000
    ) {
      throw new Error(
        "swap: integratorFeeRateBps must be an integer between 0 and 1000."
      );
    }

    // Round-trip path: TradingClient owns the full Spark→EVM→Spark dance in
    // one intent. Dispatch to the dedicated helper so the classic paths
    // below stay readable.
    if (params.useAvailableBalance) {
      return this.swapWithSparkDeposit(params, isBtcIn, isBtcOut);
    }

    const integrator = resolveIntegratorAddress(params.integratorAddress);
    const amountIn = BigInt(params.amountIn);
    // A BTC output's on-chain `minAmountOut` is the Uniswap WBTC floor, in
    // wei. The product API denominates BTC in sats, so convert here —
    // mirroring the `amountIn * WEI_PER_SAT` the BTC-input path applies
    // below. Without this, a sats floor is enforced as wei (~1e10x too
    // small) and slippage protection silently vanishes.
    const minAmountOut = isBtcOut
      ? BigInt(params.minAmountOut) * WEI_PER_SAT
      : BigInt(params.minAmountOut);
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
    // sparkRecipient is only needed for *AndWithdraw variants.
    const sparkRecipient = withdraw
      ? await this.execClient.getSparkRecipientHex()
      : "";

    if (isBtcIn) {
      const calldata = this.encodeBtcSwap(
        params.assetOutAddress, params.fee, minAmountOut, integrator, integratorBps, withdraw, sparkRecipient
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
              integratorBps,
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
              integratorBps,
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
        params.assetInAddress, params.fee, amountIn, minAmountOut, integrator, integratorBps, sparkRecipient
      );
      const signedTx = await this.signConductorTx(calldata, 0n);
      return this.submitSwapIntent(signedTx);
    }

    const calldata = this.encodeTokenSwap(
      params.assetInAddress, params.assetOutAddress, params.fee,
      amountIn, minAmountOut, integrator, integratorBps, withdraw, sparkRecipient
    );
    const signedTx = await this.signConductorTx(calldata, 0n);
    return this.submitSwapIntent(signedTx);
  }

  /**
   * Fetch a pre-trade quote for a single-pool swap. Reads the on-chain Uniswap
   * V3 `QuoterV2` directly over RPC, folds in the Conductor's fee skim, and
   * returns the estimated output, a slippage-adjusted `minAmountOut` you can
   * pass straight to {@link swap}, and the pool price impact.
   *
   * BTC legs are quoted against the configured WBTC pool token: a `"btc"`
   * input amount (sats) is converted to WBTC wei for the quote, and a
   * `"btc"` output is converted back to whole sats (the Conductor unwraps
   * WBTC and withdraws sats, flooring sub-sat dust). Either `"btc"` leg
   * requires `wbtcAddress` in {@link TradingConfig}.
   *
   * Requires `quoterV2Address` (and, since the Conductor fee is always folded
   * in, `factoryAddress`) in {@link TradingConfig}; throws if either is unset.
   */
  async quote(params: QuoteParams): Promise<QuoteResult> {
    const isBtcIn = params.assetInAddress.toLowerCase() === "btc";
    const isBtcOut = params.assetOutAddress.toLowerCase() === "btc";
    if (isBtcIn && isBtcOut) {
      throw new Error(
        'quote: BTC → BTC is not a valid swap. Both assetInAddress and ' +
          'assetOutAddress are "btc".'
      );
    }

    const trimmedAmountIn = params.amountIn.trim();
    if (!/^\d+$/.test(trimmedAmountIn)) {
      throw new Error(
        "quote: amountIn must be a base-10 integer string (token base " +
          "units, or sats when the input is BTC)."
      );
    }
    const amountInRaw = BigInt(trimmedAmountIn);
    if (amountInRaw <= 0n) {
      throw new Error("quote: amountIn must be greater than zero.");
    }
    if (
      params.slippageBps !== undefined &&
      (!Number.isInteger(params.slippageBps) ||
        params.slippageBps < 0 ||
        params.slippageBps > 10_000)
    ) {
      throw new Error(
        "quote: slippageBps must be an integer between 0 and 10000."
      );
    }
    if (
      params.integratorBps !== undefined &&
      (!Number.isInteger(params.integratorBps) ||
        params.integratorBps < 0 ||
        params.integratorBps > 1_000)
    ) {
      throw new Error(
        "quote: integratorBps must be an integer between 0 and 1000."
      );
    }

    const tokenIn = isBtcIn
      ? this.requireWbtcAddress()
      : params.assetInAddress;
    const tokenOut = isBtcOut
      ? this.requireWbtcAddress()
      : params.assetOutAddress;
    // BTC input is denominated in sats; the WBTC pool leg is in wei.
    const amountIn = isBtcIn ? amountInRaw * WEI_PER_SAT : amountInRaw;

    const res = await this.computeSwapQuote({
      tokenIn,
      tokenOut,
      fee: params.fee,
      amountIn,
      slippageBps: params.slippageBps,
      integratorBps: params.integratorBps,
    });

    // Don't blindly trust the gateway with a value the caller will use as an
    // on-chain floor: require numeric amounts with a sane relationship, and
    // confirm the requested slippage was actually honored.
    const grossOut = parseQuoteAmount(res.amountOut, "amountOut");
    const floorOut = parseQuoteAmount(res.minAmountOut, "minAmountOut");
    if (floorOut > grossOut) {
      throw new Error(
        "quote: gateway returned minAmountOut greater than amountOut."
      );
    }
    if (
      params.slippageBps !== undefined &&
      res.slippageBps !== params.slippageBps
    ) {
      throw new Error(
        `quote: gateway applied slippageBps=${res.slippageBps}, expected ` +
          `${params.slippageBps}.`
      );
    }

    // A BTC output is reported back in whole sats to match `swap`'s units.
    const amountOut = isBtcOut
      ? weiToSats(grossOut).toString()
      : grossOut.toString();
    // A positive WBTC-wei floor that rounds down to 0 sats would tell swap()
    // to accept any output, silently dropping the slippage protection the
    // caller asked for. That only happens for sub-sat (dust) BTC outputs;
    // fail loudly rather than hand back a misleading "0".
    if (isBtcOut && floorOut > 0n && weiToSats(floorOut) === 0n) {
      throw new Error(
        "quote: the slippage-adjusted minAmountOut is below 1 sat and would " +
          "floor to 0, which disables slippage protection. The BTC output is " +
          "too small for sat-granular protection at this slippageBps."
      );
    }
    const minAmountOut = isBtcOut
      ? weiToSats(floorOut).toString()
      : floorOut.toString();

    // Validate the gateway's fee fields like the other amounts: a bogus value
    // would otherwise flow into a displayed/relied-on figure or throw a
    // cryptic BigInt error far from its cause.
    const conductorFeeBps = res.conductorFeeBps;
    if (!Number.isInteger(conductorFeeBps) || conductorFeeBps < 0) {
      throw new Error("quote: gateway returned an invalid conductorFeeBps.");
    }
    const conductorFeeRaw = parseQuoteAmount(
      res.conductorFeeAmount,
      "conductorFeeAmount"
    );
    // The Conductor fee asset is whatever the gateway resolved (WBTC, USDB, or
    // the output token). Convert a WBTC fee to sats so it matches amountOut's
    // units; leave any other asset in its base units.
    const feeIsWbtc =
      res.conductorFeeAsset !== undefined &&
      this.config.wbtcAddress !== undefined &&
      res.conductorFeeAsset.toLowerCase() ===
        this.config.wbtcAddress.toLowerCase();
    const conductorFeeAmount = feeIsWbtc
      ? weiToSats(conductorFeeRaw).toString()
      : conductorFeeRaw.toString();

    return {
      amountOut,
      minAmountOut,
      priceImpactBps:
        typeof res.priceImpactBps === "number" ? res.priceImpactBps : undefined,
      slippageBps: res.slippageBps,
      fee: res.feeTier,
      conductorFeeBps,
      conductorFeeAmount,
      conductorFeeAsset: res.conductorFeeAsset,
    };
  }

  /** Resolve the WBTC pool token for a `"btc"` leg, or throw if unconfigured. */
  private requireWbtcAddress(): string {
    if (!this.config.wbtcAddress) {
      throw new Error(
        'quote: a "btc" leg requires wbtcAddress in TradingConfig — the WBTC ' +
          "contract the pool is paired against."
      );
    }
    return this.config.wbtcAddress;
  }

  /**
   * Compute a single-pool swap quote client-side, in `tokenIn`/`tokenOut` base
   * units: resolve the pool, fold in the Conductor fee skim, read
   * `QuoterV2.quoteExactInputSingle` over RPC, and derive the slippage floor
   * plus a best-effort price impact. Ported from the gateway's removed
   * `quote.rs`; the fee/slippage math lives in `./quote-math`.
   */
  private async computeSwapQuote(input: {
    tokenIn: string;
    tokenOut: string;
    fee: number;
    amountIn: bigint;
    slippageBps?: number;
    integratorBps?: number;
  }): Promise<ComputedSwapQuote> {
    const { tokenIn, tokenOut, fee, amountIn } = input;
    const slippageBps = input.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    const integratorBps = BigInt(input.integratorBps ?? 0);

    if (!isAddress(tokenIn) || !isAddress(tokenOut)) {
      throw new Error(
        "quote: tokenIn and tokenOut must be 0x-prefixed addresses."
      );
    }
    if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
      throw new Error("quote: tokenIn and tokenOut must differ.");
    }
    if (!Number.isInteger(fee) || fee < 0 || fee > UINT24_MAX) {
      throw new Error(
        "quote: fee must be a uint24 tier (e.g. 500, 3000, 10000)."
      );
    }

    const quoter = this.config.quoterV2Address;
    if (!quoter) {
      throw new Error(
        "quote: quoterV2Address is not configured in TradingConfig — the " +
          "Uniswap V3 QuoterV2 the SDK reads quotes from."
      );
    }
    const conductor = this.config.conductorAddress;
    const factory = this.config.factoryAddress;
    // The Conductor host fee is keyed by pool address, so a fee-aware quote
    // needs the factory to resolve the pool (mirrors the gateway's 503).
    if (conductor && !factory) {
      throw new Error(
        "quote: fee-aware quotes require factoryAddress in TradingConfig to " +
          "resolve the pool for the Conductor host fee."
      );
    }

    const rpcUrl = this.execClient.getConfig().rpcUrl;
    const client = getClient(rpcUrl);

    // Resolve the pool when a factory is configured; a configured factory that
    // resolves no pool is a hard error.
    const pool = factory
      ? await getPoolAddress(rpcUrl, factory, tokenIn, tokenOut, fee)
      : null;
    if (factory && !pool) {
      throw new Error("quote: no pool for the given tokenIn/tokenOut/fee.");
    }

    // Conductor fee. With no Conductor address the quote is the raw Uniswap
    // output and conductorFeeBps is 0.
    let totalFeeBps = 0n;
    let feeAsset: string | undefined;
    if (conductor && pool) {
      ({ totalFeeBps, feeAsset } = await this.resolveConductorFee(
        client,
        conductor,
        pool,
        integratorBps,
        tokenIn,
        tokenOut
      ));
    }

    // Input-side skim reduces the amount actually swapped (mirrors
    // Conductor._swap); output-side skim is taken off the gross output.
    const inputSide =
      feeAsset !== undefined &&
      feeAsset.toLowerCase() === tokenIn.toLowerCase();
    const quoterAmount = effectiveSwapInput(amountIn, totalFeeBps, inputSide);
    const inputFee = amountIn - quoterAmount;

    const { grossOut, sqrtAfter } = await this.quoteExactInputSingle(
      client,
      quoter,
      { tokenIn, tokenOut, fee, amountIn: quoterAmount }
    );

    const outputFee = inputSide ? 0n : conductorSkim(grossOut, totalFeeBps);
    const netOut = grossOut - outputFee;
    const feeAmount = inputSide ? inputFee : outputFee;

    return {
      amountOut: netOut.toString(),
      minAmountOut: applySlippage(netOut, slippageBps).toString(),
      priceImpactBps: pool
        ? await this.poolPriceImpact(client, pool, sqrtAfter)
        : undefined,
      feeTier: fee,
      slippageBps,
      conductorFeeBps: Number(totalFeeBps),
      conductorFeeAmount: feeAmount.toString(),
      conductorFeeAsset: feeAsset,
    };
  }

  /**
   * Read `hostFeeBps(pool)` + `protocolFeeBps()`, add the integrator bps, and
   * resolve the fee asset (only when a fee applies). Each on-chain component is
   * capped at `MAX_FEE_RATE_BPS`; a larger value is corrupt upstream data and
   * is rejected rather than folded into the skim.
   */
  private async resolveConductorFee(
    client: PublicClient,
    conductor: string,
    pool: string,
    integratorBps: bigint,
    tokenIn: string,
    tokenOut: string
  ): Promise<{ totalFeeBps: bigint; feeAsset?: string }> {
    const address = conductor as Address;
    const [hostBps, protocolBps] = await Promise.all([
      client.readContract({
        address,
        abi: conductorAbi,
        functionName: "hostFeeBps",
        args: [pool as Address],
      }),
      client.readContract({
        address,
        abi: conductorAbi,
        functionName: "protocolFeeBps",
      }),
    ]);
    const totalFeeBps =
      this.requireBoundedFeeBps(hostBps, "hostFeeBps") +
      this.requireBoundedFeeBps(protocolBps, "protocolFeeBps") +
      integratorBps;
    if (totalFeeBps === 0n) {
      return { totalFeeBps, feeAsset: undefined };
    }
    const [wbtc, usdb] = await Promise.all([
      client.readContract({ address, abi: conductorAbi, functionName: "wbtc" }),
      client.readContract({ address, abi: conductorAbi, functionName: "usdb" }),
    ]);
    return {
      totalFeeBps,
      feeAsset: resolveFeeAsset(tokenIn, tokenOut, wbtc, usdb),
    };
  }

  /** Widen a uint16 fee-bps read to bigint, rejecting anything above the cap. */
  private requireBoundedFeeBps(raw: number, field: string): bigint {
    const bps = BigInt(raw);
    if (bps > MAX_FEE_RATE_BPS) {
      throw new Error(
        `quote: Conductor ${field}=${raw} exceeds the protocol maximum ` +
          `of ${MAX_FEE_RATE_BPS}.`
      );
    }
    return bps;
  }

  /**
   * Read `QuoterV2.quoteExactInputSingle` over RPC (an `eth_call` to a
   * nonpayable function). A simulated revert means no pool / insufficient
   * liquidity; any other error (transport/node) propagates.
   */
  private async quoteExactInputSingle(
    client: PublicClient,
    quoter: string,
    p: { tokenIn: string; tokenOut: string; fee: number; amountIn: bigint }
  ): Promise<{ grossOut: bigint; sqrtAfter: bigint }> {
    try {
      const result = await client.readContract({
        address: quoter as Address,
        abi: uniswapV3QuoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: p.tokenIn as Address,
            tokenOut: p.tokenOut as Address,
            amountIn: p.amountIn,
            fee: p.fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      return { grossOut: result[0], sqrtAfter: result[1] };
    } catch (err) {
      const isRevert =
        err instanceof BaseError &&
        (err.walk((e) => e instanceof ContractFunctionRevertedError) !==
          null ||
          (err.shortMessage ?? err.message).toLowerCase().includes("revert"));
      if (isRevert) {
        throw new Error(
          "quote: no pool or insufficient liquidity for the given " +
            "tokenIn/tokenOut/fee."
        );
      }
      throw err;
    }
  }

  /**
   * Best-effort pool mid-price move (bps) from the pre-trade `slot0` and the
   * post-swap sqrt price. Any read failure degrades to `undefined` rather than
   * failing the quote.
   */
  private async poolPriceImpact(
    client: PublicClient,
    pool: string,
    sqrtAfter: bigint
  ): Promise<number | undefined> {
    try {
      const slot0 = await client.readContract({
        address: pool as Address,
        abi: uniswapV3PoolAbi,
        functionName: "slot0",
      });
      return priceImpactBps(slot0[0], sqrtAfter);
    } catch {
      return undefined;
    }
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
        "approvalMode='permit2' requires permit2Address in TradingConfig. " +
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
  private async signConductorTx(
    calldata: string,
    value: bigint,
    gas?: bigint
  ): Promise<string> {
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
      gas: gas ?? this.config.swapGasLimit ?? DEFAULT_SWAP_GAS_LIMIT,
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
   * Run the post-funding work of a Spark-funded operation under automatic
   * clawback. If `op` throws after funding transfer(s) committed, claw them
   * back to the caller's Spark balance and rethrow as
   * {@link StrandedFundingError} with a per-transfer recovery summary.
   *
   * `committedTransferIds` are the transfers made before `op` runs. An empty
   * array (no Spark funding) makes this a transparent pass-through. Clawback
   * eligibility is enforced server-side, so a clawback for a transfer the
   * gateway actually consumed is rejected and surfaced as unrecovered rather
   * than double-spending.
   */
  private async withAutoClawback<T>(
    committedTransferIds: string[],
    op: () => Promise<T>
  ): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (committedTransferIds.length === 0) {
        throw err;
      }
      // `clawbackMany` never throws per its contract, but localize the
      // StrandedFundingError guarantee here so a future contract change can't
      // strand the caller without the committed transfer ids.
      let results: ClawbackResult[];
      try {
        results = await this.execClient.clawbackMany(committedTransferIds);
      } catch {
        results = committedTransferIds.map((transferId) => ({
          transferId,
          success: false,
          error: "clawback request failed",
        }));
      }
      const summary: ClawbackSummary = {
        attempted: true,
        recoveredTransferIds: results
          .filter((r) => r.success)
          .map((r) => r.transferId),
        unrecoveredTransferIds: results
          .filter((r) => !r.success)
          .map((r) => r.transferId),
        results,
      };
      throw new StrandedFundingError(committedTransferIds, summary, err);
    }
  }

  /**
   * Bundle a Spark-side deposit with the swap+withdraw in ONE execute
   * intent.
   *
   * Flow:
   *   1. Make a Spark transfer from the caller to the deposit address
   *      published by the gateway via `GET /api/v1/network/info`. This
   *      produces a `transferId` that authorizes the gateway to apply
   *      the deposit to the caller's EVM identity address before the
   *      signed tx runs.
   *   2. Build the swap calldata. For BTC in we use `swapBTCAndWithdraw`
   *      (msg.value funded by the deposit, no allowance needed). For
   *      ERC-20 in we use the `*WithEIP2612` variants and sign an
   *      EIP-2612 permit so the Conductor can pull the freshly-minted
   *      Spark tokens in the same tx — no standing allowance required.
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
    if (!isBtcIn && !params.assetInSparkTokenId) {
      throw new Error(
        "swap: useAvailableBalance with an ERC-20 input requires " +
          "assetInSparkTokenId (the Spark-side tokenIdentifier matching " +
          "assetInAddress)."
      );
    }

    const integrator = resolveIntegratorAddress(params.integratorAddress);
    // Validated in `swap()` before it dispatches here.
    const integratorBps = params.integratorFeeRateBps ?? 0;
    const amountIn = BigInt(params.amountIn);
    // See `swap`: a BTC output's on-chain floor is WBTC wei, but the API
    // takes sats, so convert here too.
    const minAmountOut = isBtcOut
      ? BigInt(params.minAmountOut) * WEI_PER_SAT
      : BigInt(params.minAmountOut);
    const sparkRecipient = await this.execClient.getSparkRecipientHex();
    // Pull the current Spark deposit address from the gateway — always
    // in sync with the current threshold key, no stale env var in the app.
    const network = await this.execClient.getNetworkInfo();
    const custody = network.spark.depositAddress;

    // For ERC-20 inputs, normalize the Spark token id into both forms:
    // bech32m for the Spark SDK's transferTokens call, hex for the
    // deposit payload the gateway validates.
    const tokenIdForms = isBtcIn
      ? null
      : normalizeSparkTokenIdentifier(params.assetInSparkTokenId!);

    // Step 1: Spark transfer → gateway-advertised deposit address.
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

    // The funding transfer has committed. Everything past this point can
    // still fail (EIP-2612 permit signing, nonce/fee RPC inside
    // signConductorTx, and the gateway POST in submitSwapIntent). Run it under
    // auto-clawback so any failure returns the deposit to the caller's Spark
    // balance instead of stranding it at the gateway.
    return this.withAutoClawback([transferId], async () => {
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
            integratorBps,
          ],
        });
        value = amountIn * WEI_PER_SAT;
      } else {
        // ERC-20 in: sign an EIP-2612 permit against the freshly-minted
        // Spark token and use the *WithEIP2612 Conductor variants so
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
              integratorBps,
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
              integratorBps,
              permit,
            ],
          });
        }
      }

      // Step 3: sign + submit bundled intent.
      const signedTx = await this.signConductorTx(calldata, value);
      return await this.submitSwapIntent(signedTx, deposits, transferId);
    });
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
   * the Spark tokens will be minted to.
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

    const { v, r, s } = splitSignature(signature);
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
    integratorBps: number,
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
          integratorBps,
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
        integratorBps,
      ],
    });
  }

  // Token → BTC always implies withdraw=true: the public `swap()` rejects
  // `assetOutAddress="btc" && withdraw=false` up front (ambiguous between
  // native BTC and WBTC), so this helper only encodes the withdraw path.
  private encodeTokenToBtcSwap(
    tokenIn: string,
    fee: number,
    amountIn: bigint,
    minAmountOut: bigint,
    integrator: string,
    integratorBps: number,
    sparkRecipient: string
  ): string {
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
        integratorBps,
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
    integratorBps: number,
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
          integratorBps,
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
        integratorBps,
      ],
    });
  }

  // ══ Liquidity management ═══════════════════════════════════════
  //
  // Each write method mirrors the swap template: one intent, ERC20 legs
  // authorized via Permit2, existing-position ops gated by a one-shot ERC-721
  // `permit`, and all fungible output (dust, proceeds, fees) auto-withdrawn to
  // Spark. The position NFT stays on the caller's EVM identity address.
  //
  // Amounts are base units; the WBTC leg is in wei (1 sat = 1e10 wei, see
  // satsToWei). A leg matching `TradingConfig.wbtcAddress` routes to the payable
  // `*BTC` entry point with `msg.value` funded from that leg.
  //
  // ERC20 legs are pulled via Permit2, so the caller needs a standing Permit2
  // allowance per token — grant it once with `ensurePermit2Approval` (a
  // separate intent) before the first op.

  /** Read a single position's full state from the NonfungiblePositionManager. */
  async getPosition(tokenId: bigint | string): Promise<PositionInfo> {
    return this.readPosition(BigInt(tokenId));
  }

  /**
   * List every position NFT owned by `owner` (defaults to the caller's EVM
   * identity address), enumerated via the NPM's ERC-721 enumerable interface.
   */
  async listPositions(owner?: string): Promise<PositionInfo[]> {
    const npm = this.requirePositionManager();
    const execConfig = this.execClient.getConfig();
    const account = owner ?? (await this.execClient.getEvmAddress());
    const client = getClient(execConfig.rpcUrl);

    const balance = await client.readContract({
      address: npm as Address,
      abi: nonfungiblePositionManagerAbi,
      functionName: "balanceOf",
      args: [account as Address],
    });
    const count = Number(balance);
    if (count === 0) return [];

    const idResults = await client.multicall({
      contracts: Array.from({ length: count }, (_, i) => ({
        address: npm as Address,
        abi: nonfungiblePositionManagerAbi,
        functionName: "tokenOfOwnerByIndex" as const,
        args: [account as Address, BigInt(i)] as const,
      })),
    });
    const tokenIds: bigint[] = idResults.map((r, i) => {
      if (r.status !== "success") {
        throw new Error(`listPositions: tokenOfOwnerByIndex(${account}, ${i}) failed`);
      }
      return r.result as bigint;
    });

    const posResults = await client.multicall({
      contracts: tokenIds.map((id) => ({
        address: npm as Address,
        abi: nonfungiblePositionManagerAbi,
        functionName: "positions" as const,
        args: [id] as const,
      })),
    });
    return posResults.map((r, i) => {
      if (r.status !== "success") {
        throw new Error(`listPositions: positions(${tokenIds[i]}) failed`);
      }
      return this.toPositionInfo(tokenIds[i]!, r.result as PositionsTuple);
    });
  }

  /**
   * Mint a new V3 position. Refunds any unused token dust to Spark; the
   * position NFT is minted to the caller's EVM identity address.
   *
   * `token0`/`token1` must be sorted (`token0 < token1` by address) with
   * `amount*`/`tick*` in that order. For a BTC-paired pool, pass the WBTC
   * address as the BTC leg's token (its amount is in wei).
   */
  async addLiquidity(params: AddLiquidityParams): Promise<MintResult> {
    if (params.token0.toLowerCase() >= params.token1.toLowerCase()) {
      throw new Error(
        "addLiquidity: token0 must sort strictly before token1 (token0 < token1 " +
          "by address). Sort the pair and the matching amounts/ticks first."
      );
    }
    if (params.tickLower >= params.tickUpper) {
      throw new Error(
        `addLiquidity: tickLower (${params.tickLower}) must be < tickUpper ` +
          `(${params.tickUpper}).`
      );
    }
    const token0 = params.token0 as `0x${string}`;
    const token1 = params.token1 as `0x${string}`;
    const amount0 = BigInt(params.amount0Desired);
    const amount1 = BigInt(params.amount1Desired);
    const deadline = this.resolveDeadline(params.deadline);
    const sparkRecipient = (params.sparkRecipient ??
      (await this.execClient.getSparkRecipientHex())) as `0x${string}`;
    const { isToken0Btc, isToken1Btc, isBtcPair } = this.btcLegs(token0, token1);

    const { deposits, inboundIds } = await this.fundTwoLegs({
      useAvailableBalance: params.useAvailableBalance,
      isToken0Btc,
      isToken1Btc,
      token0Address: token0,
      token1Address: token1,
      amount0,
      amount1,
      token0SparkId: params.token0SparkId,
      token1SparkId: params.token1SparkId,
    });

    return this.withAutoClawback(inboundIds, async () => {
      const struct = {
        token0,
        token1,
        fee: params.fee,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        amount0Desired: amount0,
        amount1Desired: amount1,
        amount0Min: BigInt(params.amount0Min),
        amount1Min: BigInt(params.amount1Min),
        deadline,
        sparkRecipient,
      };

      let calldata: string;
      let value = 0n;
      if (isBtcPair) {
        const otherToken = (isToken0Btc ? token1 : token0) as `0x${string}`;
        const otherAmount = isToken0Btc ? amount1 : amount0;
        value = isToken0Btc ? amount0 : amount1;
        const permit = await this.buildPermit2Signature(otherToken, otherAmount);
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "addLiquidityBTC",
          args: [struct, permit.permitTransfer, permit.signature],
        });
      } else {
        const [permitA, permitB] = await Promise.all([
          this.buildPermit2Signature(token0, amount0),
          this.buildPermit2Signature(token1, amount1),
        ]);
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "addLiquidity",
          args: [
            struct,
            permitA.permitTransfer,
            permitA.signature,
            permitB.permitTransfer,
            permitB.signature,
          ],
        });
      }

      const signedTx = await this.signConductorTx(
        calldata,
        value,
        this.config.lpGasLimit ?? DEFAULT_LP_GAS_LIMIT
      );
      return this.submitLpIntent(signedTx, deposits, inboundIds);
    });
  }

  /**
   * Add liquidity to an existing position. No NFT permit is required (NPM's
   * `increaseLiquidity` is open to any caller). `amount0`/`amount1`
   * correspond to the position's `token0`/`token1` (see {@link getPosition}).
   */
  async increaseLiquidity(params: IncreaseLiquidityParams): Promise<IncreaseResult> {
    const tokenId = BigInt(params.tokenId);
    const position = await this.readPosition(tokenId);
    const token0 = position.token0 as `0x${string}`;
    const token1 = position.token1 as `0x${string}`;
    const amount0 = BigInt(params.amount0Desired);
    const amount1 = BigInt(params.amount1Desired);
    const deadline = this.resolveDeadline(params.deadline);
    const sparkRecipient = (params.sparkRecipient ??
      (await this.execClient.getSparkRecipientHex())) as `0x${string}`;
    const { isToken0Btc, isToken1Btc, isBtcPair } = this.btcLegs(token0, token1);

    const { deposits, inboundIds } = await this.fundTwoLegs({
      useAvailableBalance: params.useAvailableBalance,
      isToken0Btc,
      isToken1Btc,
      token0Address: token0,
      token1Address: token1,
      amount0,
      amount1,
      token0SparkId: params.token0SparkId,
      token1SparkId: params.token1SparkId,
    });

    return this.withAutoClawback(inboundIds, async () => {
      const struct = {
        tokenId,
        amount0Desired: amount0,
        amount1Desired: amount1,
        amount0Min: BigInt(params.amount0Min),
        amount1Min: BigInt(params.amount1Min),
        deadline,
        sparkRecipient,
      };

      let calldata: string;
      let value = 0n;
      if (isBtcPair) {
        const otherToken = (isToken0Btc ? token1 : token0) as `0x${string}`;
        const otherAmount = isToken0Btc ? amount1 : amount0;
        value = isToken0Btc ? amount0 : amount1;
        const permit = await this.buildPermit2Signature(otherToken, otherAmount);
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "increaseLiquidityBTC",
          args: [struct, permit.permitTransfer, permit.signature],
        });
      } else {
        const [permitA, permitB] = await Promise.all([
          this.buildPermit2Signature(token0, amount0),
          this.buildPermit2Signature(token1, amount1),
        ]);
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "increaseLiquidity",
          args: [
            struct,
            permitA.permitTransfer,
            permitA.signature,
            permitB.permitTransfer,
            permitB.signature,
          ],
        });
      }

      const signedTx = await this.signConductorTx(
        calldata,
        value,
        this.config.lpGasLimit ?? DEFAULT_LP_GAS_LIMIT
      );
      return this.submitLpIntent(signedTx, deposits, inboundIds);
    });
  }

  /**
   * Decrease `liquidity` on a position and withdraw both legs to Spark. If the
   * decrease zeroes the position, the Conductor also burns the NFT. Requires
   * an ERC-721 `permit` over the tokenId (signed here with the identity key).
   * No Permit2 / ERC20 approval is involved — this path only moves funds out.
   */
  async decreaseLiquidity(params: DecreaseLiquidityParams): Promise<WithdrawResult> {
    const tokenId = BigInt(params.tokenId);
    const liquidity = BigInt(params.liquidity);
    if (liquidity <= 0n) {
      throw new Error("decreaseLiquidity: liquidity must be greater than zero.");
    }
    const deadline = this.resolveDeadline(params.deadline);
    const sparkRecipient = (params.sparkRecipient ??
      (await this.execClient.getSparkRecipientHex())) as `0x${string}`;
    const nftPermit = await this.signNftPermit(tokenId, deadline);

    const calldata = encodeFunctionData({
      abi: conductorAbi,
      functionName: "decreaseLiquidityAndWithdraw",
      args: [
        tokenId,
        liquidity,
        BigInt(params.amount0Min),
        BigInt(params.amount1Min),
        deadline,
        nftPermit,
        sparkRecipient,
      ],
    });
    const signedTx = await this.signConductorTx(
      calldata,
      0n,
      this.config.lpGasLimit ?? DEFAULT_LP_GAS_LIMIT
    );
    return this.submitLpIntent(signedTx, [], []);
  }

  /**
   * Collect accrued fees on a position and withdraw them to Spark. Leaves the
   * underlying liquidity untouched (never burns). Requires an ERC-721 permit.
   * No Permit2 / ERC20 approval is involved — this path only moves funds out.
   */
  async collectFees(params: CollectFeesParams): Promise<WithdrawResult> {
    const tokenId = BigInt(params.tokenId);
    const deadline = this.resolveDeadline(params.deadline);
    const sparkRecipient = (params.sparkRecipient ??
      (await this.execClient.getSparkRecipientHex())) as `0x${string}`;
    const nftPermit = await this.signNftPermit(tokenId, deadline);

    const calldata = encodeFunctionData({
      abi: conductorAbi,
      functionName: "collectFeesAndWithdraw",
      args: [tokenId, nftPermit, sparkRecipient],
    });
    const signedTx = await this.signConductorTx(
      calldata,
      0n,
      this.config.lpGasLimit ?? DEFAULT_LP_GAS_LIMIT
    );
    return this.submitLpIntent(signedTx, [], []);
  }

  /**
   * Reposition a position to a new tick range in one intent: the Conductor
   * full-decreases the old position, burns its NFT, and mints a new one at
   * `newTickLower`/`newTickUpper` (to the caller) using the recovered
   * principal plus any optional `additionalAmount*` capital. Dust → Spark.
   * Requires an ERC-721 permit over the old tokenId.
   */
  async modifyPosition(params: ModifyPositionParams): Promise<MintResult> {
    if (params.newTickLower >= params.newTickUpper) {
      throw new Error(
        `modifyPosition: newTickLower (${params.newTickLower}) must be < ` +
          `newTickUpper (${params.newTickUpper}).`
      );
    }
    const tokenId = BigInt(params.tokenId);
    const position = await this.readPosition(tokenId);
    const token0 = position.token0 as `0x${string}`;
    const token1 = position.token1 as `0x${string}`;
    const add0 = BigInt(params.additionalAmount0Desired ?? "0");
    const add1 = BigInt(params.additionalAmount1Desired ?? "0");
    const deadline = this.resolveDeadline(params.deadline);
    const sparkRecipient = (params.sparkRecipient ??
      (await this.execClient.getSparkRecipientHex())) as `0x${string}`;
    // Reuse the nonce we already read so we don't round-trip `positions` twice.
    const nftPermit = await this.signNftPermit(tokenId, deadline, position.nonce);
    const { isToken0Btc, isToken1Btc, isBtcPair } = this.btcLegs(token0, token1);

    const { deposits, inboundIds } = await this.fundTwoLegs({
      useAvailableBalance: params.useAvailableBalance,
      isToken0Btc,
      isToken1Btc,
      token0Address: token0,
      token1Address: token1,
      amount0: add0,
      amount1: add1,
      token0SparkId: params.token0SparkId,
      token1SparkId: params.token1SparkId,
    });

    return this.withAutoClawback(inboundIds, async () => {
      const struct = {
        tokenId,
        newTickLower: params.newTickLower,
        newTickUpper: params.newTickUpper,
        amount0Min: BigInt(params.amount0Min),
        amount1Min: BigInt(params.amount1Min),
        additionalAmount0Desired: add0,
        additionalAmount1Desired: add1,
        newAmount0Min: BigInt(params.newAmount0Min),
        newAmount1Min: BigInt(params.newAmount1Min),
        deadline,
        sparkRecipient,
      };

      let calldata: string;
      let value = 0n;
      if (isBtcPair) {
        const otherToken = (isToken0Btc ? token1 : token0) as `0x${string}`;
        const otherAdd = isToken0Btc ? add1 : add0;
        value = isToken0Btc ? add0 : add1;
        const permit = await this.buildPermit2Signature(otherToken, otherAdd);
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "modifyPositionBTC",
          args: [struct, nftPermit, permit.permitTransfer, permit.signature],
        });
      } else {
        // The Conductor binds permitA/permitB to token0/token1 unconditionally
        // (even when the additional amount is zero), so always sign both with
        // the correct token; a zero-amount permit is a no-op on the pull.
        const [permitA, permitB] = await Promise.all([
          this.buildPermit2Signature(token0, add0),
          this.buildPermit2Signature(token1, add1),
        ]);
        calldata = encodeFunctionData({
          abi: conductorAbi,
          functionName: "modifyPosition",
          args: [
            struct,
            nftPermit,
            permitA.permitTransfer,
            permitA.signature,
            permitB.permitTransfer,
            permitB.signature,
          ],
        });
      }

      const signedTx = await this.signConductorTx(
        calldata,
        value,
        this.config.lpGasLimit ?? DEFAULT_LP_GAS_LIMIT
      );
      return this.submitLpIntent(signedTx, deposits, inboundIds);
    });
  }

  /**
   * Grant the Conductor's Permit2 a standing (max) allowance on `tokenAddress`
   * from the caller's EVM identity address, if one is not already in place.
   * Submits a one-off `approve(permit2, MAX)` intent and waits for it to land.
   *
   * This is the one-time setup the Permit2-based liquidity methods require for
   * each ERC20 leg. It is intentionally a separate intent: Permit2 cannot be
   * approved inside the same transaction that then spends through it.
   */
  async ensurePermit2Approval(
    tokenAddress: string,
    timeoutMs = 30_000
  ): Promise<void> {
    const permit2 = this.config.permit2Address;
    if (!permit2) {
      throw new Error(
        "ensurePermit2Approval requires permit2Address in TradingConfig."
      );
    }
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
    const current = await fetchAllowance(
      execConfig.rpcUrl,
      tokenAddress,
      account.address,
      permit2
    );
    // Treat any already-large allowance as sufficient — Permit2 reads the
    // full word, so half of MAX is effectively infinite for any real spend.
    if (current >= MAX_UINT256 / 2n) return;
    await this.approveSpenderAndWait(
      tokenAddress,
      permit2,
      MAX_UINT256,
      timeoutMs
    );
  }

  // ── Liquidity internals ────────────────────────────────────

  private requirePositionManager(): string {
    const npm = this.config.positionManagerAddress;
    if (!npm) {
      throw new Error(
        "TradingClient: positionManagerAddress is required for liquidity " +
          "operations. Set it in TradingConfig (or use an environment preset)."
      );
    }
    return npm;
  }

  /** Resolve an absolute unix-seconds deadline, defaulting to now + 30 min. */
  private resolveDeadline(deadline?: number): bigint {
    return BigInt(
      deadline ?? Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS
    );
  }

  /** Detect which leg(s) of a sorted pair is the configured WBTC. */
  private btcLegs(
    token0: string,
    token1: string
  ): { isToken0Btc: boolean; isToken1Btc: boolean; isBtcPair: boolean } {
    const wbtc = this.config.wbtcAddress?.toLowerCase();
    const isToken0Btc = wbtc !== undefined && token0.toLowerCase() === wbtc;
    const isToken1Btc = wbtc !== undefined && token1.toLowerCase() === wbtc;
    return { isToken0Btc, isToken1Btc, isBtcPair: isToken0Btc || isToken1Btc };
  }

  private async readPosition(tokenId: bigint): Promise<PositionInfo> {
    const npm = this.requirePositionManager();
    const execConfig = this.execClient.getConfig();
    const client = getClient(execConfig.rpcUrl);
    const tuple = (await client.readContract({
      address: npm as Address,
      abi: nonfungiblePositionManagerAbi,
      functionName: "positions",
      args: [tokenId],
    })) as PositionsTuple;
    return this.toPositionInfo(tokenId, tuple);
  }

  private toPositionInfo(tokenId: bigint, t: PositionsTuple): PositionInfo {
    return {
      tokenId,
      nonce: t[0],
      operator: t[1],
      token0: t[2],
      token1: t[3],
      fee: t[4],
      tickLower: t[5],
      tickUpper: t[6],
      liquidity: t[7],
      feeGrowthInside0LastX128: t[8],
      feeGrowthInside1LastX128: t[9],
      tokensOwed0: t[10],
      tokensOwed1: t[11],
    };
  }

  /**
   * Sign the NPM's ERC-721 `permit` typed data so the Conductor can act as the
   * approved spender for a single tokenId. The EIP-712 domain name is read
   * from the NPM (`name()`); the version is the canonical Uniswap `"1"`. The
   * nonce comes from `positions(tokenId).nonce` (auto-incremented per permit).
   */
  private async signNftPermit(
    tokenId: bigint,
    deadline: bigint,
    knownNonce?: bigint
  ): Promise<{ deadline: bigint; v: number; r: Hex; s: Hex }> {
    const npm = this.requirePositionManager();
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
    const client = getClient(execConfig.rpcUrl);

    // Read the nonce (unless the caller already has it) and the NPM name in
    // parallel — they're independent.
    const [nonce, npmName] = await Promise.all([
      knownNonce !== undefined
        ? Promise.resolve(knownNonce)
        : client
            .readContract({
              address: npm as Address,
              abi: nonfungiblePositionManagerAbi,
              functionName: "positions",
              args: [tokenId],
            })
            .then((t) => (t as PositionsTuple)[0]),
      client.readContract({
        address: npm as Address,
        abi: nonfungiblePositionManagerAbi,
        functionName: "name",
      }),
    ]);

    const signature = await account.signTypedData({
      domain: {
        name: npmName,
        version: "1",
        chainId: execConfig.chainId,
        verifyingContract: npm as `0x${string}`,
      },
      types: {
        Permit: [
          { name: "spender", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        spender: this.config.conductorAddress as `0x${string}`,
        tokenId,
        nonce,
        deadline,
      },
    });
    return { deadline, ...splitSignature(signature) };
  }

  /**
   * Fund both legs of a liquidity op from the caller's Spark balance when
   * `useAvailableBalance` is set. Each leg with a positive amount produces a
   * Spark transfer to the gateway-advertised deposit address and a matching
   * `Deposit` for the bundled intent. Returns empty arrays when funding is off.
   *
   * Pre-flights every leg's fundability *before* any Spark transfer (transfers
   * are effectively irreversible). BTC legs must be whole-sat; ERC20 legs must
   * carry a Spark token id and already hold a Permit2 allowance. Without the
   * up-front check, a failure on the second leg (or a revert at the Conductor's
   * `_pullViaPermit2`) would strand the first leg's transfer at custody with
   * the intent never submitted. Validating first keeps the Spark balance intact
   * and points the caller at `ensurePermit2Approval` when an allowance is missing.
   */
  private async fundTwoLegs(opts: {
    useAvailableBalance: boolean | undefined;
    isToken0Btc: boolean;
    isToken1Btc: boolean;
    token0Address: string;
    token1Address: string;
    amount0: bigint;
    amount1: bigint;
    token0SparkId?: string;
    token1SparkId?: string;
  }): Promise<{ deposits: Deposit[]; inboundIds: string[] }> {
    if (!opts.useAvailableBalance) return { deposits: [], inboundIds: [] };
    await this.assertLegsFundable([
      {
        isBtc: opts.isToken0Btc,
        token: opts.token0Address,
        amount: opts.amount0,
        sparkTokenId: opts.token0SparkId,
      },
      {
        isBtc: opts.isToken1Btc,
        token: opts.token1Address,
        amount: opts.amount1,
        sparkTokenId: opts.token1SparkId,
      },
    ]);
    const network = await this.execClient.getNetworkInfo();
    const custody = network.spark.depositAddress;
    const deposits: Deposit[] = [];
    const inboundIds: string[] = [];
    if (opts.amount0 > 0n) {
      const leg = await this.fundLpLeg(
        opts.isToken0Btc,
        opts.amount0,
        opts.token0SparkId,
        custody
      );
      deposits.push(leg.deposit);
      inboundIds.push(leg.transferId);
    }
    if (opts.amount1 > 0n) {
      // The first leg's transfer has already committed. If this one throws,
      // claw the first leg back instead of stranding it (no-op when the first
      // leg was zero-amount, since `inboundIds` is then empty).
      const leg = await this.withAutoClawback(inboundIds.slice(), () =>
        this.fundLpLeg(
          opts.isToken1Btc,
          opts.amount1,
          opts.token1SparkId,
          custody
        )
      );
      deposits.push(leg.deposit);
      inboundIds.push(leg.transferId);
    }
    return { deposits, inboundIds };
  }

  /**
   * Validate that both legs can be funded from Spark before any (irreversible)
   * transfer runs. BTC legs must be whole-sat (the Spark transfer is in sats);
   * ERC20 legs must carry a Spark token id and already hold a Permit2 allowance
   * covering their amount. Throwing here, rather than mid-sequence inside
   * `fundLpLeg`, prevents a failure on one leg from stranding a transfer
   * already made for the other. Zero-amount legs are skipped.
   */
  private async assertLegsFundable(
    legs: {
      isBtc: boolean;
      token: string;
      amount: bigint;
      sparkTokenId?: string;
    }[]
  ): Promise<void> {
    const active = legs.filter((l) => l.amount > 0n);
    for (const leg of active) {
      if (leg.isBtc) {
        if (leg.amount % WEI_PER_SAT !== 0n) {
          throw new Error(
            `BTC leg amount ${leg.amount} wei is not a whole number of sats ` +
              `(must be a multiple of ${WEI_PER_SAT}). Round to whole sats.`
          );
        }
      } else if (!leg.sparkTokenId) {
        throw new Error(
          `useAvailableBalance requires a Spark token id (bech32m btkn…) for ` +
            `the ERC20 leg ${leg.token}.`
        );
      }
    }

    const erc20Legs = active.filter((l) => !l.isBtc);
    if (erc20Legs.length === 0) return;
    const permit2 = this.config.permit2Address;
    if (!permit2) {
      throw new Error(
        "useAvailableBalance with an ERC20 leg requires permit2Address in " +
          "TradingConfig (legs are pulled via Permit2)."
      );
    }
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
    await Promise.all(
      erc20Legs.map(async (leg) => {
        const allowance = await fetchAllowance(
          execConfig.rpcUrl,
          leg.token,
          account.address,
          permit2
        );
        if (allowance < leg.amount) {
          throw new Error(
            `Permit2 allowance for ${leg.token} (${allowance}) is below the ` +
              `funded amount (${leg.amount}). Call ensurePermit2Approval("${leg.token}") ` +
              `once before sourcing this leg from Spark, or the Spark transfer ` +
              `would credit your EVM address while the liquidity tx reverts, ` +
              `leaving the funds stranded there.`
          );
        }
      })
    );
  }

  /** Make the Spark transfer for one LP leg and build its bundled deposit. */
  private async fundLpLeg(
    isBtc: boolean,
    amount: bigint,
    sparkTokenId: string | undefined,
    custody: string
  ): Promise<{ transferId: string; deposit: Deposit }> {
    if (isBtc) {
      // The leg amount is WBTC wei; the Spark BTC transfer is in whole sats.
      if (amount % WEI_PER_SAT !== 0n) {
        throw new Error(
          `BTC leg amount ${amount} wei is not a whole number of sats ` +
            `(must be a multiple of ${WEI_PER_SAT}). Round to whole sats.`
        );
      }
      const sats = amount / WEI_PER_SAT;
      const transferId = await this.sparkTransferForDeposit(
        true,
        sats,
        undefined,
        custody
      );
      return {
        transferId,
        deposit: { sparkTransferId: transferId, amount: sats, asset: { type: "btc" } },
      };
    }
    if (!sparkTokenId) {
      throw new Error(
        "useAvailableBalance requires a Spark token id (bech32m btkn…) for " +
          "each ERC20 leg sourced from Spark."
      );
    }
    const forms = normalizeSparkTokenIdentifier(sparkTokenId);
    const transferId = await this.sparkTransferForDeposit(
      false,
      amount,
      forms.bech32m,
      custody
    );
    return {
      transferId,
      deposit: {
        sparkTransferId: transferId,
        amount,
        asset: { type: "token", tokenId: forms.hex },
      },
    };
  }

  private async submitLpIntent(
    signedTx: string,
    deposits: Deposit[],
    inboundSparkTransferIds: string[]
  ): Promise<LpWriteResult> {
    const result = await this.execClient.execute({ deposits, signedTx });
    return {
      submissionId: result.submissionId,
      intentId: result.intentId,
      status: result.status,
      evmTxHash: keccak256(signedTx as `0x${string}`),
      inboundSparkTransferIds: inboundSparkTransferIds.length
        ? inboundSparkTransferIds
        : undefined,
    };
  }

  /**
   * Submit an `approve(spender, amount)` intent for `tokenAddress` and poll
   * until the on-chain allowance reflects it (or `timeoutMs` elapses).
   */
  private async approveSpenderAndWait(
    tokenAddress: string,
    spender: string,
    amount: bigint,
    timeoutMs: number
  ): Promise<void> {
    const execConfig = this.execClient.getConfig();
    const account = await this.execClient.getEvmAccount();
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
      args: [spender as `0x${string}`, amount],
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

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = await fetchAllowance(
        execConfig.rpcUrl,
        tokenAddress,
        account.address,
        spender
      );
      if (current >= amount) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(
      `Approval of ${spender} for ${tokenAddress} did not land within ` +
        `${timeoutMs}ms — check the intent was accepted and blocks are being produced.`
    );
  }
}

/**
 * The 12-field tuple returned by `NonfungiblePositionManager.positions`, in
 * declaration order. viem returns multiple outputs positionally.
 */
type PositionsTuple = readonly [
  bigint, // nonce (uint96)
  `0x${string}`, // operator
  `0x${string}`, // token0
  `0x${string}`, // token1
  number, // fee (uint24)
  number, // tickLower (int24)
  number, // tickUpper (int24)
  bigint, // liquidity (uint128)
  bigint, // feeGrowthInside0LastX128
  bigint, // feeGrowthInside1LastX128
  bigint, // tokensOwed0 (uint128)
  bigint, // tokensOwed1 (uint128)
];

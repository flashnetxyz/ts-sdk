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
import type { ExecutionClient } from "../execution/client";
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
export declare class AMMClient {
    private readonly execClient;
    private readonly config;
    constructor(execClient: ExecutionClient, config: AMMConfig);
    /**
     * Execute a swap through the Conductor contract.
     *
     * Detects BTC input/output from `assetInAddress === "btc"` and routes
     * to the appropriate Conductor function. If `withdraw` is true (default),
     * uses the `*AndWithdraw` variants to send output back to Spark.
     */
    swap(params: SwapParams): Promise<SwapResult>;
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
    private buildPermit2Signature;
    /**
     * Sign a transaction to the Conductor contract with current fee params.
     * Queries nonce and EIP-1559 fees from the RPC rather than hardcoding 0.
     */
    private signConductorTx;
    private submitSwapIntent;
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
    private swapWithSparkDeposit;
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
    private sparkTransferForDeposit;
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
    private signEip2612Permit;
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
    private ensureAllowance;
    private encodeBtcSwap;
    private encodeTokenToBtcSwap;
    private encodeTokenSwap;
}
//# sourceMappingURL=client.d.ts.map
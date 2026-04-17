import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import { type AddLiquidityResponse, type AllLpPositionsResponse, type AllowedAssetsResponse, type CheckClawbackEligibilityResponse, type ClaimEscrowResponse, type ClawbackAttemptResult, type ClawbackResponse, type ClientEnvironment, type CollectFeesResponse, type Condition, type ConfirmDepositResponse, type CreateConcentratedPoolResponse, type CreateEscrowResponse, type CreatePoolResponse, type DecreaseLiquidityResponse, type DepositBalanceResponse, type EscrowState, type ExecuteRouteSwapResponse, type FeatureName, type FeatureStatusResponse, type FeeWithdrawalHistoryQuery, type FeeWithdrawalHistoryResponse, type FlashnetClientConfig, type FlashnetClientCustomConfig, type FlashnetClientEnvironmentConfig, type FlashnetClientLegacyConfig, type FundEscrowResponse, type GetBalanceResponse, type GetBalancesResponse, type GetHostFeesResponse, type GetHostResponse, type GetIntegratorFeesResponse, type GetPoolHostFeesResponse, type GetPoolIntegratorFeesResponse, type IncreaseLiquidityResponse, type ListClawbackableTransfersQuery, type ListClawbackableTransfersResponse, type ListConcentratedPositionsQuery, type ListConcentratedPositionsResponse, type ListGlobalSwapsQuery, type ListGlobalSwapsResponse, type ListPoolSwapsQuery, type ListPoolSwapsResponse, type ListPoolsQuery, type ListPoolsResponse, type ListUserSwapsQuery, type ListUserSwapsResponse, type LpPositionDetailsResponse, type MinAmountsResponse, type NetworkType, type PoolDetailsResponse, type PoolLiquidityResponse, type PoolTicksResponse, type RebalancePositionResponse, type RegisterHostResponse, type RemoveLiquidityResponse, type SettlementPingResponse, type SimulateAddLiquidityRequest, type SimulateAddLiquidityResponse, type SimulateRemoveLiquidityRequest, type SimulateRemoveLiquidityResponse, type SimulateRouteSwapRequest, type SimulateRouteSwapResponse, type SimulateSwapRequest, type SimulateSwapResponse, type SparkNetworkType, type SwapResponse, type TransferAssetRecipient, type WithdrawBalanceResponse, type WithdrawHostFeesResponse, type WithdrawIntegratorFeesResponse } from "../types";
import { type SparkHumanReadableTokenIdentifier } from "../utils/tokenAddress";
export interface TokenBalance {
    /** Total token balance owned (includes locked/pending) */
    balance: bigint;
    /** Token balance available to send (excludes locked/pending) */
    availableToSendBalance: bigint;
    tokenInfo?: {
        tokenIdentifier: string;
        tokenAddress: string;
        tokenName: string;
        tokenSymbol: string;
        tokenDecimals: number;
        maxSupply: bigint;
    };
}
export interface WalletBalance {
    balance: bigint;
    tokenBalances: Map<string, TokenBalance>;
}
/**
 * Options for paying a Lightning invoice with a token
 */
export interface PayLightningWithTokenOptions {
    /** BOLT11-encoded Lightning invoice to pay */
    invoice: string;
    /** Token identifier (hex or bech32m format) to use for payment */
    tokenAddress: string;
    /** Maximum slippage for the AMM swap in basis points (default: 500 = 5%) */
    maxSlippageBps?: number;
    /** Maximum Lightning routing fee in sats (default: uses estimated fee from quote) */
    maxLightningFeeSats?: number;
    /** Prefer Spark transfers when possible (default: true) */
    preferSpark?: boolean;
    /** Integrator fee rate in basis points for the swap (optional) */
    integratorFeeRateBps?: number;
    /** Integrator public key for fee collection (optional) */
    integratorPublicKey?: string;
    /** Maximum time to wait for swap transfer completion in ms (default: 30000) */
    transferTimeoutMs?: number;
    /** If true, attempt to swap BTC back to token if Lightning payment fails (default: false) */
    rollbackOnFailure?: boolean;
    /**
     * If true, pay Lightning invoice immediately using existing BTC balance instead of waiting
     * for the swap transfer to complete. The swap BTC will arrive asynchronously.
     * Requires sufficient existing BTC balance in wallet. (default: false)
     * Ignored for zero-amount invoices.
     */
    useExistingBtcBalance?: boolean;
    /**
     * Token amount to spend. Required for zero-amount invoices.
     * The swap output (minus lightning fees) becomes the payment amount.
     * Ignored for invoices with a specified amount.
     */
    tokenAmount?: string;
    /** When true, checks against availableToSendBalance instead of total balance (default: false) */
    useAvailableBalance?: boolean;
}
/**
 * Result of paying a Lightning invoice with a token
 */
export interface PayLightningWithTokenResult {
    /** Whether the payment was successful */
    success: boolean;
    /** The pool used for the swap */
    poolId: string;
    /** Amount of token spent (including fees) */
    tokenAmountSpent: string;
    /** Amount of BTC received from swap */
    btcAmountReceived: string;
    /** Swap transaction ID */
    swapTransferId: string;
    /** Lightning payment SSP request ID (e.g. SparkLightningSendRequest:...) */
    lightningPaymentId?: string;
    /** AMM fee paid in token units */
    ammFeePaid: string;
    /** Lightning routing fee paid in sats */
    lightningFeePaid?: number;
    /** For zero-amount invoices: BTC amount actually paid to the invoice */
    invoiceAmountPaid?: number;
    /** Spark transfer ID for the token transfer to the pool */
    sparkTokenTransferId?: string;
    /** Spark transfer ID for the Lightning payment */
    sparkLightningTransferId?: string;
    /** Error message if failed */
    error?: string;
}
/**
 * Quote for paying a Lightning invoice with a token
 */
export interface PayLightningWithTokenQuote {
    /** The pool that offers the best rate */
    poolId: string;
    /** Token address being swapped */
    tokenAddress: string;
    /** Amount of token required (including all fees) */
    tokenAmountRequired: string;
    /** BTC amount needed for the invoice (in sats), rounded up for AMM bit masking */
    btcAmountRequired: string;
    /** Original invoice amount in sats (before Lightning fee and AMM adjustments) */
    invoiceAmountSats: number;
    /** Estimated AMM fee in token units */
    estimatedAmmFee: string;
    /** Estimated Lightning routing fee in sats */
    estimatedLightningFee: number;
    /** Extra sats added due to AMM BTC variable fee (bit masking rounds down by up to 63 sats). 0 for V3 pools. */
    btcVariableFeeAdjustment: number;
    /** Execution price (token per sat) */
    executionPrice: string;
    /** Price impact percentage */
    priceImpactPct: string;
    /** Whether the token is asset A or B in the pool */
    tokenIsAssetA: boolean;
    /** Pool reserves for reference */
    poolReserves: {
        assetAReserve: string;
        assetBReserve: string;
    };
    /** Warning message if any */
    warningMessage?: string;
    /** Curve type of the selected pool */
    curveType: string;
    /** Whether this quote is for a zero-amount invoice */
    isZeroAmountInvoice: boolean;
}
/**
 * Result of a single clawback monitor poll cycle
 */
export interface ClawbackPollResult {
    /** Number of clawbackable transfers found */
    transfersFound: number;
    /** Number of clawback attempts made */
    clawbacksAttempted: number;
    /** Number of successful clawbacks */
    clawbacksSucceeded: number;
    /** Number of failed clawbacks */
    clawbacksFailed: number;
    /** Detailed results for each clawback attempt */
    results: ClawbackAttemptResult[];
}
/**
 * Options for configuring the clawback monitor
 */
export interface ClawbackMonitorOptions {
    /** Polling interval in milliseconds (default: 60000 = 1 minute) */
    intervalMs?: number;
    /** Number of clawbacks to process per batch (default: 2, for rate limit safety) */
    batchSize?: number;
    /** Delay between batches in milliseconds (default: 500ms) */
    batchDelayMs?: number;
    /** Maximum transfers to fetch per poll (default: 100) */
    maxTransfersPerPoll?: number;
    /** Called when a clawback succeeds */
    onClawbackSuccess?: (result: ClawbackAttemptResult) => void;
    /** Called when a clawback fails */
    onClawbackError?: (transferId: string, error: unknown) => void;
    /** Called after each poll cycle completes */
    onPollComplete?: (result: ClawbackPollResult) => void;
    /** Called if the poll itself fails (e.g., network error fetching transfers) */
    onPollError?: (error: unknown) => void;
}
/**
 * Handle returned by startClawbackMonitor to control the monitor
 */
export interface ClawbackMonitorHandle {
    /** Check if the monitor is currently running */
    isRunning: () => boolean;
    /** Stop the monitor (waits for current poll to complete) */
    stop: () => Promise<void>;
    /** Trigger an immediate poll (throws if monitor is stopped) */
    pollNow: () => Promise<ClawbackPollResult>;
}
/**
 * @deprecated Use FlashnetClientConfig instead
 */
export interface FlashnetClientOptions {
    autoAuthenticate?: boolean;
}
/**
 * Helper type for fixed lists
 */
type Tuple<T, N extends number, Acc extends readonly T[] = []> = Acc["length"] extends N ? Acc : Tuple<T, N, [...Acc, T]>;
/**
 * Helper type that works for both fixed and unknown length lists
 */
type TupleArray<T, N extends number | unknown> = N extends number ? Tuple<T, N> & T[] : T[];
/**
 * FlashnetClient - A comprehensive client for interacting with Flashnet AMM
 *
 * This client wraps a SparkWallet and provides:
 * - Automatic network detection from the wallet
 * - Automatic authentication
 * - Balance checking before operations
 * - All AMM operations (pools, swaps, liquidity, hosts)
 * - Direct wallet access via client.wallet
 */
export declare class FlashnetClient {
    private _wallet;
    private apiClient;
    private typedApi;
    private authManager;
    private sparkNetwork;
    private clientEnvironment;
    private publicKey;
    private sparkAddress;
    private isAuthenticated;
    private featureStatusCache?;
    private minAmountsCache?;
    private allowedAssetsCache?;
    private pingCache?;
    private static readonly FEATURE_STATUS_TTL_MS;
    private static readonly MIN_AMOUNTS_TTL_MS;
    private static readonly ALLOWED_ASSETS_TTL_MS;
    private static readonly PING_TTL_MS;
    /**
     * Get the underlying wallet instance for direct wallet operations
     */
    get wallet(): IssuerSparkWallet | SparkWallet;
    /**
     * Get the Spark network type (for blockchain operations)
     */
    get sparkNetworkType(): SparkNetworkType;
    /**
     * Get the client environment (for API configuration)
     */
    get clientEnvironmentType(): ClientEnvironment;
    /**
     * @deprecated Use sparkNetworkType instead
     * Get the network type
     */
    get networkType(): NetworkType;
    /**
     * Get the wallet's public key
     */
    get pubkey(): string;
    /**
     * Get the wallet's Spark address
     */
    get address(): string;
    /**
     * Create a new FlashnetClient instance with new configuration system
     * @param wallet - The SparkWallet to use
     * @param config - Client configuration with separate Spark network and client config
     */
    constructor(wallet: IssuerSparkWallet | SparkWallet, config: FlashnetClientConfig);
    /**
     * Create a new FlashnetClient instance with custom configuration
     * @param wallet - The SparkWallet to use
     * @param config - Custom configuration with specific endpoints
     */
    constructor(wallet: IssuerSparkWallet | SparkWallet, config: FlashnetClientCustomConfig);
    /**
     * Create a new FlashnetClient instance with environment configuration
     * @param wallet - The SparkWallet to use
     * @param config - Environment-based configuration
     */
    constructor(wallet: IssuerSparkWallet | SparkWallet, config: FlashnetClientEnvironmentConfig);
    /**
     * @deprecated Use the new constructor with FlashnetClientConfig instead
     * Create a new FlashnetClient instance with legacy configuration
     * @param wallet - The SparkWallet to use
     * @param options - Legacy client options
     */
    constructor(wallet: IssuerSparkWallet | SparkWallet, options?: FlashnetClientLegacyConfig);
    /**
     * Initialize the client by deducing network and authenticating
     * This is called automatically on first use if not called manually
     */
    initialize(): Promise<void>;
    /**
     * Ensure the client is initialized
     */
    private ensureInitialized;
    /**
     * Ensure a token identifier is in human-readable (Bech32m) form expected by the Spark SDK.
     * If the identifier is already human-readable or it is the BTC constant, it is returned unchanged.
     * Otherwise, it is encoded from the raw hex form using the client's Spark network.
     */
    private toHumanReadableTokenIdentifier;
    /**
     * Convert a token identifier into the raw hex string form expected by the Flashnet backend.
     * Handles BTC constant, hex strings, and Bech32m human-readable format.
     */
    private toHexTokenIdentifier;
    /**
     * Get wallet balance including BTC and token balances
     */
    getBalance(): Promise<WalletBalance>;
    /**
     * Check if wallet has sufficient balance for an operation
     */
    checkBalance(params: {
        balancesToCheck: {
            assetAddress: string;
            amount: string | bigint;
        }[];
        errorPrefix?: string;
        walletBalance?: WalletBalance;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<void>;
    /**
     * List pools with optional filters
     */
    listPools(query?: ListPoolsQuery): Promise<ListPoolsResponse>;
    /**
     * Get detailed information about a specific pool
     */
    getPool(poolId: string): Promise<PoolDetailsResponse>;
    /**
     * Get LP position details for a provider in a pool
     */
    getLpPosition(poolId: string, providerPublicKey?: string): Promise<LpPositionDetailsResponse>;
    /**
     * Get LP position details for a provider in a pool
     */
    getAllLpPositions(): Promise<AllLpPositionsResponse>;
    /**
     * Create a constant product pool
     */
    createConstantProductPool(params: {
        assetAAddress: string;
        assetBAddress: string;
        lpFeeRateBps: number;
        totalHostFeeRateBps: number;
        poolOwnerPublicKey?: string;
        hostNamespace?: string;
        initialLiquidity?: {
            assetAAmount: bigint;
            assetBAmount: bigint;
            assetAMinAmountIn: bigint;
            assetBMinAmountIn: bigint;
        };
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<CreatePoolResponse>;
    private static parsePositiveIntegerToBigInt;
    /**
     * Calculates virtual reserves for a bonding curve AMM.
     *
     * This helper function calculates the initial virtual reserves (`v_A^0`, `v_B^0`)
     * based on the bonding curve parameters. These virtual reserves ensure smooth
     * pricing and price continuity during graduation to the double-sided phase.
     *
     * @param params - The parameters for the calculation.
     * @param params.initialTokenSupply - The initial supply of Asset A (tokens to be sold).
     * @param params.graduationThresholdPct - The percentage of tokens that need to be sold for graduation (20-95%).
     * @param params.targetRaise - The target amount of Asset B to raise at graduation.
     * @returns An object containing `virtualReserveA`, `virtualReserveB`, and `threshold`.
     */
    static calculateVirtualReserves(params: {
        initialTokenSupply: bigint | number | string;
        graduationThresholdPct: number;
        targetRaise: bigint | number | string;
    }): {
        virtualReserveA: bigint;
        virtualReserveB: bigint;
        threshold: bigint;
    };
    /**
     * Create a single-sided pool with automatic initial deposit
     *
     * This method creates a single-sided pool and by default automatically handles the initial deposit.
     * The initial reserve amount will be transferred to the pool and confirmed.
     */
    createSingleSidedPool(params: {
        assetAAddress: string;
        assetBAddress: string;
        assetAInitialReserve: string;
        virtualReserveA: number | string;
        virtualReserveB: number | string;
        threshold: number | string;
        lpFeeRateBps: number;
        totalHostFeeRateBps: number;
        poolOwnerPublicKey?: string;
        hostNamespace?: string;
        disableInitialDeposit?: boolean;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<CreatePoolResponse>;
    /**
     * Confirm initial deposit for single-sided pool
     *
     * Note: This is typically handled automatically by createSingleSidedPool().
     * Use this method only if you need to manually confirm a deposit (e.g., after a failed attempt).
     */
    confirmInitialDeposit(poolId: string, assetASparkTransferId: string, poolOwnerPublicKey?: string): Promise<ConfirmDepositResponse>;
    /**
     * Simulate a swap without executing it
     */
    simulateSwap(params: SimulateSwapRequest): Promise<SimulateSwapResponse>;
    /**
     * Execute a swap
     *
     * If the swap fails with a clawbackable error, the SDK will automatically
     * attempt to recover the transferred funds via clawback.
     *
     * @param params.useFreeBalance When true, uses free balance from V3 pool instead of making a Spark transfer.
     *   Note: Only works for V3 concentrated liquidity pools. Does NOT work for route swaps.
     */
    executeSwap(params: {
        poolId: string;
        assetInAddress: string;
        assetOutAddress: string;
        amountIn: string;
        maxSlippageBps: number;
        minAmountOut: string;
        integratorFeeRateBps?: number;
        integratorPublicKey?: string;
        /** When true, uses free balance from V3 pool instead of making a Spark transfer */
        useFreeBalance?: boolean;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<SwapResponse & {
        inboundSparkTransferId?: string;
    }>;
    /**
     * Execute a swap with a pre-created transfer or using free balance.
     *
     * When transferId is provided, uses that Spark transfer. If transferId is a null UUID, treats it as a transfer reference.
     * When transferId is omitted/undefined, uses free balance (V3 pools only).
     */
    executeSwapIntent(params: {
        poolId: string;
        transferId?: string;
        assetInAddress: string;
        assetOutAddress: string;
        amountIn: string;
        maxSlippageBps: number;
        minAmountOut: string;
        integratorFeeRateBps?: number;
        integratorPublicKey?: string;
    }): Promise<SwapResponse>;
    /**
     * Simulate a route swap (multi-hop swap)
     */
    simulateRouteSwap(params: SimulateRouteSwapRequest): Promise<SimulateRouteSwapResponse>;
    /**
     * Execute a route swap (multi-hop swap)
     *
     * If the route swap fails with a clawbackable error, the SDK will automatically
     * attempt to recover the transferred funds via clawback.
     */
    executeRouteSwap(params: {
        hops: Array<{
            poolId: string;
            assetInAddress: string;
            assetOutAddress: string;
            hopIntegratorFeeRateBps?: number;
        }>;
        initialAssetAddress: string;
        inputAmount: string;
        maxRouteSlippageBps: string;
        minAmountOut: string;
        integratorFeeRateBps?: number;
        integratorPublicKey?: string;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<ExecuteRouteSwapResponse>;
    /**
     * Simulate adding liquidity
     */
    simulateAddLiquidity(params: SimulateAddLiquidityRequest): Promise<SimulateAddLiquidityResponse>;
    /**
     * Add liquidity to a pool
     *
     * If adding liquidity fails with a clawbackable error, the SDK will automatically
     * attempt to recover the transferred funds via clawback.
     */
    addLiquidity(params: {
        poolId: string;
        assetAAmount: string;
        assetBAmount: string;
        assetAMinAmountIn: string;
        assetBMinAmountIn: string;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<AddLiquidityResponse>;
    /**
     * Simulate removing liquidity
     */
    simulateRemoveLiquidity(params: SimulateRemoveLiquidityRequest): Promise<SimulateRemoveLiquidityResponse>;
    /**
     * Remove liquidity from a pool
     */
    removeLiquidity(params: {
        poolId: string;
        lpTokensToRemove: string;
    }): Promise<RemoveLiquidityResponse>;
    /**
     * Register as a host
     */
    registerHost(params: {
        namespace: string;
        minFeeBps: number;
        feeRecipientPublicKey?: string;
    }): Promise<RegisterHostResponse>;
    /**
     * Get host information
     */
    getHost(namespace: string): Promise<GetHostResponse>;
    /**
     * Get pool host fees
     */
    getPoolHostFees(hostNamespace: string, poolId: string): Promise<GetPoolHostFeesResponse>;
    /**
     * Get host fee withdrawal history
     */
    getHostFeeWithdrawalHistory(query?: FeeWithdrawalHistoryQuery): Promise<FeeWithdrawalHistoryResponse>;
    /**
     * Withdraw host fees
     */
    withdrawHostFees(params: {
        lpIdentityPublicKey: string;
        assetBAmount?: string;
    }): Promise<WithdrawHostFeesResponse>;
    /**
     * Get host fees across all pools
     */
    getHostFees(hostNamespace: string): Promise<GetHostFeesResponse>;
    /**
     * Get integrator fee withdrawal history
     */
    getIntegratorFeeWithdrawalHistory(query?: FeeWithdrawalHistoryQuery): Promise<FeeWithdrawalHistoryResponse>;
    /**
     * Get fees for a specific pool for an integrator
     */
    getPoolIntegratorFees(poolId: string): Promise<GetPoolIntegratorFeesResponse>;
    /**
     * Withdraw integrator fees
     */
    withdrawIntegratorFees(params: {
        lpIdentityPublicKey: string;
        assetBAmount?: string;
    }): Promise<WithdrawIntegratorFeesResponse>;
    /**
     * Get integrator fees across all pools
     */
    getIntegratorFees(): Promise<GetIntegratorFeesResponse>;
    /**
     * Creates a new escrow contract.
     * This is the first step in a two-step process: create, then fund.
     * @param params Parameters to create the escrow.
     * @returns The escrow creation response, including the ID and deposit address.
     */
    createEscrow(params: {
        assetId: string;
        assetAmount: string;
        recipients: {
            id: string;
            amount: string;
        }[];
        claimConditions: Condition[];
        abandonHost?: string;
        abandonConditions?: Condition[];
        autoFund?: boolean;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<CreateEscrowResponse | FundEscrowResponse>;
    /**
     * Funds an escrow contract to activate it.
     * This handles the asset transfer and confirmation in one step.
     * @param params Parameters to fund the escrow, including asset details and deposit address.
     * @returns The funding confirmation response.
     */
    fundEscrow(params: {
        escrowId: string;
        depositAddress: string;
        assetId: string;
        assetAmount: string;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<FundEscrowResponse>;
    executeFundEscrowIntent(params: {
        escrowId: string;
        sparkTransferId: string;
    }): Promise<FundEscrowResponse>;
    /**
     * Claims funds from an active escrow contract.
     * The caller must be a valid recipient and all claim conditions must be met.
     * @param params Parameters for the claim.
     * @returns The claim processing response.
     */
    claimEscrow(params: {
        escrowId: string;
    }): Promise<ClaimEscrowResponse>;
    /**
     * Retrieves the current state of an escrow contract.
     * This is a read-only operation and does not require authentication.
     * @param escrowId The unique identifier of the escrow.
     * @returns The full state of the escrow.
     */
    getEscrow(escrowId: string): Promise<EscrowState>;
    /**
     * Get swaps for a specific pool
     */
    getPoolSwaps(lpPubkey: string, query?: ListPoolSwapsQuery): Promise<ListPoolSwapsResponse>;
    /**
     * Get global swaps across all pools
     */
    getGlobalSwaps(query?: ListGlobalSwapsQuery): Promise<ListGlobalSwapsResponse>;
    /**
     * Get swaps for a specific user
     */
    getUserSwaps(userPublicKey?: string, query?: ListUserSwapsQuery): Promise<ListUserSwapsResponse>;
    /**
     * Request clawback of a stuck inbound transfer to an LP wallet
     */
    clawback(params: {
        sparkTransferId: string;
        lpIdentityPublicKey: string;
    }): Promise<ClawbackResponse>;
    /**
     * Check if a transfer is eligible for clawback
     *
     * This is a read-only check that verifies:
     * - The transfer exists and is valid
     * - The authenticated user is the original sender
     * - The transfer is not already reserved or spent
     * - The transfer has not been claimed/settled
     * - The transfer is less than 23 hours old
     *
     * Note: This does NOT initiate a clawback, only checks eligibility.
     *
     * @param sparkTransferId - The Spark transfer ID to check
     * @returns Response indicating if the transfer is eligible and any error message
     */
    checkClawbackEligibility(params: {
        sparkTransferId: string;
    }): Promise<CheckClawbackEligibilityResponse>;
    /**
     * List transfers eligible for clawback
     *
     * Returns a paginated list of transfers that the authenticated user
     * can potentially clawback. Filters based on:
     * - Transfers sent by the authenticated user
     * - Transfers to pools the user has interacted with
     * - Not already spent or reserved
     * - Less than 10 days old
     *
     * @param query - Optional pagination parameters (limit, offset)
     * @returns List of eligible transfers with IDs and timestamps
     */
    listClawbackableTransfers(query?: ListClawbackableTransfersQuery): Promise<ListClawbackableTransfersResponse>;
    /**
     * Attempt to clawback multiple transfers
     *
     * @param transferIds - Array of transfer IDs to clawback
     * @param lpIdentityPublicKey - The LP wallet public key
     * @returns Array of results for each clawback attempt
     */
    clawbackMultiple(transferIds: string[], lpIdentityPublicKey: string): Promise<ClawbackAttemptResult[]>;
    /**
     * Internal helper to execute an operation with automatic clawback on failure
     *
     * @param operation - The async operation to execute
     * @param transferIds - Transfer IDs that were sent and may need clawback
     * @param lpIdentityPublicKey - The LP wallet public key for clawback
     * @returns The result of the operation
     * @throws FlashnetError with typed clawbackSummary attached
     */
    private executeWithAutoClawback;
    /**
     * Start a background job that periodically polls for clawbackable transfers
     * and automatically claws them back.
     *
     * @param options - Monitor configuration options
     * @returns ClawbackMonitorHandle to control the monitor
     *
     * @example
     * ```typescript
     * const monitor = client.startClawbackMonitor({
     *   intervalMs: 60000, // Poll every 60 seconds
     *   onClawbackSuccess: (result) => console.log('Recovered:', result.transferId),
     *   onClawbackError: (transferId, error) => console.error('Failed:', transferId, error),
     * });
     *
     * // Later, to stop:
     * monitor.stop();
     * ```
     */
    startClawbackMonitor(options?: ClawbackMonitorOptions): ClawbackMonitorHandle;
    /**
     * Encode a token identifier into a human-readable token address using the client's Spark network
     * @param tokenIdentifier - Token identifier as hex string or Uint8Array
     * @returns Human-readable token address
     */
    encodeTokenAddress(tokenIdentifier: string | Uint8Array): SparkHumanReadableTokenIdentifier;
    /**
     * Decode a human-readable token address back to its identifier
     * @param address - Human-readable token address
     * @returns Object containing the token identifier (as hex string) and Spark network
     */
    decodeTokenAddress(address: SparkHumanReadableTokenIdentifier): {
        tokenIdentifier: string;
        network: SparkNetworkType;
    };
    /**
     * @deprecated Use encodeTokenAddress instead - this method uses legacy types
     * Encode a token identifier into a human-readable token address using legacy types
     * @param tokenIdentifier - Token identifier as hex string or Uint8Array
     * @returns Human-readable token address
     */
    encodeLegacyTokenAddress(tokenIdentifier: string | Uint8Array): SparkHumanReadableTokenIdentifier;
    /**
     * @deprecated Use decodeTokenAddress instead - this method uses legacy types
     * Decode a human-readable token address back to its identifier using legacy types
     * @param address - Human-readable token address
     * @returns Object containing the token identifier (as hex string) and network
     */
    decodeLegacyTokenAddress(address: SparkHumanReadableTokenIdentifier): {
        tokenIdentifier: string;
        network: NetworkType;
    };
    /**
     * Get raw feature status list (cached briefly)
     */
    getFeatureStatus(): Promise<FeatureStatusResponse>;
    /**
     * Get feature flags as a map of feature name to boolean (cached briefly)
     */
    getFeatureFlags(): Promise<Map<FeatureName, boolean>>;
    /**
     * Get raw min-amounts configuration list from the backend
     */
    getMinAmounts(): Promise<MinAmountsResponse>;
    /**
     * Get enabled min-amounts as a map keyed by hex asset identifier
     */
    getMinAmountsMap(): Promise<Map<string, bigint>>;
    /**
     * Get allowed Asset B list for pool creation (cached for 60s)
     */
    getAllowedAssets(): Promise<AllowedAssetsResponse>;
    /**
     * Ping the settlement service
     */
    ping(): Promise<SettlementPingResponse>;
    /**
     * Performs asset transfer using generalized asset address for both BTC and tokens.
     */
    transferAsset(recipient: TransferAssetRecipient, checkBalanceErrorPrefix?: string, useAvailableBalance?: boolean): Promise<string>;
    /**
     * Performs asset transfers using generalized asset addresses for both BTC and tokens.
     * Supports optional generic to hardcode recipients length so output list can be typed with same length.
     */
    transferAssets<N extends number | unknown = unknown>(recipients: TupleArray<TransferAssetRecipient, N>, checkBalanceErrorPrefix?: string, useAvailableBalance?: boolean): Promise<TupleArray<string, N>>;
    /**
     * Helper method to add initial liquidity after pool creation
     */
    private addInitialLiquidity;
    /**
     * Get a quote for paying a Lightning invoice with a token.
     * This calculates the optimal pool and token amount needed.
     *
     * @param invoice - BOLT11-encoded Lightning invoice
     * @param tokenAddress - Token identifier to use for payment
     * @param options - Optional configuration (slippage, integrator fees, etc.)
     * @returns Quote with pricing details
     * @throws Error if invoice amount or token amount is below Flashnet minimums
     */
    getPayLightningWithTokenQuote(invoice: string, tokenAddress: string, options?: {
        maxSlippageBps?: number;
        integratorFeeRateBps?: number;
        tokenAmount?: string;
    }): Promise<PayLightningWithTokenQuote>;
    /**
     * Generate a quote for a zero-amount invoice.
     * Forward-direction: simulate swapping tokenAmount and pick the pool with the best BTC output.
     * @private
     */
    private getZeroAmountInvoiceQuote;
    /**
     * Pay a Lightning invoice using a token.
     * This swaps the token to BTC on Flashnet and uses the BTC to pay the invoice.
     *
     * @param options - Payment options including invoice and token address
     * @returns Payment result with transaction details
     */
    payLightningWithToken(options: PayLightningWithTokenOptions): Promise<PayLightningWithTokenResult>;
    /**
     * Attempt to rollback a swap by swapping BTC back to the original token
     * @private
     */
    private rollbackSwap;
    /**
     * Find the best pool for swapping a token to BTC
     * @private
     */
    private findBestPoolForTokenToBtc;
    /**
     * Calculate the token amount needed to get a specific BTC output.
     * Implements the AMM fee-inclusive model.
     * @private
     */
    private calculateTokenAmountForBtcOutput;
    /**
     * Find the token amount needed to get a specific BTC output from a V3 concentrated liquidity pool.
     * Uses binary search with simulateSwap since V3 tick-based math can't be inverted locally.
     * @private
     */
    private findV3TokenAmountForBtcOutput;
    /**
     * Calculate minimum amount out with slippage protection
     * @private
     */
    private calculateMinAmountOut;
    /**
     * Wait for a transfer to be claimed using wallet events.
     * This is more efficient than polling as it uses the wallet's event stream.
     * @private
     */
    private waitForTransferCompletion;
    /**
     * Fallback polling method for transfer completion
     * @private
     */
    private pollForTransferCompletion;
    /**
     * Suppress leaf optimization on the wallet. Sets the internal
     * optimizationInProgress flag so optimizeLeaves() returns immediately.
     * Returns a restore function that clears the flag.
     * @private
     */
    private suppressOptimization;
    /**
     * Insta-claim: listen for the wallet's stream event that fires when
     * the coordinator broadcasts the transfer. The stream auto-claims
     * incoming transfers, so no polling is needed.
     *
     * After claim, refreshes the leaf cache from the coordinator to
     * ensure the balance is current.
     *
     * Caller is responsible for suppressing optimization around this call
     * if the claimed leaves must not be swapped before spending.
     * @private
     */
    private instaClaimTransfer;
    /**
     * Get Lightning fee estimate for an invoice
     * @private
     */
    private getLightningFeeEstimate;
    /**
     * Decode the amount from a Lightning invoice (in sats)
     * Uses light-bolt11-decoder (same library as Spark SDK) for reliable parsing.
     * @private
     */
    private decodeInvoiceAmount;
    /**
     * Clean up wallet connections
     */
    cleanup(): Promise<void>;
    private ensureAmmOperationAllowed;
    private ensurePingOk;
    private getFeatureStatusMap;
    private getEnabledMinAmountsMap;
    private getHexAddress;
    private assertSwapMeetsMinAmounts;
    private assertAddLiquidityMeetsMinAmounts;
    private assertRemoveLiquidityMeetsMinAmounts;
    private assertAllowedAssetBForPoolCreation;
    /**
     * Create a V3 concentrated liquidity pool
     *
     * Concentrated liquidity pools allow LPs to provide liquidity within specific
     * price ranges (tick ranges) for higher capital efficiency.
     *
     * @param params Pool creation parameters
     * @param params.assetAAddress - Address of asset A (base asset)
     * @param params.assetBAddress - Address of asset B (quote asset)
     * @param params.tickSpacing - Tick spacing (common values: 10, 60, 200)
     * @param params.initialPrice - Initial price of asset A in terms of asset B
     * @param params.lpFeeRateBps - LP fee rate in basis points
     * @param params.hostFeeRateBps - Host fee rate in basis points
     * @param params.hostNamespace - Optional host namespace
     * @param params.poolOwnerPublicKey - Optional pool owner (defaults to wallet pubkey)
     */
    createConcentratedPool(params: {
        assetAAddress: string;
        assetBAddress: string;
        tickSpacing: number;
        initialPrice: string;
        lpFeeRateBps: number;
        hostFeeRateBps: number;
        hostNamespace?: string;
        poolOwnerPublicKey?: string;
    }): Promise<CreateConcentratedPoolResponse>;
    /**
     * Add liquidity to a V3 concentrated position
     *
     * Increases liquidity within a specific tick range. If the position doesn't exist,
     * a new position is created.
     *
     * @param params Position parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.tickLower - Lower tick of the position
     * @param params.tickUpper - Upper tick of the position
     * @param params.amountADesired - Desired amount of asset A to add
     * @param params.amountBDesired - Desired amount of asset B to add
     * @param params.amountAMin - Minimum amount of asset A (slippage protection)
     * @param params.amountBMin - Minimum amount of asset B (slippage protection)
     * @param params.useFreeBalance - If true, use free balance from pool instead of Spark transfers
     * @param params.retainExcessInBalance - If true, retain any excess amounts in pool free balance instead of refunding via Spark
     */
    increaseLiquidity(params: {
        poolId: string;
        tickLower: number;
        tickUpper: number;
        amountADesired: string;
        amountBDesired: string;
        amountAMin: string;
        amountBMin: string;
        useFreeBalance?: boolean;
        retainExcessInBalance?: boolean;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<IncreaseLiquidityResponse>;
    /**
     * Remove liquidity from a V3 concentrated position
     *
     * Decreases liquidity from a specific tick range position.
     *
     * @param params Position parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.tickLower - Lower tick of the position
     * @param params.tickUpper - Upper tick of the position
     * @param params.liquidityToRemove - Amount of liquidity to remove (use "0" to remove all)
     * @param params.amountAMin - Minimum amount of asset A to receive (slippage protection)
     * @param params.amountBMin - Minimum amount of asset B to receive (slippage protection)
     * @param params.retainInBalance - If true, retain withdrawn assets in pool free balance instead of sending via Spark
     */
    decreaseLiquidity(params: {
        poolId: string;
        tickLower: number;
        tickUpper: number;
        liquidityToRemove: string;
        amountAMin: string;
        amountBMin: string;
        retainInBalance?: boolean;
    }): Promise<DecreaseLiquidityResponse>;
    /**
     * Collect accumulated fees from a V3 position
     *
     * Collects fees earned from trading activity without removing liquidity.
     *
     * @param params Position parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.tickLower - Lower tick of the position
     * @param params.tickUpper - Upper tick of the position
     * @param params.retainInBalance - If true, retain collected fees in pool free balance instead of sending via Spark
     */
    collectFees(params: {
        poolId: string;
        tickLower: number;
        tickUpper: number;
        retainInBalance?: boolean;
    }): Promise<CollectFeesResponse>;
    /**
     * Rebalance a V3 position to a new tick range
     *
     * Atomically moves liquidity from an old position to a new tick range.
     * Optionally can add additional funds during rebalancing.
     *
     * @param params Rebalance parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.oldTickLower - Lower tick of the current position
     * @param params.oldTickUpper - Upper tick of the current position
     * @param params.newTickLower - Lower tick for the new position
     * @param params.newTickUpper - Upper tick for the new position
     * @param params.liquidityToMove - Amount of liquidity to move (use "0" to move all)
     * @param params.additionalAmountA - Optional additional asset A to add
     * @param params.additionalAmountB - Optional additional asset B to add
     * @param params.retainInBalance - If true, retain any excess amounts in pool free balance instead of sending via Spark
     */
    rebalancePosition(params: {
        poolId: string;
        oldTickLower: number;
        oldTickUpper: number;
        newTickLower: number;
        newTickUpper: number;
        liquidityToMove: string;
        additionalAmountA?: string;
        additionalAmountB?: string;
        retainInBalance?: boolean;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<RebalancePositionResponse>;
    /**
     * List V3 concentrated liquidity positions
     *
     * @param query Optional query parameters
     * @param query.poolId - Filter by pool ID
     * @param query.page - Page number (default: 1)
     * @param query.pageSize - Page size (default: 20, max: 100)
     */
    listConcentratedPositions(query?: ListConcentratedPositionsQuery): Promise<ListConcentratedPositionsResponse>;
    /**
     * Get pool liquidity distribution for visualization
     *
     * Returns aggregated liquidity ranges for visualizing the liquidity distribution.
     *
     * @param poolId - Pool ID (LP identity public key)
     */
    getPoolLiquidity(poolId: string): Promise<PoolLiquidityResponse>;
    /**
     * Get pool ticks for simulation
     *
     * Returns all initialized ticks with their liquidity deltas for swap simulation.
     *
     * @param poolId - Pool ID (LP identity public key)
     */
    getPoolTicks(poolId: string): Promise<PoolTicksResponse>;
    /**
     * Get user's free balance for a specific V3 pool
     *
     * Returns the user's current free balance in the pool, which can be used for
     * liquidity operations without needing to transfer from the wallet.
     *
     * @param poolId - Pool ID (LP identity public key)
     */
    getConcentratedBalance(poolId: string): Promise<GetBalanceResponse>;
    /**
     * Get user's free balances across all V3 pools
     *
     * Returns all free balances for the authenticated user across all V3 pools.
     */
    getConcentratedBalances(): Promise<GetBalancesResponse>;
    /**
     * Withdraw free balance from a V3 pool to user's Spark wallet
     *
     * Withdraws accumulated free balance from a pool. Use "0" to skip an asset,
     * or "max" to withdraw all available balance of that asset.
     *
     * @param params Withdrawal parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.amountA - Amount of asset A to withdraw ("0" to skip, "max" to withdraw all)
     * @param params.amountB - Amount of asset B to withdraw ("0" to skip, "max" to withdraw all)
     */
    withdrawConcentratedBalance(params: {
        poolId: string;
        amountA: string;
        amountB: string;
    }): Promise<WithdrawBalanceResponse>;
    /**
     * Deposits assets to your free balance in a V3 concentrated liquidity pool.
     *
     * Free balance can be used for adding liquidity to positions without requiring
     * additional Spark transfers. The SDK handles the Spark transfers internally.
     *
     * @param params - Deposit parameters
     * @param params.poolId - The pool identifier (LP identity public key)
     * @param params.amountA - Amount of asset A to deposit (use "0" to skip)
     * @param params.amountB - Amount of asset B to deposit (use "0" to skip)
     * @returns Promise resolving to deposit response with updated balances
     * @throws Error if the deposit is rejected
     */
    depositConcentratedBalance(params: {
        poolId: string;
        amountA: string;
        amountB: string;
        /** When true, checks against availableToSendBalance instead of total balance */
        useAvailableBalance?: boolean;
    }): Promise<DepositBalanceResponse>;
}
export {};
//# sourceMappingURL=FlashnetClient.d.ts.map
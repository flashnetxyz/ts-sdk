import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import sha256 from "fast-sha256";
import { decode as decodeBolt11 } from "light-bolt11-decoder";
import { ApiClient } from "../api/client";
import { TypedAmmApi } from "../api/typed-endpoints";
import {
  BTC_ASSET_PUBKEY,
  getClientEnvironmentName,
  getClientNetworkConfig,
  resolveClientNetworkConfig,
} from "../config";
import {
  type AddLiquidityRequest,
  type AddLiquidityResponse,
  type AllLpPositionsResponse,
  type AllowedAssetsResponse,
  type AutoClawbackSummary,
  type CheckClawbackEligibilityRequest,
  type CheckClawbackEligibilityResponse,
  type ClaimEscrowRequest,
  type ClaimEscrowResponse,
  type ClawbackAttemptResult,
  type ClawbackRequest,
  type ClawbackResponse,
  type ClientEnvironment,
  type ClientNetworkConfig,
  type CollectFeesRequest,
  type CollectFeesResponse,
  type Condition,
  type ConfirmDepositResponse,
  type ConfirmInitialDepositRequest,
  type CreateConcentratedPoolRequest,
  type CreateConcentratedPoolResponse,
  type CreateConstantProductPoolRequest,
  type CreateEscrowRequest,
  type CreateEscrowResponse,
  type CreatePoolResponse,
  type CreateSingleSidedPoolRequest,
  type DecreaseLiquidityRequest,
  type DecreaseLiquidityResponse,
  type DepositBalanceRequest,
  type DepositBalanceResponse,
  type EscrowCondition,
  type EscrowRecipient,
  type EscrowState,
  type ExecuteRouteSwapRequest,
  type ExecuteRouteSwapResponse,
  type ExecuteSwapRequest,
  type FeatureName,
  type FeatureStatusResponse,
  type FeeWithdrawalHistoryQuery,
  type FeeWithdrawalHistoryResponse,
  type FlashnetClientConfig,
  type FlashnetClientCustomConfig,
  type FlashnetClientEnvironmentConfig,
  type FlashnetClientLegacyConfig,
  FlashnetError,
  type FundEscrowRequest,
  type FundEscrowResponse,
  type GetBalanceResponse,
  type GetBalancesResponse,
  type GetHostFeesRequest,
  type GetHostFeesResponse,
  type GetHostResponse,
  type GetIntegratorFeesResponse,
  type GetPoolHostFeesResponse,
  type GetPoolIntegratorFeesResponse,
  getClientEnvironmentFromLegacy,
  getSparkNetworkFromLegacy,
  type IncreaseLiquidityRequest,
  type IncreaseLiquidityResponse,
  type ListClawbackableTransfersQuery,
  type ListClawbackableTransfersResponse,
  type ListConcentratedPositionsQuery,
  type ListConcentratedPositionsResponse,
  type ListGlobalSwapsQuery,
  type ListGlobalSwapsResponse,
  type ListPoolSwapsQuery,
  type ListPoolSwapsResponse,
  type ListPoolsQuery,
  type ListPoolsResponse,
  type ListUserSwapsQuery,
  type ListUserSwapsResponse,
  type LpPositionDetailsResponse,
  type MinAmountsResponse,
  Network,
  type NetworkType,
  type PoolDetailsResponse,
  type PoolLiquidityResponse,
  type PoolTicksResponse,
  type RebalancePositionRequest,
  type RebalancePositionResponse,
  type RegisterHostRequest,
  type RegisterHostResponse,
  type RemoveLiquidityRequest,
  type RemoveLiquidityResponse,
  type RouteHopRequest,
  type RouteHopValidation,
  type SettlementPingResponse,
  type SimulateAddLiquidityRequest,
  type SimulateAddLiquidityResponse,
  type SimulateRemoveLiquidityRequest,
  type SimulateRemoveLiquidityResponse,
  type SimulateRouteSwapRequest,
  type SimulateRouteSwapResponse,
  type SimulateSwapRequest,
  type SimulateSwapResponse,
  type SparkNetworkType,
  type SwapResponse,
  type TransferAssetRecipient,
  type WithdrawBalanceRequest,
  type WithdrawBalanceResponse,
  type WithdrawHostFeesRequest,
  type WithdrawHostFeesResponse,
  type WithdrawIntegratorFeesRequest,
  type WithdrawIntegratorFeesResponse,
} from "../types";
import { compareDecimalStrings, generateNonce, safeBigInt } from "../utils";
import { AuthManager } from "../utils/auth";
import { getHexFromUint8Array } from "../utils/hex";
import {
  generateAddLiquidityIntentMessage,
  generateClaimEscrowIntentMessage,
  generateClawbackIntentMessage,
  generateCollectFeesIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
  generateCreateConcentratedPoolIntentMessage,
  generateCreateEscrowIntentMessage,
  generateDecreaseLiquidityIntentMessage,
  generateDepositBalanceIntentMessage,
  generateFundEscrowIntentMessage,
  generateIncreaseLiquidityIntentMessage,
  generatePoolConfirmInitialDepositIntentMessage,
  generatePoolInitializationIntentMessage,
  generatePoolSwapIntentMessage,
  generateRebalancePositionIntentMessage,
  generateRegisterHostIntentMessage,
  generateRemoveLiquidityIntentMessage,
  generateRouteSwapIntentMessage,
  generateWithdrawBalanceIntentMessage,
  generateWithdrawHostFeesIntentMessage,
  generateWithdrawIntegratorFeesIntentMessage,
} from "../utils/intents";
import {
  encodeSparkAddressNew,
  getSparkNetworkFromAddress,
} from "../utils/spark-address";
import {
  decodeSparkHumanReadableTokenIdentifier,
  encodeSparkHumanReadableTokenIdentifier,
  type SparkHumanReadableTokenIdentifier,
} from "../utils/tokenAddress";

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
  balance: bigint; // BTC balance in sats
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
  autoAuthenticate?: boolean; // Default: true
}

/**
 * Helper type for fixed lists
 */
type Tuple<
  T,
  N extends number,
  Acc extends readonly T[] = [],
> = Acc["length"] extends N ? Acc : Tuple<T, N, [...Acc, T]>;

/**
 * Helper type that works for both fixed and unknown length lists
 */
type TupleArray<T, N extends number | unknown> = N extends number
  ? Tuple<T, N> & T[]
  : T[];

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
export class FlashnetClient {
  private _wallet: IssuerSparkWallet | SparkWallet;
  private apiClient: ApiClient;
  private typedApi: TypedAmmApi;
  private authManager: AuthManager;
  private sparkNetwork: SparkNetworkType;
  private clientEnvironment: ClientEnvironment;
  private publicKey: string = "";
  private sparkAddress: string = "";
  private isAuthenticated: boolean = false;

  // Ephemeral caches for config endpoints and ping
  private featureStatusCache?: {
    data: FeatureStatusResponse;
    expiryMs: number;
  };
  private minAmountsCache?: { map: Map<string, bigint>; expiryMs: number };
  private allowedAssetsCache?: {
    data: AllowedAssetsResponse;
    expiryMs: number;
  };
  private pingCache?: { ok: boolean; expiryMs: number };

  // TTLs (milliseconds)
  private static readonly FEATURE_STATUS_TTL_MS = 5000; // 5s
  private static readonly MIN_AMOUNTS_TTL_MS = 5000; // 5s
  private static readonly ALLOWED_ASSETS_TTL_MS = 60000; // 60s
  private static readonly PING_TTL_MS = 2000; // 2s

  /**
   * Get the underlying wallet instance for direct wallet operations
   */
  get wallet(): IssuerSparkWallet | SparkWallet {
    return this._wallet;
  }

  /**
   * Get the Spark network type (for blockchain operations)
   */
  get sparkNetworkType(): SparkNetworkType {
    return this.sparkNetwork;
  }

  /**
   * Get the client environment (for API configuration)
   */
  get clientEnvironmentType(): ClientEnvironment {
    return this.clientEnvironment;
  }

  /**
   * @deprecated Use sparkNetworkType instead
   * Get the network type
   */
  get networkType(): NetworkType {
    // Map Spark network back to legacy network type
    // This is for backward compatibility
    return this.sparkNetwork === "REGTEST" && this.clientEnvironment === "local"
      ? "LOCAL"
      : (this.sparkNetwork as NetworkType);
  }

  /**
   * Get the wallet's public key
   */
  get pubkey(): string {
    return this.publicKey;
  }

  /**
   * Get the wallet's Spark address
   */
  get address(): string {
    return this.sparkAddress;
  }

  /**
   * Create a new FlashnetClient instance with new configuration system
   * @param wallet - The SparkWallet to use
   * @param config - Client configuration with separate Spark network and client config
   */
  constructor(
    wallet: IssuerSparkWallet | SparkWallet,
    config: FlashnetClientConfig
  );

  /**
   * Create a new FlashnetClient instance with custom configuration
   * @param wallet - The SparkWallet to use
   * @param config - Custom configuration with specific endpoints
   */
  constructor(
    wallet: IssuerSparkWallet | SparkWallet,
    config: FlashnetClientCustomConfig
  );

  /**
   * Create a new FlashnetClient instance with environment configuration
   * @param wallet - The SparkWallet to use
   * @param config - Environment-based configuration
   */
  constructor(
    wallet: IssuerSparkWallet | SparkWallet,
    config: FlashnetClientEnvironmentConfig
  );

  /**
   * @deprecated Use the new constructor with FlashnetClientConfig instead
   * Create a new FlashnetClient instance with legacy configuration
   * @param wallet - The SparkWallet to use
   * @param options - Legacy client options
   */
  constructor(
    wallet: IssuerSparkWallet | SparkWallet,
    options?: FlashnetClientLegacyConfig
  );

  constructor(
    wallet: IssuerSparkWallet | SparkWallet,
    configOrOptions?:
      | FlashnetClientConfig
      | FlashnetClientCustomConfig
      | FlashnetClientEnvironmentConfig
      | FlashnetClientLegacyConfig
  ) {
    this._wallet = wallet;

    // Determine configuration type and extract values
    const isLegacyConfig =
      !configOrOptions ||
      "network" in configOrOptions ||
      !("sparkNetworkType" in configOrOptions);

    if (isLegacyConfig) {
      // Legacy configuration system - derive from wallet or options
      const legacyConfig = configOrOptions as
        | FlashnetClientLegacyConfig
        | undefined;

      if (legacyConfig?.network) {
        // Use provided legacy network
        this.sparkNetwork = getSparkNetworkFromLegacy(legacyConfig.network);
        this.clientEnvironment = getClientEnvironmentFromLegacy(
          legacyConfig.network
        );
      } else {
        // Auto-detect from wallet (existing behavior)
        // @ts-expect-error - wallet.config is protected
        const networkEnum = wallet.config.getNetwork();
        const networkName = Network[networkEnum] as NetworkType;
        const detectedNetwork =
          networkName === "MAINNET" ? "MAINNET" : "REGTEST";

        this.sparkNetwork = getSparkNetworkFromLegacy(detectedNetwork);
        this.clientEnvironment =
          getClientEnvironmentFromLegacy(detectedNetwork);
      }
    } else {
      // New configuration system
      const config = configOrOptions as
        | FlashnetClientConfig
        | FlashnetClientCustomConfig
        | FlashnetClientEnvironmentConfig;
      this.sparkNetwork = config.sparkNetworkType;

      // Determine client configuration based on the specific config type
      let clientConfig: ClientEnvironment | ClientNetworkConfig;

      if ("clientConfig" in config) {
        // FlashnetClientConfig - can be either environment or custom config
        clientConfig = config.clientConfig;
      } else if ("clientNetworkConfig" in config) {
        // FlashnetClientCustomConfig - custom configuration
        clientConfig = config.clientNetworkConfig;
      } else if ("clientEnvironment" in config) {
        // FlashnetClientEnvironmentConfig - predefined environment
        clientConfig = config.clientEnvironment;
      } else {
        throw new Error(
          "Invalid configuration: must specify clientConfig, clientNetworkConfig, or clientEnvironment"
        );
      }

      // Resolve the client environment name for internal tracking
      const environmentName = getClientEnvironmentName(clientConfig);
      this.clientEnvironment =
        environmentName === "custom"
          ? "local"
          : (environmentName as ClientEnvironment);
    }

    // Initialize API client with resolved client configuration
    let resolvedClientConfig: ClientNetworkConfig;

    if (!isLegacyConfig) {
      const config = configOrOptions as
        | FlashnetClientConfig
        | FlashnetClientCustomConfig
        | FlashnetClientEnvironmentConfig;
      let clientConfigParam: ClientEnvironment | ClientNetworkConfig;

      if ("clientConfig" in config) {
        clientConfigParam = config.clientConfig;
      } else if ("clientNetworkConfig" in config) {
        clientConfigParam = config.clientNetworkConfig;
      } else if ("clientEnvironment" in config) {
        clientConfigParam = config.clientEnvironment;
      } else {
        throw new Error("Invalid configuration");
      }

      resolvedClientConfig = resolveClientNetworkConfig(clientConfigParam);
    } else {
      // Use legacy resolution
      resolvedClientConfig = getClientNetworkConfig(this.clientEnvironment);
    }

    this.apiClient = new ApiClient(resolvedClientConfig);
    this.typedApi = new TypedAmmApi(this.apiClient);
    this.authManager = new AuthManager(this.apiClient, "", wallet);
  }

  /**
   * Initialize the client by deducing network and authenticating
   * This is called automatically on first use if not called manually
   */
  async initialize(): Promise<void> {
    if (this.isAuthenticated) {
      return;
    }

    // Get wallet details
    this.publicKey = await this._wallet.getIdentityPublicKey();
    this.sparkAddress = await this._wallet.getSparkAddress();

    // Deduce Spark network from spark address and validate consistency
    const detectedSparkNetwork = getSparkNetworkFromAddress(this.sparkAddress);
    if (!detectedSparkNetwork) {
      throw new Error(
        `Unable to determine Spark network from spark address: ${this.sparkAddress}`
      );
    }

    // Warn if configured Spark network doesn't match detected network
    if (this.sparkNetwork !== detectedSparkNetwork) {
      console.warn(
        `Warning: Configured Spark network (${this.sparkNetwork}) doesn't match detected network from address (${detectedSparkNetwork}). Using detected network.`
      );
      this.sparkNetwork = detectedSparkNetwork;
    }

    // Re-initialize auth manager with correct public key
    this.authManager = new AuthManager(
      this.apiClient,
      this.publicKey,
      this._wallet
    );

    // Authenticate
    const token = await this.authManager.authenticate();
    this.apiClient.setAuthToken(token);
    this.isAuthenticated = true;
  }

  /**
   * Ensure the client is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isAuthenticated) {
      await this.initialize();
    }
  }

  /**
   * Ensure a token identifier is in human-readable (Bech32m) form expected by the Spark SDK.
   * If the identifier is already human-readable or it is the BTC constant, it is returned unchanged.
   * Otherwise, it is encoded from the raw hex form using the client's Spark network.
   */
  private toHumanReadableTokenIdentifier(tokenIdentifier: string): string {
    if (tokenIdentifier === BTC_ASSET_PUBKEY) {
      return tokenIdentifier;
    }
    if (tokenIdentifier.startsWith("btkn")) {
      return tokenIdentifier;
    }
    return encodeSparkHumanReadableTokenIdentifier(
      tokenIdentifier,
      this.sparkNetwork
    );
  }

  /**
   * Convert a token identifier into the raw hex string form expected by the Flashnet backend.
   * Handles BTC constant, hex strings, and Bech32m human-readable format.
   */
  private toHexTokenIdentifier(tokenIdentifier: string): string {
    if (tokenIdentifier === BTC_ASSET_PUBKEY) {
      return tokenIdentifier;
    }
    if (tokenIdentifier.startsWith("btkn")) {
      return decodeSparkHumanReadableTokenIdentifier(
        tokenIdentifier as SparkHumanReadableTokenIdentifier,
        this.sparkNetwork
      ).tokenIdentifier;
    }
    return tokenIdentifier;
  }

  /**
   * Get wallet balance including BTC and token balances
   */
  async getBalance(): Promise<WalletBalance> {
    const balance = await this._wallet.getBalance();

    // Convert the wallet's balance format to our format
    const tokenBalances = new Map<string, TokenBalance>();

    if (balance.tokenBalances) {
      for (const [tokenPubkey, tokenData] of balance.tokenBalances.entries()) {
        const info = tokenData.tokenMetadata;

        // Convert raw token identifier to hex and human-readable forms
        const tokenIdentifierHex = getHexFromUint8Array(
          info.rawTokenIdentifier
        );
        const tokenAddress = encodeSparkHumanReadableTokenIdentifier(
          info.rawTokenIdentifier,
          this.sparkNetwork
        );

        tokenBalances.set(tokenPubkey, {
          balance: safeBigInt(
            tokenData.ownedBalance ?? (tokenData as any).balance
          ),
          availableToSendBalance: safeBigInt(
            tokenData.availableToSendBalance ??
              tokenData.ownedBalance ??
              (tokenData as any).balance
          ),
          tokenInfo: {
            tokenIdentifier: tokenIdentifierHex,
            tokenAddress,
            tokenName: info.tokenName,
            tokenSymbol: info.tokenTicker,
            tokenDecimals: info.decimals,
            maxSupply: info.maxSupply,
          },
        });
      }
    }

    return {
      balance: safeBigInt(balance.balance),
      tokenBalances,
    };
  }

  /**
   * Check if wallet has sufficient balance for an operation
   */
  async checkBalance(params: {
    balancesToCheck: {
      assetAddress: string;
      amount: string | bigint;
    }[];
    errorPrefix?: string;
    walletBalance?: WalletBalance;
    /** When true, checks against availableToSendBalance instead of total balance */
    useAvailableBalance?: boolean;
  }): Promise<void> {
    const balance = params.walletBalance ?? (await this.getBalance());

    // Check balance
    const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
      tokens: new Map(),
    };

    for (const balance of params.balancesToCheck) {
      if (balance.assetAddress === BTC_ASSET_PUBKEY) {
        requirements.btc = BigInt(balance.amount);
      } else {
        requirements.tokens?.set(balance.assetAddress, BigInt(balance.amount));
      }
    }

    // Check BTC balance
    if (requirements.btc && balance.balance < requirements.btc) {
      throw new Error(
        [
          params.errorPrefix ?? "",
          `Insufficient BTC balance. `,
          `Required: ${requirements.btc} sats, Available: ${balance.balance} sats`,
        ].join("")
      );
    }

    // Check token balances
    if (requirements.tokens) {
      for (const [
        tokenPubkey,
        requiredAmount,
      ] of requirements.tokens.entries()) {
        // Support both hex and Bech32m token identifiers by trying all representations
        const hrKey = this.toHumanReadableTokenIdentifier(tokenPubkey);
        const hexKey = this.toHexTokenIdentifier(tokenPubkey);
        const effectiveTokenBalance =
          balance.tokenBalances.get(tokenPubkey) ??
          balance.tokenBalances.get(hrKey) ??
          balance.tokenBalances.get(hexKey);
        const available = params.useAvailableBalance
          ? (effectiveTokenBalance?.availableToSendBalance ?? 0n)
          : (effectiveTokenBalance?.balance ?? 0n);

        if (available < requiredAmount) {
          throw new Error(
            [
              params.errorPrefix ?? "",
              `Insufficient token balance for ${tokenPubkey}. `,
              `Required: ${requiredAmount}, Available: ${available}`,
            ].join("")
          );
        }
      }
    }
  }

  // Pool Operations

  /**
   * List pools with optional filters
   */
  async listPools(query?: ListPoolsQuery): Promise<ListPoolsResponse> {
    await this.ensureInitialized();
    return this.typedApi.listPools(query);
  }

  /**
   * Get detailed information about a specific pool
   */
  async getPool(poolId: string): Promise<PoolDetailsResponse> {
    await this.ensureInitialized();
    return this.typedApi.getPool(poolId);
  }

  /**
   * Get LP position details for a provider in a pool
   */
  async getLpPosition(
    poolId: string,
    providerPublicKey?: string
  ): Promise<LpPositionDetailsResponse> {
    await this.ensureInitialized();
    const provider = providerPublicKey || this.publicKey;
    return this.typedApi.getLpPosition(poolId, provider);
  }

  /**
   * Get LP position details for a provider in a pool
   */
  async getAllLpPositions(): Promise<AllLpPositionsResponse> {
    await this.ensureInitialized();
    return this.typedApi.getAllLpPositions();
  }

  /**
   * Create a constant product pool
   */
  async createConstantProductPool(params: {
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
  }): Promise<CreatePoolResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_pool_creation");
    await this.assertAllowedAssetBForPoolCreation(
      this.toHexTokenIdentifier(params.assetBAddress)
    );

    // Check if we need to add initial liquidity
    if (params.initialLiquidity) {
      await this.checkBalance({
        balancesToCheck: [
          {
            assetAddress: params.assetAAddress,
            amount: params.initialLiquidity.assetAAmount,
          },
          {
            assetAddress: params.assetBAddress,
            amount: params.initialLiquidity.assetBAmount,
          },
        ],
        errorPrefix: "Insufficient balance for initial liquidity: ",
        useAvailableBalance: params.useAvailableBalance,
      });
    }

    const poolOwnerPublicKey = params.poolOwnerPublicKey ?? this.publicKey;

    // Generate intent
    const nonce = generateNonce();
    const intentMessage =
      generateConstantProductPoolInitializationIntentMessage({
        poolOwnerPublicKey,
        assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
        assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
        lpFeeRateBps: params.lpFeeRateBps.toString(),
        totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
        nonce,
      });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    // Create pool
    const request: CreateConstantProductPoolRequest = {
      poolOwnerPublicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
      hostNamespace: params.hostNamespace || "",
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.createConstantProductPool(request);

    // Add initial liquidity if specified
    if (params.initialLiquidity && response.poolId) {
      await this.addInitialLiquidity(
        response.poolId,
        params.assetAAddress,
        params.assetBAddress,
        params.initialLiquidity.assetAAmount.toString(),
        params.initialLiquidity.assetBAmount.toString(),
        params.initialLiquidity.assetAMinAmountIn.toString(),
        params.initialLiquidity.assetBMinAmountIn.toString()
      );
    }

    return response;
  }

  // Validate and normalize inputs to bigint
  private static parsePositiveIntegerToBigInt(
    value: bigint | number | string,
    name: string
  ): bigint {
    if (typeof value === "bigint") {
      if (value <= 0n) {
        throw new Error(`${name} must be positive integer`);
      }
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be positive integer`);
      }
      return BigInt(value);
    }
    try {
      const v = BigInt(value);
      if (v <= 0n) {
        throw new Error(`${name} must be positive integer`);
      }
      return v;
    } catch {
      throw new Error(`${name} must be positive integer`);
    }
  }

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
  public static calculateVirtualReserves(params: {
    initialTokenSupply: bigint | number | string;
    graduationThresholdPct: number;
    targetRaise: bigint | number | string;
  }): { virtualReserveA: bigint; virtualReserveB: bigint; threshold: bigint } {
    if (
      !Number.isFinite(params.graduationThresholdPct) ||
      !Number.isInteger(params.graduationThresholdPct)
    ) {
      throw new Error(
        "Graduation threshold percentage must be an integer number of percent"
      );
    }

    const supply = FlashnetClient.parsePositiveIntegerToBigInt(
      params.initialTokenSupply,
      "Initial token supply"
    );
    const targetB = FlashnetClient.parsePositiveIntegerToBigInt(
      params.targetRaise,
      "Target raise"
    );
    const graduationThresholdPct = BigInt(params.graduationThresholdPct);

    // Align bounds with Rust AMM (20%..95%), then check feasibility for g=1 (requires >50%).
    const MIN_PCT = 20n;
    const MAX_PCT = 95n;
    if (graduationThresholdPct < MIN_PCT || graduationThresholdPct > MAX_PCT) {
      throw new Error(
        `Graduation threshold percentage must be between ${MIN_PCT} and ${MAX_PCT}`
      );
    }

    // Feasibility: denom = f - g*(1-f) > 0 with g=1 -> 2f - 1 > 0 -> pct > 50
    const denomNormalized = 2n * graduationThresholdPct - 100n; // equals 100*(f - (1-f))
    if (denomNormalized <= 0n) {
      throw new Error(
        "Invalid configuration: threshold must be greater than 50% when LP fraction is 1.0"
      );
    }

    // v_A = S * f^2 / (f - (1-f)) ; using integer math with pct where
    // v_A = S * p^2 / (100 * (2p - 100))
    const vANumerator =
      supply * graduationThresholdPct * graduationThresholdPct;
    const vADenominator = 100n * denomNormalized;
    const virtualA = vANumerator / vADenominator; // floor

    // v_B = T * (1 - f) / (f - (1-f)) ; with pct => T * (100 - p) / (2p - 100)
    const vBNumerator = targetB * (100n - graduationThresholdPct);
    const vBDenominator = denomNormalized;
    const virtualB = vBNumerator / vBDenominator; // floor

    // Threshold amount in A
    const threshold = (supply * graduationThresholdPct) / 100n;

    return { virtualReserveA: virtualA, virtualReserveB: virtualB, threshold };
  }

  /**
   * Create a single-sided pool with automatic initial deposit
   *
   * This method creates a single-sided pool and by default automatically handles the initial deposit.
   * The initial reserve amount will be transferred to the pool and confirmed.
   */
  async createSingleSidedPool(params: {
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
  }): Promise<CreatePoolResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_pool_creation");
    await this.assertAllowedAssetBForPoolCreation(
      this.toHexTokenIdentifier(params.assetBAddress)
    );

    if (!params.hostNamespace && params.totalHostFeeRateBps < 10) {
      throw new Error(
        `Host fee must be greater than 10 bps when no host namespace is provided`
      );
    }

    // Validate reserves are valid positive integers before any operations
    const assetAInitialReserve = FlashnetClient.parsePositiveIntegerToBigInt(
      params.assetAInitialReserve,
      "Asset A Initial Reserve"
    ).toString();
    const virtualReserveA = FlashnetClient.parsePositiveIntegerToBigInt(
      params.virtualReserveA,
      "Virtual Reserve A"
    ).toString();
    const virtualReserveB = FlashnetClient.parsePositiveIntegerToBigInt(
      params.virtualReserveB,
      "Virtual Reserve B"
    ).toString();

    await this.checkBalance({
      balancesToCheck: [
        {
          assetAddress: params.assetAAddress,
          amount: assetAInitialReserve,
        },
      ],
      errorPrefix: "Insufficient balance for pool creation: ",
      useAvailableBalance: params.useAvailableBalance,
    });

    const poolOwnerPublicKey = params.poolOwnerPublicKey ?? this.publicKey;

    // Generate intent
    const nonce = generateNonce();
    const intentMessage = generatePoolInitializationIntentMessage({
      poolOwnerPublicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      assetAInitialReserve,
      virtualReserveA,
      virtualReserveB,
      threshold: params.threshold.toString(),
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
      nonce,
    });

    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    // Create pool
    const request: CreateSingleSidedPoolRequest = {
      poolOwnerPublicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      assetAInitialReserve,
      virtualReserveA,
      virtualReserveB,
      threshold: params.threshold.toString(),
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
      hostNamespace: params.hostNamespace,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const createResponse = await this.typedApi.createSingleSidedPool(request);

    if (params.disableInitialDeposit) {
      return createResponse;
    }

    // Transfer initial reserve to the pool using new address encoding
    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: createResponse.poolId,
      network: this.sparkNetwork,
    });

    const assetATransferId = await this.transferAsset({
      receiverSparkAddress: lpSparkAddress,
      assetAddress: params.assetAAddress,
      amount: assetAInitialReserve,
    });

    // Execute confirm with auto-clawback on failure
    await this.executeWithAutoClawback(
      async () => {
        const confirmResponse = await this.confirmInitialDeposit(
          createResponse.poolId,
          assetATransferId,
          poolOwnerPublicKey
        );

        if (!confirmResponse.confirmed) {
          throw new Error(
            `Failed to confirm initial deposit: ${confirmResponse.message}`
          );
        }

        return confirmResponse;
      },
      [assetATransferId],
      createResponse.poolId
    );

    return createResponse;
  }

  /**
   * Confirm initial deposit for single-sided pool
   *
   * Note: This is typically handled automatically by createSingleSidedPool().
   * Use this method only if you need to manually confirm a deposit (e.g., after a failed attempt).
   */
  async confirmInitialDeposit(
    poolId: string,
    assetASparkTransferId: string,
    poolOwnerPublicKey?: string
  ): Promise<ConfirmDepositResponse> {
    await this.ensureInitialized();

    const nonce = generateNonce();
    const intentMessage = generatePoolConfirmInitialDepositIntentMessage({
      poolOwnerPublicKey: poolOwnerPublicKey ?? this.publicKey,
      lpIdentityPublicKey: poolId,
      assetASparkTransferId,
      nonce,
    });

    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: ConfirmInitialDepositRequest = {
      poolId,
      assetASparkTransferId,
      nonce,
      signature: getHexFromUint8Array(signature),
      poolOwnerPublicKey: poolOwnerPublicKey ?? this.publicKey,
    };

    return this.typedApi.confirmInitialDeposit(request);
  }

  // Swap Operations

  /**
   * Simulate a swap without executing it
   */
  async simulateSwap(
    params: SimulateSwapRequest
  ): Promise<SimulateSwapResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    // Ensure integratorBps is an integer (floor if it has decimals)
    const processedParams = {
      ...params,
      ...(params.integratorBps !== undefined && {
        integratorBps: Math.floor(params.integratorBps),
      }),
    };

    return this.typedApi.simulateSwap(processedParams);
  }

  /**
   * Execute a swap
   *
   * If the swap fails with a clawbackable error, the SDK will automatically
   * attempt to recover the transferred funds via clawback.
   *
   * @param params.useFreeBalance When true, uses free balance from V3 pool instead of making a Spark transfer.
   *   Note: Only works for V3 concentrated liquidity pools. Does NOT work for route swaps.
   */
  async executeSwap(params: {
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
  }): Promise<SwapResponse & { inboundSparkTransferId?: string }> {
    await this.ensureInitialized();

    // Gate by feature flags and ping, and enforce min-amount policy before transfers
    await this.ensureAmmOperationAllowed("allow_swaps");
    await this.assertSwapMeetsMinAmounts({
      assetInAddress: params.assetInAddress,
      assetOutAddress: params.assetOutAddress,
      amountIn: params.amountIn,
      minAmountOut: params.minAmountOut,
    });

    // If using free balance (V3 pools only), skip the Spark transfer
    if (params.useFreeBalance) {
      const swapResponse = await this.executeSwapIntent({
        ...params,
        // No transferId - triggers free balance mode
      });
      return {
        ...swapResponse,
        inboundSparkTransferId: swapResponse.requestId,
      };
    }

    // Transfer assets to pool using new address encoding
    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: params.poolId,
      network: this.sparkNetwork,
    });

    const transferId = await this.transferAsset(
      {
        receiverSparkAddress: lpSparkAddress,
        assetAddress: params.assetInAddress,
        amount: params.amountIn,
      },
      "Insufficient balance for swap: ",
      params.useAvailableBalance
    );

    // Execute with auto-clawback on failure
    const swapResponse = await this.executeWithAutoClawback(
      () =>
        this.executeSwapIntent({
          ...params,
          transferId,
        }),
      [transferId],
      params.poolId
    );

    return { ...swapResponse, inboundSparkTransferId: transferId };
  }

  /**
   * Execute a swap with a pre-created transfer or using free balance.
   *
   * When transferId is provided, uses that Spark transfer. If transferId is a null UUID, treats it as a transfer reference.
   * When transferId is omitted/undefined, uses free balance (V3 pools only).
   */
  async executeSwapIntent(params: {
    poolId: string;
    transferId?: string;
    assetInAddress: string;
    assetOutAddress: string;
    amountIn: string;
    maxSlippageBps: number;
    minAmountOut: string;
    integratorFeeRateBps?: number;
    integratorPublicKey?: string;
  }) {
    await this.ensureInitialized();

    // Also enforce gating and min amounts for direct intent usage
    await this.ensureAmmOperationAllowed("allow_swaps");
    await this.assertSwapMeetsMinAmounts({
      assetInAddress: params.assetInAddress,
      assetOutAddress: params.assetOutAddress,
      amountIn: params.amountIn,
      minAmountOut: params.minAmountOut,
    });

    // Determine if using free balance based on whether transferId is provided
    const isUsingFreeBalance = !params.transferId;

    // Generate swap intent
    const nonce = generateNonce();
    const intentMessage = generatePoolSwapIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      assetInSparkTransferId: params.transferId,
      assetInAddress: this.toHexTokenIdentifier(params.assetInAddress),
      assetOutAddress: this.toHexTokenIdentifier(params.assetOutAddress),
      amountIn: params.amountIn.toString(),
      maxSlippageBps: params.maxSlippageBps.toString(),
      minAmountOut: params.minAmountOut,
      totalIntegratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: ExecuteSwapRequest = {
      userPublicKey: this.publicKey,
      poolId: params.poolId,
      assetInAddress: this.toHexTokenIdentifier(params.assetInAddress),
      assetOutAddress: this.toHexTokenIdentifier(params.assetOutAddress),
      amountIn: params.amountIn.toString(),
      maxSlippageBps: params.maxSlippageBps?.toString(),
      minAmountOut: params.minAmountOut,
      assetInSparkTransferId: params.transferId ?? "",
      totalIntegratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
      integratorPublicKey: params.integratorPublicKey || "",
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.executeSwap(request);

    // Check if the swap was accepted
    if (!response.accepted) {
      const errorMessage = response.error || "Swap rejected by the AMM";
      const hasRefund = !!response.refundedAmount;
      const refundInfo = hasRefund
        ? ` Refunded ${response.refundedAmount} of ${response.refundedAssetAddress} via transfer ${response.refundTransferId}`
        : "";

      // If refund was provided, funds are safe - use auto_refund recovery
      // If no refund and not using free balance, funds may need clawback
      throw new FlashnetError(`${errorMessage}.${refundInfo}`, {
        response: {
          errorCode: hasRefund ? "FSAG-4202" : "UNKNOWN", // Slippage if refunded
          errorCategory: hasRefund ? "Business" : "System",
          message: `${errorMessage}.${refundInfo}`,
          requestId: "",
          timestamp: new Date().toISOString(),
          service: "amm-gateway",
          severity: "Error",
        },
        httpStatus: 400,
        // Don't include transferIds if refunded or using free balance - no clawback needed
        transferIds:
          hasRefund || isUsingFreeBalance ? [] : [params.transferId ?? ""],
        lpIdentityPublicKey: params.poolId,
      });
    }

    return response;
  }

  /**
   * Simulate a route swap (multi-hop swap)
   */
  async simulateRouteSwap(
    params: SimulateRouteSwapRequest
  ): Promise<SimulateRouteSwapResponse> {
    if (params.hops.length > 4) {
      throw new Error("Route swap cannot have more than 4 hops");
    }
    await this.ensureInitialized();
    await this.ensurePingOk();
    return this.typedApi.simulateRouteSwap(params);
  }

  /**
   * Execute a route swap (multi-hop swap)
   *
   * If the route swap fails with a clawbackable error, the SDK will automatically
   * attempt to recover the transferred funds via clawback.
   */
  async executeRouteSwap(params: {
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
  }): Promise<ExecuteRouteSwapResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_route_swaps");
    // Validate min-amount policy for route: check initial input and final output asset
    const finalOutputAsset =
      params.hops[params.hops.length - 1]?.assetOutAddress;
    if (!finalOutputAsset) {
      throw new Error("Route swap requires at least one hop with output asset");
    }
    await this.assertSwapMeetsMinAmounts({
      assetInAddress: params.initialAssetAddress,
      assetOutAddress: finalOutputAsset,
      amountIn: params.inputAmount,
      minAmountOut: params.minAmountOut,
    });

    // Validate hops array
    if (params.hops.length > 4) {
      throw new Error("Route swap cannot have more than 4 hops");
    }
    if (!params.hops.length) {
      throw new Error("Route swap requires at least one hop");
    }

    // Transfer initial asset to first pool using new address encoding
    const firstPoolId = params.hops[0]?.poolId;
    if (!firstPoolId) {
      throw new Error("First pool ID is required");
    }

    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: firstPoolId,
      network: this.sparkNetwork,
    });

    const initialTransferId = await this.transferAsset(
      {
        receiverSparkAddress: lpSparkAddress,
        assetAddress: params.initialAssetAddress,
        amount: params.inputAmount,
      },
      "Insufficient balance for route swap: ",
      params.useAvailableBalance
    );

    // Execute with auto-clawback on failure
    return this.executeWithAutoClawback(
      async () => {
        // Prepare hops for validation
        const hops: RouteHopValidation[] = params.hops.map((hop) => ({
          lpIdentityPublicKey: hop.poolId,
          inputAssetAddress: this.toHexTokenIdentifier(hop.assetInAddress),
          outputAssetAddress: this.toHexTokenIdentifier(hop.assetOutAddress),
          hopIntegratorFeeRateBps:
            hop.hopIntegratorFeeRateBps !== undefined &&
            hop.hopIntegratorFeeRateBps !== null
              ? hop.hopIntegratorFeeRateBps.toString()
              : "0",
        }));

        // Convert hops and ensure integrator fee is always present
        const requestHops: RouteHopRequest[] = params.hops.map((hop) => ({
          poolId: hop.poolId,
          assetInAddress: this.toHexTokenIdentifier(hop.assetInAddress),
          assetOutAddress: this.toHexTokenIdentifier(hop.assetOutAddress),
          hopIntegratorFeeRateBps:
            hop.hopIntegratorFeeRateBps !== undefined &&
            hop.hopIntegratorFeeRateBps !== null
              ? hop.hopIntegratorFeeRateBps.toString()
              : "0",
        }));

        // Generate route swap intent
        const nonce = generateNonce();
        const intentMessage = generateRouteSwapIntentMessage({
          userPublicKey: this.publicKey,
          hops: hops.map((hop) => ({
            lpIdentityPublicKey: hop.lpIdentityPublicKey,
            inputAssetAddress: hop.inputAssetAddress,
            outputAssetAddress: hop.outputAssetAddress,
            hopIntegratorFeeRateBps: hop.hopIntegratorFeeRateBps,
          })),
          initialSparkTransferId: initialTransferId,
          inputAmount: params.inputAmount.toString(),
          maxRouteSlippageBps: params.maxRouteSlippageBps.toString(),
          minAmountOut: params.minAmountOut,
          nonce,
          defaultIntegratorFeeRateBps: params.integratorFeeRateBps?.toString(),
        });

        // Sign intent
        const messageHash = sha256(intentMessage);
        const signature = await (
          this._wallet as any
        ).config.signer.signMessageWithIdentityKey(messageHash, true);

        const request: ExecuteRouteSwapRequest = {
          userPublicKey: this.publicKey,
          hops: requestHops,
          initialSparkTransferId: initialTransferId,
          inputAmount: params.inputAmount.toString(),
          maxRouteSlippageBps: params.maxRouteSlippageBps.toString(),
          minAmountOut: params.minAmountOut,
          nonce,
          signature: getHexFromUint8Array(signature),
          integratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
          integratorPublicKey: params.integratorPublicKey || "",
        };

        const response = await this.typedApi.executeRouteSwap(request);

        // Check if the route swap was accepted
        if (!response.accepted) {
          const errorMessage =
            response.error || "Route swap rejected by the AMM";
          const hasRefund = !!response.refundedAmount;
          const refundInfo = hasRefund
            ? ` Refunded ${response.refundedAmount} of ${response.refundedAssetPublicKey} via transfer ${response.refundTransferId}`
            : "";

          throw new FlashnetError(`${errorMessage}.${refundInfo}`, {
            response: {
              errorCode: hasRefund ? "FSAG-4202" : "UNKNOWN",
              errorCategory: hasRefund ? "Business" : "System",
              message: `${errorMessage}.${refundInfo}`,
              requestId: "",
              timestamp: new Date().toISOString(),
              service: "amm-gateway",
              severity: "Error",
            },
            httpStatus: 400,
            transferIds: hasRefund ? [] : [initialTransferId],
            lpIdentityPublicKey: firstPoolId,
          });
        }

        return response;
      },
      [initialTransferId],
      firstPoolId
    );
  }

  // Liquidity Operations

  /**
   * Simulate adding liquidity
   */
  async simulateAddLiquidity(
    params: SimulateAddLiquidityRequest
  ): Promise<SimulateAddLiquidityResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();
    return this.typedApi.simulateAddLiquidity(params);
  }

  /**
   * Add liquidity to a pool
   *
   * If adding liquidity fails with a clawbackable error, the SDK will automatically
   * attempt to recover the transferred funds via clawback.
   */
  async addLiquidity(params: {
    poolId: string;
    assetAAmount: string;
    assetBAmount: string;
    assetAMinAmountIn: string;
    assetBMinAmountIn: string;
    /** When true, checks against availableToSendBalance instead of total balance */
    useAvailableBalance?: boolean;
  }): Promise<AddLiquidityResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_add_liquidity");

    // Get pool details to know which assets we're dealing with
    const pool = await this.getPool(params.poolId);

    // Enforce min-amount policy for inputs based on pool assets
    await this.assertAddLiquidityMeetsMinAmounts({
      poolId: params.poolId,
      assetAAmount: params.assetAAmount,
      assetBAmount: params.assetBAmount,
    });

    // Transfer assets to pool using new address encoding
    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: params.poolId,
      network: this.sparkNetwork,
    });

    const [assetATransferId, assetBTransferId] = await this.transferAssets<2>(
      [
        {
          receiverSparkAddress: lpSparkAddress,
          assetAddress: pool.assetAAddress,
          amount: params.assetAAmount,
        },
        {
          receiverSparkAddress: lpSparkAddress,
          assetAddress: pool.assetBAddress,
          amount: params.assetBAmount,
        },
      ],
      "Insufficient balance for adding liquidity: ",
      params.useAvailableBalance
    );

    // Execute with auto-clawback on failure
    return this.executeWithAutoClawback(
      async () => {
        // Generate add liquidity intent
        const nonce = generateNonce();
        const intentMessage = generateAddLiquidityIntentMessage({
          userPublicKey: this.publicKey,
          lpIdentityPublicKey: params.poolId,
          assetASparkTransferId: assetATransferId,
          assetBSparkTransferId: assetBTransferId,
          assetAAmount: params.assetAAmount.toString(),
          assetBAmount: params.assetBAmount.toString(),
          assetAMinAmountIn: params.assetAMinAmountIn.toString(),
          assetBMinAmountIn: params.assetBMinAmountIn.toString(),
          nonce,
        });

        // Sign intent
        const messageHash = sha256(intentMessage);
        const signature = await (
          this._wallet as any
        ).config.signer.signMessageWithIdentityKey(messageHash, true);

        const request: AddLiquidityRequest = {
          userPublicKey: this.publicKey,
          poolId: params.poolId,
          assetASparkTransferId: assetATransferId,
          assetBSparkTransferId: assetBTransferId,
          assetAAmountToAdd: params.assetAAmount.toString(),
          assetBAmountToAdd: params.assetBAmount.toString(),
          assetAMinAmountIn: params.assetAMinAmountIn.toString(),
          assetBMinAmountIn: params.assetBMinAmountIn.toString(),
          nonce,
          signature: getHexFromUint8Array(signature),
        };

        const response = await this.typedApi.addLiquidity(request);

        // Check if the liquidity addition was accepted
        if (!response.accepted) {
          const errorMessage =
            response.error || "Add liquidity rejected by the AMM";
          const hasRefund = !!(
            response.refund?.assetAAmount || response.refund?.assetBAmount
          );
          const refundInfo = response.refund
            ? ` Refunds: Asset A: ${
                response.refund.assetAAmount || 0
              }, Asset B: ${response.refund.assetBAmount || 0}`
            : "";

          throw new FlashnetError(`${errorMessage}.${refundInfo}`, {
            response: {
              errorCode: hasRefund ? "FSAG-4203" : "UNKNOWN", // Phase error if refunded
              errorCategory: hasRefund ? "Business" : "System",
              message: `${errorMessage}.${refundInfo}`,
              requestId: "",
              timestamp: new Date().toISOString(),
              service: "amm-gateway",
              severity: "Error",
            },
            httpStatus: 400,
            transferIds: hasRefund ? [] : [assetATransferId, assetBTransferId],
            lpIdentityPublicKey: params.poolId,
          });
        }

        return response;
      },
      [assetATransferId, assetBTransferId],
      params.poolId
    );
  }

  /**
   * Simulate removing liquidity
   */
  async simulateRemoveLiquidity(
    params: SimulateRemoveLiquidityRequest
  ): Promise<SimulateRemoveLiquidityResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();
    return this.typedApi.simulateRemoveLiquidity(params);
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(params: {
    poolId: string;
    lpTokensToRemove: string;
  }): Promise<RemoveLiquidityResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_withdraw_liquidity");

    // Check LP token balance
    const position = await this.getLpPosition(params.poolId);
    const lpTokensOwned = position.lpTokensOwned;
    const tokensToRemove = params.lpTokensToRemove;

    if (compareDecimalStrings(lpTokensOwned, tokensToRemove) < 0) {
      throw new Error(
        `Insufficient LP tokens. Owned: ${lpTokensOwned}, Requested: ${tokensToRemove}`
      );
    }

    // Pre-simulate and enforce min-amount policy for outputs
    await this.assertRemoveLiquidityMeetsMinAmounts({
      poolId: params.poolId,
      lpTokensToRemove: params.lpTokensToRemove,
    });

    // Generate remove liquidity intent
    const nonce = generateNonce();
    const intentMessage = generateRemoveLiquidityIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      lpTokensToRemove: params.lpTokensToRemove,
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: RemoveLiquidityRequest = {
      userPublicKey: this.publicKey,
      poolId: params.poolId,
      lpTokensToRemove: params.lpTokensToRemove,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.removeLiquidity(request);

    // Check if the liquidity removal was accepted
    if (!response.accepted) {
      const errorMessage =
        response.error || "Remove liquidity rejected by the AMM";
      throw new Error(errorMessage);
    }

    return response;
  }

  // Host Operations

  /**
   * Register as a host
   */
  async registerHost(params: {
    namespace: string;
    minFeeBps: number;
    feeRecipientPublicKey?: string;
  }): Promise<RegisterHostResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    const feeRecipient = params.feeRecipientPublicKey || this.publicKey;
    const nonce = generateNonce();

    // Generate intent
    const intentMessage = generateRegisterHostIntentMessage({
      namespace: params.namespace,
      minFeeBps: params.minFeeBps,
      feeRecipientPublicKey: feeRecipient,
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: RegisterHostRequest = {
      namespace: params.namespace,
      minFeeBps: params.minFeeBps,
      feeRecipientPublicKey: feeRecipient,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    return this.typedApi.registerHost(request);
  }

  /**
   * Get host information
   */
  async getHost(namespace: string): Promise<GetHostResponse> {
    await this.ensureInitialized();
    return this.typedApi.getHost(namespace);
  }

  /**
   * Get pool host fees
   */
  async getPoolHostFees(
    hostNamespace: string,
    poolId: string
  ): Promise<GetPoolHostFeesResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();
    return this.typedApi.getPoolHostFees({ hostNamespace, poolId });
  }

  /**
   * Get host fee withdrawal history
   */
  async getHostFeeWithdrawalHistory(
    query?: FeeWithdrawalHistoryQuery
  ): Promise<FeeWithdrawalHistoryResponse> {
    await this.ensureInitialized();
    return this.typedApi.getHostFeeWithdrawalHistory(query);
  }

  /**
   * Withdraw host fees
   */
  async withdrawHostFees(params: {
    lpIdentityPublicKey: string;
    assetBAmount?: string;
  }): Promise<WithdrawHostFeesResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_withdraw_fees");

    const nonce = generateNonce();
    const assetBAmount = params.assetBAmount ?? "0";
    const intentMessage = generateWithdrawHostFeesIntentMessage({
      hostPublicKey: this.publicKey,
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      assetBAmount,
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: WithdrawHostFeesRequest = {
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      assetBAmount,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.withdrawHostFees(request);

    // Check if the withdrawal was accepted
    if (!response.accepted) {
      const errorMessage =
        response.error || "Withdraw host fees rejected by the AMM";
      throw new Error(errorMessage);
    }

    return response;
  }

  /**
   * Get host fees across all pools
   */
  async getHostFees(hostNamespace: string): Promise<GetHostFeesResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    const request: GetHostFeesRequest = {
      hostNamespace,
    };

    return this.typedApi.getHostFees(request);
  }

  /**
   * Get integrator fee withdrawal history
   */
  async getIntegratorFeeWithdrawalHistory(
    query?: FeeWithdrawalHistoryQuery
  ): Promise<FeeWithdrawalHistoryResponse> {
    await this.ensureInitialized();
    return this.typedApi.getIntegratorFeeWithdrawalHistory(query);
  }

  /**
   * Get fees for a specific pool for an integrator
   */
  async getPoolIntegratorFees(
    poolId: string
  ): Promise<GetPoolIntegratorFeesResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();
    return this.typedApi.getPoolIntegratorFees({ poolId });
  }

  /**
   * Withdraw integrator fees
   */
  async withdrawIntegratorFees(params: {
    lpIdentityPublicKey: string;
    assetBAmount?: string;
  }): Promise<WithdrawIntegratorFeesResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_withdraw_fees");

    const nonce = generateNonce();
    const assetBAmount = params.assetBAmount ?? "0";
    const intentMessage = generateWithdrawIntegratorFeesIntentMessage({
      integratorPublicKey: this.publicKey,
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      assetBAmount,
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: WithdrawIntegratorFeesRequest = {
      integratorPublicKey: this.publicKey,
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      assetBAmount,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.withdrawIntegratorFees(request);

    // Check if the withdrawal was accepted
    if (!response.accepted) {
      const errorMessage =
        response.error || "Withdraw integrator fees rejected by the AMM";
      throw new Error(errorMessage);
    }

    return response;
  }

  /**
   * Get integrator fees across all pools
   */
  async getIntegratorFees(): Promise<GetIntegratorFeesResponse> {
    await this.ensureInitialized();
    return this.typedApi.getIntegratorFees();
  }

  // Escrow Operations

  /**
   * Creates a new escrow contract.
   * This is the first step in a two-step process: create, then fund.
   * @param params Parameters to create the escrow.
   * @returns The escrow creation response, including the ID and deposit address.
   */
  async createEscrow(params: {
    assetId: string;
    assetAmount: string;
    recipients: { id: string; amount: string }[];
    claimConditions: Condition[];
    abandonHost?: string;
    abandonConditions?: Condition[];
    autoFund?: boolean;
    /** When true, checks against availableToSendBalance instead of total balance */
    useAvailableBalance?: boolean;
  }): Promise<CreateEscrowResponse | FundEscrowResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    const nonce = generateNonce();
    // The intent message requires a different structure for recipients and conditions
    const intentRecipients: EscrowRecipient[] = params.recipients.map((r) => ({
      recipientId: r.id,
      amount: r.amount,
      hasClaimed: false, // Default value for creation
    }));

    const intentMessage = generateCreateEscrowIntentMessage({
      creatorPublicKey: this.publicKey,
      assetId: params.assetId,
      assetAmount: params.assetAmount,
      recipients: intentRecipients,
      claimConditions: params.claimConditions as unknown as EscrowCondition[], // Assuming API `Condition` is compatible
      abandonHost: params.abandonHost,
      abandonConditions:
        (params.abandonConditions as unknown as EscrowCondition[]) || undefined,
      nonce,
    });

    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: CreateEscrowRequest = {
      creatorPublicKey: this.publicKey,
      assetId: params.assetId,
      assetAmount: params.assetAmount,
      recipients: params.recipients,
      claimConditions: params.claimConditions,
      abandonHost: params.abandonHost,
      abandonConditions: params.abandonConditions,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const createResponse = await this.typedApi.createEscrow(request);

    const autoFund = params.autoFund !== false;

    if (!autoFund) {
      return createResponse;
    }

    // Auto-fund the escrow
    return this.fundEscrow({
      escrowId: createResponse.escrowId,
      depositAddress: createResponse.depositAddress,
      assetId: params.assetId,
      assetAmount: params.assetAmount,
      useAvailableBalance: params.useAvailableBalance,
    });
  }

  /**
   * Funds an escrow contract to activate it.
   * This handles the asset transfer and confirmation in one step.
   * @param params Parameters to fund the escrow, including asset details and deposit address.
   * @returns The funding confirmation response.
   */
  async fundEscrow(params: {
    escrowId: string;
    depositAddress: string;
    assetId: string;
    assetAmount: string;
    /** When true, checks against availableToSendBalance instead of total balance */
    useAvailableBalance?: boolean;
  }): Promise<FundEscrowResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    // 1. Balance check
    await this.checkBalance({
      balancesToCheck: [
        { assetAddress: params.assetId, amount: params.assetAmount },
      ],
      errorPrefix: "Insufficient balance to fund escrow: ",
      useAvailableBalance: params.useAvailableBalance,
    });

    // 2. Perform transfer
    const escrowSparkAddress = encodeSparkAddressNew({
      identityPublicKey: params.depositAddress,
      network: this.sparkNetwork,
    });

    const sparkTransferId = await this.transferAsset({
      receiverSparkAddress: escrowSparkAddress,
      assetAddress: params.assetId,
      amount: params.assetAmount,
    });

    // 3. Execute signed intent
    return await this.executeFundEscrowIntent({
      escrowId: params.escrowId,
      sparkTransferId,
    });
  }

  async executeFundEscrowIntent(params: {
    escrowId: string;
    sparkTransferId: string;
  }): Promise<FundEscrowResponse> {
    await this.ensurePingOk();
    // Generate intent
    const nonce = generateNonce();
    const intentMessage = generateFundEscrowIntentMessage({
      ...params,
      creatorPublicKey: this.publicKey,
      nonce,
    });

    // Sign
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    // Call API
    const request: FundEscrowRequest = {
      ...params,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    return this.typedApi.fundEscrow(request);
  }

  /**
   * Claims funds from an active escrow contract.
   * The caller must be a valid recipient and all claim conditions must be met.
   * @param params Parameters for the claim.
   * @returns The claim processing response.
   */
  async claimEscrow(params: {
    escrowId: string;
  }): Promise<ClaimEscrowResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    const nonce = generateNonce();
    const intentMessage = generateClaimEscrowIntentMessage({
      escrowId: params.escrowId,
      recipientPublicKey: this.publicKey,
      nonce,
    });

    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: ClaimEscrowRequest = {
      escrowId: params.escrowId,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    return this.typedApi.claimEscrow(request);
  }

  /**
   * Retrieves the current state of an escrow contract.
   * This is a read-only operation and does not require authentication.
   * @param escrowId The unique identifier of the escrow.
   * @returns The full state of the escrow.
   */
  async getEscrow(escrowId: string): Promise<EscrowState> {
    await this.ensureInitialized();
    return this.typedApi.getEscrow(escrowId);
  }

  // Swap History

  /**
   * Get swaps for a specific pool
   */
  async getPoolSwaps(
    lpPubkey: string,
    query?: ListPoolSwapsQuery
  ): Promise<ListPoolSwapsResponse> {
    await this.ensureInitialized();
    return this.typedApi.getPoolSwaps(lpPubkey, query);
  }

  /**
   * Get global swaps across all pools
   */
  async getGlobalSwaps(
    query?: ListGlobalSwapsQuery
  ): Promise<ListGlobalSwapsResponse> {
    await this.ensureInitialized();
    return this.typedApi.getGlobalSwaps(query);
  }

  /**
   * Get swaps for a specific user
   */
  async getUserSwaps(
    userPublicKey?: string,
    query?: ListUserSwapsQuery
  ): Promise<ListUserSwapsResponse> {
    await this.ensureInitialized();
    const user = userPublicKey || this.publicKey;
    return this.typedApi.getUserSwaps(user, query);
  }

  // Clawback
  /**
   * Request clawback of a stuck inbound transfer to an LP wallet
   */
  async clawback(params: {
    sparkTransferId: string;
    lpIdentityPublicKey: string;
  }): Promise<ClawbackResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    const nonce = generateNonce();
    const intentMessage = generateClawbackIntentMessage({
      senderPublicKey: this.publicKey,
      sparkTransferId: params.sparkTransferId,
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      nonce,
    });

    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: ClawbackRequest = {
      senderPublicKey: this.publicKey,
      sparkTransferId: params.sparkTransferId,
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.clawback(request);

    if (!response.accepted) {
      const errorMessage = response.error || "Clawback request was rejected";
      throw new Error(errorMessage);
    }

    return response;
  }

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
  async checkClawbackEligibility(params: {
    sparkTransferId: string;
  }): Promise<CheckClawbackEligibilityResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    const request: CheckClawbackEligibilityRequest = {
      sparkTransferId: params.sparkTransferId,
    };

    return this.typedApi.checkClawbackEligibility(request);
  }

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
  async listClawbackableTransfers(
    query?: ListClawbackableTransfersQuery
  ): Promise<ListClawbackableTransfersResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();
    return this.typedApi.listClawbackableTransfers(query);
  }

  /**
   * Attempt to clawback multiple transfers
   *
   * @param transferIds - Array of transfer IDs to clawback
   * @param lpIdentityPublicKey - The LP wallet public key
   * @returns Array of results for each clawback attempt
   */
  async clawbackMultiple(
    transferIds: string[],
    lpIdentityPublicKey: string
  ): Promise<ClawbackAttemptResult[]> {
    const results: ClawbackAttemptResult[] = [];

    for (const transferId of transferIds) {
      try {
        const response = await this.clawback({
          sparkTransferId: transferId,
          lpIdentityPublicKey,
        });
        results.push({
          transferId,
          success: true,
          response,
        });
      } catch (err) {
        results.push({
          transferId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  /**
   * Internal helper to execute an operation with automatic clawback on failure
   *
   * @param operation - The async operation to execute
   * @param transferIds - Transfer IDs that were sent and may need clawback
   * @param lpIdentityPublicKey - The LP wallet public key for clawback
   * @returns The result of the operation
   * @throws FlashnetError with typed clawbackSummary attached
   */
  private async executeWithAutoClawback<T>(
    operation: () => Promise<T>,
    transferIds: string[],
    lpIdentityPublicKey: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Convert to FlashnetError if not already
      const flashnetError = FlashnetError.fromUnknown(error, {
        transferIds,
        lpIdentityPublicKey,
      });

      // Check if we should attempt clawback
      if (flashnetError.shouldClawback() && transferIds.length > 0) {
        // Attempt to clawback all transfers
        const clawbackResults = await this.clawbackMultiple(
          transferIds,
          lpIdentityPublicKey
        );

        // Separate successful and failed clawbacks
        const successfulClawbacks = clawbackResults.filter((r) => r.success);
        const failedClawbacks = clawbackResults.filter((r) => !r.success);

        // Build typed clawback summary
        const clawbackSummary: AutoClawbackSummary = {
          attempted: true,
          totalTransfers: transferIds.length,
          successCount: successfulClawbacks.length,
          failureCount: failedClawbacks.length,
          results: clawbackResults,
          recoveredTransferIds: successfulClawbacks.map((r) => r.transferId),
          unrecoveredTransferIds: failedClawbacks.map((r) => r.transferId),
        };

        // Create enhanced error message
        let enhancedMessage = flashnetError.message;
        if (successfulClawbacks.length > 0) {
          enhancedMessage += ` [Auto-clawback: ${successfulClawbacks.length}/${transferIds.length} transfers recovered]`;
        }
        if (failedClawbacks.length > 0) {
          const failedIds = failedClawbacks.map((r) => r.transferId).join(", ");
          enhancedMessage += ` [Clawback failed for: ${failedIds}]`;
        }

        // Determine remediation based on clawback results
        let remediation: string;
        if (clawbackSummary.failureCount === 0) {
          remediation =
            "Your funds have been automatically recovered. No action needed.";
        } else if (clawbackSummary.successCount > 0) {
          remediation = `${clawbackSummary.successCount} transfer(s) recovered. Manual clawback needed for remaining transfers.`;
        } else {
          remediation =
            flashnetError.remediation ??
            "Automatic recovery failed. Please initiate a manual clawback.";
        }

        // Throw new error with typed clawback summary
        const errorWithClawback = new FlashnetError(enhancedMessage, {
          response: {
            errorCode: flashnetError.errorCode,
            errorCategory: flashnetError.category,
            message: enhancedMessage,
            details: flashnetError.details,
            requestId: flashnetError.requestId,
            timestamp: flashnetError.timestamp,
            service: flashnetError.service,
            severity: flashnetError.severity,
            remediation,
          },
          httpStatus: flashnetError.httpStatus,
          transferIds: clawbackSummary.unrecoveredTransferIds,
          lpIdentityPublicKey,
          clawbackSummary,
        });

        throw errorWithClawback;
      }

      // Not a clawbackable error, just re-throw
      throw flashnetError;
    }
  }

  // Clawback Monitor

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
  startClawbackMonitor(
    options: ClawbackMonitorOptions = {}
  ): ClawbackMonitorHandle {
    const {
      intervalMs = 60000, // Default: 1 minute
      batchSize = 2, // Default: 2 clawbacks per batch (rate limit safe)
      batchDelayMs = 500, // Default: 500ms between batches
      maxTransfersPerPoll = 100, // Default: max 100 transfers per poll
      onClawbackSuccess,
      onClawbackError,
      onPollComplete,
      onPollError,
    } = options;

    let isRunning = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let currentPollPromise: Promise<void> | null = null;

    const poll = async (): Promise<ClawbackPollResult> => {
      const result: ClawbackPollResult = {
        transfersFound: 0,
        clawbacksAttempted: 0,
        clawbacksSucceeded: 0,
        clawbacksFailed: 0,
        results: [],
      };

      try {
        // Fetch clawbackable transfers
        const response = await this.listClawbackableTransfers({
          limit: maxTransfersPerPoll,
        });

        result.transfersFound = response.transfers.length;

        if (response.transfers.length === 0) {
          return result;
        }

        // Process in batches to respect rate limits
        for (let i = 0; i < response.transfers.length; i += batchSize) {
          if (!isRunning) {
            break;
          }

          const batch = response.transfers.slice(i, i + batchSize);

          // Process batch concurrently
          const batchResults = await Promise.all(
            batch.map(async (transfer) => {
              result.clawbacksAttempted++;
              try {
                const clawbackResponse = await this.clawback({
                  sparkTransferId: transfer.id,
                  lpIdentityPublicKey: transfer.lpIdentityPublicKey,
                });

                const attemptResult: ClawbackAttemptResult = {
                  transferId: transfer.id,
                  success: true,
                  response: clawbackResponse,
                };

                result.clawbacksSucceeded++;
                onClawbackSuccess?.(attemptResult);
                return attemptResult;
              } catch (err) {
                const attemptResult: ClawbackAttemptResult = {
                  transferId: transfer.id,
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                };

                result.clawbacksFailed++;
                onClawbackError?.(transfer.id, err);
                return attemptResult;
              }
            })
          );

          result.results.push(...batchResults);

          // Wait between batches if there are more to process
          if (i + batchSize < response.transfers.length && isRunning) {
            await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
          }
        }
      } catch (err) {
        onPollError?.(err);
      }

      return result;
    };

    const scheduleNextPoll = () => {
      if (!isRunning) {
        return;
      }
      timeoutId = setTimeout(async () => {
        if (!isRunning) {
          return;
        }
        currentPollPromise = (async () => {
          const result = await poll();
          onPollComplete?.(result);
          scheduleNextPoll();
        })();
      }, intervalMs);
    };

    // Start first poll immediately
    currentPollPromise = (async () => {
      const result = await poll();
      onPollComplete?.(result);
      scheduleNextPoll();
    })();

    return {
      isRunning: () => isRunning,
      stop: async () => {
        isRunning = false;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        // Wait for current poll to complete
        if (currentPollPromise) {
          await currentPollPromise.catch(() => {});
        }
      },
      pollNow: async () => {
        if (!isRunning) {
          throw new Error("Monitor is stopped");
        }
        return poll();
      },
    };
  }

  // Token Address Operations

  /**
   * Encode a token identifier into a human-readable token address using the client's Spark network
   * @param tokenIdentifier - Token identifier as hex string or Uint8Array
   * @returns Human-readable token address
   */
  encodeTokenAddress(
    tokenIdentifier: string | Uint8Array
  ): SparkHumanReadableTokenIdentifier {
    return encodeSparkHumanReadableTokenIdentifier(
      tokenIdentifier,
      this.sparkNetwork
    );
  }

  /**
   * Decode a human-readable token address back to its identifier
   * @param address - Human-readable token address
   * @returns Object containing the token identifier (as hex string) and Spark network
   */
  decodeTokenAddress(address: SparkHumanReadableTokenIdentifier): {
    tokenIdentifier: string;
    network: SparkNetworkType;
  } {
    return decodeSparkHumanReadableTokenIdentifier(address, this.sparkNetwork);
  }

  /**
   * @deprecated Use encodeTokenAddress instead - this method uses legacy types
   * Encode a token identifier into a human-readable token address using legacy types
   * @param tokenIdentifier - Token identifier as hex string or Uint8Array
   * @returns Human-readable token address
   */
  encodeLegacyTokenAddress(
    tokenIdentifier: string | Uint8Array
  ): SparkHumanReadableTokenIdentifier {
    return encodeSparkHumanReadableTokenIdentifier(
      tokenIdentifier,
      this.sparkNetwork
    );
  }

  /**
   * @deprecated Use decodeTokenAddress instead - this method uses legacy types
   * Decode a human-readable token address back to its identifier using legacy types
   * @param address - Human-readable token address
   * @returns Object containing the token identifier (as hex string) and network
   */
  decodeLegacyTokenAddress(address: SparkHumanReadableTokenIdentifier): {
    tokenIdentifier: string;
    network: NetworkType;
  } {
    return decodeSparkHumanReadableTokenIdentifier(address, this.sparkNetwork);
  }

  // Status

  // Config Inspection
  /**
   * Get raw feature status list (cached briefly)
   */
  async getFeatureStatus(): Promise<FeatureStatusResponse> {
    await this.ensureInitialized();
    const now = Date.now();
    if (this.featureStatusCache && this.featureStatusCache.expiryMs > now) {
      return this.featureStatusCache.data;
    }
    const data = await this.typedApi.getFeatureStatus();
    this.featureStatusCache = {
      data,
      expiryMs: now + FlashnetClient.FEATURE_STATUS_TTL_MS,
    };
    return data;
  }

  /**
   * Get feature flags as a map of feature name to boolean (cached briefly)
   */
  async getFeatureFlags(): Promise<Map<FeatureName, boolean>> {
    await this.ensureInitialized();
    return this.getFeatureStatusMap();
  }

  /**
   * Get raw min-amounts configuration list from the backend
   */
  async getMinAmounts(): Promise<MinAmountsResponse> {
    await this.ensureInitialized();
    return this.typedApi.getMinAmounts();
  }

  /**
   * Get enabled min-amounts as a map keyed by hex asset identifier
   */
  async getMinAmountsMap(): Promise<Map<string, bigint>> {
    await this.ensureInitialized();
    return this.getEnabledMinAmountsMap();
  }

  /**
   * Get allowed Asset B list for pool creation (cached for 60s)
   */
  async getAllowedAssets(): Promise<AllowedAssetsResponse> {
    await this.ensureInitialized();
    const now = Date.now();
    if (this.allowedAssetsCache && this.allowedAssetsCache.expiryMs > now) {
      return this.allowedAssetsCache.data;
    }
    const allowed = await this.typedApi.getAllowedAssets();
    this.allowedAssetsCache = {
      data: allowed,
      expiryMs: now + FlashnetClient.ALLOWED_ASSETS_TTL_MS,
    };
    return allowed;
  }

  /**
   * Ping the settlement service
   */
  async ping(): Promise<SettlementPingResponse> {
    await this.ensureInitialized();
    return this.typedApi.ping();
  }

  // Helper Methods

  /**
   * Performs asset transfer using generalized asset address for both BTC and tokens.
   */
  async transferAsset(
    recipient: TransferAssetRecipient,
    checkBalanceErrorPrefix?: string,
    useAvailableBalance?: boolean
  ): Promise<string> {
    const transferIds = await this.transferAssets<1>(
      [recipient],
      checkBalanceErrorPrefix,
      useAvailableBalance
    );
    return transferIds[0];
  }

  /**
   * Performs asset transfers using generalized asset addresses for both BTC and tokens.
   * Supports optional generic to hardcode recipients length so output list can be typed with same length.
   */
  async transferAssets<N extends number | unknown = unknown>(
    recipients: TupleArray<TransferAssetRecipient, N>,
    checkBalanceErrorPrefix?: string,
    useAvailableBalance?: boolean
  ): Promise<TupleArray<string, N>> {
    if (checkBalanceErrorPrefix) {
      await this.checkBalance({
        balancesToCheck: recipients,
        errorPrefix: checkBalanceErrorPrefix,
        useAvailableBalance,
      });
    }

    const transferIds = [];
    for (const recipient of recipients) {
      if (recipient.assetAddress === BTC_ASSET_PUBKEY) {
        const transfer = await this._wallet.transfer({
          amountSats: Number(recipient.amount),
          receiverSparkAddress: recipient.receiverSparkAddress,
        });
        transferIds.push(transfer.id);
      } else {
        const transferId = await this._wallet.transferTokens({
          tokenIdentifier: this.toHumanReadableTokenIdentifier(
            recipient.assetAddress
          ) as any,
          tokenAmount: BigInt(recipient.amount),
          receiverSparkAddress: recipient.receiverSparkAddress,
        });
        transferIds.push(transferId);
      }
    }

    return transferIds as TupleArray<string, N>;
  }

  /**
   * Helper method to add initial liquidity after pool creation
   */
  private async addInitialLiquidity(
    poolId: string,
    assetAAddress: string,
    assetBAddress: string,
    assetAAmount: string,
    assetBAmount: string,
    assetAMinAmountIn: string,
    assetBMinAmountIn: string
  ): Promise<void> {
    // Enforce gating and min-amount policy for initial liquidity
    await this.ensureAmmOperationAllowed("allow_add_liquidity");
    await this.assertAddLiquidityMeetsMinAmounts({
      poolId,
      assetAAmount,
      assetBAmount,
    });

    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: poolId,
      network: this.sparkNetwork,
    });

    const [assetATransferId, assetBTransferId] = await this.transferAssets<2>([
      {
        receiverSparkAddress: lpSparkAddress,
        assetAddress: assetAAddress,
        amount: assetAAmount,
      },
      {
        receiverSparkAddress: lpSparkAddress,
        assetAddress: assetBAddress,
        amount: assetBAmount,
      },
    ]);

    // Add liquidity
    const nonce = generateNonce();
    const intentMessage = generateAddLiquidityIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: poolId,
      assetASparkTransferId: assetATransferId,
      assetBSparkTransferId: assetBTransferId,
      assetAAmount: assetAAmount.toString(),
      assetBAmount: assetBAmount.toString(),
      assetAMinAmountIn: assetAMinAmountIn.toString(),
      assetBMinAmountIn: assetBMinAmountIn.toString(),
      nonce,
    });

    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: AddLiquidityRequest = {
      userPublicKey: this.publicKey,
      poolId: poolId,
      assetASparkTransferId: assetATransferId,
      assetBSparkTransferId: assetBTransferId,
      assetAAmountToAdd: assetAAmount.toString(),
      assetBAmountToAdd: assetBAmount.toString(),
      assetAMinAmountIn: assetAMinAmountIn.toString(),
      assetBMinAmountIn: assetBMinAmountIn.toString(),
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.addLiquidity(request);

    // Check if the initial liquidity addition was accepted
    if (!response.accepted) {
      const errorMessage =
        response.error || "Initial liquidity addition rejected by the AMM";
      throw new Error(errorMessage);
    }
  }

  // Lightning Payment with Token

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
  async getPayLightningWithTokenQuote(
    invoice: string,
    tokenAddress: string,
    options?: {
      maxSlippageBps?: number;
      integratorFeeRateBps?: number;
      tokenAmount?: string;
    }
  ): Promise<PayLightningWithTokenQuote> {
    await this.ensureInitialized();

    // Decode the invoice to get the amount
    const invoiceAmountSats = await this.decodeInvoiceAmount(invoice);

    // Zero-amount invoice: forward-direction quoting using caller-specified tokenAmount
    if (!invoiceAmountSats || invoiceAmountSats <= 0) {
      const tokenAmount = options?.tokenAmount;
      if (!tokenAmount || BigInt(tokenAmount) <= 0n) {
        throw new FlashnetError(
          "Zero-amount invoice requires tokenAmount in options.",
          {
            response: {
              errorCode: "FSAG-1002",
              errorCategory: "Validation",
              message: "Zero-amount invoice requires tokenAmount in options.",
              requestId: "",
              timestamp: new Date().toISOString(),
              service: "sdk",
              severity: "Error",
              remediation:
                "Provide tokenAmount when using a zero-amount invoice.",
            },
          }
        );
      }
      return this.getZeroAmountInvoiceQuote(
        invoice,
        tokenAddress,
        tokenAmount,
        options
      );
    }

    // Get Lightning fee estimate
    const lightningFeeEstimate = await this.getLightningFeeEstimate(invoice);

    // Total BTC needed = invoice amount + lightning fee (unmasked).
    // Bitmasking for V2 pools is handled inside findBestPoolForTokenToBtc.
    const baseBtcNeeded =
      BigInt(invoiceAmountSats) + BigInt(lightningFeeEstimate);

    // Check Flashnet minimum amounts early to provide clear error messages
    const minAmounts = await this.getEnabledMinAmountsMap();

    // Check BTC minimum (output from swap)
    const btcMinAmount = minAmounts.get(BTC_ASSET_PUBKEY.toLowerCase());
    if (btcMinAmount && baseBtcNeeded < btcMinAmount) {
      const msg = `Invoice amount too small. Minimum BTC output is ${btcMinAmount} sats, but invoice + lightning fee totals only ${baseBtcNeeded} sats.`;
      throw new FlashnetError(msg, {
        response: {
          errorCode: "FSAG-1003",
          errorCategory: "Validation",
          message: msg,
          requestId: "",
          timestamp: new Date().toISOString(),
          service: "sdk",
          severity: "Error",
          remediation: `Use an invoice of at least ${btcMinAmount} sats.`,
        },
      });
    }

    // Find the best pool to swap token -> BTC.
    // Bitmasking is applied per-pool inside this function (V2 pools get masked, V3 pools don't).
    const poolQuote = await this.findBestPoolForTokenToBtc(
      tokenAddress,
      baseBtcNeeded.toString(),
      options?.integratorFeeRateBps
    );

    // Check token minimum (input to swap)
    const tokenHex = this.toHexTokenIdentifier(tokenAddress).toLowerCase();
    const tokenMinAmount = minAmounts.get(tokenHex);
    if (
      tokenMinAmount &&
      safeBigInt(poolQuote.tokenAmountRequired) < tokenMinAmount
    ) {
      const msg = `Token amount too small. Minimum input is ${tokenMinAmount} units, but calculated amount is only ${poolQuote.tokenAmountRequired} units.`;
      throw new FlashnetError(msg, {
        response: {
          errorCode: "FSAG-1003",
          errorCategory: "Validation",
          message: msg,
          requestId: "",
          timestamp: new Date().toISOString(),
          service: "sdk",
          severity: "Error",
          remediation: "Use a larger invoice amount.",
        },
      });
    }

    // BTC variable fee adjustment: difference between what the pool targets and unmasked base.
    // For V3 pools this is 0 (no masking). For V2 it's the rounding overhead.
    const btcVariableFeeAdjustment = Number(
      safeBigInt(poolQuote.btcAmountUsed) - baseBtcNeeded
    );

    return {
      poolId: poolQuote.poolId,
      tokenAddress: this.toHexTokenIdentifier(tokenAddress),
      tokenAmountRequired: poolQuote.tokenAmountRequired,
      btcAmountRequired: poolQuote.btcAmountUsed,
      invoiceAmountSats: invoiceAmountSats,
      estimatedAmmFee: poolQuote.estimatedAmmFee,
      estimatedLightningFee: lightningFeeEstimate,
      btcVariableFeeAdjustment,
      executionPrice: poolQuote.executionPrice,
      priceImpactPct: poolQuote.priceImpactPct,
      tokenIsAssetA: poolQuote.tokenIsAssetA,
      poolReserves: poolQuote.poolReserves,
      warningMessage: poolQuote.warningMessage,
      curveType: poolQuote.curveType,
      isZeroAmountInvoice: false,
    };
  }

  /**
   * Generate a quote for a zero-amount invoice.
   * Forward-direction: simulate swapping tokenAmount and pick the pool with the best BTC output.
   * @private
   */
  private async getZeroAmountInvoiceQuote(
    invoice: string,
    tokenAddress: string,
    tokenAmount: string,
    options?: {
      maxSlippageBps?: number;
      integratorFeeRateBps?: number;
    }
  ): Promise<PayLightningWithTokenQuote> {
    const tokenHex = this.toHexTokenIdentifier(tokenAddress);
    const btcHex = BTC_ASSET_PUBKEY;

    // Discover all token/BTC pools
    const [poolsWithTokenAsA, poolsWithTokenAsB] = await Promise.all([
      this.listPools({ assetAAddress: tokenHex, assetBAddress: btcHex }),
      this.listPools({ assetAAddress: btcHex, assetBAddress: tokenHex }),
    ]);

    const poolMap = new Map<
      string,
      {
        pool: (typeof poolsWithTokenAsA.pools)[0];
        tokenIsAssetA: boolean;
      }
    >();
    for (const p of [...poolsWithTokenAsA.pools, ...poolsWithTokenAsB.pools]) {
      if (!poolMap.has(p.lpPublicKey)) {
        const tokenIsAssetA =
          p.assetAAddress?.toLowerCase() === tokenHex.toLowerCase();
        poolMap.set(p.lpPublicKey, { pool: p, tokenIsAssetA });
      }
    }

    const allPools = Array.from(poolMap.values());
    if (allPools.length === 0) {
      throw new FlashnetError(
        `No liquidity pool found for token ${tokenAddress} paired with BTC`,
        {
          response: {
            errorCode: "FSAG-4001",
            errorCategory: "Business",
            message: `No liquidity pool found for token ${tokenAddress} paired with BTC`,
            requestId: "",
            timestamp: new Date().toISOString(),
            service: "sdk",
            severity: "Error",
          },
        }
      );
    }

    // Simulate each pool with tokenAmount as input, pick highest BTC output
    let bestResult: {
      poolId: string;
      tokenIsAssetA: boolean;
      simulation: SimulateSwapResponse;
      curveType: string;
      poolReserves: { assetAReserve: string; assetBReserve: string };
    } | null = null;
    let bestBtcOut = 0n;

    for (const { pool, tokenIsAssetA } of allPools) {
      try {
        const poolDetails = await this.getPool(pool.lpPublicKey);
        const assetInAddress = tokenIsAssetA
          ? poolDetails.assetAAddress
          : poolDetails.assetBAddress;
        const assetOutAddress = tokenIsAssetA
          ? poolDetails.assetBAddress
          : poolDetails.assetAAddress;

        const simulation = await this.simulateSwap({
          poolId: pool.lpPublicKey,
          assetInAddress,
          assetOutAddress,
          amountIn: tokenAmount,
          integratorBps: options?.integratorFeeRateBps,
        });

        const btcOut = safeBigInt(simulation.amountOut);
        if (btcOut > bestBtcOut) {
          bestBtcOut = btcOut;
          bestResult = {
            poolId: pool.lpPublicKey,
            tokenIsAssetA,
            simulation,
            curveType: poolDetails.curveType,
            poolReserves: {
              assetAReserve: poolDetails.assetAReserve,
              assetBReserve: poolDetails.assetBReserve,
            },
          };
        }
      } catch {
        // Skip pools that fail simulation
      }
    }

    if (!bestResult || bestBtcOut <= 0n) {
      throw new FlashnetError(
        "No pool can produce BTC output for the given token amount",
        {
          response: {
            errorCode: "FSAG-4201",
            errorCategory: "Business",
            message:
              "No pool can produce BTC output for the given token amount",
            requestId: "",
            timestamp: new Date().toISOString(),
            service: "sdk",
            severity: "Error",
            remediation: "Try a larger token amount.",
          },
        }
      );
    }

    // Estimate lightning fee from the BTC output
    let lightningFeeEstimate: number;
    try {
      lightningFeeEstimate = await this.getLightningFeeEstimate(invoice);
    } catch {
      lightningFeeEstimate = Math.max(
        5,
        Math.ceil(Number(bestBtcOut) * 0.0017)
      );
    }

    // Check minimum amounts
    const minAmounts = await this.getEnabledMinAmountsMap();
    const btcMinAmount = minAmounts.get(BTC_ASSET_PUBKEY.toLowerCase());
    if (btcMinAmount && bestBtcOut < btcMinAmount) {
      const msg = `BTC output too small. Minimum is ${btcMinAmount} sats, but swap would produce only ${bestBtcOut} sats.`;
      throw new FlashnetError(msg, {
        response: {
          errorCode: "FSAG-1003",
          errorCategory: "Validation",
          message: msg,
          requestId: "",
          timestamp: new Date().toISOString(),
          service: "sdk",
          severity: "Error",
          remediation: "Use a larger token amount.",
        },
      });
    }

    return {
      poolId: bestResult.poolId,
      tokenAddress: tokenHex,
      tokenAmountRequired: tokenAmount,
      btcAmountRequired: bestBtcOut.toString(),
      invoiceAmountSats: 0,
      estimatedAmmFee: bestResult.simulation.feePaidAssetIn || "0",
      estimatedLightningFee: lightningFeeEstimate,
      btcVariableFeeAdjustment: 0,
      executionPrice: bestResult.simulation.executionPrice || "0",
      priceImpactPct: bestResult.simulation.priceImpactPct || "0",
      tokenIsAssetA: bestResult.tokenIsAssetA,
      poolReserves: bestResult.poolReserves,
      warningMessage: bestResult.simulation.warningMessage,
      curveType: bestResult.curveType,
      isZeroAmountInvoice: true,
    };
  }

  /**
   * Pay a Lightning invoice using a token.
   * This swaps the token to BTC on Flashnet and uses the BTC to pay the invoice.
   *
   * @param options - Payment options including invoice and token address
   * @returns Payment result with transaction details
   */
  async payLightningWithToken(
    options: PayLightningWithTokenOptions
  ): Promise<PayLightningWithTokenResult> {
    await this.ensureInitialized();

    const {
      invoice,
      tokenAddress,
      tokenAmount,
      maxSlippageBps = 500, // 5% default
      maxLightningFeeSats,
      preferSpark = true,
      integratorFeeRateBps,
      integratorPublicKey,
      transferTimeoutMs = 30000, // 30s default
      rollbackOnFailure = false,
      useExistingBtcBalance = false,
      useAvailableBalance = false,
    } = options;

    try {
      // Step 1: Get a quote for the payment
      const quote = await this.getPayLightningWithTokenQuote(
        invoice,
        tokenAddress,
        {
          maxSlippageBps,
          integratorFeeRateBps,
          tokenAmount,
        }
      );

      // Step 2: Check token balance (always required)
      await this.checkBalance({
        balancesToCheck: [
          {
            assetAddress: tokenAddress,
            amount: quote.tokenAmountRequired,
          },
        ],
        errorPrefix: "Insufficient token balance for Lightning payment: ",
        useAvailableBalance,
      });

      // Step 3: Get pool details
      const pool = await this.getPool(quote.poolId);

      // Step 4: Determine swap direction and execute
      const assetInAddress = quote.tokenIsAssetA
        ? pool.assetAAddress
        : pool.assetBAddress;
      const assetOutAddress = quote.tokenIsAssetA
        ? pool.assetBAddress
        : pool.assetAAddress;

      const effectiveMaxLightningFee =
        maxLightningFeeSats ?? quote.estimatedLightningFee;

      // Floor minAmountOut at invoiceAmount + fee so the swap never returns
      // less BTC than the lightning payment requires.
      const slippageMin = this.calculateMinAmountOut(
        quote.btcAmountRequired,
        maxSlippageBps
      );
      const baseBtcNeeded = !quote.isZeroAmountInvoice
        ? BigInt(quote.invoiceAmountSats) + BigInt(effectiveMaxLightningFee)
        : 0n;
      const minBtcOut =
        BigInt(slippageMin) >= baseBtcNeeded
          ? slippageMin
          : baseBtcNeeded.toString();

      // Execute the swap
      const swapResponse = await this.executeSwap({
        poolId: quote.poolId,
        assetInAddress,
        assetOutAddress,
        amountIn: quote.tokenAmountRequired,
        maxSlippageBps,
        minAmountOut: minBtcOut,
        integratorFeeRateBps,
        integratorPublicKey,
        useAvailableBalance,
      });

      if (!swapResponse.accepted || !swapResponse.outboundTransferId) {
        return {
          success: false,
          poolId: quote.poolId,
          tokenAmountSpent: quote.tokenAmountRequired,
          btcAmountReceived: "0",
          swapTransferId: swapResponse.outboundTransferId || "",
          ammFeePaid: quote.estimatedAmmFee,
          sparkTokenTransferId: swapResponse.inboundSparkTransferId,
          error: swapResponse.error || "Swap was not accepted",
        };
      }

      // Step 5: Claim the swap output and refresh wallet state.
      // Suppress leaf optimization for the entire claim-to-pay window so
      // the SSP cannot swap away the leaves we need for lightning payment.
      const restoreOptimization = this.suppressOptimization();
      try {
        let canPayImmediately = false;
        if (!quote.isZeroAmountInvoice && useExistingBtcBalance) {
          const invoiceAmountSats = await this.decodeInvoiceAmount(invoice);
          const btcNeededForPayment =
            invoiceAmountSats + effectiveMaxLightningFee;
          const balance = await this.getBalance();
          canPayImmediately =
            balance.balance >= safeBigInt(btcNeededForPayment);
        }

        if (!canPayImmediately) {
          const claimed = await this.instaClaimTransfer(
            swapResponse.outboundTransferId,
            transferTimeoutMs
          );

          if (!claimed) {
            return {
              success: false,
              poolId: quote.poolId,
              tokenAmountSpent: quote.tokenAmountRequired,
              btcAmountReceived: swapResponse.amountOut || "0",
              swapTransferId: swapResponse.outboundTransferId,
              ammFeePaid: quote.estimatedAmmFee,
              sparkTokenTransferId: swapResponse.inboundSparkTransferId,
              error: "Transfer did not complete within timeout",
            };
          }
        }

        // Step 6: Calculate payment amount
        const requestedMaxLightningFee = effectiveMaxLightningFee;
        const btcReceived = swapResponse.amountOut || quote.btcAmountRequired;

        // Cap the lightning fee budget to what the wallet can actually cover.
        // The swap output may be slightly less than quoted due to rounding or
        // price movement between quote and execution. The Spark SDK requires
        // invoiceAmount + maxFeeSats <= balance, so we adjust maxFeeSats down
        // when the actual BTC received is less than expected.
        let cappedMaxLightningFee = requestedMaxLightningFee;
        if (!quote.isZeroAmountInvoice) {
          const actualBtc = safeBigInt(btcReceived);
          const invoiceAmount = safeBigInt(quote.invoiceAmountSats);
          const available = actualBtc - invoiceAmount;
          if (available > 0n && available < safeBigInt(cappedMaxLightningFee)) {
            cappedMaxLightningFee = Number(available);
          }
        }

        // Step 7: Pay the Lightning invoice
        try {
          let lightningPayment: { id: string };
          let invoiceAmountPaid: number | undefined;

          if (quote.isZeroAmountInvoice) {
            const actualBtc = safeBigInt(btcReceived);
            const lnFee = safeBigInt(cappedMaxLightningFee);
            const amountToPay = actualBtc - lnFee;

            if (amountToPay <= 0n) {
              return {
                success: false,
                poolId: quote.poolId,
                tokenAmountSpent: quote.tokenAmountRequired,
                btcAmountReceived: btcReceived,
                swapTransferId: swapResponse.outboundTransferId,
                ammFeePaid: quote.estimatedAmmFee,
                sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                error: `BTC received (${btcReceived} sats) is not enough to cover lightning fee (${cappedMaxLightningFee} sats).`,
              };
            }

            invoiceAmountPaid = Number(amountToPay);
            lightningPayment = await (this._wallet as any).payLightningInvoice({
              invoice,
              amountSats: invoiceAmountPaid,
              maxFeeSats: cappedMaxLightningFee,
              preferSpark,
            });
          } else {
            lightningPayment = await (this._wallet as any).payLightningInvoice({
              invoice,
              maxFeeSats: cappedMaxLightningFee,
              preferSpark,
            });
          }

          // Extract the Spark transfer ID from the lightning payment result.
          // payLightningInvoice returns LightningSendRequest | WalletTransfer:
          //   - LightningSendRequest has .transfer?.sparkId (the Sparkscan-visible transfer ID)
          //   - WalletTransfer (Spark-to-Spark) has .id directly as the transfer ID
          // Note: lightningPayment.id (the SSP request ID) is already returned as lightningPaymentId
          const sparkLightningTransferId: string | undefined = (
            lightningPayment as any
          ).transfer?.sparkId;

          return {
            success: true,
            poolId: quote.poolId,
            tokenAmountSpent: quote.tokenAmountRequired,
            btcAmountReceived: btcReceived,
            swapTransferId: swapResponse.outboundTransferId,
            lightningPaymentId: lightningPayment.id,
            ammFeePaid: quote.estimatedAmmFee,
            lightningFeePaid: cappedMaxLightningFee,
            invoiceAmountPaid,
            sparkTokenTransferId: swapResponse.inboundSparkTransferId,
            sparkLightningTransferId,
          };
        } catch (lightningError) {
          // Lightning payment failed after swap succeeded
          const lightningErrorMessage =
            lightningError instanceof Error
              ? lightningError.message
              : String(lightningError);

          // Attempt rollback if requested
          if (rollbackOnFailure) {
            try {
              const rollbackResult = await this.rollbackSwap(
                quote.poolId,
                btcReceived,
                tokenAddress,
                maxSlippageBps
              );

              if (rollbackResult.success) {
                return {
                  success: false,
                  poolId: quote.poolId,
                  tokenAmountSpent: "0", // Rolled back
                  btcAmountReceived: "0",
                  swapTransferId: swapResponse.outboundTransferId,
                  ammFeePaid: quote.estimatedAmmFee,
                  sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                  error: `Lightning payment failed: ${lightningErrorMessage}. Funds rolled back to ${rollbackResult.tokenAmount} tokens.`,
                };
              }
            } catch (rollbackError) {
              const rollbackErrorMessage =
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError);
              return {
                success: false,
                poolId: quote.poolId,
                tokenAmountSpent: quote.tokenAmountRequired,
                btcAmountReceived: btcReceived,
                swapTransferId: swapResponse.outboundTransferId,
                ammFeePaid: quote.estimatedAmmFee,
                sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                error: `Lightning payment failed: ${lightningErrorMessage}. Rollback also failed: ${rollbackErrorMessage}. BTC remains in wallet.`,
              };
            }
          }

          return {
            success: false,
            poolId: quote.poolId,
            tokenAmountSpent: quote.tokenAmountRequired,
            btcAmountReceived: btcReceived,
            swapTransferId: swapResponse.outboundTransferId,
            ammFeePaid: quote.estimatedAmmFee,
            sparkTokenTransferId: swapResponse.inboundSparkTransferId,
            error: `Lightning payment failed: ${lightningErrorMessage}. BTC (${btcReceived} sats) remains in wallet.`,
          };
        }
      } finally {
        restoreOptimization();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        poolId: "",
        tokenAmountSpent: "0",
        btcAmountReceived: "0",
        swapTransferId: "",
        ammFeePaid: "0",
        error: errorMessage,
      };
    }
  }

  /**
   * Attempt to rollback a swap by swapping BTC back to the original token
   * @private
   */
  private async rollbackSwap(
    poolId: string,
    btcAmount: string,
    tokenAddress: string,
    maxSlippageBps: number
  ): Promise<{ success: boolean; tokenAmount?: string }> {
    const pool = await this.getPool(poolId);
    const tokenHex = this.toHexTokenIdentifier(tokenAddress);

    // Determine swap direction (BTC -> Token)
    const tokenIsAssetA = pool.assetAAddress === tokenHex;
    const assetInAddress = tokenIsAssetA
      ? pool.assetBAddress
      : pool.assetAAddress; // BTC
    const assetOutAddress = tokenIsAssetA
      ? pool.assetAAddress
      : pool.assetBAddress; // Token

    // Calculate expected token output and min amount with slippage
    // For rollback, we accept more slippage since we're recovering from failure
    const minAmountOut = "0"; // Accept any amount to ensure rollback succeeds

    // Execute reverse swap
    const swapResponse = await this.executeSwap({
      poolId,
      assetInAddress,
      assetOutAddress,
      amountIn: btcAmount,
      maxSlippageBps: maxSlippageBps * 2, // Double slippage for rollback
      minAmountOut,
    });

    if (!swapResponse.accepted) {
      throw new Error(swapResponse.error || "Rollback swap not accepted");
    }

    // Wait for the rollback transfer
    if (swapResponse.outboundTransferId) {
      await this.waitForTransferCompletion(
        swapResponse.outboundTransferId,
        30000
      );
    }

    return {
      success: true,
      tokenAmount: swapResponse.amountOut,
    };
  }

  /**
   * Find the best pool for swapping a token to BTC
   * @private
   */
  private async findBestPoolForTokenToBtc(
    tokenAddress: string,
    baseBtcNeeded: string,
    integratorFeeRateBps?: number
  ): Promise<{
    poolId: string;
    tokenAmountRequired: string;
    estimatedAmmFee: string;
    executionPrice: string;
    priceImpactPct: string;
    tokenIsAssetA: boolean;
    poolReserves: {
      assetAReserve: string;
      assetBReserve: string;
    };
    warningMessage?: string;
    btcAmountUsed: string;
    curveType: string;
  }> {
    const tokenHex = this.toHexTokenIdentifier(tokenAddress);
    const btcHex = BTC_ASSET_PUBKEY;

    // Find all pools that have this token paired with BTC
    // Note: The API may return the same pool for both filter combinations,
    // so we need to deduplicate and determine tokenIsAssetA from actual pool data
    const poolsWithTokenAsA = await this.listPools({
      assetAAddress: tokenHex,
      assetBAddress: btcHex,
    });

    const poolsWithTokenAsB = await this.listPools({
      assetAAddress: btcHex,
      assetBAddress: tokenHex,
    });

    // Deduplicate pools by poolId and determine tokenIsAssetA from actual pool addresses
    const poolMap = new Map<
      string,
      { pool: (typeof poolsWithTokenAsA.pools)[0]; tokenIsAssetA: boolean }
    >();

    for (const p of [...poolsWithTokenAsA.pools, ...poolsWithTokenAsB.pools]) {
      if (!poolMap.has(p.lpPublicKey)) {
        // Determine tokenIsAssetA from actual pool asset addresses, not from which query returned it
        const tokenIsAssetA =
          p.assetAAddress?.toLowerCase() === tokenHex.toLowerCase();
        poolMap.set(p.lpPublicKey, { pool: p, tokenIsAssetA });
      }
    }

    const allPools = Array.from(poolMap.values()).map(
      ({ pool, tokenIsAssetA }) => ({
        ...pool,
        tokenIsAssetA,
      })
    );

    if (allPools.length === 0) {
      throw new FlashnetError(
        `No liquidity pool found for token ${tokenAddress} paired with BTC`,
        {
          response: {
            errorCode: "FSAG-4001",
            errorCategory: "Business",
            message: `No liquidity pool found for token ${tokenAddress} paired with BTC`,
            requestId: "",
            timestamp: new Date().toISOString(),
            service: "sdk",
            severity: "Error",
          },
        }
      );
    }

    // Pre-check: Get minimum amounts to provide clear error if invoice is too small
    const minAmounts = await this.getMinAmountsMap();
    const btcMinAmount = minAmounts.get(BTC_ASSET_PUBKEY.toLowerCase());

    // Check if the BTC amount needed is below the minimum
    if (btcMinAmount && BigInt(baseBtcNeeded) < btcMinAmount) {
      const msg = `Invoice amount too small. Minimum ${btcMinAmount} sats required, but invoice only requires ${baseBtcNeeded} sats.`;
      throw new FlashnetError(msg, {
        response: {
          errorCode: "FSAG-1003",
          errorCategory: "Validation",
          message: msg,
          requestId: "",
          timestamp: new Date().toISOString(),
          service: "sdk",
          severity: "Error",
          remediation: `Use an invoice with at least ${btcMinAmount} sats.`,
        },
      });
    }

    // Compute V2 masked BTC amount (round up to next multiple of 64 for bit masking)
    const baseBtc = BigInt(baseBtcNeeded);
    const BTC_VARIABLE_FEE_BITS = 6n;
    const BTC_VARIABLE_FEE_MASK = 1n << BTC_VARIABLE_FEE_BITS; // 64
    const maskedBtc =
      ((baseBtc + BTC_VARIABLE_FEE_MASK - 1n) / BTC_VARIABLE_FEE_MASK) *
      BTC_VARIABLE_FEE_MASK;

    // Find the best pool (lowest token cost for the required BTC)
    let bestPool: (typeof allPools)[0] | null = null;
    let bestTokenAmount = BigInt(Number.MAX_SAFE_INTEGER);
    let bestBtcTarget = 0n;
    let bestCurveType = "";
    let bestSimulation: {
      amountIn: string;
      fee: string;
      executionPrice: string;
      priceImpactPct: string;
      warningMessage?: string;
    } | null = null;

    // Track errors for each pool to provide better diagnostics
    const poolErrors: Array<{
      poolId: string;
      error: string;
      btcReserve?: string;
    }> = [];

    for (const pool of allPools) {
      try {
        // Get pool details for reserves and curve type
        const poolDetails = await this.getPool(pool.lpPublicKey);
        const isV3 = poolDetails.curveType === "V3_CONCENTRATED";

        // V3 pools use exact BTC amount, V2 pools use masked amount
        const btcTarget = isV3 ? baseBtc : maskedBtc;

        const assetInAddress = pool.tokenIsAssetA
          ? poolDetails.assetAAddress
          : poolDetails.assetBAddress;
        const assetOutAddress = pool.tokenIsAssetA
          ? poolDetails.assetBAddress
          : poolDetails.assetAAddress;

        let tokenAmount: bigint;
        let fee: string;
        let executionPrice: string;
        let priceImpactPct: string;
        let warningMessage: string | undefined;

        if (isV3) {
          // V3: binary search with simulateSwap
          const v3Result = await this.findV3TokenAmountForBtcOutput({
            poolId: pool.lpPublicKey,
            assetInAddress,
            assetOutAddress,
            desiredBtcOut: btcTarget,
            currentPriceAInB: poolDetails.currentPriceAInB,
            tokenIsAssetA: pool.tokenIsAssetA,
            integratorBps: integratorFeeRateBps,
          });

          tokenAmount = safeBigInt(v3Result.amountIn);
          fee = v3Result.totalFee;
          executionPrice = v3Result.simulation.executionPrice || "0";
          priceImpactPct = v3Result.simulation.priceImpactPct || "0";
          warningMessage = v3Result.simulation.warningMessage;
        } else {
          // V2: constant product math + simulation verification
          const calculation = this.calculateTokenAmountForBtcOutput(
            btcTarget.toString(),
            poolDetails.assetAReserve,
            poolDetails.assetBReserve,
            poolDetails.lpFeeBps,
            poolDetails.hostFeeBps,
            pool.tokenIsAssetA,
            integratorFeeRateBps
          );

          tokenAmount = safeBigInt(calculation.amountIn);

          // Verify with simulation
          const simulation = await this.simulateSwap({
            poolId: pool.lpPublicKey,
            assetInAddress,
            assetOutAddress,
            amountIn: calculation.amountIn,
            integratorBps: integratorFeeRateBps,
          });

          if (safeBigInt(simulation.amountOut) < btcTarget) {
            const btcReserve = pool.tokenIsAssetA
              ? poolDetails.assetBReserve
              : poolDetails.assetAReserve;
            poolErrors.push({
              poolId: pool.lpPublicKey,
              error: `Simulation output (${simulation.amountOut} sats) < required (${btcTarget} sats)`,
              btcReserve,
            });
            continue;
          }

          fee = calculation.totalFee;
          executionPrice = simulation.executionPrice || "0";
          priceImpactPct = simulation.priceImpactPct || "0";
          warningMessage = simulation.warningMessage;
        }

        // Check if this pool offers a better rate
        if (tokenAmount < bestTokenAmount) {
          bestPool = pool;
          bestTokenAmount = tokenAmount;
          bestBtcTarget = btcTarget;
          bestCurveType = poolDetails.curveType;
          bestSimulation = {
            amountIn: tokenAmount.toString(),
            fee,
            executionPrice,
            priceImpactPct,
            warningMessage,
          };
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        poolErrors.push({
          poolId: pool.lpPublicKey,
          error: errorMessage,
        });
      }
    }

    if (!bestPool || !bestSimulation) {
      let errorMessage = `No pool has sufficient liquidity for ${baseBtcNeeded} sats`;
      if (poolErrors.length > 0) {
        const details = poolErrors
          .map((pe) => {
            const reserveInfo = pe.btcReserve
              ? ` (BTC reserve: ${pe.btcReserve})`
              : "";
            return `  - Pool ${pe.poolId.slice(0, 12)}...${reserveInfo}: ${
              pe.error
            }`;
          })
          .join("\n");
        errorMessage += `\n\nPool evaluation details:\n${details}`;
      }
      throw new FlashnetError(errorMessage, {
        response: {
          errorCode: "FSAG-4201",
          errorCategory: "Business",
          message: errorMessage,
          requestId: "",
          timestamp: new Date().toISOString(),
          service: "sdk",
          severity: "Error",
          remediation: "Try a smaller amount or wait for more liquidity.",
        },
      });
    }

    const poolDetails = await this.getPool(bestPool.lpPublicKey);

    return {
      poolId: bestPool.lpPublicKey,
      tokenAmountRequired: bestSimulation.amountIn,
      estimatedAmmFee: bestSimulation.fee,
      executionPrice: bestSimulation.executionPrice,
      priceImpactPct: bestSimulation.priceImpactPct,
      tokenIsAssetA: bestPool.tokenIsAssetA,
      poolReserves: {
        assetAReserve: poolDetails.assetAReserve,
        assetBReserve: poolDetails.assetBReserve,
      },
      warningMessage: bestSimulation.warningMessage,
      btcAmountUsed: bestBtcTarget.toString(),
      curveType: bestCurveType,
    };
  }

  /**
   * Calculate the token amount needed to get a specific BTC output.
   * Implements the AMM fee-inclusive model.
   * @private
   */
  private calculateTokenAmountForBtcOutput(
    btcAmountOut: string,
    reserveA: string,
    reserveB: string,
    lpFeeBps: number,
    hostFeeBps: number,
    tokenIsAssetA: boolean,
    integratorFeeBps?: number
  ): { amountIn: string; totalFee: string } {
    const amountOut = safeBigInt(btcAmountOut);
    const resA = safeBigInt(reserveA);
    const resB = safeBigInt(reserveB);
    const totalFeeBps = lpFeeBps + hostFeeBps + (integratorFeeBps || 0);
    const feeRate = Number(totalFeeBps) / 10000; // Convert bps to decimal

    // Token is the input asset
    // BTC is the output asset

    if (tokenIsAssetA) {
      // Token is asset A, BTC is asset B
      // A → B swap: we want BTC out (asset B)
      // reserve_in = reserveA (token), reserve_out = reserveB (BTC)

      // Constant product formula for amount_in given amount_out:
      // amount_in_effective = (reserve_in * amount_out) / (reserve_out - amount_out)
      const reserveIn = resA;
      const reserveOut = resB;

      if (amountOut >= reserveOut) {
        throw new Error(
          "Insufficient liquidity: requested BTC amount exceeds reserve"
        );
      }

      // Calculate effective amount in (before fees)
      const amountInEffective =
        (reserveIn * amountOut) / (reserveOut - amountOut) + 1n; // +1 for rounding up

      // A→B swap: LP fee deducted from input A, integrator fee from output B
      // amount_in = amount_in_effective * (1 + lp_fee_rate)
      // Then integrator fee is deducted from output, so we need slightly more input
      const lpFeeRate = Number(lpFeeBps) / 10000;
      const integratorFeeRate = Number(integratorFeeBps || 0) / 10000;

      // Account for LP fee on input
      const amountInWithLpFee = BigInt(
        Math.ceil(Number(amountInEffective) * (1 + lpFeeRate))
      );

      // Account for integrator fee on output (need more input to get same output after fee)
      const amountIn =
        integratorFeeRate > 0
          ? BigInt(
              Math.ceil(Number(amountInWithLpFee) * (1 + integratorFeeRate))
            )
          : amountInWithLpFee;

      const totalFee = amountIn - amountInEffective;

      return {
        amountIn: amountIn.toString(),
        totalFee: totalFee.toString(),
      };
    } else {
      // Token is asset B, BTC is asset A
      // B → A swap: we want BTC out (asset A)
      // reserve_in = reserveB (token), reserve_out = reserveA (BTC)

      const reserveIn = resB;
      const reserveOut = resA;

      if (amountOut >= reserveOut) {
        throw new Error(
          "Insufficient liquidity: requested BTC amount exceeds reserve"
        );
      }

      // Calculate effective amount in (before fees)
      const amountInEffective =
        (reserveIn * amountOut) / (reserveOut - amountOut) + 1n; // +1 for rounding up

      // B→A swap: ALL fees (LP + integrator) deducted from input B
      // amount_in = amount_in_effective * (1 + total_fee_rate)
      const amountIn = BigInt(
        Math.ceil(Number(amountInEffective) * (1 + feeRate))
      );

      // Fee calculation: fee = amount_in * fee_rate / (1 + fee_rate)
      const totalFee = BigInt(
        Math.ceil((Number(amountIn) * feeRate) / (1 + feeRate))
      );

      return {
        amountIn: amountIn.toString(),
        totalFee: totalFee.toString(),
      };
    }
  }

  /**
   * Find the token amount needed to get a specific BTC output from a V3 concentrated liquidity pool.
   * Uses binary search with simulateSwap since V3 tick-based math can't be inverted locally.
   * @private
   */
  private async findV3TokenAmountForBtcOutput(params: {
    poolId: string;
    assetInAddress: string;
    assetOutAddress: string;
    desiredBtcOut: bigint;
    currentPriceAInB?: string;
    tokenIsAssetA: boolean;
    integratorBps?: number;
  }): Promise<{
    amountIn: string;
    totalFee: string;
    simulation: SimulateSwapResponse;
  }> {
    const {
      poolId,
      assetInAddress,
      assetOutAddress,
      desiredBtcOut,
      currentPriceAInB,
      tokenIsAssetA,
      integratorBps,
    } = params;

    // Step 1: Compute initial estimate from pool price
    let estimate: bigint;
    if (currentPriceAInB && currentPriceAInB !== "0") {
      const price = Number(currentPriceAInB);
      if (tokenIsAssetA) {
        // priceAInB = how much B (BTC) per 1 A (token), so tokenNeeded = btcOut / price
        estimate = BigInt(Math.ceil(Number(desiredBtcOut) / price));
      } else {
        // priceAInB = how much B (token) per 1 A (BTC), so tokenNeeded = btcOut * price
        estimate = BigInt(Math.ceil(Number(desiredBtcOut) * price));
      }
      // Ensure non-zero
      if (estimate <= 0n) {
        estimate = desiredBtcOut * 2n;
      }
    } else {
      estimate = desiredBtcOut * 2n;
    }

    // Step 2: Find upper bound by simulating with estimate + 10% buffer
    let upperBound = (estimate * 110n) / 100n;
    if (upperBound <= 0n) {
      upperBound = 1n;
    }
    let upperSim: SimulateSwapResponse | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const sim = await this.simulateSwap({
        poolId,
        assetInAddress,
        assetOutAddress,
        amountIn: upperBound.toString(),
        integratorBps,
      });

      if (safeBigInt(sim.amountOut) >= desiredBtcOut) {
        upperSim = sim;
        break;
      }
      // Double the upper bound
      upperBound = upperBound * 2n;
    }

    if (!upperSim) {
      throw new Error(
        `V3 pool ${poolId} has insufficient liquidity for ${desiredBtcOut} sats`
      );
    }

    // Step 3: Refine estimate via linear interpolation
    const upperOut = safeBigInt(upperSim.amountOut);
    // Scale proportionally: if upperBound produced upperOut, we need roughly
    // (upperBound * desiredBtcOut / upperOut). Add +1 to avoid undershoot from truncation.
    let refined = (upperBound * desiredBtcOut) / upperOut + 1n;
    if (refined <= 0n) {
      refined = 1n;
    }

    let bestAmountIn = upperBound;
    let bestSim = upperSim;

    // Check if the refined estimate is tighter
    if (refined < upperBound) {
      const refinedSim = await this.simulateSwap({
        poolId,
        assetInAddress,
        assetOutAddress,
        amountIn: refined.toString(),
        integratorBps,
      });

      if (safeBigInt(refinedSim.amountOut) >= desiredBtcOut) {
        bestAmountIn = refined;
        bestSim = refinedSim;
      } else {
        // Refined estimate was slightly too low. Keep upperBound as best,
        // and let binary search narrow between refined (too low) and upperBound (sufficient).
        bestAmountIn = upperBound;
        bestSim = upperSim;
      }
    }

    // Step 4: Binary search to converge on minimum amountIn
    // Use a tight range: the interpolation is close, so search between 99.5% and 100% of best
    let lo =
      bestAmountIn === upperBound
        ? refined < upperBound
          ? refined
          : (bestAmountIn * 99n) / 100n
        : (bestAmountIn * 999n) / 1000n;
    if (lo <= 0n) {
      lo = 1n;
    }
    let hi = bestAmountIn;

    for (let i = 0; i < 6; i++) {
      if (hi - lo <= 1n) {
        break;
      }

      const mid = (lo + hi) / 2n;
      const midSim = await this.simulateSwap({
        poolId,
        assetInAddress,
        assetOutAddress,
        amountIn: mid.toString(),
        integratorBps,
      });

      if (safeBigInt(midSim.amountOut) >= desiredBtcOut) {
        hi = mid;
        bestAmountIn = mid;
        bestSim = midSim;
      } else {
        lo = mid;
      }
    }

    // Compute fee from the best simulation
    const totalFee = bestSim.feePaidAssetIn || "0";

    return {
      amountIn: bestAmountIn.toString(),
      totalFee,
      simulation: bestSim,
    };
  }

  /**
   * Calculate minimum amount out with slippage protection
   * @private
   */
  private calculateMinAmountOut(
    expectedAmount: string,
    slippageBps: number
  ): string {
    const amount = BigInt(expectedAmount);
    const slippageFactor = BigInt(10000 - slippageBps);
    const minAmount = (amount * slippageFactor) / 10000n;
    return minAmount.toString();
  }

  /**
   * Wait for a transfer to be claimed using wallet events.
   * This is more efficient than polling as it uses the wallet's event stream.
   * @private
   */
  private async waitForTransferCompletion(
    transferId: string,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Remove listener on timeout
        try {
          (this._wallet as any).removeListener?.("transfer:claimed", handler);
        } catch {
          // Ignore if removeListener doesn't exist
        }
        resolve(false);
      }, timeoutMs);

      const handler = (claimedTransferId: string, _balance: bigint) => {
        if (claimedTransferId === transferId) {
          clearTimeout(timeout);
          try {
            (this._wallet as any).removeListener?.("transfer:claimed", handler);
          } catch {
            // Ignore if removeListener doesn't exist
          }
          resolve(true);
        }
      };

      // Subscribe to transfer claimed events
      // The wallet's RPC stream will automatically claim incoming transfers
      try {
        (this._wallet as any).on?.("transfer:claimed", handler);
      } catch {
        // If event subscription fails, fall back to polling
        clearTimeout(timeout);
        this.pollForTransferCompletion(transferId, timeoutMs).then(resolve);
      }
    });
  }

  /**
   * Fallback polling method for transfer completion
   * @private
   */
  private async pollForTransferCompletion(
    transferId: string,
    timeoutMs: number
  ): Promise<boolean> {
    const startTime = Date.now();
    const pollIntervalMs = 500;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const transfer = await this._wallet.getTransfer(transferId);

        if (transfer) {
          if (transfer.status === "TRANSFER_STATUS_COMPLETED") {
            return true;
          }
        }
      } catch {
        // Ignore errors and continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return false;
  }

  /**
   * Suppress leaf optimization on the wallet. Sets the internal
   * optimizationInProgress flag so optimizeLeaves() returns immediately.
   * Returns a restore function that clears the flag.
   * @private
   */
  private suppressOptimization(): () => void {
    const w = this._wallet as any;
    const was = w.optimizationInProgress;
    w.optimizationInProgress = true;
    return () => {
      w.optimizationInProgress = was;
    };
  }

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
  private async instaClaimTransfer(
    transferId: string,
    timeoutMs: number
  ): Promise<boolean> {
    const w = this._wallet as any;

    const claimed = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (value: boolean) => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        try {
          w.removeListener?.("transfer:claimed", handler);
        } catch {
          // Ignore
        }
        resolve(value);
      };

      const timer = setTimeout(() => finish(false), timeoutMs);

      const handler = (claimedId: string) => {
        if (claimedId === transferId) {
          finish(true);
        }
      };

      // The wallet's background gRPC stream auto-claims transfers.
      // We just listen for the event.
      if (typeof w.on === "function") {
        w.on("transfer:claimed", handler);
      } else {
        // No event support, fall back to passive polling
        clearTimeout(timer);
        this.pollForTransferCompletion(transferId, timeoutMs).then(resolve);
      }
    });

    if (claimed) {
      const leaves = await this._wallet.getLeaves(true);
      w.leaves = leaves;
    }

    return claimed;
  }

  /**
   * Get Lightning fee estimate for an invoice
   * @private
   */
  private async getLightningFeeEstimate(invoice: string): Promise<number> {
    try {
      const feeEstimate = await (
        this._wallet as any
      ).getLightningSendFeeEstimate({
        encodedInvoice: invoice,
      });

      // The fee estimate might be returned as a number or an object
      if (typeof feeEstimate === "number") {
        return feeEstimate;
      }
      if (feeEstimate?.fee || feeEstimate?.feeEstimate) {
        return Number(feeEstimate.fee || feeEstimate.feeEstimate);
      }

      // Fallback to invoice amount-based estimate
      const invoiceAmount = await this.decodeInvoiceAmount(invoice);
      return Math.max(5, Math.ceil(invoiceAmount * 0.0017)); // 17 bps or 5 sats minimum
    } catch {
      // Fallback to invoice amount-based estimate
      const invoiceAmount = await this.decodeInvoiceAmount(invoice);
      return Math.max(5, Math.ceil(invoiceAmount * 0.0017));
    }
  }

  /**
   * Decode the amount from a Lightning invoice (in sats)
   * Uses light-bolt11-decoder (same library as Spark SDK) for reliable parsing.
   * @private
   */
  private async decodeInvoiceAmount(invoice: string): Promise<number> {
    try {
      const decoded = decodeBolt11(invoice);

      const amountSection = decoded.sections.find(
        (s: any) => s.name === "amount"
      ) as { value?: string } | undefined;

      if (!amountSection?.value) {
        return 0; // Zero-amount invoice
      }

      // The library returns amount in millisatoshis as a string
      const amountMSats = BigInt(amountSection.value);
      return Number(amountMSats / 1000n);
    } catch {
      // Fallback: if library fails, return 0 (treated as zero-amount invoice)
      return 0;
    }
  }

  /**
   * Clean up wallet connections
   */
  async cleanup(): Promise<void> {
    await this._wallet.cleanupConnections();
  }

  // Config and Policy Enforcement Helpers

  private async ensureAmmOperationAllowed(
    requiredFeature: FeatureName
  ): Promise<void> {
    await this.ensurePingOk();
    const featureMap = await this.getFeatureStatusMap();

    if (featureMap.get("master_kill_switch")) {
      throw new Error("Service is temporarily disabled by master kill switch");
    }

    if (!featureMap.get(requiredFeature)) {
      throw new Error(
        `Operation not allowed: feature '${requiredFeature}' is disabled`
      );
    }
  }

  private async ensurePingOk(): Promise<void> {
    const now = Date.now();
    if (this.pingCache && this.pingCache.expiryMs > now) {
      if (!this.pingCache.ok) {
        throw new Error(
          "Settlement service unavailable. Only read (GET) operations are allowed right now."
        );
      }
      return;
    }
    const ping = await this.typedApi.ping();
    const ok =
      !!ping &&
      typeof ping.status === "string" &&
      ping.status.toLowerCase() === "ok";
    this.pingCache = { ok, expiryMs: now + FlashnetClient.PING_TTL_MS };
    if (!ok) {
      throw new Error(
        "Settlement service unavailable. Only read (GET) operations are allowed right now."
      );
    }
  }

  private async getFeatureStatusMap(): Promise<Map<FeatureName, boolean>> {
    const now = Date.now();
    if (this.featureStatusCache && this.featureStatusCache.expiryMs > now) {
      const map = new Map<FeatureName, boolean>();
      for (const item of this.featureStatusCache.data) {
        map.set(item.feature_name as FeatureName, Boolean(item.enabled));
      }
      return map;
    }

    const data = await this.typedApi.getFeatureStatus();
    this.featureStatusCache = {
      data,
      expiryMs: now + FlashnetClient.FEATURE_STATUS_TTL_MS,
    };
    const map = new Map<FeatureName, boolean>();
    for (const item of data) {
      map.set(item.feature_name as FeatureName, Boolean(item.enabled));
    }
    return map;
  }

  private async getEnabledMinAmountsMap(): Promise<Map<string, bigint>> {
    const now = Date.now();
    if (this.minAmountsCache && this.minAmountsCache.expiryMs > now) {
      return this.minAmountsCache.map;
    }

    const config = await this.typedApi.getMinAmounts();
    const map = new Map<string, bigint>();
    for (const item of config) {
      if (item.enabled) {
        if (item.min_amount == null) {
          continue;
        }
        const key = item.asset_identifier.toLowerCase();
        const value = safeBigInt(item.min_amount);
        map.set(key, value);
      }
    }
    this.minAmountsCache = {
      map,
      expiryMs: now + FlashnetClient.MIN_AMOUNTS_TTL_MS,
    };
    return map;
  }

  private getHexAddress(addr: string): string {
    return this.toHexTokenIdentifier(addr).toLowerCase();
  }

  private async assertSwapMeetsMinAmounts(params: {
    assetInAddress: string;
    assetOutAddress: string;
    amountIn: string | bigint | number;
    minAmountOut: string | bigint | number;
  }): Promise<void> {
    const minMap = await this.getEnabledMinAmountsMap();
    if (minMap.size === 0) {
      return;
    }

    const inHex = this.getHexAddress(params.assetInAddress);
    const outHex = this.getHexAddress(params.assetOutAddress);
    const minIn = minMap.get(inHex);
    const minOut = minMap.get(outHex);

    const amountIn = BigInt(params.amountIn);
    const minAmountOut = BigInt(params.minAmountOut);

    if (minIn && minOut) {
      if (amountIn < minIn) {
        throw new Error(
          `Minimum amount not met for input asset. Required \
${minIn.toString()}, provided ${amountIn.toString()}`
        );
      }
      return;
    }

    if (minIn) {
      if (amountIn < minIn) {
        throw new Error(
          `Minimum amount not met for input asset. Required \
${minIn.toString()}, provided ${amountIn.toString()}`
        );
      }
      return;
    }

    if (minOut) {
      const relaxed = minOut / 2n; // 50% relaxation for slippage
      if (minAmountOut < relaxed) {
        throw new Error(
          `Minimum amount not met for output asset. Required at least \
${relaxed.toString()} (50% relaxed), provided minAmountOut ${minAmountOut.toString()}`
        );
      }
    }
  }

  private async assertAddLiquidityMeetsMinAmounts(params: {
    poolId: string;
    assetAAmount: string | bigint | number;
    assetBAmount: string | bigint | number;
  }): Promise<void> {
    const minMap = await this.getEnabledMinAmountsMap();
    if (minMap.size === 0) {
      return;
    }

    const pool = await this.getPool(params.poolId);
    const aHex = pool.assetAAddress.toLowerCase();
    const bHex = pool.assetBAddress.toLowerCase();
    const aMin = minMap.get(aHex);
    const bMin = minMap.get(bHex);

    if (aMin) {
      const aAmt = BigInt(params.assetAAmount);
      if (aAmt < aMin) {
        throw new Error(
          `Minimum amount not met for Asset A. Required ${aMin.toString()}, provided ${aAmt.toString()}`
        );
      }
    }

    if (bMin) {
      const bAmt = BigInt(params.assetBAmount);
      if (bAmt < bMin) {
        throw new Error(
          `Minimum amount not met for Asset B. Required ${bMin.toString()}, provided ${bAmt.toString()}`
        );
      }
    }
  }

  private async assertRemoveLiquidityMeetsMinAmounts(params: {
    poolId: string;
    lpTokensToRemove: string | bigint | number;
  }): Promise<void> {
    const minMap = await this.getEnabledMinAmountsMap();
    if (minMap.size === 0) {
      return;
    }

    const simulation = await this.simulateRemoveLiquidity({
      poolId: params.poolId,
      providerPublicKey: this.publicKey,
      lpTokensToRemove: String(params.lpTokensToRemove),
    });

    const pool = await this.getPool(params.poolId);
    const aHex = pool.assetAAddress.toLowerCase();
    const bHex = pool.assetBAddress.toLowerCase();
    const aMin = minMap.get(aHex);
    const bMin = minMap.get(bHex);

    if (aMin) {
      const predictedAOut = safeBigInt(simulation.assetAAmount);
      const relaxedA = aMin / 2n; // apply 50% relaxation for outputs
      if (predictedAOut < relaxedA) {
        throw new Error(
          `Minimum amount not met for Asset A on withdrawal. Required at least ${relaxedA.toString()} (50% relaxed), predicted ${predictedAOut.toString()}`
        );
      }
    }

    if (bMin) {
      const predictedBOut = safeBigInt(simulation.assetBAmount);
      const relaxedB = bMin / 2n;
      if (predictedBOut < relaxedB) {
        throw new Error(
          `Minimum amount not met for Asset B on withdrawal. Required at least ${relaxedB.toString()} (50% relaxed), predicted ${predictedBOut.toString()}`
        );
      }
    }
  }

  private async assertAllowedAssetBForPoolCreation(
    assetBHex: string
  ): Promise<void> {
    const now = Date.now();
    let allowed: AllowedAssetsResponse;
    if (this.allowedAssetsCache && this.allowedAssetsCache.expiryMs > now) {
      allowed = this.allowedAssetsCache.data;
    } else {
      allowed = await this.typedApi.getAllowedAssets();
      this.allowedAssetsCache = {
        data: allowed,
        expiryMs: now + FlashnetClient.ALLOWED_ASSETS_TTL_MS,
      };
    }
    if (!allowed || allowed.length === 0) {
      // Wildcard allowance
      return;
    }

    const isAllowed = allowed.some(
      (it) =>
        it.enabled &&
        it.asset_identifier.toLowerCase() === assetBHex.toLowerCase()
    );

    if (!isAllowed) {
      throw new Error(`Asset B is not allowed for pool creation: ${assetBHex}`);
    }
  }

  // V3 Concentrated Liquidity Operations

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
  async createConcentratedPool(params: {
    assetAAddress: string;
    assetBAddress: string;
    tickSpacing: number;
    initialPrice: string;
    lpFeeRateBps: number;
    hostFeeRateBps: number;
    hostNamespace?: string;
    poolOwnerPublicKey?: string;
  }): Promise<CreateConcentratedPoolResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_pool_creation");
    await this.assertAllowedAssetBForPoolCreation(
      this.toHexTokenIdentifier(params.assetBAddress)
    );

    const poolOwnerPublicKey = params.poolOwnerPublicKey ?? this.publicKey;

    // Generate intent
    const nonce = generateNonce();
    const intentMessage = generateCreateConcentratedPoolIntentMessage({
      poolOwnerPublicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      tickSpacing: params.tickSpacing,
      initialPrice: params.initialPrice,
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      hostFeeRateBps: params.hostFeeRateBps.toString(),
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: CreateConcentratedPoolRequest = {
      poolOwnerPublicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      tickSpacing: params.tickSpacing,
      initialPrice: params.initialPrice,
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      hostFeeRateBps: params.hostFeeRateBps.toString(),
      hostNamespace: params.hostNamespace,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    return this.typedApi.createConcentratedPool(request);
  }

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
  async increaseLiquidity(params: {
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
  }): Promise<IncreaseLiquidityResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_add_liquidity");

    // Get pool details to know asset addresses
    const pool = await this.getPool(params.poolId);

    // Transfer assets to pool (unless using free balance)
    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: params.poolId,
      network: this.sparkNetwork,
    });

    let assetATransferId = "";
    let assetBTransferId = "";
    const transferIds: string[] = [];

    // Transfer assets if not using free balance
    if (!params.useFreeBalance) {
      if (BigInt(params.amountADesired) > 0n) {
        assetATransferId = await this.transferAsset(
          {
            receiverSparkAddress: lpSparkAddress,
            assetAddress: pool.assetAAddress,
            amount: params.amountADesired,
          },
          "Insufficient balance for adding V3 liquidity (Asset A): ",
          params.useAvailableBalance
        );
        transferIds.push(assetATransferId);
      }

      if (BigInt(params.amountBDesired) > 0n) {
        assetBTransferId = await this.transferAsset(
          {
            receiverSparkAddress: lpSparkAddress,
            assetAddress: pool.assetBAddress,
            amount: params.amountBDesired,
          },
          "Insufficient balance for adding V3 liquidity (Asset B): ",
          params.useAvailableBalance
        );
        transferIds.push(assetBTransferId);
      }
    }

    const executeIncrease = async () => {
      // Generate intent
      const nonce = generateNonce();
      const intentMessage = generateIncreaseLiquidityIntentMessage({
        userPublicKey: this.publicKey,
        lpIdentityPublicKey: params.poolId,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        assetASparkTransferId: assetATransferId,
        assetBSparkTransferId: assetBTransferId,
        amountADesired: params.amountADesired,
        amountBDesired: params.amountBDesired,
        amountAMin: params.amountAMin,
        amountBMin: params.amountBMin,
        nonce,
      });

      // Sign intent
      const messageHash = sha256(intentMessage);
      const signature = await (
        this._wallet as any
      ).config.signer.signMessageWithIdentityKey(messageHash, true);

      const request: IncreaseLiquidityRequest = {
        poolId: params.poolId,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        assetASparkTransferId: assetATransferId,
        assetBSparkTransferId: assetBTransferId,
        amountADesired: params.amountADesired,
        amountBDesired: params.amountBDesired,
        amountAMin: params.amountAMin,
        amountBMin: params.amountBMin,
        useFreeBalance: params.useFreeBalance,
        retainExcessInBalance: params.retainExcessInBalance,
        nonce,
        signature: getHexFromUint8Array(signature),
      };

      const response = await this.typedApi.increaseLiquidity(request);

      if (!response.accepted) {
        const errorMessage =
          response.error || "Increase liquidity rejected by the AMM";
        const hasRefund = !!(response.amountARefund || response.amountBRefund);
        const refundInfo = hasRefund
          ? ` Refunds: Asset A: ${response.amountARefund || "0"}, Asset B: ${
              response.amountBRefund || "0"
            }`
          : "";

        throw new FlashnetError(`${errorMessage}.${refundInfo}`, {
          response: {
            errorCode: hasRefund ? "FSAG-4203" : "UNKNOWN",
            errorCategory: hasRefund ? "Business" : "System",
            message: `${errorMessage}.${refundInfo}`,
            requestId: response.requestId || "",
            timestamp: new Date().toISOString(),
            service: "amm-gateway",
            severity: "Error",
          },
          httpStatus: 400,
          transferIds: hasRefund ? [] : transferIds,
          lpIdentityPublicKey: params.poolId,
        });
      }

      return response;
    };

    // Execute with auto-clawback if we made transfers
    if (transferIds.length > 0) {
      return this.executeWithAutoClawback(
        executeIncrease,
        transferIds,
        params.poolId
      );
    }

    return executeIncrease();
  }

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
  async decreaseLiquidity(params: {
    poolId: string;
    tickLower: number;
    tickUpper: number;
    liquidityToRemove: string;
    amountAMin: string;
    amountBMin: string;
    retainInBalance?: boolean;
  }): Promise<DecreaseLiquidityResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_withdraw_liquidity");

    // Generate intent
    const nonce = generateNonce();
    const intentMessage = generateDecreaseLiquidityIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      liquidityToRemove: params.liquidityToRemove,
      amountAMin: params.amountAMin,
      amountBMin: params.amountBMin,
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: DecreaseLiquidityRequest = {
      poolId: params.poolId,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      liquidityToRemove: params.liquidityToRemove,
      amountAMin: params.amountAMin,
      amountBMin: params.amountBMin,
      retainInBalance: params.retainInBalance,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.decreaseLiquidity(request);

    if (!response.accepted) {
      const errorMessage =
        response.error || "Decrease liquidity rejected by the AMM";
      throw new Error(errorMessage);
    }

    return response;
  }

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
  async collectFees(params: {
    poolId: string;
    tickLower: number;
    tickUpper: number;
    retainInBalance?: boolean;
  }): Promise<CollectFeesResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_withdraw_fees");

    // Generate intent
    const nonce = generateNonce();
    const intentMessage = generateCollectFeesIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: CollectFeesRequest = {
      poolId: params.poolId,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      retainInBalance: params.retainInBalance,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.collectFees(request);

    if (!response.accepted) {
      const errorMessage = response.error || "Collect fees rejected by the AMM";
      throw new Error(errorMessage);
    }

    return response;
  }

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
  async rebalancePosition(params: {
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
  }): Promise<RebalancePositionResponse> {
    await this.ensureInitialized();

    await this.ensureAmmOperationAllowed("allow_add_liquidity");

    // Get pool details
    const pool = await this.getPool(params.poolId);

    // Transfer additional assets if provided
    let assetATransferId: string | undefined;
    let assetBTransferId: string | undefined;

    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: params.poolId,
      network: this.sparkNetwork,
    });

    if (params.additionalAmountA && BigInt(params.additionalAmountA) > 0n) {
      assetATransferId = await this.transferAsset(
        {
          receiverSparkAddress: lpSparkAddress,
          assetAddress: pool.assetAAddress,
          amount: params.additionalAmountA,
        },
        "Insufficient balance for rebalance (Asset A): ",
        params.useAvailableBalance
      );
    }

    if (params.additionalAmountB && BigInt(params.additionalAmountB) > 0n) {
      assetBTransferId = await this.transferAsset(
        {
          receiverSparkAddress: lpSparkAddress,
          assetAddress: pool.assetBAddress,
          amount: params.additionalAmountB,
        },
        "Insufficient balance for rebalance (Asset B): ",
        params.useAvailableBalance
      );
    }

    // Collect transfer IDs for potential clawback
    const transferIds: string[] = [];
    if (assetATransferId) {
      transferIds.push(assetATransferId);
    }
    if (assetBTransferId) {
      transferIds.push(assetBTransferId);
    }

    // Execute (with auto-clawback if we have transfers)
    const executeRebalance = async () => {
      // Generate intent
      const nonce = generateNonce();
      const intentMessage = generateRebalancePositionIntentMessage({
        userPublicKey: this.publicKey,
        lpIdentityPublicKey: params.poolId,
        oldTickLower: params.oldTickLower,
        oldTickUpper: params.oldTickUpper,
        newTickLower: params.newTickLower,
        newTickUpper: params.newTickUpper,
        liquidityToMove: params.liquidityToMove,
        assetASparkTransferId: assetATransferId,
        assetBSparkTransferId: assetBTransferId,
        additionalAmountA: params.additionalAmountA,
        additionalAmountB: params.additionalAmountB,
        nonce,
      });

      // Sign intent
      const messageHash = sha256(intentMessage);
      const signature = await (
        this._wallet as any
      ).config.signer.signMessageWithIdentityKey(messageHash, true);

      const request: RebalancePositionRequest = {
        poolId: params.poolId,
        oldTickLower: params.oldTickLower,
        oldTickUpper: params.oldTickUpper,
        newTickLower: params.newTickLower,
        newTickUpper: params.newTickUpper,
        liquidityToMove: params.liquidityToMove,
        assetASparkTransferId: assetATransferId,
        assetBSparkTransferId: assetBTransferId,
        additionalAmountA: params.additionalAmountA,
        additionalAmountB: params.additionalAmountB,
        retainInBalance: params.retainInBalance,
        nonce,
        signature: getHexFromUint8Array(signature),
      };

      const response = await this.typedApi.rebalancePosition(request);

      if (!response.accepted) {
        const errorMessage =
          response.error || "Rebalance position rejected by the AMM";

        throw new FlashnetError(errorMessage, {
          response: {
            errorCode: "UNKNOWN",
            errorCategory: "System",
            message: errorMessage,
            requestId: response.requestId || "",
            timestamp: new Date().toISOString(),
            service: "amm-gateway",
            severity: "Error",
          },
          httpStatus: 400,
          transferIds,
          lpIdentityPublicKey: params.poolId,
        });
      }

      return response;
    };

    // Use auto-clawback if we made transfers
    if (transferIds.length > 0) {
      return this.executeWithAutoClawback(
        executeRebalance,
        transferIds,
        params.poolId
      );
    }

    return executeRebalance();
  }

  /**
   * List V3 concentrated liquidity positions
   *
   * @param query Optional query parameters
   * @param query.poolId - Filter by pool ID
   * @param query.page - Page number (default: 1)
   * @param query.pageSize - Page size (default: 20, max: 100)
   */
  async listConcentratedPositions(
    query?: ListConcentratedPositionsQuery
  ): Promise<ListConcentratedPositionsResponse> {
    await this.ensureInitialized();
    return this.typedApi.listConcentratedPositions(query);
  }

  /**
   * Get pool liquidity distribution for visualization
   *
   * Returns aggregated liquidity ranges for visualizing the liquidity distribution.
   *
   * @param poolId - Pool ID (LP identity public key)
   */
  async getPoolLiquidity(poolId: string): Promise<PoolLiquidityResponse> {
    await this.ensureInitialized();
    return this.typedApi.getPoolLiquidity(poolId);
  }

  /**
   * Get pool ticks for simulation
   *
   * Returns all initialized ticks with their liquidity deltas for swap simulation.
   *
   * @param poolId - Pool ID (LP identity public key)
   */
  async getPoolTicks(poolId: string): Promise<PoolTicksResponse> {
    await this.ensureInitialized();
    return this.typedApi.getPoolTicks(poolId);
  }

  // V3 Free Balance Methods

  /**
   * Get user's free balance for a specific V3 pool
   *
   * Returns the user's current free balance in the pool, which can be used for
   * liquidity operations without needing to transfer from the wallet.
   *
   * @param poolId - Pool ID (LP identity public key)
   */
  async getConcentratedBalance(poolId: string): Promise<GetBalanceResponse> {
    await this.ensureInitialized();
    return this.typedApi.getConcentratedBalance(poolId);
  }

  /**
   * Get user's free balances across all V3 pools
   *
   * Returns all free balances for the authenticated user across all V3 pools.
   */
  async getConcentratedBalances(): Promise<GetBalancesResponse> {
    await this.ensureInitialized();
    return this.typedApi.getConcentratedBalances();
  }

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
  async withdrawConcentratedBalance(params: {
    poolId: string;
    amountA: string;
    amountB: string;
  }): Promise<WithdrawBalanceResponse> {
    await this.ensureInitialized();

    // Generate intent
    const nonce = generateNonce();
    const intentMessage = generateWithdrawBalanceIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      amountA: params.amountA,
      amountB: params.amountB,
      nonce,
    });

    // Sign intent
    const messageHash = sha256(intentMessage);
    const signature = await (
      this._wallet as any
    ).config.signer.signMessageWithIdentityKey(messageHash, true);

    const request: WithdrawBalanceRequest = {
      poolId: params.poolId,
      amountA: params.amountA,
      amountB: params.amountB,
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.withdrawConcentratedBalance(request);

    if (!response.accepted) {
      const errorMessage =
        response.error || "Withdraw balance rejected by the AMM";
      throw new Error(errorMessage);
    }

    return response;
  }

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
  async depositConcentratedBalance(params: {
    poolId: string;
    amountA: string;
    amountB: string;
    /** When true, checks against availableToSendBalance instead of total balance */
    useAvailableBalance?: boolean;
  }): Promise<DepositBalanceResponse> {
    await this.ensureInitialized();

    // Get pool details to know asset addresses
    const pool = await this.getPool(params.poolId);

    const lpSparkAddress = encodeSparkAddressNew({
      identityPublicKey: params.poolId,
      network: this.sparkNetwork,
    });

    let assetATransferId = "";
    let assetBTransferId = "";
    const transferIds: string[] = [];

    // Transfer assets to pool
    if (BigInt(params.amountA) > 0n) {
      assetATransferId = await this.transferAsset(
        {
          receiverSparkAddress: lpSparkAddress,
          assetAddress: pool.assetAAddress,
          amount: params.amountA,
        },
        "Insufficient balance for depositing to V3 pool (Asset A): ",
        params.useAvailableBalance
      );
      transferIds.push(assetATransferId);
    }

    if (BigInt(params.amountB) > 0n) {
      assetBTransferId = await this.transferAsset(
        {
          receiverSparkAddress: lpSparkAddress,
          assetAddress: pool.assetBAddress,
          amount: params.amountB,
        },
        "Insufficient balance for depositing to V3 pool (Asset B): ",
        params.useAvailableBalance
      );
      transferIds.push(assetBTransferId);
    }

    const executeDeposit = async () => {
      // Generate intent
      const nonce = generateNonce();
      const intentMessage = generateDepositBalanceIntentMessage({
        userPublicKey: this.publicKey,
        lpIdentityPublicKey: params.poolId,
        assetASparkTransferId: assetATransferId,
        assetBSparkTransferId: assetBTransferId,
        amountA: params.amountA,
        amountB: params.amountB,
        nonce,
      });

      // Sign intent
      const messageHash = sha256(intentMessage);
      const signature = await (
        this._wallet as any
      ).config.signer.signMessageWithIdentityKey(messageHash, true);

      const request: DepositBalanceRequest = {
        poolId: params.poolId,
        amountA: params.amountA,
        amountB: params.amountB,
        assetASparkTransferId: assetATransferId,
        assetBSparkTransferId: assetBTransferId,
        nonce,
        signature: getHexFromUint8Array(signature),
      };

      const response = await this.typedApi.depositConcentratedBalance(request);

      if (!response.accepted) {
        const errorMessage =
          response.error || "Deposit balance rejected by the AMM";
        throw new FlashnetError(errorMessage, {
          response: {
            errorCode: "UNKNOWN",
            errorCategory: "System",
            message: errorMessage,
            requestId: "",
            timestamp: new Date().toISOString(),
            service: "amm-gateway",
            severity: "Error",
          },
          httpStatus: 400,
          transferIds,
          lpIdentityPublicKey: params.poolId,
        });
      }

      return response;
    };

    // Execute with auto-clawback if we made transfers
    if (transferIds.length > 0) {
      return this.executeWithAutoClawback(
        executeDeposit,
        transferIds,
        params.poolId
      );
    }

    return executeDeposit();
  }
}

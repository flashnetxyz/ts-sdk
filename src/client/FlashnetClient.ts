import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
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
  type ClaimEscrowRequest,
  type ClaimEscrowResponse,
  type ClawbackRequest,
  type ClawbackResponse,
  type ClientEnvironment,
  type ClientNetworkConfig,
  type Condition,
  type ConfirmDepositResponse,
  type ConfirmInitialDepositRequest,
  type CreateConstantProductPoolRequest,
  type CreateEscrowRequest,
  type CreateEscrowResponse,
  type CreatePoolResponse,
  type CreateSingleSidedPoolRequest,
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
  type FundEscrowRequest,
  type FundEscrowResponse,
  type GetHostFeesRequest,
  type GetHostFeesResponse,
  type GetHostResponse,
  type GetIntegratorFeesResponse,
  type GetPoolHostFeesResponse,
  type GetPoolIntegratorFeesResponse,
  getClientEnvironmentFromLegacy,
  getSparkNetworkFromLegacy,
  type ListGlobalSwapsQuery,
  type ListGlobalSwapsResponse,
  type ListPoolSwapsQuery,
  type ListPoolSwapsResponse,
  type ListPoolsQuery,
  type ListPoolsResponse,
  type ListUserSwapsQuery,
  type ListUserSwapsResponse,
  type LpPositionDetailsResponse,
  Network,
  type NetworkType,
  type PoolDetailsResponse,
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
  type WithdrawHostFeesRequest,
  type WithdrawHostFeesResponse,
  type WithdrawIntegratorFeesRequest,
  type WithdrawIntegratorFeesResponse,
} from "../types";
import { compareDecimalStrings, generateNonce } from "../utils";
import { AuthManager } from "../utils/auth";
import { getHexFromUint8Array } from "../utils/hex";
import {
  generateAddLiquidityIntentMessage,
  generateClaimEscrowIntentMessage,
  generateClawbackIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
  generateCreateEscrowIntentMessage,
  generateFundEscrowIntentMessage,
  generatePoolConfirmInitialDepositIntentMessage,
  generatePoolInitializationIntentMessage,
  generatePoolSwapIntentMessage,
  generateRegisterHostIntentMessage,
  generateRemoveLiquidityIntentMessage,
  generateRouteSwapIntentMessage,
  generateWithdrawHostFeesIntentMessage,
  generateWithdrawIntegratorFeesIntentMessage,
} from "../utils/intents";
import { createWalletSigner } from "../utils/signer";
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
  balance: bigint;
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
      createWalletSigner(this._wallet)
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
   * If the identifier is the BTC constant or already a hex string, it is returned unchanged.
   * If it is in Bech32m human-readable form, it is decoded to hex.
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
          balance: BigInt(tokenData.balance),
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
      balance: BigInt(balance.balance),
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
  }): Promise<void> {
    const balance = await this.getBalance();

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
        // If direct lookup fails (possible representation mismatch), try the human-readable form
        const hrKey = this.toHumanReadableTokenIdentifier(tokenPubkey);
        const effectiveTokenBalance =
          balance.tokenBalances.get(tokenPubkey) ??
          balance.tokenBalances.get(hrKey);
        const available = effectiveTokenBalance?.balance ?? 0n;

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

  // ===== Pool Operations =====

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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

  // ===== Swap Operations =====

  /**
   * Simulate a swap without executing it
   */
  async simulateSwap(
    params: SimulateSwapRequest
  ): Promise<SimulateSwapResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();
    return this.typedApi.simulateSwap(params);
  }

  /**
   * Execute a swap
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
  }): Promise<SwapResponse> {
    await this.ensureInitialized();

    // Gate by feature flags and ping, and enforce min-amount policy before transfers
    await this.ensureAmmOperationAllowed("allow_swaps");
    await this.assertSwapMeetsMinAmounts({
      assetInAddress: params.assetInAddress,
      assetOutAddress: params.assetOutAddress,
      amountIn: params.amountIn,
      minAmountOut: params.minAmountOut,
    });

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
      "Insufficient balance for swap: "
    );

    const response = await this.executeSwapIntent({
      ...params,
      transferId,
    });

    return response;
  }

  async executeSwapIntent(params: {
    poolId: string;
    transferId: string;
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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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
      assetInSparkTransferId: params.transferId,
      totalIntegratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
      integratorPublicKey: params.integratorPublicKey || "",
      nonce,
      signature: getHexFromUint8Array(signature),
    };

    const response = await this.typedApi.executeSwap(request);

    // Check if the swap was accepted
    if (!response.accepted) {
      const errorMessage = response.error || "Swap rejected by the AMM";
      const refundInfo = response.refundedAmount
        ? ` Refunded ${response.refundedAmount} of ${response.refundedAssetAddress} via transfer ${response.refundTransferId}`
        : "";
      throw new Error(`${errorMessage}.${refundInfo}`);
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
      "Insufficient balance for route swap: "
    );

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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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
      const errorMessage = response.error || "Route swap rejected by the AMM";
      const refundInfo = response.refundedAmount
        ? ` Refunded ${response.refundedAmount} of ${response.refundedAssetPublicKey} via transfer ${response.refundTransferId}`
        : "";
      throw new Error(`${errorMessage}.${refundInfo}`);
    }

    return response;
  }

  // ===== Liquidity Operations =====

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
   */
  async addLiquidity(params: {
    poolId: string;
    assetAAmount: string;
    assetBAmount: string;
    assetAMinAmountIn: string;
    assetBMinAmountIn: string;
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
      "Insufficient balance for adding liquidity: "
    );

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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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
      const refundInfo = response.refund
        ? ` Refunds: Asset A: ${response.refund.assetAAmount || 0}, Asset B: ${
            response.refund.assetBAmount || 0
          }`
        : "";
      throw new Error(`${errorMessage}.${refundInfo}`);
    }

    return response;
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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

  // ===== Host Operations =====

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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

  // ===== Escrow Operations =====

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

    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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
  }): Promise<FundEscrowResponse> {
    await this.ensureInitialized();
    await this.ensurePingOk();

    // 1. Balance check
    await this.checkBalance({
      balancesToCheck: [
        { assetAddress: params.assetId, amount: params.assetAmount },
      ],
      errorPrefix: "Insufficient balance to fund escrow: ",
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
    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

  // ===== Swap History =====

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

  // ===== Clawback =====
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

    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

  // ===== Token Address Operations =====

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

  // ===== Status =====

  /**
   * Ping the settlement service
   */
  async ping(): Promise<SettlementPingResponse> {
    await this.ensureInitialized();
    return this.typedApi.ping();
  }

  // ===== Helper Methods =====

  /**
   * Performs asset transfer using generalized asset address for both BTC and tokens.
   */
  async transferAsset(
    recipient: TransferAssetRecipient,
    checkBalanceErrorPrefix?: string
  ): Promise<string> {
    const transferIds = await this.transferAssets<1>(
      [recipient],
      checkBalanceErrorPrefix
    );
    return transferIds[0];
  }

  /**
   * Performs asset transfers using generalized asset addresses for both BTC and tokens.
   * Supports optional generic to hardcode recipients length so output list can be typed with same length.
   */
  async transferAssets<N extends number | unknown = unknown>(
    recipients: TupleArray<TransferAssetRecipient, N>,
    checkBalanceErrorPrefix?: string
  ): Promise<TupleArray<string, N>> {
    if (checkBalanceErrorPrefix) {
      await this.checkBalance({
        balancesToCheck: recipients,
        errorPrefix: checkBalanceErrorPrefix,
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

    const messageHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", intentMessage)
    );
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

  /**
   * Clean up wallet connections
   */
  async cleanup(): Promise<void> {
    await this._wallet.cleanupConnections();
  }

  // ===== Config and Policy Enforcement Helpers =====

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
        const key = item.asset_identifier.toLowerCase();
        const value = BigInt(String(item.min_amount));
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

    const amountIn = BigInt(String(params.amountIn));
    const minAmountOut = BigInt(String(params.minAmountOut));

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
      const aAmt = BigInt(String(params.assetAAmount));
      if (aAmt < aMin) {
        throw new Error(
          `Minimum amount not met for Asset A. Required ${aMin.toString()}, provided ${aAmt.toString()}`
        );
      }
    }

    if (bMin) {
      const bAmt = BigInt(String(params.assetBAmount));
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
      const predictedAOut = BigInt(String(simulation.assetAAmount));
      const relaxedA = aMin / 2n; // apply 50% relaxation for outputs
      if (predictedAOut < relaxedA) {
        throw new Error(
          `Minimum amount not met for Asset A on withdrawal. Required at least ${relaxedA.toString()} (50% relaxed), predicted ${predictedAOut.toString()}`
        );
      }
    }

    if (bMin) {
      const predictedBOut = BigInt(String(simulation.assetBAmount));
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
}

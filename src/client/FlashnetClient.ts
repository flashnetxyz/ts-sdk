import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import { ApiClient } from "../api/client";
import { TypedAmmApi } from "../api/typed-endpoints";
import { BTC_ASSET_PUBKEY, getNetworkConfig } from "../config";
import {
  type AddLiquidityRequest,
  type AddLiquidityResponse,
  type ConfirmDepositResponse,
  type ConfirmInitialDepositRequest,
  type CreateConstantProductPoolRequest,
  type CreatePoolResponse,
  type CreateSingleSidedPoolRequest,
  type ExecuteRouteSwapRequest,
  type ExecuteRouteSwapResponse,
  type ExecuteSwapRequest,
  type GetHostFeesRequest,
  type GetHostFeesResponse,
  type GetHostResponse,
  type GetIntegratorFeesResponse,
  type GetPoolHostFeesResponse,
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
  type SwapResponse,
  type WithdrawHostFeesRequest,
  type WithdrawHostFeesResponse,
  type WithdrawIntegratorFeesRequest,
  type WithdrawIntegratorFeesResponse,
} from "../types";
import { generateNonce } from "../utils";
import { AuthManager } from "../utils/auth";
import {
  generateAddLiquidityIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
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
  encodeSparkAddress,
  getNetworkFromAddress,
} from "../utils/spark-address";
import {
  encodeHumanReadableTokenIdentifier,
  decodeHumanReadableTokenIdentifier,
  type HumanReadableTokenIdentifier,
} from "../utils/tokenAddress";

export interface TokenBalance {
  balance: bigint;
  tokenInfo?: {
    tokenPublicKey: string;
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

export interface FlashnetClientOptions {
  autoAuthenticate?: boolean; // Default: true
}

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
  private network: NetworkType;
  private publicKey: string = "";
  private sparkAddress: string = "";
  private isAuthenticated: boolean = false;

  /**
   * Get the underlying wallet instance for direct wallet operations
   */
  get wallet(): IssuerSparkWallet | SparkWallet {
    return this._wallet;
  }

  /**
   * Get the network type
   */
  get networkType(): NetworkType {
    return this.network;
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
   * Create a new FlashnetClient instance
   * @param wallet - The SparkWallet to use
   * @param options - Client options
   */
  constructor(
    wallet: IssuerSparkWallet | SparkWallet,
    _options: FlashnetClientOptions = {}
  ) {
    this._wallet = wallet;

    // We'll initialize these in the init method
    // @ts-expect-error - wallet.config is protected
    const networkEnum = wallet.config.getNetwork();
    const networkName = Network[networkEnum] as NetworkType;
    this.network = networkName === "MAINNET" ? "MAINNET" : "REGTEST";

    // panic if mainnet for now
    if (networkName === "MAINNET") {
      throw new Error("Mainnet is not supported yet");
    }

    const config = getNetworkConfig(this.network);
    this.apiClient = new ApiClient(config);
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

    // Deduce network from spark address
    const detectedNetwork = getNetworkFromAddress(this.sparkAddress);
    if (!detectedNetwork) {
      throw new Error(
        `Unable to determine network from spark address: ${this.sparkAddress}`
      );
    }
    this.network = detectedNetwork;
    // panic if mainnet for now
    if (detectedNetwork === "MAINNET") {
      throw new Error("Mainnet is not supported yet");
    }

    // Reinitialize API client with correct network
    const config = getNetworkConfig(this.network);
    this.apiClient = new ApiClient(config);
    this.typedApi = new TypedAmmApi(this.apiClient);
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
   * Otherwise, it is encoded from the raw hex form using the client network.
   */
  private toHumanReadableTokenIdentifier(tokenIdentifier: string): string {
    if (tokenIdentifier === BTC_ASSET_PUBKEY) {
      return tokenIdentifier;
    }
    if (tokenIdentifier.startsWith("btkn")) {
      return tokenIdentifier;
    }
    return encodeHumanReadableTokenIdentifier(tokenIdentifier, this.network);
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
      return decodeHumanReadableTokenIdentifier(
        tokenIdentifier as HumanReadableTokenIdentifier,
        this.network
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
        const info =
          "tokenInfo" in tokenData
            ? tokenData.tokenInfo
            : (tokenData as any).tokenMetadata;

        tokenBalances.set(tokenPubkey, {
          balance: BigInt(tokenData.balance),
          tokenInfo: {
            tokenPublicKey: info.tokenPublicKey,
            tokenName: info.tokenName,
            tokenSymbol: (info.tokenSymbol || info.tokenTicker) as string,
            tokenDecimals: (info.tokenDecimals ?? info.decimals) as number,
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
  private async checkBalance(requirements: {
    btc?: bigint;
    tokens?: Map<string, bigint>;
  }): Promise<{ sufficient: boolean; message?: string }> {
    const balance = await this.getBalance();

    // Check BTC balance
    if (requirements.btc && balance.balance < requirements.btc) {
      return {
        sufficient: false,
        message: `Insufficient BTC balance. Required: ${requirements.btc} sats, Available: ${balance.balance} sats`,
      };
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
          balance.tokenBalances.get(tokenPubkey) ?? balance.tokenBalances.get(hrKey);
        const available = effectiveTokenBalance?.balance ?? 0n;

        if (available < requiredAmount) {
          return {
            sufficient: false,
            message: `Insufficient token balance for ${tokenPubkey}. Required: ${requiredAmount}, Available: ${available}`,
          };
        }
      }
    }

    return { sufficient: true };
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
   * Create a constant product pool
   */
  async createConstantProductPool(params: {
    assetAAddress: string;
    assetBAddress: string;
    lpFeeRateBps: number;
    totalHostFeeRateBps: number;
    hostNamespace?: string;
    initialLiquidity?: {
      assetAAmount: bigint;
      assetBAmount: bigint;
    };
  }): Promise<CreatePoolResponse> {
    await this.ensureInitialized();

    // Check if we need to add initial liquidity
    if (params.initialLiquidity) {
      const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
        tokens: new Map(),
      };

      if (params.assetAAddress === BTC_ASSET_PUBKEY) {
        requirements.btc = params.initialLiquidity.assetAAmount;
      } else {
        requirements.tokens?.set(
          params.assetAAddress,
          params.initialLiquidity.assetAAmount
        );
      }

      if (params.assetBAddress === BTC_ASSET_PUBKEY) {
        requirements.btc =
          (requirements.btc || 0n) + params.initialLiquidity.assetBAmount;
      } else {
        requirements.tokens?.set(
          params.assetBAddress,
          params.initialLiquidity.assetBAmount
        );
      }

      const balanceCheck = await this.checkBalance(requirements);
      if (!balanceCheck.sufficient) {
        throw new Error(
          `Insufficient balance for initial liquidity: ${balanceCheck.message}`
        );
      }
    }

    // Generate intent
    const nonce = generateNonce();
    const intentMessage =
      generateConstantProductPoolInitializationIntentMessage({
        poolOwnerPublicKey: this.publicKey,
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
      poolOwnerPublicKey: this.publicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
      hostNamespace: params.hostNamespace || "",
      nonce,
      signature: Buffer.from(signature).toString("hex"),
    };

    const response = await this.typedApi.createConstantProductPool(request);

    // Add initial liquidity if specified
    if (params.initialLiquidity && response.poolId) {
      await this.addInitialLiquidity(
        response.poolId,
        params.assetAAddress,
        params.assetBAddress,
        params.initialLiquidity.assetAAmount,
        params.initialLiquidity.assetBAmount
      );
    }

    return response;
  }

  /**
   * Create a single-sided pool with automatic initial deposit
   *
   * This method creates a single-sided pool and automatically handles the initial deposit.
   * The initial reserve amount will be transferred to the pool and confirmed.
   */
  async createSingleSidedPool(params: {
    assetAAddress: string;
    assetBAddress: string;
    assetAInitialReserve: string;
    assetAPctSoldAtGraduation: number;
    targetBRaisedAtGraduation: string;
    lpFeeRateBps: number;
    totalHostFeeRateBps: number;
    hostNamespace?: string;
  }): Promise<CreatePoolResponse> {
    await this.ensureInitialized();

    // check that assetAPctSoldAtGraduation is between 0 and 100 - no decimals
    if (
      params.assetAPctSoldAtGraduation < 0 ||
      params.assetAPctSoldAtGraduation > 100
    ) {
      throw new Error(`assetAPctSoldAtGraduation must be between 0 and 100`);
    }

    if (!params.hostNamespace && params.totalHostFeeRateBps < 10) {
      throw new Error(
        `Host fee must be greater than 10 bps when no host namespace is provided`
      );
    }

    // Check balance for initial reserve
    const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
      tokens: new Map(),
    };

    if (params.assetAAddress === BTC_ASSET_PUBKEY) {
      requirements.btc = BigInt(params.assetAInitialReserve);
    } else {
      requirements.tokens?.set(
        params.assetAAddress,
        BigInt(params.assetAInitialReserve)
      );
    }

    const balanceCheck = await this.checkBalance(requirements);
    if (!balanceCheck.sufficient) {
      throw new Error(
        `Insufficient balance for pool creation: ${balanceCheck.message}`
      );
    }

    // Generate intent
    const nonce = generateNonce();
    const intentMessage = generatePoolInitializationIntentMessage({
      poolOwnerPublicKey: this.publicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      assetAInitialReserve: params.assetAInitialReserve,
      graduationThresholdPct: params.assetAPctSoldAtGraduation.toString(),
      targetBRaisedAtGraduation: params.targetBRaisedAtGraduation,
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
      poolOwnerPublicKey: this.publicKey,
      assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
      assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
      assetAInitialReserve: params.assetAInitialReserve,
      graduationThresholdPct: params.assetAPctSoldAtGraduation,
      targetBRaisedAtGraduation: params.targetBRaisedAtGraduation,
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
      hostNamespace: params.hostNamespace,
      nonce,
      signature: Buffer.from(signature).toString("hex"),
    };

    const createResponse = await this.typedApi.createSingleSidedPool(request);

    // If pool creation was successful, handle the initial deposit
    if (createResponse.poolId) {
      try {
        // Transfer initial reserve to the pool
        const lpSparkAddress = encodeSparkAddress({
          identityPublicKey: createResponse.poolId,
          network: this.network,
        });

        let assetATransferId: string;
        if (params.assetAAddress === BTC_ASSET_PUBKEY) {
          const transfer = await this._wallet.transfer({
            amountSats: Number(params.assetAInitialReserve),
            receiverSparkAddress: lpSparkAddress,
          });
          assetATransferId = transfer.id;
        } else {
          assetATransferId = await this._wallet.transferTokens({
            tokenIdentifier: this.toHumanReadableTokenIdentifier(params.assetAAddress) as any,
            tokenAmount: BigInt(params.assetAInitialReserve),
            receiverSparkAddress: lpSparkAddress,
          });
        }

        // Confirm the initial deposit
        const confirmNonce = generateNonce();
        const confirmIntentMessage =
          generatePoolConfirmInitialDepositIntentMessage({
            poolOwnerPublicKey: this.publicKey,
            lpIdentityPublicKey: createResponse.poolId,
            assetASparkTransferId: assetATransferId,
            nonce: confirmNonce,
          });

        const confirmMessageHash = new Uint8Array(
          await crypto.subtle.digest("SHA-256", confirmIntentMessage)
        );
        const confirmSignature = await (
          this._wallet as any
        ).config.signer.signMessageWithIdentityKey(confirmMessageHash, true);

        const confirmRequest: ConfirmInitialDepositRequest = {
          poolId: createResponse.poolId,
          assetASparkTransferId: assetATransferId,
          nonce: confirmNonce,
          signature: Buffer.from(confirmSignature).toString("hex"),
          poolOwnerPublicKey: this.publicKey,
        };

        const confirmResponse = await this.typedApi.confirmInitialDeposit(
          confirmRequest
        );

        if (!confirmResponse.confirmed) {
          throw new Error(
            `Failed to confirm initial deposit: ${confirmResponse.message}`
          );
        }
      } catch (error) {
        // If initial deposit fails, we should inform the user
        throw new Error(
          `Pool created with ID ${
            createResponse.poolId
          }, but initial deposit failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
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
    assetASparkTransferId: string
  ): Promise<ConfirmDepositResponse> {
    await this.ensureInitialized();

    const nonce = generateNonce();
    const intentMessage = generatePoolConfirmInitialDepositIntentMessage({
      poolOwnerPublicKey: this.publicKey,
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
      signature: Buffer.from(signature).toString("hex"),
      poolOwnerPublicKey: this.publicKey,
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

    // Check balance
    const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
      tokens: new Map(),
    };

    if (params.assetInAddress === BTC_ASSET_PUBKEY) {
      requirements.btc = BigInt(params.amountIn);
    } else {
      requirements.tokens?.set(params.assetInAddress, BigInt(params.amountIn));
    }

    const balanceCheck = await this.checkBalance(requirements);
    if (!balanceCheck.sufficient) {
      throw new Error(`Insufficient balance for swap: ${balanceCheck.message}`);
    }

    // Transfer assets to pool
    const lpSparkAddress = encodeSparkAddress({
      identityPublicKey: params.poolId,
      network: this.network,
    });

    let transferId: string;
    if (params.assetInAddress === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(params.amountIn),
        receiverSparkAddress: lpSparkAddress,
      });
      transferId = transfer.id;
    } else {
      transferId = await this._wallet.transferTokens({
        tokenIdentifier: this.toHumanReadableTokenIdentifier(params.assetInAddress) as any,
        tokenAmount: BigInt(params.amountIn),
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Generate swap intent
    const nonce = generateNonce();
    const intentMessage = generatePoolSwapIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      assetInSparkTransferId: transferId,
      assetInTokenPublicKey: this.toHexTokenIdentifier(params.assetInAddress),
      assetOutTokenPublicKey: this.toHexTokenIdentifier(params.assetOutAddress),
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
      assetInSparkTransferId: transferId,
      totalIntegratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
      integratorPublicKey: params.integratorPublicKey || "",
      nonce,
      signature: Buffer.from(signature).toString("hex"),
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
    await this.ensureInitialized();
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

    // Check balance for initial asset
    const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
      tokens: new Map(),
    };

    if (params.initialAssetAddress === BTC_ASSET_PUBKEY) {
      requirements.btc = BigInt(params.inputAmount);
    } else {
      requirements.tokens?.set(
        params.initialAssetAddress,
        BigInt(params.inputAmount)
      );
    }

    const balanceCheck = await this.checkBalance(requirements);
    if (!balanceCheck.sufficient) {
      throw new Error(
        `Insufficient balance for route swap: ${balanceCheck.message}`
      );
    }

    // Validate hops array
    if (!params.hops.length) {
      throw new Error("Route swap requires at least one hop");
    }

    // Transfer initial asset to first pool
    const firstPoolId = params.hops[0]?.poolId;
    if (!firstPoolId) {
      throw new Error("First pool ID is required");
    }

    const lpSparkAddress = encodeSparkAddress({
      identityPublicKey: firstPoolId,
      network: this.network,
    });

    let initialTransferId: string;
    if (params.initialAssetAddress === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(params.inputAmount),
        receiverSparkAddress: lpSparkAddress,
      });
      initialTransferId = transfer.id;
    } else {
      initialTransferId = await this._wallet.transferTokens({
        tokenIdentifier: this.toHumanReadableTokenIdentifier(params.initialAssetAddress) as any,
        tokenAmount: BigInt(params.inputAmount),
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Prepare hops for validation
    const hops: RouteHopValidation[] = params.hops.map((hop) => ({
      lpIdentityPublicKey: hop.poolId,
      inputAssetPublicKey: this.toHexTokenIdentifier(hop.assetInAddress),
      outputAssetPublicKey: this.toHexTokenIdentifier(hop.assetOutAddress),
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
        inputAssetPublicKey: hop.inputAssetPublicKey,
        outputAssetPublicKey: hop.outputAssetPublicKey,
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
      signature: Buffer.from(signature).toString("hex"),
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
    return this.typedApi.simulateAddLiquidity(params);
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(params: {
    poolId: string;
    assetAAmount: bigint;
    assetBAmount: bigint;
  }): Promise<AddLiquidityResponse> {
    await this.ensureInitialized();

    // Get pool details to know which assets we're dealing with
    const pool = await this.getPool(params.poolId);

    // Check balance
    const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
      tokens: new Map(),
    };

    if (pool.assetAAddress === BTC_ASSET_PUBKEY) {
      requirements.btc = params.assetAAmount;
    } else {
      requirements.tokens?.set(pool.assetAAddress, params.assetAAmount);
    }

    if (pool.assetBAddress === BTC_ASSET_PUBKEY) {
      requirements.btc = (requirements.btc || 0n) + params.assetBAmount;
    } else {
      requirements.tokens?.set(pool.assetBAddress, params.assetBAmount);
    }

    const balanceCheck = await this.checkBalance(requirements);
    if (!balanceCheck.sufficient) {
      throw new Error(
        `Insufficient balance for adding liquidity: ${balanceCheck.message}`
      );
    }

    // Transfer assets to pool
    const lpSparkAddress = encodeSparkAddress({
      identityPublicKey: params.poolId,
      network: this.network,
    });

    // Transfer asset A
    let assetATransferId: string;
    if (pool.assetAAddress === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(params.assetAAmount),
        receiverSparkAddress: lpSparkAddress,
      });
      assetATransferId = transfer.id;
    } else {
      assetATransferId = await this._wallet.transferTokens({
        tokenIdentifier: this.toHumanReadableTokenIdentifier(pool.assetAAddress) as any,
        tokenAmount: params.assetAAmount,
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Transfer asset B
    let assetBTransferId: string;
    if (pool.assetBAddress === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(params.assetBAmount),
        receiverSparkAddress: lpSparkAddress,
      });
      assetBTransferId = transfer.id;
    } else {
      assetBTransferId = await this._wallet.transferTokens({
        tokenIdentifier: this.toHumanReadableTokenIdentifier(pool.assetBAddress) as any,
        tokenAmount: params.assetBAmount,
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Generate add liquidity intent
    const nonce = generateNonce();
    const intentMessage = generateAddLiquidityIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      assetASparkTransferId: assetATransferId,
      assetBSparkTransferId: assetBTransferId,
      assetAAmount: params.assetAAmount.toString(),
      assetBAmount: params.assetBAmount.toString(),
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
      nonce,
      signature: Buffer.from(signature).toString("hex"),
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

    // Check LP token balance
    const position = await this.getLpPosition(params.poolId);
    const lpTokensOwned = BigInt(position.lpTokensOwned);
    const tokensToRemove = BigInt(params.lpTokensToRemove);

    if (lpTokensOwned < tokensToRemove) {
      throw new Error(
        `Insufficient LP tokens. Owned: ${lpTokensOwned}, Requested: ${tokensToRemove}`
      );
    }

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
      signature: Buffer.from(signature).toString("hex"),
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
      signature: Buffer.from(signature).toString("hex"),
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
    return this.typedApi.getPoolHostFees({ hostNamespace, poolId });
  }

  /**
   * Withdraw host fees
   */
  async withdrawHostFees(params: {
    lpIdentityPublicKey: string;
    assetAAmount?: string;
    assetBAmount?: string;
  }): Promise<WithdrawHostFeesResponse> {
    await this.ensureInitialized();

    const nonce = generateNonce();
    const intentMessage = generateWithdrawHostFeesIntentMessage({
      hostPublicKey: this.publicKey,
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      assetAAmount: params.assetAAmount,
      assetBAmount: params.assetBAmount,
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
      assetAAmount: params.assetAAmount,
      assetBAmount: params.assetBAmount,
      nonce,
      signature: Buffer.from(signature).toString("hex"),
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

    const request: GetHostFeesRequest = {
      hostNamespace,
    };

    return this.typedApi.getHostFees(request);
  }

  /**
   * Withdraw integrator fees
   */
  async withdrawIntegratorFees(params: {
    lpIdentityPublicKey: string;
    assetAAmount?: string;
    assetBAmount?: string;
  }): Promise<WithdrawIntegratorFeesResponse> {
    await this.ensureInitialized();

    const nonce = generateNonce();
    const intentMessage = generateWithdrawIntegratorFeesIntentMessage({
      integratorPublicKey: this.publicKey,
      lpIdentityPublicKey: params.lpIdentityPublicKey,
      assetAAmount: params.assetAAmount,
      assetBAmount: params.assetBAmount,
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
      assetAAmount: params.assetAAmount,
      assetBAmount: params.assetBAmount,
      nonce,
      signature: Buffer.from(signature).toString("hex"),
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

  // ===== Token Address Operations =====

  /**
   * Encode a token identifier into a human-readable token address using the client's network
   * @param tokenIdentifier - Token identifier as hex string or Uint8Array
   * @returns Human-readable token address
   */
  encodeTokenAddress(tokenIdentifier: string | Uint8Array): HumanReadableTokenIdentifier {
    return encodeHumanReadableTokenIdentifier(tokenIdentifier, this.network);
  }

  /**
   * Decode a human-readable token address back to its identifier
   * @param address - Human-readable token address
   * @returns Object containing the token identifier (as hex string) and network
   */
  decodeTokenAddress(address: HumanReadableTokenIdentifier): { tokenIdentifier: string; network: NetworkType } {
    return decodeHumanReadableTokenIdentifier(address, this.network);
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
   * Helper method to add initial liquidity after pool creation
   */
  private async addInitialLiquidity(
    poolId: string,
    assetATokenPublicKey: string,
    assetBTokenPublicKey: string,
    assetAAmount: bigint,
    assetBAmount: bigint
  ): Promise<void> {
    const lpSparkAddress = encodeSparkAddress({
      identityPublicKey: poolId,
      network: this.network,
    });

    // Transfer asset A
    let assetATransferId: string;
    if (assetATokenPublicKey === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(assetAAmount),
        receiverSparkAddress: lpSparkAddress,
      });
      assetATransferId = transfer.id;
    } else {
      assetATransferId = await this._wallet.transferTokens({
        tokenIdentifier: this.toHumanReadableTokenIdentifier(assetATokenPublicKey) as any,
        tokenAmount: assetAAmount,
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Transfer asset B
    let assetBTransferId: string;
    if (assetBTokenPublicKey === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(assetBAmount),
        receiverSparkAddress: lpSparkAddress,
      });
      assetBTransferId = transfer.id;
    } else {
      assetBTransferId = await this._wallet.transferTokens({
        tokenIdentifier: this.toHumanReadableTokenIdentifier(assetBTokenPublicKey) as any,
        tokenAmount: assetBAmount,
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Add liquidity
    const nonce = generateNonce();
    const intentMessage = generateAddLiquidityIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: poolId,
      assetASparkTransferId: assetATransferId,
      assetBSparkTransferId: assetBTransferId,
      assetAAmount: assetAAmount.toString(),
      assetBAmount: assetBAmount.toString(),
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
      nonce,
      signature: Buffer.from(signature).toString("hex"),
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
}

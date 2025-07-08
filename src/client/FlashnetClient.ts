import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import { ApiClient } from "../api/client";
import { TypedAmmApi } from "../api/typed-endpoints";
import { AuthManager } from "../utils/auth";
import { createWalletSigner } from "../utils/signer";
import {
  getNetworkFromAddress,
  encodeSparkAddress,
} from "../utils/spark-address";
import { getNetworkConfig } from "../config";
import { generateNonce } from "../utils";
import {
  generatePoolSwapIntentMessage,
  generateAddLiquidityIntentMessage,
  generateRemoveLiquidityIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
  generatePoolInitializationIntentMessage,
  generatePoolConfirmInitialDepositIntentMessage,
  generateRegisterHostIntentMessage,
  generateWithdrawHostFeesIntentMessage,
} from "../utils/intents";
import { BTC_ASSET_PUBKEY } from "../config";
import {
  type NetworkType,
  Network,
  type ListPoolsQuery,
  type ListPoolsResponse,
  type PoolDetailsResponse,
  type LpPositionDetailsResponse,
  type SimulateSwapRequest,
  type SimulateSwapResponse,
  type ExecuteSwapRequest,
  type SwapResponse,
  type SimulateAddLiquidityRequest,
  type SimulateAddLiquidityResponse,
  type AddLiquidityRequest,
  type AddLiquidityResponse,
  type SimulateRemoveLiquidityRequest,
  type SimulateRemoveLiquidityResponse,
  type RemoveLiquidityRequest,
  type RemoveLiquidityResponse,
  type CreateConstantProductPoolRequest,
  type CreateSingleSidedPoolRequest,
  type CreatePoolResponse,
  type ConfirmInitialDepositRequest,
  type ConfirmDepositResponse,
  type RegisterHostRequest,
  type RegisterHostResponse,
  type GetHostResponse,
  type WithdrawHostFeesRequest,
  type WithdrawHostFeesResponse,
  type GetPoolHostFeesRequest,
  type GetPoolHostFeesResponse,
  type ListPoolSwapsQuery,
  type ListPoolSwapsResponse,
  type ListGlobalSwapsQuery,
  type ListGlobalSwapsResponse,
  type ListUserSwapsQuery,
  type ListUserSwapsResponse,
  type SettlementPingResponse,
} from "../types";

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
    options: FlashnetClientOptions = {}
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
   * Get wallet balance including BTC and token balances
   */
  async getBalance(): Promise<WalletBalance> {
    const balance = await this._wallet.getBalance();

    // Convert the wallet's balance format to our format
    const tokenBalances = new Map<string, TokenBalance>();

    if (balance.tokenBalances) {
      for (const [tokenPubkey, tokenData] of balance.tokenBalances.entries()) {
        tokenBalances.set(tokenPubkey, {
          balance: BigInt(tokenData.balance),
          tokenInfo: {
            tokenPublicKey: tokenData.tokenInfo.tokenPublicKey,
            tokenName: tokenData.tokenInfo.tokenName,
            tokenSymbol: tokenData.tokenInfo.tokenSymbol,
            tokenDecimals: tokenData.tokenInfo.tokenDecimals,
            maxSupply: tokenData.tokenInfo.maxSupply,
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
        const tokenBalance = balance.tokenBalances.get(tokenPubkey);
        const available = tokenBalance?.balance ?? 0n;

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
    assetATokenPublicKey: string;
    assetBTokenPublicKey: string;
    lpFeeRateBps: number;
    totalHostFeeRateBps: number;
    integratorNamespace?: string;
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

      if (params.assetATokenPublicKey === BTC_ASSET_PUBKEY) {
        requirements.btc = params.initialLiquidity.assetAAmount;
      } else {
        requirements.tokens!.set(
          params.assetATokenPublicKey,
          params.initialLiquidity.assetAAmount
        );
      }

      if (params.assetBTokenPublicKey === BTC_ASSET_PUBKEY) {
        requirements.btc =
          (requirements.btc || 0n) + params.initialLiquidity.assetBAmount;
      } else {
        requirements.tokens!.set(
          params.assetBTokenPublicKey,
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
        assetATokenPublicKey: params.assetATokenPublicKey,
        assetBTokenPublicKey: params.assetBTokenPublicKey,
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
      assetATokenPublicKey: params.assetATokenPublicKey,
      assetBTokenPublicKey: params.assetBTokenPublicKey,
      lpFeeRateBps: params.lpFeeRateBps.toString(),
      totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
      integratorNamespace: params.integratorNamespace || "",
      nonce,
      signature: Buffer.from(signature).toString("hex"),
    };

    const response = await this.typedApi.createConstantProductPool(request);

    // Add initial liquidity if specified
    if (params.initialLiquidity && response.poolId) {
      await this.addInitialLiquidity(
        response.poolId,
        params.assetATokenPublicKey,
        params.assetBTokenPublicKey,
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
    assetATokenPublicKey: string;
    assetBTokenPublicKey: string;
    assetAInitialReserve: string;
    assetAInitialVirtualReserve: string;
    assetBInitialVirtualReserve: string;
    threshold: string;
    lpFeeRateBps: number;
    totalHostFeeRateBps: number;
    hostNamespace?: string;
  }): Promise<CreatePoolResponse> {
    await this.ensureInitialized();

    // Check balance for initial reserve
    const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
      tokens: new Map(),
    };

    if (params.assetATokenPublicKey === BTC_ASSET_PUBKEY) {
      requirements.btc = BigInt(params.assetAInitialReserve);
    } else {
      requirements.tokens!.set(
        params.assetATokenPublicKey,
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
      assetATokenPublicKey: params.assetATokenPublicKey,
      assetBTokenPublicKey: params.assetBTokenPublicKey,
      assetAInitialReserve: params.assetAInitialReserve,
      assetAInitialVirtualReserve: params.assetAInitialVirtualReserve,
      assetBInitialVirtualReserve: params.assetBInitialVirtualReserve,
      threshold: params.threshold,
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
      assetATokenPublicKey: params.assetATokenPublicKey,
      assetBTokenPublicKey: params.assetBTokenPublicKey,
      assetAInitialReserve: params.assetAInitialReserve,
      assetAInitialVirtualReserve: params.assetAInitialVirtualReserve,
      assetBInitialVirtualReserve: params.assetBInitialVirtualReserve,
      threshold: params.threshold,
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
        if (params.assetATokenPublicKey === BTC_ASSET_PUBKEY) {
          const transfer = await this._wallet.transfer({
            amountSats: Number(params.assetAInitialReserve),
            receiverSparkAddress: lpSparkAddress,
          });
          assetATransferId = transfer.id;
        } else {
          assetATransferId = await this._wallet.transferTokens({
            tokenPublicKey: params.assetATokenPublicKey,
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
    assetInTokenPublicKey: string;
    assetOutTokenPublicKey: string;
    amountIn: bigint;
    minAmountOut: bigint;
    maxSlippageBps: number;
  }): Promise<SwapResponse> {
    await this.ensureInitialized();

    // Check balance
    const requirements: { btc?: bigint; tokens?: Map<string, bigint> } = {
      tokens: new Map(),
    };

    if (params.assetInTokenPublicKey === BTC_ASSET_PUBKEY) {
      requirements.btc = params.amountIn;
    } else {
      requirements.tokens!.set(params.assetInTokenPublicKey, params.amountIn);
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
    if (params.assetInTokenPublicKey === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(params.amountIn),
        receiverSparkAddress: lpSparkAddress,
      });
      transferId = transfer.id;
    } else {
      transferId = await this._wallet.transferTokens({
        tokenPublicKey: params.assetInTokenPublicKey,
        tokenAmount: params.amountIn,
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Generate swap intent
    const nonce = generateNonce();
    const intentMessage = generatePoolSwapIntentMessage({
      userPublicKey: this.publicKey,
      lpIdentityPublicKey: params.poolId,
      assetASparkTransferId: transferId,
      assetInTokenPublicKey: params.assetInTokenPublicKey,
      assetOutTokenPublicKey: params.assetOutTokenPublicKey,
      amountIn: params.amountIn.toString(),
      minAmountOut: params.minAmountOut.toString(),
      maxSlippageBps: params.maxSlippageBps.toString(),
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
      assetInTokenPublicKey: params.assetInTokenPublicKey,
      assetOutTokenPublicKey: params.assetOutTokenPublicKey,
      amountIn: params.amountIn.toString(),
      minAmountOut: params.minAmountOut.toString(),
      maxSlippageBps: params.maxSlippageBps?.toString(),
      assetInSparkTransferId: transferId,
      nonce,
      signature: Buffer.from(signature).toString("hex"),
    };

    const response = await this.typedApi.executeSwap(request);

    // Check if the swap was accepted
    if (!response.accepted) {
      const errorMessage = response.error || "Swap rejected by the AMM";
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

    if (pool.assetATokenPublicKey === BTC_ASSET_PUBKEY) {
      requirements.btc = params.assetAAmount;
    } else {
      requirements.tokens!.set(pool.assetATokenPublicKey, params.assetAAmount);
    }

    if (pool.assetBTokenPublicKey === BTC_ASSET_PUBKEY) {
      requirements.btc = (requirements.btc || 0n) + params.assetBAmount;
    } else {
      requirements.tokens!.set(pool.assetBTokenPublicKey, params.assetBAmount);
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
    if (pool.assetATokenPublicKey === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(params.assetAAmount),
        receiverSparkAddress: lpSparkAddress,
      });
      assetATransferId = transfer.id;
    } else {
      assetATransferId = await this._wallet.transferTokens({
        tokenPublicKey: pool.assetATokenPublicKey,
        tokenAmount: params.assetAAmount,
        receiverSparkAddress: lpSparkAddress,
      });
    }

    // Transfer asset B
    let assetBTransferId: string;
    if (pool.assetBTokenPublicKey === BTC_ASSET_PUBKEY) {
      const transfer = await this._wallet.transfer({
        amountSats: Number(params.assetBAmount),
        receiverSparkAddress: lpSparkAddress,
      });
      assetBTransferId = transfer.id;
    } else {
      assetBTransferId = await this._wallet.transferTokens({
        tokenPublicKey: pool.assetBTokenPublicKey,
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
        tokenPublicKey: assetATokenPublicKey,
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
        tokenPublicKey: assetBTokenPublicKey,
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

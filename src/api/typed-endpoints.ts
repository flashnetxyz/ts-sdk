import type * as Types from "../types";
import type { ApiClient } from "./client";

/**
 * Typed API endpoints for the Flashnet AMM Gateway
 */
export class TypedAmmApi {
  constructor(private client: ApiClient) {}

  // ===== Authentication Endpoints =====

  /**
   * Request authentication challenge
   * @POST /v1/auth/challenge
   */
  async getChallenge(
    request: Types.ChallengeRequest
  ): Promise<Types.ChallengeResponse> {
    return this.client.ammPost<Types.ChallengeResponse>(
      "/v1/auth/challenge",
      request
    );
  }

  /**
   * Verify challenge and get access token
   * @POST /v1/auth/verify
   */
  async verify(request: Types.VerifyRequest): Promise<Types.VerifyResponse> {
    return this.client.ammPost<Types.VerifyResponse>(
      "/v1/auth/verify",
      request
    );
  }

  // ===== Host Endpoints =====

  /**
   * Register a new host
   * @POST /v1/hosts/register
   * @requires Bearer token
   */
  async registerHost(
    request: Types.RegisterHostRequest
  ): Promise<Types.RegisterHostResponse> {
    return this.client.ammPost<Types.RegisterHostResponse>(
      "/v1/hosts/register",
      request
    );
  }

  /**
   * Get host information
   * @GET /v1/hosts/{namespace}
   */
  async getHost(namespace: string): Promise<Types.GetHostResponse> {
    return this.client.ammGet<Types.GetHostResponse>(`/v1/hosts/${namespace}`);
  }

  /**
   * Withdraw host fees
   * @POST /v1/hosts/withdraw-fees
   * @requires Bearer token
   */
  async withdrawHostFees(
    request: Types.WithdrawHostFeesRequest
  ): Promise<Types.WithdrawHostFeesResponse> {
    return this.client.ammPost<Types.WithdrawHostFeesResponse>(
      "/v1/hosts/withdraw-fees",
      request
    );
  }

  /**
   * Get pool host fees
   * @POST /v1/hosts/pool-fees
   * @requires Bearer token
   */
  async getPoolHostFees(
    request: Types.GetPoolHostFeesRequest
  ): Promise<Types.GetPoolHostFeesResponse> {
    return this.client.ammPost<Types.GetPoolHostFeesResponse>(
      "/v1/hosts/pool-fees",
      request
    );
  }

  /**
   * Get host fees across all pools
   * @POST /v1/hosts/host-fees
   * @requires Bearer token
   */
  async getHostFees(
    request: Types.GetHostFeesRequest
  ): Promise<Types.GetHostFeesResponse> {
    return this.client.ammPost<Types.GetHostFeesResponse>(
      "/v1/hosts/fees",
      request
    );
  }

  /**
   * Get host fee withdrawal history
   * @GET /v1/hosts/fee-withdrawal-history
   * @requires Bearer token
   */
  async getHostFeeWithdrawalHistory(
    query?: Types.FeeWithdrawalHistoryQuery
  ): Promise<Types.FeeWithdrawalHistoryResponse> {
    return this.client.ammGet<Types.FeeWithdrawalHistoryResponse>(
      "/v1/hosts/fee-withdrawal-history",
      { params: query as any }
    );
  }

  // ===== Pool Endpoints =====

  /**
   * Create constant product pool
   * @POST /v1/pools/constant-product
   * @requires Bearer token
   */
  async createConstantProductPool(
    request: Types.CreateConstantProductPoolRequest
  ): Promise<Types.CreatePoolResponse> {
    return this.client.ammPost<Types.CreatePoolResponse>(
      "/v1/pools/constant-product",
      request
    );
  }

  /**
   * Create single-sided pool
   * @POST /v1/pools/single-sided
   * @requires Bearer token
   */
  async createSingleSidedPool(
    request: Types.CreateSingleSidedPoolRequest
  ): Promise<Types.CreatePoolResponse> {
    return this.client.ammPost<Types.CreatePoolResponse>(
      "/v1/pools/single-sided",
      request
    );
  }

  /**
   * Confirm initial deposit for single-sided pool
   * @POST /v1/pools/single-sided/confirm-initial-deposit
   * @requires Bearer token
   */
  async confirmInitialDeposit(
    request: Types.ConfirmInitialDepositRequest
  ): Promise<Types.ConfirmDepositResponse> {
    return this.client.ammPost<Types.ConfirmDepositResponse>(
      "/v1/pools/single-sided/confirm-initial-deposit",
      request
    );
  }

  /**
   * List pools with filters
   * @GET /v1/pools
   */
  async listPools(
    query?: Types.ListPoolsQuery
  ): Promise<Types.ListPoolsResponse> {
    return this.client.ammGet<Types.ListPoolsResponse>("/v1/pools", {
      params: query as any,
    });
  }

  /**
   * Get pool details
   * @GET /v1/pools/{poolId}
   */
  async getPool(poolId: string): Promise<Types.PoolDetailsResponse> {
    return this.client.ammGet<Types.PoolDetailsResponse>(`/v1/pools/${poolId}`);
  }

  /**
   * Get LP position details
   * @GET /v1/pools/{poolId}/lp/{providerPublicKey}
   * @requires Bearer token
   */
  async getLpPosition(
    poolId: string,
    providerPublicKey: string
  ): Promise<Types.LpPositionDetailsResponse> {
    return this.client.ammGet<Types.LpPositionDetailsResponse>(
      `/v1/pools/${poolId}/lp/${providerPublicKey}`
    );
  }

  /**
   * Get all LP positions
   * @GET /v1/pools/lp
   * @requires Bearer token
   */
  async getAllLpPositions(): Promise<Types.AllLpPositionsResponse> {
    return this.client.ammGet<Types.AllLpPositionsResponse>(
      "/v1/liquidity/positions"
    );
  }

  // ===== Liquidity Endpoints =====

  /**
   * Add liquidity to pool
   * @POST /v1/liquidity/add
   * @requires Bearer token
   */
  async addLiquidity(
    request: Types.AddLiquidityRequest
  ): Promise<Types.AddLiquidityResponse> {
    return this.client.ammPost<Types.AddLiquidityResponse>(
      "/v1/liquidity/add",
      request
    );
  }

  /**
   * Simulate adding liquidity
   * @POST /v1/liquidity/add/simulate
   */
  async simulateAddLiquidity(
    request: Types.SimulateAddLiquidityRequest
  ): Promise<Types.SimulateAddLiquidityResponse> {
    return this.client.ammPost<Types.SimulateAddLiquidityResponse>(
      "/v1/liquidity/add/simulate",
      request
    );
  }

  /**
   * Remove liquidity from pool
   * @POST /v1/liquidity/remove
   * @requires Bearer token
   */
  async removeLiquidity(
    request: Types.RemoveLiquidityRequest
  ): Promise<Types.RemoveLiquidityResponse> {
    return this.client.ammPost<Types.RemoveLiquidityResponse>(
      "/v1/liquidity/remove",
      request
    );
  }

  /**
   * Simulate removing liquidity
   * @POST /v1/liquidity/remove/simulate
   */
  async simulateRemoveLiquidity(
    request: Types.SimulateRemoveLiquidityRequest
  ): Promise<Types.SimulateRemoveLiquidityResponse> {
    return this.client.ammPost<Types.SimulateRemoveLiquidityResponse>(
      "/v1/liquidity/remove/simulate",
      request
    );
  }

  // ===== Swap Endpoints =====

  /**
   * Execute swap
   * @POST /v1/swap
   * @requires Bearer token
   */
  async executeSwap(
    request: Types.ExecuteSwapRequest
  ): Promise<Types.SwapResponse> {
    return this.client.ammPost<Types.SwapResponse>("/v1/swap", request);
  }

  /**
   * Simulate swap
   * @POST /v1/swap/simulate
   */
  async simulateSwap(
    request: Types.SimulateSwapRequest
  ): Promise<Types.SimulateSwapResponse> {
    return this.client.ammPost<Types.SimulateSwapResponse>(
      "/v1/swap/simulate",
      request
    );
  }

  /**
   * Get swaps for a pool
   * @GET /v1/pools/{lpPubkey}/swaps
   */
  async getPoolSwaps(
    lpPubkey: string,
    query?: Types.ListPoolSwapsQuery
  ): Promise<Types.ListPoolSwapsResponse> {
    return this.client.ammGet<Types.ListPoolSwapsResponse>(
      `/v1/pools/${lpPubkey}/swaps`,
      { params: query as any }
    );
  }

  /**
   * Get global swaps
   * @GET /v1/swaps
   */
  async getGlobalSwaps(
    query?: Types.ListGlobalSwapsQuery
  ): Promise<Types.ListGlobalSwapsResponse> {
    return this.client.ammGet<Types.ListGlobalSwapsResponse>("/v1/swaps", {
      params: query as any,
    });
  }

  /**
   * Get user swaps
   * @GET /v1/swaps/user/{userPublicKey}
   */
  async getUserSwaps(
    userPublicKey: string,
    query?: Types.ListUserSwapsQuery
  ): Promise<Types.ListUserSwapsResponse> {
    return this.client.ammGet<Types.ListUserSwapsResponse>(
      `/v1/swaps/user/${userPublicKey}`,
      { params: query as any }
    );
  }

  // ===== Route Swap Endpoints =====

  /**
   * Execute route swap
   * @POST /v1/route-swap
   * @requires Bearer token
   */
  async executeRouteSwap(
    request: Types.ExecuteRouteSwapRequest
  ): Promise<Types.ExecuteRouteSwapResponse> {
    return this.client.ammPost<Types.ExecuteRouteSwapResponse>(
      "/v1/route-swap",
      request
    );
  }

  /**
   * Simulate route swap
   * @POST /v1/route-swap/simulate
   */
  async simulateRouteSwap(
    request: Types.SimulateRouteSwapRequest
  ): Promise<Types.SimulateRouteSwapResponse> {
    return this.client.ammPost<Types.SimulateRouteSwapResponse>(
      "/v1/route-swap/simulate",
      request
    );
  }

  // ===== Integrator Endpoints =====

  /**
   * Get integrator fees across all pools
   * @GET /v1/integrators/fees
   * @requires Bearer token
   */
  async getIntegratorFees(): Promise<Types.GetIntegratorFeesResponse> {
    return this.client.ammGet<Types.GetIntegratorFeesResponse>(
      "/v1/integrators/fees"
    );
  }

  /**
   * Get integrator fee withdrawal history
   * @GET /v1/integrators/fee-withdrawal-history
   * @requires Bearer token
   */
  async getIntegratorFeeWithdrawalHistory(
    query?: Types.FeeWithdrawalHistoryQuery
  ): Promise<Types.FeeWithdrawalHistoryResponse> {
    return this.client.ammGet<Types.FeeWithdrawalHistoryResponse>(
      "/v1/integrators/fee-withdrawal-history",
      { params: query as any }
    );
  }

  /**
   * Get pool integrator fees
   * @POST /v1/integrators/pool-fees
   * @requires Bearer token
   */
  async getPoolIntegratorFees(
    request: Types.GetPoolIntegratorFeesRequest
  ): Promise<Types.GetPoolIntegratorFeesResponse> {
    return this.client.ammPost<Types.GetPoolIntegratorFeesResponse>(
      "/v1/integrators/pool-fees",
      request
    );
  }

  /**
   * Withdraw integrator fees
   * @POST /v1/integrators/withdraw-fees
   * @requires Bearer token
   */
  async withdrawIntegratorFees(
    request: Types.WithdrawIntegratorFeesRequest
  ): Promise<Types.WithdrawIntegratorFeesResponse> {
    return this.client.ammPost<Types.WithdrawIntegratorFeesResponse>(
      "/v1/integrators/withdraw-fees",
      request
    );
  }

  // ===== Escrow Endpoints =====

  /**
   * Create a new escrow contract
   * @POST /v1/escrows/create
   * @requires Bearer token
   */
  async createEscrow(
    request: Types.CreateEscrowRequest
  ): Promise<Types.CreateEscrowResponse> {
    return this.client.ammPost<Types.CreateEscrowResponse>(
      "/v1/escrows/create",
      request
    );
  }

  /**
   * Fund an existing escrow contract
   * @POST /v1/escrows/fund
   * @requires Bearer token
   */
  async fundEscrow(
    request: Types.FundEscrowRequest
  ): Promise<Types.FundEscrowResponse> {
    return this.client.ammPost<Types.FundEscrowResponse>(
      "/v1/escrows/fund",
      request
    );
  }

  /**
   * Claim funds from an escrow contract
   * @POST /v1/escrows/claim
   * @requires Bearer token
   */
  async claimEscrow(
    request: Types.ClaimEscrowRequest
  ): Promise<Types.ClaimEscrowResponse> {
    return this.client.ammPost<Types.ClaimEscrowResponse>(
      "/v1/escrows/claim",
      request
    );
  }

  /**
   * Get the state of an escrow contract
   * @GET /v1/escrows/{escrowId}
   */
  async getEscrow(escrowId: string): Promise<Types.EscrowState> {
    return this.client.ammGet<Types.EscrowState>(`/v1/escrows/${escrowId}`);
  }

  // ===== Status Endpoints =====

  /**
   * Ping settlement service
   * @GET /v1/ping
   */
  async ping(): Promise<Types.SettlementPingResponse> {
    return this.client.ammGet<Types.SettlementPingResponse>("/v1/ping");
  }

  // ===== Config Endpoints =====

  /**
   * Get feature status flags
   * @GET /v1/config/feature-status
   */
  async getFeatureStatus(): Promise<Types.FeatureStatusResponse> {
    return this.client.ammGet<Types.FeatureStatusResponse>(
      "/v1/config/feature-status"
    );
  }

  /**
   * Get min amount configuration per asset
   * @GET /v1/config/min-amounts
   */
  async getMinAmounts(): Promise<Types.MinAmountsResponse> {
    return this.client.ammGet<Types.MinAmountsResponse>(
      "/v1/config/min-amounts"
    );
  }

  /**
   * Get allowed Asset B list for pool creation
   * @GET /v1/config/allowed-assets
   */
  async getAllowedAssets(): Promise<Types.AllowedAssetsResponse> {
    return this.client.ammGet<Types.AllowedAssetsResponse>(
      "/v1/config/allowed-assets"
    );
  }

  // ===== Clawback Endpoint =====
  /**
   * Clawback stuck funds sent to an LP wallet
   * @POST /v1/clawback
   * @requires Bearer token
   */
  async clawback(
    request: Types.ClawbackRequest
  ): Promise<Types.ClawbackResponse> {
    return this.client.ammPost<Types.ClawbackResponse>("/v1/clawback", request);
  }
}

/**
 * Error checking utilities
 */
export function isFlashnetError(
  error: unknown
): error is Types.FlashnetErrorResponse {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "msg" in error &&
    typeof (error as any).code === "number" &&
    typeof (error as any).msg === "string"
  );
}

export function isApiError(error: unknown): error is Types.ApiErrorResponse {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof (error as any).error === "object"
  );
}

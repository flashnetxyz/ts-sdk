import type * as Types from "../types";
import type { ApiClient } from "./client";
/**
 * Typed API endpoints for the Flashnet AMM Gateway
 */
export declare class TypedAmmApi {
    private client;
    constructor(client: ApiClient);
    /**
     * Request authentication challenge
     * @POST /v1/auth/challenge
     */
    getChallenge(request: Types.ChallengeRequest): Promise<Types.ChallengeResponse>;
    /**
     * Verify challenge and get access token
     * @POST /v1/auth/verify
     */
    verify(request: Types.VerifyRequest): Promise<Types.VerifyResponse>;
    /**
     * Register a new host
     * @POST /v1/hosts/register
     * @requires Bearer token
     */
    registerHost(request: Types.RegisterHostRequest): Promise<Types.RegisterHostResponse>;
    /**
     * Get host information
     * @GET /v1/hosts/{namespace}
     */
    getHost(namespace: string): Promise<Types.GetHostResponse>;
    /**
     * Withdraw host fees
     * @POST /v1/hosts/withdraw-fees
     * @requires Bearer token
     */
    withdrawHostFees(request: Types.WithdrawHostFeesRequest): Promise<Types.WithdrawHostFeesResponse>;
    /**
     * Get pool host fees
     * @POST /v1/hosts/pool-fees
     * @requires Bearer token
     */
    getPoolHostFees(request: Types.GetPoolHostFeesRequest): Promise<Types.GetPoolHostFeesResponse>;
    /**
     * Get host fees across all pools
     * @POST /v1/hosts/host-fees
     * @requires Bearer token
     */
    getHostFees(request: Types.GetHostFeesRequest): Promise<Types.GetHostFeesResponse>;
    /**
     * Get host fee withdrawal history
     * @GET /v1/hosts/fee-withdrawal-history
     * @requires Bearer token
     */
    getHostFeeWithdrawalHistory(query?: Types.FeeWithdrawalHistoryQuery): Promise<Types.FeeWithdrawalHistoryResponse>;
    /**
     * Create constant product pool
     * @POST /v1/pools/constant-product
     * @requires Bearer token
     */
    createConstantProductPool(request: Types.CreateConstantProductPoolRequest): Promise<Types.CreatePoolResponse>;
    /**
     * Create single-sided pool
     * @POST /v1/pools/single-sided
     * @requires Bearer token
     */
    createSingleSidedPool(request: Types.CreateSingleSidedPoolRequest): Promise<Types.CreatePoolResponse>;
    /**
     * Confirm initial deposit for single-sided pool
     * @POST /v1/pools/single-sided/confirm-initial-deposit
     * @requires Bearer token
     */
    confirmInitialDeposit(request: Types.ConfirmInitialDepositRequest): Promise<Types.ConfirmDepositResponse>;
    /**
     * List pools with filters
     * @GET /v1/pools
     */
    listPools(query?: Types.ListPoolsQuery): Promise<Types.ListPoolsResponse>;
    /**
     * Get pool details
     * @GET /v1/pools/{poolId}
     */
    getPool(poolId: string): Promise<Types.PoolDetailsResponse>;
    /**
     * Get LP position details
     * @GET /v1/pools/{poolId}/lp/{providerPublicKey}
     * @requires Bearer token
     */
    getLpPosition(poolId: string, providerPublicKey: string): Promise<Types.LpPositionDetailsResponse>;
    /**
     * Get all LP positions
     * @GET /v1/pools/lp
     * @requires Bearer token
     */
    getAllLpPositions(): Promise<Types.AllLpPositionsResponse>;
    /**
     * Add liquidity to pool
     * @POST /v1/liquidity/add
     * @requires Bearer token
     */
    addLiquidity(request: Types.AddLiquidityRequest): Promise<Types.AddLiquidityResponse>;
    /**
     * Simulate adding liquidity
     * @POST /v1/liquidity/add/simulate
     */
    simulateAddLiquidity(request: Types.SimulateAddLiquidityRequest): Promise<Types.SimulateAddLiquidityResponse>;
    /**
     * Remove liquidity from pool
     * @POST /v1/liquidity/remove
     * @requires Bearer token
     */
    removeLiquidity(request: Types.RemoveLiquidityRequest): Promise<Types.RemoveLiquidityResponse>;
    /**
     * Simulate removing liquidity
     * @POST /v1/liquidity/remove/simulate
     */
    simulateRemoveLiquidity(request: Types.SimulateRemoveLiquidityRequest): Promise<Types.SimulateRemoveLiquidityResponse>;
    /**
     * Execute swap
     * @POST /v1/swap
     * @requires Bearer token
     */
    executeSwap(request: Types.ExecuteSwapRequest): Promise<Types.SwapResponse>;
    /**
     * Simulate swap
     * @POST /v1/swap/simulate
     */
    simulateSwap(request: Types.SimulateSwapRequest): Promise<Types.SimulateSwapResponse>;
    /**
     * Get swaps for a pool
     * @GET /v1/pools/{lpPubkey}/swaps
     */
    getPoolSwaps(lpPubkey: string, query?: Types.ListPoolSwapsQuery): Promise<Types.ListPoolSwapsResponse>;
    /**
     * Get global swaps
     * @GET /v1/swaps
     */
    getGlobalSwaps(query?: Types.ListGlobalSwapsQuery): Promise<Types.ListGlobalSwapsResponse>;
    /**
     * Get user swaps
     * @GET /v1/swaps/user/{userPublicKey}
     */
    getUserSwaps(userPublicKey: string, query?: Types.ListUserSwapsQuery): Promise<Types.ListUserSwapsResponse>;
    /**
     * Execute route swap
     * @POST /v1/route-swap
     * @requires Bearer token
     */
    executeRouteSwap(request: Types.ExecuteRouteSwapRequest): Promise<Types.ExecuteRouteSwapResponse>;
    /**
     * Simulate route swap
     * @POST /v1/route-swap/simulate
     */
    simulateRouteSwap(request: Types.SimulateRouteSwapRequest): Promise<Types.SimulateRouteSwapResponse>;
    /**
     * Get integrator fees across all pools
     * @GET /v1/integrators/fees
     * @requires Bearer token
     */
    getIntegratorFees(): Promise<Types.GetIntegratorFeesResponse>;
    /**
     * Get integrator fee withdrawal history
     * @GET /v1/integrators/fee-withdrawal-history
     * @requires Bearer token
     */
    getIntegratorFeeWithdrawalHistory(query?: Types.FeeWithdrawalHistoryQuery): Promise<Types.FeeWithdrawalHistoryResponse>;
    /**
     * Get pool integrator fees
     * @POST /v1/integrators/pool-fees
     * @requires Bearer token
     */
    getPoolIntegratorFees(request: Types.GetPoolIntegratorFeesRequest): Promise<Types.GetPoolIntegratorFeesResponse>;
    /**
     * Withdraw integrator fees
     * @POST /v1/integrators/withdraw-fees
     * @requires Bearer token
     */
    withdrawIntegratorFees(request: Types.WithdrawIntegratorFeesRequest): Promise<Types.WithdrawIntegratorFeesResponse>;
    /**
     * Create a new escrow contract
     * @POST /v1/escrows/create
     * @requires Bearer token
     */
    createEscrow(request: Types.CreateEscrowRequest): Promise<Types.CreateEscrowResponse>;
    /**
     * Fund an existing escrow contract
     * @POST /v1/escrows/fund
     * @requires Bearer token
     */
    fundEscrow(request: Types.FundEscrowRequest): Promise<Types.FundEscrowResponse>;
    /**
     * Claim funds from an escrow contract
     * @POST /v1/escrows/claim
     * @requires Bearer token
     */
    claimEscrow(request: Types.ClaimEscrowRequest): Promise<Types.ClaimEscrowResponse>;
    /**
     * Get the state of an escrow contract
     * @GET /v1/escrows/{escrowId}
     */
    getEscrow(escrowId: string): Promise<Types.EscrowState>;
    /**
     * Ping settlement service
     * @GET /v1/ping
     */
    ping(): Promise<Types.SettlementPingResponse>;
    /**
     * Get feature status flags
     * @GET /v1/config/feature-status
     */
    getFeatureStatus(): Promise<Types.FeatureStatusResponse>;
    /**
     * Get min amount configuration per asset
     * @GET /v1/config/min-amounts
     */
    getMinAmounts(): Promise<Types.MinAmountsResponse>;
    /**
     * Get allowed Asset B list for pool creation
     * @GET /v1/config/allowed-assets
     */
    getAllowedAssets(): Promise<Types.AllowedAssetsResponse>;
    /**
     * Clawback stuck funds sent to an LP wallet
     * @POST /v1/clawback
     * @requires Bearer token
     */
    clawback(request: Types.ClawbackRequest): Promise<Types.ClawbackResponse>;
    /**
     * Check if a transfer is eligible for clawback
     * @POST /v1/check_clawback_eligibility
     * @requires Bearer token
     */
    checkClawbackEligibility(request: Types.CheckClawbackEligibilityRequest): Promise<Types.CheckClawbackEligibilityResponse>;
    /**
     * List transfers eligible for clawback
     * @GET /v1/clawback-transfers/list
     * @requires Bearer token
     */
    listClawbackableTransfers(query?: Types.ListClawbackableTransfersQuery): Promise<Types.ListClawbackableTransfersResponse>;
    /**
     * Create a new concentrated liquidity pool (V3)
     * @POST /v1/pools/concentrated
     * @requires Bearer token
     */
    createConcentratedPool(request: Types.CreateConcentratedPoolRequest): Promise<Types.CreateConcentratedPoolResponse>;
    /**
     * Increase liquidity in a V3 concentrated position
     * @POST /v1/concentrated/liquidity/increase
     * @requires Bearer token
     */
    increaseLiquidity(request: Types.IncreaseLiquidityRequest): Promise<Types.IncreaseLiquidityResponse>;
    /**
     * Decrease liquidity in a V3 concentrated position
     * @POST /v1/concentrated/liquidity/decrease
     * @requires Bearer token
     */
    decreaseLiquidity(request: Types.DecreaseLiquidityRequest): Promise<Types.DecreaseLiquidityResponse>;
    /**
     * Collect accumulated fees from a V3 position
     * @POST /v1/concentrated/fees/collect
     * @requires Bearer token
     */
    collectFees(request: Types.CollectFeesRequest): Promise<Types.CollectFeesResponse>;
    /**
     * Rebalance a V3 position to a new tick range
     * @POST /v1/concentrated/positions/rebalance
     * @requires Bearer token
     */
    rebalancePosition(request: Types.RebalancePositionRequest): Promise<Types.RebalancePositionResponse>;
    /**
     * List V3 concentrated liquidity positions
     * @GET /v1/concentrated/positions
     * @requires Bearer token
     */
    listConcentratedPositions(query?: Types.ListConcentratedPositionsQuery): Promise<Types.ListConcentratedPositionsResponse>;
    /**
     * Get pool liquidity distribution for visualization
     * @GET /v1/concentrated/pools/{poolId}/liquidity
     */
    getPoolLiquidity(poolId: string): Promise<Types.PoolLiquidityResponse>;
    /**
     * Get pool ticks for simulation
     * @GET /v1/concentrated/pools/{poolId}/ticks
     */
    getPoolTicks(poolId: string): Promise<Types.PoolTicksResponse>;
    /**
     * Get user's free balance for a specific V3 pool
     * @GET /v1/concentrated/balance/{poolId}
     * @requires Bearer token
     */
    getConcentratedBalance(poolId: string): Promise<Types.GetBalanceResponse>;
    /**
     * Get user's free balances across all V3 pools
     * @GET /v1/concentrated/balances
     * @requires Bearer token
     */
    getConcentratedBalances(): Promise<Types.GetBalancesResponse>;
    /**
     * Get user's free balance for a specific V3 pool (via balances endpoint)
     * @GET /v1/concentrated/balances/{poolId}
     * @requires Bearer token
     */
    getConcentratedBalanceByPool(poolId: string): Promise<Types.GetBalancesResponse>;
    /**
     * Withdraw free balance from a V3 pool to user's Spark wallet
     * @POST /v1/concentrated/balance/withdraw
     * @requires Bearer token
     */
    withdrawConcentratedBalance(request: Types.WithdrawBalanceRequest): Promise<Types.WithdrawBalanceResponse>;
    /**
     * Deposit to free balance in a V3 pool from Spark transfers
     * @POST /v1/concentrated/balance/deposit
     * @requires Bearer token
     */
    depositConcentratedBalance(request: Types.DepositBalanceRequest): Promise<Types.DepositBalanceResponse>;
}
/**
 * Error checking utilities
 */
/**
 * @deprecated Use isFlashnetError from types/errors instead
 * Check if error matches the legacy FlashnetErrorResponse format (code/msg)
 */
export declare function isLegacyFlashnetErrorResponse(error: unknown): error is Types.FlashnetErrorResponse;
/**
 * @deprecated Use isLegacyFlashnetErrorResponse - this name is reserved for FlashnetError class check
 */
export declare const isFlashnetError: typeof isLegacyFlashnetErrorResponse;
export declare function isApiError(error: unknown): error is Types.ApiErrorResponse;
//# sourceMappingURL=typed-endpoints.d.ts.map
'use strict';

/**
 * Typed API endpoints for the Flashnet AMM Gateway
 */
class TypedAmmApi {
    client;
    constructor(client) {
        this.client = client;
    }
    // Authentication Endpoints
    /**
     * Request authentication challenge
     * @POST /v1/auth/challenge
     */
    async getChallenge(request) {
        return this.client.ammPost("/v1/auth/challenge", request);
    }
    /**
     * Verify challenge and get access token
     * @POST /v1/auth/verify
     */
    async verify(request) {
        return this.client.ammPost("/v1/auth/verify", request);
    }
    // Host Endpoints
    /**
     * Register a new host
     * @POST /v1/hosts/register
     * @requires Bearer token
     */
    async registerHost(request) {
        return this.client.ammPost("/v1/hosts/register", request);
    }
    /**
     * Get host information
     * @GET /v1/hosts/{namespace}
     */
    async getHost(namespace) {
        return this.client.ammGet(`/v1/hosts/${namespace}`);
    }
    /**
     * Withdraw host fees
     * @POST /v1/hosts/withdraw-fees
     * @requires Bearer token
     */
    async withdrawHostFees(request) {
        return this.client.ammPost("/v1/hosts/withdraw-fees", request);
    }
    /**
     * Get pool host fees
     * @POST /v1/hosts/pool-fees
     * @requires Bearer token
     */
    async getPoolHostFees(request) {
        return this.client.ammPost("/v1/hosts/pool-fees", request);
    }
    /**
     * Get host fees across all pools
     * @POST /v1/hosts/host-fees
     * @requires Bearer token
     */
    async getHostFees(request) {
        return this.client.ammPost("/v1/hosts/fees", request);
    }
    /**
     * Get host fee withdrawal history
     * @GET /v1/hosts/fee-withdrawal-history
     * @requires Bearer token
     */
    async getHostFeeWithdrawalHistory(query) {
        return this.client.ammGet("/v1/hosts/fee-withdrawal-history", { params: query });
    }
    // Pool Endpoints
    /**
     * Create constant product pool
     * @POST /v1/pools/constant-product
     * @requires Bearer token
     */
    async createConstantProductPool(request) {
        return this.client.ammPost("/v1/pools/constant-product", request);
    }
    /**
     * Create single-sided pool
     * @POST /v1/pools/single-sided
     * @requires Bearer token
     */
    async createSingleSidedPool(request) {
        return this.client.ammPost("/v1/pools/single-sided", request);
    }
    /**
     * Confirm initial deposit for single-sided pool
     * @POST /v1/pools/single-sided/confirm-initial-deposit
     * @requires Bearer token
     */
    async confirmInitialDeposit(request) {
        return this.client.ammPost("/v1/pools/single-sided/confirm-initial-deposit", request);
    }
    /**
     * List pools with filters
     * @GET /v1/pools
     */
    async listPools(query) {
        return this.client.ammGet("/v1/pools", {
            params: query,
        });
    }
    /**
     * Get pool details
     * @GET /v1/pools/{poolId}
     */
    async getPool(poolId) {
        return this.client.ammGet(`/v1/pools/${poolId}`);
    }
    /**
     * Get LP position details
     * @GET /v1/pools/{poolId}/lp/{providerPublicKey}
     * @requires Bearer token
     */
    async getLpPosition(poolId, providerPublicKey) {
        return this.client.ammGet(`/v1/pools/${poolId}/lp/${providerPublicKey}`);
    }
    /**
     * Get all LP positions
     * @GET /v1/pools/lp
     * @requires Bearer token
     */
    async getAllLpPositions() {
        return this.client.ammGet("/v1/liquidity/positions");
    }
    // Liquidity Endpoints
    /**
     * Add liquidity to pool
     * @POST /v1/liquidity/add
     * @requires Bearer token
     */
    async addLiquidity(request) {
        return this.client.ammPost("/v1/liquidity/add", request);
    }
    /**
     * Simulate adding liquidity
     * @POST /v1/liquidity/add/simulate
     */
    async simulateAddLiquidity(request) {
        return this.client.ammPost("/v1/liquidity/add/simulate", request);
    }
    /**
     * Remove liquidity from pool
     * @POST /v1/liquidity/remove
     * @requires Bearer token
     */
    async removeLiquidity(request) {
        return this.client.ammPost("/v1/liquidity/remove", request);
    }
    /**
     * Simulate removing liquidity
     * @POST /v1/liquidity/remove/simulate
     */
    async simulateRemoveLiquidity(request) {
        return this.client.ammPost("/v1/liquidity/remove/simulate", request);
    }
    // Swap Endpoints
    /**
     * Execute swap
     * @POST /v1/swap
     * @requires Bearer token
     */
    async executeSwap(request) {
        return this.client.ammPost("/v1/swap", request);
    }
    /**
     * Simulate swap
     * @POST /v1/swap/simulate
     */
    async simulateSwap(request) {
        return this.client.ammPost("/v1/swap/simulate", request);
    }
    /**
     * Get swaps for a pool
     * @GET /v1/pools/{lpPubkey}/swaps
     */
    async getPoolSwaps(lpPubkey, query) {
        return this.client.ammGet(`/v1/pools/${lpPubkey}/swaps`, { params: query });
    }
    /**
     * Get global swaps
     * @GET /v1/swaps
     */
    async getGlobalSwaps(query) {
        return this.client.ammGet("/v1/swaps", {
            params: query,
        });
    }
    /**
     * Get user swaps
     * @GET /v1/swaps/user/{userPublicKey}
     */
    async getUserSwaps(userPublicKey, query) {
        return this.client.ammGet(`/v1/swaps/user/${userPublicKey}`, { params: query });
    }
    // Route Swap Endpoints
    /**
     * Execute route swap
     * @POST /v1/route-swap
     * @requires Bearer token
     */
    async executeRouteSwap(request) {
        return this.client.ammPost("/v1/route-swap", request);
    }
    /**
     * Simulate route swap
     * @POST /v1/route-swap/simulate
     */
    async simulateRouteSwap(request) {
        return this.client.ammPost("/v1/route-swap/simulate", request);
    }
    // Integrator Endpoints
    /**
     * Get integrator fees across all pools
     * @GET /v1/integrators/fees
     * @requires Bearer token
     */
    async getIntegratorFees() {
        return this.client.ammGet("/v1/integrators/fees");
    }
    /**
     * Get integrator fee withdrawal history
     * @GET /v1/integrators/fee-withdrawal-history
     * @requires Bearer token
     */
    async getIntegratorFeeWithdrawalHistory(query) {
        return this.client.ammGet("/v1/integrators/fee-withdrawal-history", { params: query });
    }
    /**
     * Get pool integrator fees
     * @POST /v1/integrators/pool-fees
     * @requires Bearer token
     */
    async getPoolIntegratorFees(request) {
        return this.client.ammPost("/v1/integrators/pool-fees", request);
    }
    /**
     * Withdraw integrator fees
     * @POST /v1/integrators/withdraw-fees
     * @requires Bearer token
     */
    async withdrawIntegratorFees(request) {
        return this.client.ammPost("/v1/integrators/withdraw-fees", request);
    }
    // Escrow Endpoints
    /**
     * Create a new escrow contract
     * @POST /v1/escrows/create
     * @requires Bearer token
     */
    async createEscrow(request) {
        return this.client.ammPost("/v1/escrows/create", request);
    }
    /**
     * Fund an existing escrow contract
     * @POST /v1/escrows/fund
     * @requires Bearer token
     */
    async fundEscrow(request) {
        return this.client.ammPost("/v1/escrows/fund", request);
    }
    /**
     * Claim funds from an escrow contract
     * @POST /v1/escrows/claim
     * @requires Bearer token
     */
    async claimEscrow(request) {
        return this.client.ammPost("/v1/escrows/claim", request);
    }
    /**
     * Get the state of an escrow contract
     * @GET /v1/escrows/{escrowId}
     */
    async getEscrow(escrowId) {
        return this.client.ammGet(`/v1/escrows/${escrowId}`);
    }
    // Status Endpoints
    /**
     * Ping settlement service
     * @GET /v1/ping
     */
    async ping() {
        return this.client.ammGet("/v1/ping");
    }
    // Config Endpoints
    /**
     * Get feature status flags
     * @GET /v1/config/feature-status
     */
    async getFeatureStatus() {
        return this.client.ammGet("/v1/config/feature-status");
    }
    /**
     * Get min amount configuration per asset
     * @GET /v1/config/min-amounts
     */
    async getMinAmounts() {
        return this.client.ammGet("/v1/config/min-amounts");
    }
    /**
     * Get allowed Asset B list for pool creation
     * @GET /v1/config/allowed-assets
     */
    async getAllowedAssets() {
        return this.client.ammGet("/v1/config/allowed-assets");
    }
    // Clawback Endpoint
    /**
     * Clawback stuck funds sent to an LP wallet
     * @POST /v1/clawback
     * @requires Bearer token
     */
    async clawback(request) {
        return this.client.ammPost("/v1/clawback", request);
    }
    /**
     * Check if a transfer is eligible for clawback
     * @POST /v1/check_clawback_eligibility
     * @requires Bearer token
     */
    async checkClawbackEligibility(request) {
        return this.client.ammPost("/v1/check_clawback_eligibility", request);
    }
    /**
     * List transfers eligible for clawback
     * @GET /v1/clawback-transfers/list
     * @requires Bearer token
     */
    async listClawbackableTransfers(query) {
        return this.client.ammGet("/v1/clawback-transfers/list", { params: query });
    }
    // V3 Concentrated Liquidity Endpoints
    /**
     * Create a new concentrated liquidity pool (V3)
     * @POST /v1/pools/concentrated
     * @requires Bearer token
     */
    async createConcentratedPool(request) {
        return this.client.ammPost("/v1/pools/concentrated", request);
    }
    /**
     * Increase liquidity in a V3 concentrated position
     * @POST /v1/concentrated/liquidity/increase
     * @requires Bearer token
     */
    async increaseLiquidity(request) {
        return this.client.ammPost("/v1/concentrated/liquidity/increase", request);
    }
    /**
     * Decrease liquidity in a V3 concentrated position
     * @POST /v1/concentrated/liquidity/decrease
     * @requires Bearer token
     */
    async decreaseLiquidity(request) {
        return this.client.ammPost("/v1/concentrated/liquidity/decrease", request);
    }
    /**
     * Collect accumulated fees from a V3 position
     * @POST /v1/concentrated/fees/collect
     * @requires Bearer token
     */
    async collectFees(request) {
        return this.client.ammPost("/v1/concentrated/fees/collect", request);
    }
    /**
     * Rebalance a V3 position to a new tick range
     * @POST /v1/concentrated/positions/rebalance
     * @requires Bearer token
     */
    async rebalancePosition(request) {
        return this.client.ammPost("/v1/concentrated/positions/rebalance", request);
    }
    /**
     * List V3 concentrated liquidity positions
     * @GET /v1/concentrated/positions
     * @requires Bearer token
     */
    async listConcentratedPositions(query) {
        return this.client.ammGet("/v1/concentrated/positions", { params: query });
    }
    /**
     * Get pool liquidity distribution for visualization
     * @GET /v1/concentrated/pools/{poolId}/liquidity
     */
    async getPoolLiquidity(poolId) {
        return this.client.ammGet(`/v1/concentrated/pools/${poolId}/liquidity`);
    }
    /**
     * Get pool ticks for simulation
     * @GET /v1/concentrated/pools/{poolId}/ticks
     */
    async getPoolTicks(poolId) {
        return this.client.ammGet(`/v1/concentrated/pools/${poolId}/ticks`);
    }
    /**
     * Get user's free balance for a specific V3 pool
     * @GET /v1/concentrated/balance/{poolId}
     * @requires Bearer token
     */
    async getConcentratedBalance(poolId) {
        return this.client.ammGet(`/v1/concentrated/balance/${poolId}`);
    }
    /**
     * Get user's free balances across all V3 pools
     * @GET /v1/concentrated/balances
     * @requires Bearer token
     */
    async getConcentratedBalances() {
        return this.client.ammGet("/v1/concentrated/balances");
    }
    /**
     * Get user's free balance for a specific V3 pool (via balances endpoint)
     * @GET /v1/concentrated/balances/{poolId}
     * @requires Bearer token
     */
    async getConcentratedBalanceByPool(poolId) {
        return this.client.ammGet(`/v1/concentrated/balances/${poolId}`);
    }
    /**
     * Withdraw free balance from a V3 pool to user's Spark wallet
     * @POST /v1/concentrated/balance/withdraw
     * @requires Bearer token
     */
    async withdrawConcentratedBalance(request) {
        return this.client.ammPost("/v1/concentrated/balance/withdraw", request);
    }
    /**
     * Deposit to free balance in a V3 pool from Spark transfers
     * @POST /v1/concentrated/balance/deposit
     * @requires Bearer token
     */
    async depositConcentratedBalance(request) {
        return this.client.ammPost("/v1/concentrated/balance/deposit", request);
    }
}
/**
 * Error checking utilities
 */
/**
 * @deprecated Use isFlashnetError from types/errors instead
 * Check if error matches the legacy FlashnetErrorResponse format (code/msg)
 */
function isLegacyFlashnetErrorResponse(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        "msg" in error &&
        typeof error.code === "number" &&
        typeof error.msg === "string");
}
function isApiError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "error" in error &&
        typeof error.error === "object");
}

exports.TypedAmmApi = TypedAmmApi;
exports.isApiError = isApiError;
exports.isLegacyFlashnetErrorResponse = isLegacyFlashnetErrorResponse;
//# sourceMappingURL=typed-endpoints.js.map

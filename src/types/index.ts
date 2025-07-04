// Network types (preserved custom type)
export type NetworkType =
  | "MAINNET"
  | "REGTEST"
  | "TESTNET"
  | "SIGNET"
  | "LOCAL";

// Wallet types (preserved custom type)
export interface WalletConfig {
  mnemonic: string;
  network: NetworkType;
}

// Spark address types (preserved custom type)
export interface SparkAddressData {
  identityPublicKey: string;
  network: NetworkType;
}

// Generic signer interface (preserved custom type)
export interface Signer {
  /**
   * Sign a message and return the signature
   * @param message - The message to sign (as Uint8Array)
   * @returns The signature as Uint8Array
   */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

// ===== Generated from OpenAPI Specification =====

// Authentication types
export interface ChallengeRequest {
  publicKey: string;
}

export interface ChallengeResponse {
  challenge: string;
  requestId: string;
}

export interface VerifyRequest {
  publicKey: string;
  signature: string;
}

export interface VerifyResponse {
  accessToken: string;
}

// Host types
export interface RegisterHostRequest {
  namespace: string;
  minFeeBps: number;
  feeRecipientPublicKey: string;
  nonce: string;
  signature: string;
}

export interface RegisterHostResponse {
  namespace: string;
  message: string;
}

export interface GetHostResponse {
  createdAt: string;
  feeRecipientPublicKey: string;
  flashnetSplitPercentage: number;
  minFeeBps: number;
  namespace: string;
}

export interface WithdrawHostFeesRequest {
  lpIdentityPublicKey: string;
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
  signature: string;
}

export interface WithdrawHostFeesResponse {
  requestId: string;
  accepted: boolean;
  assetAWithdrawn?: number;
  assetBWithdrawn?: number;
  transferIds?: WithdrawalTransferIds;
  error?: string;
}

export interface WithdrawalTransferIds {
  assetA?: string;
  assetB?: string;
}

// Host fee inquiry types
export interface GetPoolHostFeesRequest {
  hostNamespace: string;
  poolId: string;
}

export interface GetPoolHostFeesResponse {
  poolId: string;
  hostNamespace: string;
  feeRecipientType: string;
  assetAFees: string;
  assetBFees: string;
}

// Pool types
export interface CreateConstantProductPoolRequest {
  poolOwnerPublicKey: string;
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  integratorNamespace: string;
  nonce: string;
  signature: string;
}

export interface CreateSingleSidedPoolRequest {
  poolOwnerPublicKey: string;
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  assetAInitialReserve: string;
  assetAInitialVirtualReserve: string;
  assetBInitialVirtualReserve: string;
  threshold: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  hostNamespace?: string;
  nonce: string;
  signature: string;
}

export interface CreatePoolResponse {
  poolId: string;
  message: string;
}

export interface ConfirmInitialDepositRequest {
  poolId: string;
  assetASparkTransferId: string;
  nonce: string;
  signature: string;
  poolOwnerPublicKey?: string;
}

export interface ConfirmDepositResponse {
  poolId: string;
  confirmed: boolean;
  message: string;
}

// Liquidity types
export interface AddLiquidityRequest {
  userPublicKey: string;
  poolId: string;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  assetAAmountToAdd: string;
  assetBAmountToAdd: string;
  nonce: string;
  signature: string;
}

export interface AddLiquidityResponse {
  requestId: string;
  accepted: boolean;
  lpTokensMinted?: string;
  assetAAmountUsed?: number;
  assetBAmountUsed?: number;
  error?: string;
  refund?: RefundDetails;
}

export interface RefundDetails {
  assetAAmount?: number;
  assetBAmount?: number;
  assetATransferId?: string;
  assetBTransferId?: string;
}

export interface RemoveLiquidityRequest {
  userPublicKey: string;
  poolId: string;
  lpTokensToRemove: string;
  nonce: string;
  signature: string;
}

export interface RemoveLiquidityResponse {
  requestId: string;
  accepted: boolean;
  assetAWithdrawn?: number;
  assetBWithdrawn?: number;
  assetATransferId?: string;
  assetBTransferId?: string;
  error?: string;
}

export interface SimulateAddLiquidityRequest {
  poolId: string;
  assetAAmount: number;
  assetBAmount: number;
}

export interface SimulateAddLiquidityResponse {
  lpTokensToMint: string;
  assetAAmountToAdd: number;
  assetBAmountToAdd: number;
  assetARefundAmount: number;
  assetBRefundAmount: number;
  poolSharePercentage: string;
  warningMessage?: string;
}

export interface SimulateRemoveLiquidityRequest {
  poolId: string;
  providerPublicKey: string;
  lpTokensToRemove: string;
}

export interface SimulateRemoveLiquidityResponse {
  assetAAmount: number;
  assetBAmount: number;
  currentLpBalance: string;
  poolShareRemovedPercentage: string;
  warningMessage?: string;
}

// Swap types
export interface ExecuteSwapRequest {
  userPublicKey: string;
  poolId: string;
  assetInTokenPublicKey: string;
  assetOutTokenPublicKey: string;
  amountIn: string;
  minAmountOut: string;
  maxSlippageBps?: string;
  assetInSparkTransferId: string;
  nonce: string;
  signature: string;
}

export interface SwapResponse {
  requestId: string;
  accepted: boolean;
  amountOut?: number;
  feeAmount?: number;
  executionPrice?: string;
  assetOutPublicKey?: string;
  assetInPublicKey?: string;
  outboundTransferId?: string;
  error?: string;
  refundedAssetPublicKey?: string;
  refundedAmount?: number;
  refundTransferId?: string;
}

export interface SimulateSwapRequest {
  poolId: string;
  assetInTokenPublicKey: string;
  assetOutTokenPublicKey: string;
  amountIn: string;
}

export interface SimulateSwapResponse {
  amountOut: number;
  executionPrice?: string;
  feePaidAssetIn?: number;
  priceImpactPct?: string;
  warningMessage?: string;
}

// Pool listing types
export interface AmmPool {
  lpPubkey: string;
  hostName?: string;
  hostFeeBps: number;
  lpFeeBps: number;
  assetAPubkey: string;
  assetBPubkey: string;
  assetAReserve?: number;
  assetBReserve?: number;
  currentPriceAInB?: string;
  tvlAssetB?: number;
  volume24hAssetB?: number;
  priceChangePercent24h?: string;
  curveType?: string;
  threshold?: number;
  assetBVirtualReserve?: number;
  createdAt: string;
}

export interface ListPoolsQuery {
  assetATokenPublicKey?: string;
  assetBTokenPublicKey?: string;
  hostNames?: string[];
  minVolume24h?: number;
  minTvl?: number;
  curveTypes?: string[];
  sort?: PoolSortOrder;
  limit?: number;
  offset?: number;
}

export type PoolSortOrder =
  | "createdAtDesc"
  | "createdAtAsc"
  | "volume24hDesc"
  | "volume24hAsc"
  | "tvlDesc"
  | "tvlAsc";

export interface ListPoolsResponse {
  pools: AmmPool[];
  totalCount: number;
}

export interface PoolDetailsResponse {
  lpPubkey: string;
  hostName?: string;
  hostFeeBps: number;
  lpFeeBps: number;
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  actualAssetAReserve: number;
  actualAssetBReserve: number;
  currentPriceAInB?: string;
  tvlAssetB: number;
  volume24hAssetB: number;
  priceChangePercent24h?: string;
  curveType: string;
  threshold?: number;
  assetBVirtualReserve?: number;
  createdAt: string;
  status: string;
}

// LP Position types
export interface LpPositionDetailsResponse {
  providerPublicKey: string;
  poolId: string;
  lpTokensOwned: string;
  sharePercentage: string;
  valueAssetA: number;
  valueAssetB: number;
  principalAssetA?: number;
  principalAssetB?: number;
  unrealizedProfitLossAssetA?: string;
  unrealizedProfitLossAssetB?: string;
}

// Swap event types
export interface PoolSwapEvent {
  id: string;
  swapperPubkey: string;
  amountIn: number;
  amountOut: number;
  assetInAddress: string;
  assetOutAddress: string;
  price?: string;
  createdAt: string;
  feePaid: number;
  inboundTransferId: string;
  outboundTransferId: string;
}

export interface GlobalSwapEvent extends PoolSwapEvent {
  poolLpPubkey: string;
  poolType: string;
  poolAssetA?: string;
  poolAssetB?: string;
}

export interface UserSwapEvent {
  id: string;
  poolLpPubkey: string;
  amountIn: number;
  amountOut: number;
  assetInAddress: string;
  assetOutAddress: string;
  price?: string;
  timestamp: string;
  feePaid: number;
  poolAssetA?: string;
  poolAssetB?: string;
  inboundTransferId: string;
  outboundTransferId: string;
}

export interface ListPoolSwapsQuery {
  limit?: number;
  offset?: number;
}

export interface ListPoolSwapsResponse {
  swaps: PoolSwapEvent[];
  totalCount: number;
}

export interface ListGlobalSwapsQuery {
  limit?: number;
  offset?: number;
  pool_type?: string;
  asset_address?: string;
}

export interface ListGlobalSwapsResponse {
  swaps: GlobalSwapEvent[];
  totalCount: number;
}

export interface ListUserSwapsQuery {
  poolLpPubkey?: string;
  assetInTokenPublicKey?: string;
  assetOutTokenPublicKey?: string;
  minAmountIn?: number;
  maxAmountIn?: number;
  startTime?: string;
  endTime?: string;
  sort?: SwapSortOrder;
  limit?: number;
  offset?: number;
}

export type SwapSortOrder =
  | "timestampDesc"
  | "timestampAsc"
  | "amountInDesc"
  | "amountInAsc"
  | "amountOutDesc"
  | "amountOutAsc";

export interface ListUserSwapsResponse {
  swaps: UserSwapEvent[];
  totalCount: number;
}

// Settlement service types
export interface SettlementPingResponse {
  requestId: string;
  status: string;
  settlementTimestamp: string;
  gatewayTimestamp: string;
}

// Error types
export interface FlashnetErrorResponse {
  code: number;
  msg: string;
}

export interface ApiErrorResponse {
  error: ErrorDetail;
}

export interface ErrorDetail {
  code: string;
  message: string;
  requestId: string;
  details?: any;
}

export type ErrorCode =
  | "InvalidRequest"
  | "MissingParameter"
  | "InvalidParameter"
  | "InvalidSignature"
  | "InvalidNonce"
  | "Unauthorized"
  | "TokenExpired"
  | "InvalidToken"
  | "NotFound"
  | "PoolNotFound"
  | "UserNotFound"
  | "InsufficientLiquidity"
  | "InsufficientBalance"
  | "SlippageExceeded"
  | "MinAmountNotMet"
  | "PoolInactive"
  | "InvalidRatio"
  | "RateLimitExceeded"
  | "InternalError"
  | "ServiceUnavailable"
  | "Timeout";

// Legacy types for backward compatibility
export type ChallengeRequestData = ChallengeRequest;
export type ChallengeResponseData = ChallengeResponse;
export type VerifyRequestData = VerifyRequest;
export type VerifyResponseData = VerifyResponse;

// API Response wrapper (preserved custom type)
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// Additional custom types preserved from original
export interface Token {
  tokenPublicKey: string;
  name: string;
  ticker: string;
  decimals: number;
  iconUrl?: string;
}

// Intent message types (preserved custom types)
export interface ValidateAmmInitializeSingleSidedPoolData {
  poolOwnerPublicKey: string;
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  assetAInitialReserve: string;
  assetAInitialVirtualReserve: string;
  assetBInitialVirtualReserve: string;
  threshold: string;
  hostFeeShares: any[];
  totalHostFeeRateBps: string;
  lpFeeRateBps: string;
  nonce: string;
}

export interface ValidateAmmInitializeConstantProductPoolData {
  poolOwnerPublicKey: string;
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  hostFeeShares: any[];
  totalHostFeeRateBps: string;
  lpFeeRateBps: string;
  nonce: string;
}

export interface ValidateAmmConfirmInitialDepositData {
  poolOwnerPublicKey: string;
  lpIdentityPublicKey: string;
  assetASparkTransferId: string;
  nonce: string;
}

export interface ValidateAmmSwapData {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  assetASparkTransferId: string;
  assetInTokenPublicKey: string;
  assetOutTokenPublicKey: string;
  amountIn: string;
  minAmountOut: string;
  maxSlippageBps: string;
  nonce: string;
}

export interface AmmAddLiquiditySettlementRequest {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  assetAAmount: string;
  assetBAmount: string;
  nonce: string;
}

export interface AmmRemoveLiquiditySettlementRequest {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  lpTokensToRemove: string;
  nonce: string;
}

// Old interfaces mapped to new ones for compatibility
export interface Pool {
  pool_id: string;
  lp_pubkey: string;
  asset_a_pubkey: string;
  asset_b_pubkey: string;
  asset_a_reserve: string;
  asset_b_reserve: string;
  lp_token_supply: string;
  curve_type: "CONSTANT_PRODUCT" | "SINGLE_SIDED";
  lp_fee_rate_bps: number;
  total_host_fee_rate_bps: number;
}

export interface LpPosition {
  lpTokensOwned: number;
  valueAssetA: number;
  valueAssetB: number;
  principalAssetA: number | null;
  principalAssetB: number | null;
  unrealizedProfitLossAssetA: number;
  unrealizedProfitLossAssetB: number;
}

export interface RegisterHostIntentData {
  namespace: string;
  minFeeBps: number;
  feeRecipientPublicKey: string;
  nonce: string;
}

export interface ValidateAmmWithdrawHostFeesData {
  hostPublicKey: string;
  lpIdentityPublicKey: string;
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
}

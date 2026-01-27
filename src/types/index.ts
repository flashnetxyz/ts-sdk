/**
 * Spark network types - represents the actual Spark blockchain network
 * Used for address encoding, token identifiers, and wallet operations
 */
export type SparkNetworkType =
  | "MAINNET"
  | "REGTEST"
  | "TESTNET"
  | "SIGNET"
  | "LOCAL";

/**
 * Client environment types - represents the client configuration environment
 * Used for API endpoints, settlement services, and client behavior
 */
export type ClientEnvironment =
  | "mainnet"
  | "regtest"
  | "testnet"
  | "signet"
  | "local";

/**
 * Client network configuration interface
 * Contains all client-specific configuration (URLs, endpoints, etc.)
 */
export interface ClientNetworkConfig {
  ammGatewayUrl: string;
  mempoolApiUrl: string;
  explorerUrl: string;
  sparkScanUrl?: string;
}

/**
 * Configuration for FlashnetClient constructor
 * Supports both predefined environments and custom endpoint configurations
 */
export interface FlashnetClientConfig {
  /** Spark blockchain network for addresses and tokens */
  sparkNetworkType: SparkNetworkType;
  /**
   * Client configuration - can be either:
   * 1. A predefined environment name (e.g., 'mainnet', 'local')
   * 2. A custom configuration object with specific URLs
   */
  clientConfig: ClientEnvironment | ClientNetworkConfig;
  /** Optional: automatically authenticate on initialization */
  autoAuthenticate?: boolean;
}

/**
 * Enhanced configuration that allows full customization
 * This is the most flexible option for advanced users
 */
export interface FlashnetClientCustomConfig {
  /** Spark blockchain network for addresses and tokens */
  sparkNetworkType: SparkNetworkType;
  /** Custom client network configuration with specific URLs */
  clientNetworkConfig: ClientNetworkConfig;
  /** Optional: automatically authenticate on initialization */
  autoAuthenticate?: boolean;
}

/**
 * Configuration using predefined environments
 * This is the recommended option for most users
 */
export interface FlashnetClientEnvironmentConfig {
  /** Spark blockchain network for addresses and tokens */
  sparkNetworkType: SparkNetworkType;
  /** Predefined client environment */
  clientEnvironment: ClientEnvironment;
  /** Optional: automatically authenticate on initialization */
  autoAuthenticate?: boolean;
}

/**
 * Legacy configuration for backward compatibility
 * @deprecated Use FlashnetClientConfig with sparkNetworkType and clientEnvironment instead
 */
export interface FlashnetClientLegacyConfig {
  /** @deprecated Use sparkNetworkType and clientEnvironment instead */
  network?: NetworkType;
  /** Optional: automatically authenticate on initialization */
  autoAuthenticate?: boolean;
}

// BACKWARD COMPATIBILITY TYPES

/**
 * @deprecated Use SparkNetworkType for Spark networks and ClientEnvironment for client configuration
 * This type will be removed in v3.0.0
 */
export type NetworkType =
  | "MAINNET"
  | "REGTEST"
  | "TESTNET"
  | "SIGNET"
  | "LOCAL";

// TYPE CONVERSION UTILITIES

/**
 * Maps legacy NetworkType to SparkNetworkType
 * @deprecated For migration purposes only
 */
export function getSparkNetworkFromLegacy(
  networkType: NetworkType
): SparkNetworkType {
  // LOCAL maps to REGTEST for Spark operations
  return networkType === "LOCAL"
    ? "REGTEST"
    : (networkType as SparkNetworkType);
}

/**
 * Maps legacy NetworkType to ClientEnvironment
 * @deprecated For migration purposes only
 */
export function getClientEnvironmentFromLegacy(
  networkType: NetworkType
): ClientEnvironment {
  return networkType.toLowerCase() as ClientEnvironment;
}

/**
 * Type guard to check if a value is a valid SparkNetworkType
 */
export function isSparkNetworkType(value: unknown): value is SparkNetworkType {
  return (
    typeof value === "string" &&
    ["MAINNET", "REGTEST", "TESTNET", "SIGNET"].includes(value)
  );
}

/**
 * Type guard to check if a value is a valid ClientEnvironment
 */
export function isClientEnvironment(
  value: unknown
): value is ClientEnvironment {
  return (
    typeof value === "string" &&
    ["mainnet", "regtest", "testnet", "signet", "local"].includes(value)
  );
}

// Wallet types (preserved custom type)
export interface WalletConfig {
  mnemonic: string;
  /** @deprecated Use SparkNetworkType instead */
  network: NetworkType;
}

// Spark address types (preserved custom type)
export interface SparkAddressData {
  identityPublicKey: string;
  /** @deprecated Use SparkNetworkType instead */
  network: NetworkType;
}

/**
 * New Spark address data interface using SparkNetworkType
 */
export interface SparkAddressDataNew {
  identityPublicKey: string;
  network: SparkNetworkType;
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

// Generated from OpenAPI Specification

// Authentication types
export interface ChallengeRequest {
  publicKey: string;
}

export interface ChallengeResponse {
  challenge: string;
  challengeString: string;
  requestId: string;
}

export interface VerifyRequest {
  publicKey: string;
  signature: string;
}

export interface VerifyResponse {
  accessToken: string;
}

// Error types
export type ErrorSeverity = "Info" | "Warning" | "Error" | "Critical";

export interface FlashnetGatewayErrorSchema {
  errorCode: string;
  errorCategory: string;
  message: string;
  details?: any;
  requestId: string;
  timestamp: string;
  service: string;
  severity: string;
  remediation?: string;
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
  namespace: string;
  feeRecipientPublicKey: string;
  minFeeBps: number;
  flashnetSplitPercentage: number;
  createdAt: string;
}

export interface WithdrawHostFeesRequest {
  lpIdentityPublicKey: string;
  assetBAmount?: string;
  nonce: string;
  signature: string;
}

export interface WithdrawHostFeesResponse {
  requestId: string;
  accepted: boolean;
  assetAWithdrawn?: string;
  assetBWithdrawn?: string;
  transferId?: string;
  error?: string;
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

// Integrator types
export interface WithdrawIntegratorFeesRequest {
  integratorPublicKey: string;
  lpIdentityPublicKey: string;
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
  signature: string;
}

export interface WithdrawIntegratorFeesResponse {
  requestId: string;
  accepted: boolean;
  assetAWithdrawn?: string;
  assetBWithdrawn?: string;
  transferId?: string;
  error?: string;
}

// Pool types
export interface CreateConstantProductPoolRequest {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  hostNamespace?: string;
  nonce: string;
  signature: string;
}

export interface CreateSingleSidedPoolRequest {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  assetAInitialReserve: string;
  virtualReserveA: string;
  virtualReserveB: string;
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
  assetAMinAmountIn: string;
  assetBMinAmountIn: string;
  nonce: string;
  signature: string;
}

export interface AddLiquidityResponse {
  requestId: string;
  accepted: boolean;
  lpTokensMinted?: string;
  assetAAmountUsed?: string;
  assetBAmountUsed?: string;
  error?: string;
  refund?: RefundDetails;
}

export interface RefundDetails {
  assetAAmount?: string;
  assetBAmount?: string;
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
  assetAWithdrawn?: string;
  assetBWithdrawn?: string;
  assetATransferId?: string;
  assetBTransferId?: string;
  error?: string;
}

export interface SimulateAddLiquidityRequest {
  poolId: string;
  assetAAmount: string;
  assetBAmount: string;
}

export interface SimulateAddLiquidityResponse {
  lpTokensToMint: string;
  assetAAmountToAdd: string;
  assetBAmountToAdd: string;
  assetARefundAmount: string;
  assetBRefundAmount: string;
  poolSharePercentage: string;
  warningMessage?: string;
}

export interface SimulateRemoveLiquidityRequest {
  poolId: string;
  providerPublicKey: string;
  lpTokensToRemove: string;
}

export interface SimulateRemoveLiquidityResponse {
  assetAAmount: string;
  assetBAmount: string;
  currentLpBalance: string;
  poolShareRemovedPercentage: string;
  warningMessage?: string;
}

// Swap types
export interface ExecuteSwapRequest {
  userPublicKey: string;
  poolId: string;
  assetInAddress: string;
  assetOutAddress: string;
  amountIn: string;
  maxSlippageBps?: string;
  minAmountOut: string;
  assetInSparkTransferId: string;
  nonce: string;
  totalIntegratorFeeRateBps: string;
  integratorPublicKey: string;
  signature: string;
}

export interface SwapResponse {
  requestId: string;
  accepted: boolean;
  amountOut?: string;
  feeAmount?: string;
  executionPrice?: string;
  assetOutAddress?: string;
  assetInAddress?: string;
  outboundTransferId?: string;
  error?: string;
  refundedAssetAddress?: string;
  refundedAmount?: string;
  refundTransferId?: string;
}

export interface SimulateSwapRequest {
  poolId: string;
  assetInAddress: string;
  assetOutAddress: string;
  amountIn: string;
  integratorBps?: number;
}

export interface SimulateSwapResponse {
  amountOut: string;
  executionPrice?: string;
  feePaidAssetIn?: string;
  priceImpactPct?: string;
  warningMessage?: string;
}

// Route swap types
export interface RouteHopRequest {
  poolId: string;
  assetInAddress: string;
  assetOutAddress: string;
  /**
   * Integrator fee rate for this hop in basis points (as a string). The property must be present in the request
   * payload and can be explicitly set to null when no hop-level integrator fee is specified.
   */
  hopIntegratorFeeRateBps?: string | null;
}

export interface RouteHop {
  poolId: string;
  assetInAddress: string;
  assetOutAddress: string;
}

export interface ExecuteRouteSwapRequest {
  userPublicKey: string;
  hops: RouteHopRequest[];
  initialSparkTransferId: string;
  inputAmount: string;
  maxRouteSlippageBps: string;
  minAmountOut: string;
  nonce: string;
  signature: string;
  integratorFeeRateBps?: string;
  integratorPublicKey?: string;
}

export interface ExecuteRouteSwapResponse {
  requestId: string;
  accepted: boolean;
  outputAmount: string;
  executionPrice: string;
  finalOutboundTransferId: string;
  error?: string;
  refundedAssetPublicKey?: string;
  refundedAmount?: string;
  refundTransferId?: string;
}

export interface SimulateRouteSwapRequest {
  hops: RouteHop[];
  amountIn: string;
  maxRouteSlippageBps: string;
}

export interface SimulateRouteSwapResponse {
  outputAmount: string;
  executionPrice: string;
  totalLpFees: string;
  totalHostFees: string;
  totalPriceImpactPct: string;
  hopBreakdown: HopResult[];
  warningMessage?: string;
}

// Legacy alias for backward compatibility
export interface RouteSwapSimulationResponse
  extends SimulateRouteSwapResponse {}

export interface HopResult {
  poolId: string;
  amountIn: string;
  amountOut: string;
  priceImpactPct: string;
}

export interface AmmPool {
  lpPublicKey: string;
  hostName?: string;
  hostFeeBps: number;
  lpFeeBps: number;
  assetAAddress: string;
  assetBAddress: string;
  assetAReserve?: string;
  assetBReserve?: string;
  virtualReserveA?: string;
  virtualReserveB?: string;
  thresholdPct?: number;
  currentPriceAInB?: string;
  tvlAssetB?: string;
  volume24hAssetB?: string;
  priceChangePercent24h?: string;
  curveType?: string;
  initialReserveA?: string;
  bondingProgressPercent?: string;
  graduationThresholdAmount?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListPoolsQuery {
  assetAAddress?: string;
  assetBAddress?: string;
  hostNames?: string[];
  minVolume24h?: number;
  minTvl?: number;
  curveTypes?: string[];
  sort?: PoolSortOrder;
  limit?: number;
  offset?: number;
  /** RFC3339 timestamp to filter pools updated after the given date */
  afterUpdatedAt?: string;
}

export type PoolSortOrder =
  | "CREATED_AT_DESC"
  | "CREATED_AT_ASC"
  | "VOLUME24H_DESC"
  | "VOLUME24H_ASC"
  | "TVL_DESC"
  | "TVL_ASC";

export interface ListPoolsResponse {
  pools: AmmPool[];
  totalCount: number;
}

export interface PoolDetailsResponse {
  lpPublicKey: string;
  hostName?: string;
  hostFeeBps: number;
  lpFeeBps: number;
  assetAAddress: string;
  assetBAddress: string;
  assetAReserve: string;
  assetBReserve: string;
  virtualReserveA?: string;
  virtualReserveB?: string;
  thresholdPct?: number;
  currentPriceAInB?: string;
  tvlAssetB: string;
  volume24hAssetB: string;
  priceChangePercent24h?: string;
  curveType: string;
  initialReserveA?: string;
  bondingProgressPercent?: string;
  graduationThresholdAmount?: string;
  createdAt: string;
  status: string;
}

// LP Position types
export interface LpPositionDetailsResponse {
  providerPublicKey: string;
  poolId: string;
  lpTokensOwned: string;
  sharePercentage: string;
  valueAssetA: string;
  valueAssetB: string;
  principalAssetA?: string;
  principalAssetB?: string;
  unrealizedProfitLossAssetA?: string;
  unrealizedProfitLossAssetB?: string;
}

// Multiple LP positions response
export interface LpPositionInfo {
  poolId: string;
  lpFeeRateBps: number;
  assetAAddress: string;
  assetBAddress: string;
  lpTokenSupply: string;
  userLpTokens: string;
  userShareOfPoolPercent: string;
  assetAAmount: string;
  assetBAmount: string;
}

export interface AllLpPositionsResponse {
  lpPublicKey: string;
  positions: LpPositionInfo[];
}

// Swap event types
export interface PoolSwapEvent {
  id: string;
  swapperPublicKey: string;
  amountIn: string;
  amountOut: string;
  assetInAddress: string;
  assetOutAddress: string;
  price?: string;
  createdAt: string;
  feePaid: string;
  inboundTransferId: string;
  outboundTransferId: string;
}

export interface GlobalSwapEvent extends PoolSwapEvent {
  poolLpPublicKey: string;
  poolType: string;
  poolAssetAAddress?: string;
  poolAssetBAddress?: string;
}

export interface UserSwapEvent {
  id: string;
  poolLpPublicKey: string;
  amountIn: string;
  amountOut: string;
  assetInAddress: string;
  assetOutAddress: string;
  price?: string;
  timestamp: string;
  feePaid: string;
  poolAssetAAddress?: string;
  poolAssetBAddress?: string;
  inboundTransferId: string;
  outboundTransferId: string;
}

export interface ListPoolSwapsQuery {
  /** ISO8601 start time to filter swaps */
  startTime?: string;
  /** ISO8601 end time to filter swaps */
  endTime?: string;
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
  /** ISO8601 start time to filter swaps */
  start_time?: string;
  /** ISO8601 end time to filter swaps */
  end_time?: string;
}

export interface ListGlobalSwapsResponse {
  swaps: GlobalSwapEvent[];
  totalCount: number;
}

export interface ListUserSwapsQuery {
  poolLpPubkey?: string;
  assetInAddress?: string;
  assetOutAddress?: string;
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

// Config Endpoints Types

export type FeatureName =
  | "master_kill_switch"
  | "allow_withdraw_fees"
  | "allow_pool_creation"
  | "allow_swaps"
  | "allow_add_liquidity"
  | "allow_route_swaps"
  | "allow_withdraw_liquidity";

export interface FeatureStatusItem {
  feature_name: FeatureName;
  enabled: boolean;
  reason: string | null;
}

export type FeatureStatusResponse = FeatureStatusItem[];

export interface MinAmountItem {
  asset_identifier: string;
  min_amount: string | number;
  enabled: boolean;
}

export type MinAmountsResponse = MinAmountItem[];

export interface AllowedAssetItem {
  asset_identifier: string;
  asset_name: string | null;
  enabled: boolean;
}

export type AllowedAssetsResponse = AllowedAssetItem[];

// Define Network enum locally to avoid spark-sdk dependency
export enum Network {
  MAINNET = 0,
  REGTEST = 1,
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
  tokenIdentifier: string;
  tokenAddress: string;
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  iconUrl?: string;
}

// Intent message types (preserved custom types)
export interface ValidateAmmInitializeSingleSidedPoolData {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  assetAInitialReserve: string;
  virtualReserveA: string;
  virtualReserveB: string;
  threshold: string; // Amount of asset A that must be sold to graduate to constant product
  totalHostFeeRateBps: string;
  lpFeeRateBps: string;
  nonce: string;
}

export interface ValidateAmmInitializeConstantProductPoolData {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
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
  assetInSparkTransferId: string;
  assetInAddress: string;
  assetOutAddress: string;
  amountIn: string;
  minAmountOut: string;
  maxSlippageBps: string;
  nonce: string;
  totalIntegratorFeeRateBps: string;
}

export interface AmmAddLiquiditySettlementRequest {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  assetAAmount: string;
  assetBAmount: string;
  assetAMinAmountIn: string;
  assetBMinAmountIn: string;
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
  lpTokensOwned: string;
  valueAssetA: string;
  valueAssetB: string;
  principalAssetA: string | null;
  principalAssetB: string | null;
  unrealizedProfitLossAssetA: string;
  unrealizedProfitLossAssetB: string;
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
  assetBAmount?: string;
  nonce: string;
}

// Route swap validation types
export interface RouteHopValidation {
  lpIdentityPublicKey: string;
  inputAssetAddress: string;
  outputAssetAddress: string;
  hopIntegratorFeeRateBps?: string | null;
}

export interface ValidateRouteSwapData {
  userPublicKey: string;
  hops: RouteHopValidation[];
  initialSparkTransferId: string;
  inputAmount: string;
  minFinalOutputAmount: string;
  maxRouteSlippageBps: string;
  nonce: string;
  defaultIntegratorFeeRateBps?: string;
}

// Backward compatibility aliases (deprecated)
/** @deprecated Use assetAAddress instead */
export type AssetATokenPublicKey = string;
/** @deprecated Use assetBAddress instead */
export type AssetBTokenPublicKey = string;
/** @deprecated Use assetInAddress instead */
export type AssetInTokenPublicKey = string;
/** @deprecated Use assetOutAddress instead */
export type AssetOutTokenPublicKey = string;

// Integrator fees validation types
export interface ValidateAmmWithdrawIntegratorFeesData {
  integratorPublicKey: string;
  lpIdentityPublicKey: string;
  assetBAmount?: string;
  nonce: string;
}

// Clawback validation data
export interface ValidateClawbackData {
  senderPublicKey: string;
  sparkTransferId: string;
  lpIdentityPublicKey: string;
  nonce: string;
}

// Host fees for all pools types
export interface GetHostFeesRequest {
  hostNamespace: string;
}

export interface HostPoolFees {
  poolId: string;
  assetBPubkey: string;
  assetBFees: string;
}

export interface GetHostFeesResponse {
  hostNamespace: string;
  feeRecipientType: string;
  pools: HostPoolFees[];
  totalAssetBFees?: string;
}

// Integrator fees types
export interface IntegratorPoolFees {
  poolId: string;
  hostNamespace?: string;
  assetBPubkey: string;
  assetBFees: string;
}

export interface GetIntegratorFeesResponse {
  integratorPublicKey: string;
  pools: IntegratorPoolFees[];
  totalAssetBFees?: string;
}

export interface GetPoolIntegratorFeesRequest {
  poolId: string;
}

export interface GetPoolIntegratorFeesResponse {
  poolId: string;
  integratorPublicKey: string;
  assetBFees: string;
}

export interface FeeWithdrawalRecord {
  lpPubkey: string;
  asset: string;
  amount: string;
  transferId: string;
  timestamp: string;
}

export interface FeeWithdrawalHistoryResponse {
  withdrawals: FeeWithdrawalRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalWithdrawn?: string;
}

export interface FeeWithdrawalHistoryQuery {
  page?: number;
  pageSize?: number;
  lpPubkey?: string;
  assetB?: string;
  fromDate?: string;
  toDate?: string;
  sortOrder?: "desc" | "asc";
}

export interface TransferAssetRecipient {
  receiverSparkAddress: string;
  assetAddress: string;
  amount: string;
}

// Escrow Types

// --- Escrow Intent Validation Data ---

/**
 * Data for validating an escrow claim intent.
 */
export interface ValidateEscrowClaimData {
  escrowId: string;
  recipientPublicKey: string;
  nonce: string;
}

/**
 * Data for validating an escrow fund intent.
 */
export interface ValidateEscrowFundData {
  escrowId: string;
  creatorPublicKey: string;
  sparkTransferId: string;
  nonce: string;
}

/**
 * A recipient in an escrow contract for intent validation.
 */
export interface EscrowRecipient {
  recipientId: string;
  amount: string;
  hasClaimed: boolean;
  claimedAt?: string;
}

/**
 * Time comparison types for time-based conditions.
 */
export enum TimeComparison {
  TIME_COMPARISON_UNSPECIFIED = 0,
  TIME_COMPARISON_AFTER = 1,
  TIME_COMPARISON_BEFORE = 2,
  TIME_COMPARISON_BETWEEN = 3,
}

/**
 * Time-based condition data for intent validation.
 */
export interface TimeConditionData {
  comparison: TimeComparison;
  timestampStart: string;
  timestampEnd?: string;
}

/**
 * AMM phase values for AMM state conditions.
 */
export enum AmmPhase {
  AMM_PHASE_UNSPECIFIED = 0,
  AMM_PHASE_SINGLE_SIDED = 1,
  AMM_PHASE_DOUBLE_SIDED = 2,
  AMM_PHASE_GRADUATED = 3,
}

/**
 * AMM state check types for intent validation.
 */
export enum AmmStateCheckType {
  PHASE = 0,
  MINIMUM_RESERVE = 1,
  EXISTS = 2,
}

/**
 * AMM state condition data for intent validation.
 */
export interface AmmStateConditionData {
  ammId: string;
  checkType: AmmStateCheckType;
  requiredPhase?: AmmPhase;
  minimumReserveAmount?: string;
  mustExist?: boolean;
}

/**
 * Logical condition data for AND/OR operations for intent validation.
 */
export interface LogicalConditionData {
  conditions: EscrowCondition[];
}

/**
 * Types of conditions for escrow for intent validation.
 */
export enum ConditionType {
  TIME = 0,
  AMM_STATE = 1,
  LOGICAL = 2,
}

/**
 * Generic escrow condition for intent validation.
 */
export interface EscrowCondition {
  conditionType: ConditionType;
  timeCondition?: TimeConditionData;
  ammStateCondition?: AmmStateConditionData;
  logicalCondition?: LogicalConditionData;
}

/**
 * Data for validating an escrow creation intent.
 */
export interface ValidateEscrowCreateData {
  creatorPublicKey: string;
  assetId: string;
  assetAmount: string;
  recipients: EscrowRecipient[];
  claimConditions: EscrowCondition[];
  abandonHost?: string;
  abandonConditions?: EscrowCondition[];
  nonce: string;
}

// --- Escrow API Types ---

/**
 * Recipient definition for escrow creation API request.
 */
export interface EscrowRecipientInput {
  id: string;
  amount: string;
}

/**
 * Flexible condition definition for API requests.
 */
export type Condition = LogicCondition | TimeCondition | AmmStateCondition;

interface LogicCondition {
  conditionType: "and" | "or";
  data: {
    conditions: Condition[];
  };
}

interface TimeCondition {
  conditionType: "time";
  data: {
    comparison: "after" | "before";
    timestamp: string;
  };
}

interface AmmStateCondition {
  conditionType: "amm_state";
  data: {
    ammId: string;
    stateCheck:
      | {
          type: "minimum_reserve";
          asset: "A" | "B";
          min: string;
        }
      | {
          type: "phase";
          phase: "double_sided";
        };
  };
}

/**
 * Request body for creating a new escrow contract.
 */
export interface CreateEscrowRequest {
  creatorPublicKey: string;
  assetId: string;
  assetAmount: string;
  recipients: EscrowRecipientInput[];
  claimConditions: Condition[];
  abandonHost?: string;
  abandonConditions?: Condition[];
  nonce: string;
  signature: string;
}

/**
 * Response after successfully initiating escrow creation.
 */
export interface CreateEscrowResponse {
  requestId: string;
  escrowId: string;
  depositAddress: string;
  message: string;
}

/**
 * Request body for funding an escrow contract.
 */
export interface FundEscrowRequest {
  escrowId: string;
  sparkTransferId: string;
  nonce: string;
  signature: string;
}

// CLAWBACK TYPES

export interface ClawbackRequest {
  senderPublicKey: string;
  sparkTransferId: string;
  lpIdentityPublicKey: string;
  nonce: string;
  signature: string;
}

export interface CheckClawbackEligibilityRequest {
  sparkTransferId: string;
}

export interface CheckClawbackEligibilityResponse {
  accepted: boolean;
  error?: string;
}

// Query parameters for listing clawbackable transfers
export interface ListClawbackableTransfersQuery {
  limit?: number; // 1-500, default 20
  offset?: number; // min 0, default 0
}

// Single clawback transfer with ID and timestamp
export interface ClawbackTransfer {
  id: string;
  lpIdentityPublicKey: string;
  createdAt?: string; // RFC3339 format, optional
}

// Response for listing clawbackable transfers
export interface ListClawbackableTransfersResponse {
  transfers: ClawbackTransfer[];
}

/**
 * Response after successfully funding an escrow contract.
 */
export interface FundEscrowResponse {
  requestId: string;
  escrowId: string;
  status: string;
  message: string;
}

/**
 * Request body for claiming funds from an escrow contract.
 */
export interface ClaimEscrowRequest {
  escrowId: string;
  nonce: string;
  signature: string;
}

/**
 * Response after successfully initiating an escrow claim.
 */
export interface ClaimEscrowResponse {
  requestId: string;
  escrowId: string;
  recipientId: string;
  claimedAmount: string;
  outboundTransferId: string;
  message: string;
}

/**
 * Status of an escrow contract.
 */
export type EscrowStatus =
  | "PENDING_FUNDING"
  | "ACTIVE"
  | "COMPLETED"
  | "ABANDONED";

/**
 * Asset held in escrow.
 */
export interface Asset {
  id: string;
  amount: string;
}

/**
 * Recipient state within an active escrow.
 */
export interface EscrowRecipientState {
  id: string;
  amount: string;
  hasClaimed: boolean;
  claimedAt?: string;
}

/**
 * Complete state of an escrow contract.
 */
export interface EscrowState {
  id: string;
  asset: Asset;
  recipients: EscrowRecipientState[];
  status: EscrowStatus;
  claimConditions: Condition[];
  abandonHost?: string;
  abandonConditions?: Condition[];
  createdAt: string;
  updatedAt: string;
  totalClaimed: string;
}

export interface ClawbackResponse {
  requestId: string;
  accepted: boolean;
  internalRequestId: string;
  sparkStatusTrackingId: string;
  error?: string;
}

// VALIDATION UTILITIES

/**
 * Validation result interface for client-side validations
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates that a single-sided pool threshold is within acceptable range (20%-90% of initial reserve)
 * @param threshold - Amount of asset A that must be sold to graduate to constant product
 * @param assetAInitialReserve - Initial reserve amount for asset A
 * @returns Validation result with error message if invalid
 */
export function validateSingleSidedPoolThreshold(
  threshold: string,
  assetAInitialReserve: string
): ValidationResult {
  try {
    const thresholdNum = BigInt(threshold);
    const initialReserveNum = BigInt(assetAInitialReserve);

    if (thresholdNum <= 0n || initialReserveNum <= 0n) {
      return {
        isValid: false,
        error: "Threshold and initial reserve must be positive values",
      };
    }

    // Calculate 20% and 90% thresholds
    const minThreshold = (initialReserveNum * BigInt(20)) / BigInt(100); // 20%
    const maxThreshold = (initialReserveNum * BigInt(90)) / BigInt(100); // 90%

    if (thresholdNum < minThreshold) {
      return {
        isValid: false,
        error: `Threshold must be at least 20% of initial reserve (minimum: ${minThreshold.toString()})`,
      };
    }

    if (thresholdNum > maxThreshold) {
      return {
        isValid: false,
        error: `Threshold must not exceed 90% of initial reserve (maximum: ${maxThreshold.toString()})`,
      };
    }

    return { isValid: true };
  } catch (_error) {
    return {
      isValid: false,
      error: "Invalid number format for threshold or initial reserve",
    };
  }
}

/**
 * Calculates the percentage that a threshold represents of the initial reserve
 * @param threshold - Amount of asset A that must be sold
 * @param assetAInitialReserve - Initial reserve amount for asset A
 * @returns Percentage as a number (e.g., 25.5 for 25.5%)
 */
export function calculateThresholdPercentage(
  threshold: string,
  assetAInitialReserve: string
): number {
  try {
    const thresholdNum = BigInt(threshold);
    const initialReserveNum = BigInt(assetAInitialReserve);

    if (initialReserveNum === 0n) {
      return 0;
    }

    // Calculate percentage with precision
    const percentage = (thresholdNum * BigInt(10000)) / initialReserveNum;
    return Number(percentage) / 100; // Convert back to percentage
  } catch (_error) {
    return 0;
  }
}

// V3 CONCENTRATED LIQUIDITY TYPES

// --- V3 Intent Validation Data Types ---

/**
 * Data for validating a create concentrated pool intent.
 */
export interface ValidateConcentratedPoolData {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  tickSpacing: number;
  initialPrice: string;
  lpFeeRateBps: string;
  hostFeeRateBps: string;
  nonce: string;
}

/**
 * Data for validating an increase liquidity intent.
 */
export interface ValidateIncreaseLiquidityData {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  tickLower: number;
  tickUpper: number;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  amountADesired: string;
  amountBDesired: string;
  amountAMin: string;
  amountBMin: string;
  nonce: string;
}

/**
 * Data for validating a decrease liquidity intent.
 */
export interface ValidateDecreaseLiquidityData {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  tickLower: number;
  tickUpper: number;
  liquidityToRemove: string;
  amountAMin: string;
  amountBMin: string;
  nonce: string;
}

/**
 * Data for validating a collect fees intent.
 */
export interface ValidateCollectFeesData {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  tickLower: number;
  tickUpper: number;
  nonce: string;
}

/**
 * Data for validating a rebalance position intent.
 * Note: Optional fields serialize as null (not omitted) to match TEE's proto serde behavior.
 */
export interface ValidateRebalancePositionData {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  oldTickLower: number;
  oldTickUpper: number;
  newTickLower: number;
  newTickUpper: number;
  liquidityToMove: string;
  assetASparkTransferId: string | null;
  assetBSparkTransferId: string | null;
  additionalAmountA: string | null;
  additionalAmountB: string | null;
  nonce: string;
}

// --- V3 Request Types ---

/**
 * Request body for creating a new concentrated liquidity pool.
 */
export interface CreateConcentratedPoolRequest {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  tickSpacing: number;
  initialPrice: string;
  lpFeeRateBps: string;
  hostFeeRateBps: string;
  hostNamespace?: string;
  nonce: string;
  signature: string;
}

/**
 * Request body for increasing liquidity in a concentrated position.
 */
export interface IncreaseLiquidityRequest {
  poolId: string;
  tickLower: number;
  tickUpper: number;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  amountADesired: string;
  amountBDesired: string;
  amountAMin: string;
  amountBMin: string;
  /** Use free balance from pool instead of Spark transfers. */
  useFreeBalance?: boolean;
  /** Retain any excess amounts in free balance instead of refunding via Spark. */
  retainExcessInBalance?: boolean;
  nonce: string;
  signature: string;
}

/**
 * Request body for decreasing liquidity in a concentrated position.
 */
export interface DecreaseLiquidityRequest {
  poolId: string;
  tickLower: number;
  tickUpper: number;
  liquidityToRemove: string;
  amountAMin: string;
  amountBMin: string;
  /** Retain withdrawn assets in free balance instead of sending via Spark. */
  retainInBalance?: boolean;
  nonce: string;
  signature: string;
}

/**
 * Request body for collecting accumulated fees from a position.
 */
export interface CollectFeesRequest {
  poolId: string;
  tickLower: number;
  tickUpper: number;
  /** Retain collected fees in free balance instead of sending via Spark. */
  retainInBalance?: boolean;
  nonce: string;
  signature: string;
}

/**
 * Request body for rebalancing a position to a new tick range.
 */
export interface RebalancePositionRequest {
  poolId: string;
  oldTickLower: number;
  oldTickUpper: number;
  newTickLower: number;
  newTickUpper: number;
  liquidityToMove: string;
  assetASparkTransferId?: string;
  assetBSparkTransferId?: string;
  additionalAmountA?: string;
  additionalAmountB?: string;
  /** Retain any excess amounts in free balance instead of sending via Spark. */
  retainInBalance?: boolean;
  nonce: string;
  signature: string;
}

// --- V3 Response Types ---

/**
 * Information about a user's free balance in a V3 pool.
 */
export interface V3FreeBalanceInfo {
  balanceA: string;
  balanceB: string;
}

/**
 * Response for concentrated pool creation.
 */
export interface CreateConcentratedPoolResponse {
  poolId: string;
  initialTick: number;
  message: string;
}

/**
 * Response for increasing liquidity.
 */
export interface IncreaseLiquidityResponse {
  requestId: string;
  accepted: boolean;
  liquidityAdded?: string;
  amountAUsed?: string;
  amountBUsed?: string;
  amountARefund?: string;
  amountBRefund?: string;
  /** Whether excess was retained in free balance. */
  retainedInBalance?: boolean;
  /** Current free balance after operation (if retainedInBalance is true). */
  currentBalance?: V3FreeBalanceInfo;
  error?: string;
}

/**
 * Response for decreasing liquidity.
 */
export interface DecreaseLiquidityResponse {
  requestId: string;
  accepted: boolean;
  liquidityRemoved?: string;
  amountA?: string;
  amountB?: string;
  feesCollectedA?: string;
  feesCollectedB?: string;
  outboundTransferIds?: string[];
  /** Whether assets were retained in free balance. */
  retainedInBalance?: boolean;
  /** Current free balance after operation (if retainedInBalance is true). */
  currentBalance?: V3FreeBalanceInfo;
  error?: string;
}

/**
 * Response for collecting fees.
 */
export interface CollectFeesResponse {
  requestId: string;
  accepted: boolean;
  feesCollectedA?: string;
  feesCollectedB?: string;
  assetAAddress?: string;
  assetBAddress?: string;
  outboundTransferIds?: string[];
  /** Whether fees were retained in free balance. */
  retainedInBalance?: boolean;
  /** Current free balance after operation (if retainedInBalance is true). */
  currentBalance?: V3FreeBalanceInfo;
  error?: string;
}

/**
 * Response for rebalancing a position.
 */
export interface RebalancePositionResponse {
  requestId: string;
  accepted: boolean;
  oldLiquidity?: string;
  newLiquidity?: string;
  netAmountA?: string;
  netAmountB?: string;
  feesCollectedA?: string;
  feesCollectedB?: string;
  /** Spark transfer IDs for outbound assets (net amounts and fees sent to user). */
  outboundTransferIds?: string[];
  /** Whether excess was retained in free balance. */
  retainedInBalance?: boolean;
  /** Current free balance after operation (if retainedInBalance is true). */
  currentBalance?: V3FreeBalanceInfo;
  error?: string;
}

// --- V3 Position Types ---

/**
 * Query parameters for listing positions.
 */
export interface ListConcentratedPositionsQuery {
  poolId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * A single concentrated liquidity position.
 */
export interface ConcentratedPosition {
  poolId: string;
  owner: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  uncollectedFeesA: string;
  uncollectedFeesB: string;
  assetAAddress: string;
  assetBAddress: string;
  inRange: boolean;
  createdAt?: string;
}

/**
 * Response for listing positions.
 */
export interface ListConcentratedPositionsResponse {
  positions: ConcentratedPosition[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// --- V3 Pool Liquidity Types ---

/**
 * Status of a liquidity range relative to current price.
 */
export type RangeStatus = "below_price" | "in_range" | "above_price";

/**
 * A liquidity range representing aggregated positions at a tick range.
 */
export interface LiquidityRange {
  tickLower: number;
  tickUpper: number;
  priceLower: string;
  priceUpper: string;
  liquidity: string;
  amountA: string;
  amountB: string;
  status: RangeStatus;
}

/**
 * Response for pool liquidity distribution (visualization endpoint).
 */
export interface PoolLiquidityResponse {
  poolId: string;
  assetAAddress: string;
  assetBAddress: string;
  currentTick: number;
  currentPrice: string;
  currentSqrtPriceX96: string;
  tickSpacing: number;
  activeLiquidity: string;
  totalReserveA: string;
  totalReserveB: string;
  ranges: LiquidityRange[];
}

// --- V3 Pool Ticks Types ---

/**
 * A tick with its liquidity delta for simulation.
 */
export interface TickData {
  tick: number;
  liquidityNet: string;
  liquidityGross: string;
  sqrtPriceX96: string;
}

/**
 * Response for pool ticks (simulation endpoint).
 */
export interface PoolTicksResponse {
  poolId: string;
  assetAAddress: string;
  assetBAddress: string;
  currentTick: number;
  currentSqrtPriceX96: string;
  currentLiquidity: string;
  tickSpacing: number;
  lpFeeBps: number;
  ticks: TickData[];
}

// --- V3 Free Balance Types ---

/**
 * A single pool balance entry with total, available, and locked amounts.
 */
export interface PoolBalanceEntry {
  /** Pool ID (LP identity public key). */
  poolId: string;
  /** Total balance of asset A in atomic units. */
  balanceA: string;
  /** Total balance of asset B in atomic units. */
  balanceB: string;
  /** Available balance of asset A (total minus in-flight locks). */
  availableA: string;
  /** Available balance of asset B (total minus in-flight locks). */
  availableB: string;
  /** Currently locked balance of asset A (in-flight operations). */
  lockedA: string;
  /** Currently locked balance of asset B (in-flight operations). */
  lockedB: string;
  /** Asset A address. */
  assetAAddress: string;
  /** Asset B address. */
  assetBAddress: string;
}

/**
 * Response for getting a single pool balance.
 */
export interface GetBalanceResponse {
  requestId: string;
  poolId: string;
  balanceA: string;
  balanceB: string;
  availableA: string;
  availableB: string;
  lockedA: string;
  lockedB: string;
  assetAAddress: string;
  assetBAddress: string;
}

/**
 * Response for getting all free balances across pools.
 */
export interface GetBalancesResponse {
  requestId: string;
  balances: PoolBalanceEntry[];
}

/**
 * Request body for withdrawing free balance from a V3 pool.
 */
export interface WithdrawBalanceRequest {
  /** Pool ID (LP identity public key). */
  poolId: string;
  /** Amount of asset A to withdraw. Use "0" to skip, "max" to withdraw all available. */
  amountA: string;
  /** Amount of asset B to withdraw. Use "0" to skip, "max" to withdraw all available. */
  amountB: string;
  /** Unique nonce for replay protection. */
  nonce: string;
  /** Hex-encoded signature of the nonce. */
  signature: string;
}

/**
 * Response for withdrawing free balance.
 */
export interface WithdrawBalanceResponse {
  requestId: string;
  accepted: boolean;
  amountAWithdrawn?: string;
  amountBWithdrawn?: string;
  assetAAddress?: string;
  assetBAddress?: string;
  remainingBalanceA?: string;
  remainingBalanceB?: string;
  outboundTransferIds?: string[];
  error?: string;
}

/**
 * Data for validating a withdraw balance intent.
 */
export interface ValidateWithdrawBalanceData {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  amountA: string;
  amountB: string;
  nonce: string;
}

/**
 * Request body for depositing to free balance in a V3 pool.
 */
export interface DepositBalanceRequest {
  /** Pool ID (LP identity public key). */
  poolId: string;
  /** Amount of asset A to deposit. Use "0" to skip. */
  amountA: string;
  /** Amount of asset B to deposit. Use "0" to skip. */
  amountB: string;
  /** Spark transfer ID for asset A deposit. Empty string to skip. */
  assetASparkTransferId: string;
  /** Spark transfer ID for asset B deposit. Empty string to skip. */
  assetBSparkTransferId: string;
  /** Unique nonce for replay protection. */
  nonce: string;
  /** Hex-encoded signature of the nonce. */
  signature: string;
}

/**
 * Response for depositing to free balance.
 */
export interface DepositBalanceResponse {
  requestId: string;
  accepted: boolean;
  amountADeposited?: string;
  amountBDeposited?: string;
  currentBalanceA?: string;
  currentBalanceB?: string;
  error?: string;
}

/**
 * Data for validating a deposit balance intent.
 */
export interface ValidateDepositBalanceData {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  amountA: string;
  amountB: string;
  nonce: string;
}

// Error Types
// Re-export all error types from errors module
export * from "./errors";

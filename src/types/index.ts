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

// ===== BACKWARD COMPATIBILITY TYPES =====

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

// ===== TYPE CONVERSION UTILITIES =====

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
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
  signature: string;
}

export interface WithdrawHostFeesResponse {
  requestId: string;
  accepted: boolean;
  assetAWithdrawn?: string;
  assetBWithdrawn?: string;
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
  transferIds?: WithdrawalTransferIds;
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
  graduationThresholdPct: number;
  targetBRaisedAtGraduation: string;
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

export interface CreatePoolNoInitialDepsoitResponse {
  poolId: string;
  message: string;
  transferInitialDeposit: () => Promise<string>;
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
  integratorBps?: string;
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

// Pool listing types
export interface AmmPool {
  lpPublicKey: string;
  hostName?: string;
  hostFeeBps: number;
  lpFeeBps: number;
  assetAAddress: string;
  assetBAddress: string;
  assetAReserve?: string;
  assetBReserve?: string;
  currentPriceAInB?: string;
  tvlAssetB?: string;
  volume24hAssetB?: string;
  priceChangePercent24h?: string;
  curveType?: string;
  initialReserveA?: string;
  bondingProgressPercent?: string;
  createdAt: string;
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
  /** ISO8601 timestamp to filter pools updated after the given date */
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
  currentPriceAInB?: string;
  tvlAssetB: string;
  volume24hAssetB: string;
  priceChangePercent24h?: string;
  curveType: string;
  initialReserveA?: string;
  bondingProgressPercent?: string;
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
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  assetAInitialReserve: string;
  graduationThresholdPct: string;
  targetBRaisedAtGraduation: string;
  totalHostFeeRateBps: string;
  lpFeeRateBps: string;
  nonce: string;
}

export interface ValidateAmmInitializeConstantProductPoolData {
  poolOwnerPublicKey: string;
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
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
  assetInTokenPublicKey: string;
  assetOutTokenPublicKey: string;
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
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
}

// Route swap validation types
export interface RouteHopValidation {
  lpIdentityPublicKey: string;
  inputAssetPublicKey: string;
  outputAssetPublicKey: string;
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

// Integrator fees validation types
export interface ValidateAmmWithdrawIntegratorFeesData {
  integratorPublicKey: string;
  lpIdentityPublicKey: string;
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
}

// Host fees for all pools types
export interface GetHostFeesRequest {
  hostNamespace: string;
}

export interface HostPoolFees {
  poolId: string;
  assetAPubkey: string;
  assetBPubkey: string;
  assetAFees: string;
  assetBFees: string;
}

export interface GetHostFeesResponse {
  hostNamespace: string;
  feeRecipientType: string;
  pools: HostPoolFees[];
  totalAssetAFees?: string;
  totalAssetBFees?: string;
}

// Integrator fees types
export interface IntegratorPoolFees {
  poolId: string;
  hostNamespace?: string;
  assetAPubkey: string;
  assetBPubkey: string;
  assetAFees: string;
  assetBFees: string;
}

export interface GetIntegratorFeesResponse {
  integratorPublicKey: string;
  pools: IntegratorPoolFees[];
  totalAssetAFees?: string;
  totalAssetBFees?: string;
}

export interface GetPoolIntegratorFeesRequest {
  poolId: string;
}

export interface GetPoolIntegratorFeesResponse {
  poolId: string;
  integratorPublicKey: string;
  assetAFees: string;
  assetBFees: string;
}

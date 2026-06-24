/**
 * Flashnet Execution Layer Module
 *
 * Core client for interacting with the Flashnet execution gateway.
 * Handles deposit, withdrawal, and raw execute intents.
 *
 * For AMM operations (swap, quote, createPool), use the TradingClient
 * from "@flashnet/sdk" which wraps ExecutionClient.
 *
 * @example
 * ```typescript
 * import { ExecutionClient } from "@flashnet/sdk";
 *
 * const client = new ExecutionClient(sparkWallet, {
 *   gatewayUrl: "http://localhost:8080",
 *   rpcUrl: "http://localhost:8545",
 *   chainId: 21022,
 * });
 * await client.authenticate();
 * // Deposit / withdraw addresses are discovered from the gateway:
 * const { spark, execution } = await client.getNetworkInfo();
 * await client.deposit({ deposits: [...] });
 * await client.withdraw({ amount: 1000n });
 * ```
 */

// Conductor contract ABI — the single source of truth TradingClient encodes
// against internally. Exported for integrators building raw calldata via
// encodeFunctionData({ abi: conductorAbi, functionName, args }): all swap
// variants, LP entrypoints, and fee getters.
export { conductorAbi } from "./abis/conductor";
export {
  errorSelector,
  fetchAbiErrorsFromBlockscout,
} from "./blockscout-abi";
// Core client
export {
  type DepositParams,
  EXECUTION_NETWORK_CONFIGS,
  type ExecuteParams,
  ExecutionClient,
  type ExecutionClientConfig,
  type ProofOptOut,
  type VerifyDepositParams,
  VerifyDepositRejectedError,
  type WaitForIntentOptions,
  type WithdrawParams,
  type WithdrawTokenParams,
} from "./client";

// EVM read helpers
export {
  fetchAllowance,
  fetchEip1559Fees,
  fetchNativeBalance,
  fetchNonce,
  fetchTokenBalance,
  fetchTokenInfo,
  type TokenInfo,
} from "./evm";
// Gateway calldata encoding and queries
export {
  encodeWithdrawSats,
  encodeWithdrawToken,
  querySparkTokenAddress,
  waitForSparkTokenAddress,
} from "./gateway";
// Gateway RPC contract the execution client honors (see ./gateway-rpc-policy).
export {
  assertJsonRpcBatchWithinLimit,
  GATEWAY_BLOCKED_STATEFUL_FILTER_METHODS,
  type GatewayBlockedFilterMethod,
  isGatewayBlockedStatefulFilter,
  MAX_JSON_RPC_BATCH_REQUESTS,
} from "./gateway-rpc-policy";
// Pool queries
export {
  fetchPoolInfo,
  getPoolAddress,
  type PoolInfo,
  sortTokens,
} from "./pool";
// Pool creation encoding
export {
  type CreateBTCPoolParams,
  type CreatePoolParams,
  encodeCreateBTCPool,
  encodeCreatePoolParams,
  type PermitSignature,
} from "./pool-creation";
// Price math
export {
  FEE_TIERS,
  fullRangeTicks,
  priceToSqrtPriceX96,
  sqrtPriceX96ToPrice,
} from "./price-math";
// Revert reason decoding
export {
  CONDUCTOR_REVERT_ERRORS,
  DEFAULT_REVERT_ERRORS,
  type DecodedRevertReason,
  type DecodeRevertReasonOptions,
  decodeRevertReason,
  SOLIDITY_BUILTIN_REVERT_ERRORS,
  SPARK_GATEWAY_REVERT_ERRORS,
} from "./revert-reason";
// SparkWallet → EVM account adapter
export {
  type SparkWalletInput,
  sparkWalletToEvmAccount,
} from "./spark-evm-account";
export {
  extractTxHashFromStatusMessage,
  type InnermostRevertFrame,
  type TraceFrame,
  traceInnermostRevert,
} from "./trace-revert";
// Types
export type {
  Asset,
  CanonicalIntentAction,
  CanonicalIntentMessage,
  CanonicalTransferEntry,
  Deposit,
  DepositAsset,
  DepositRejection,
  ExecuteResponse,
  ExecutionNetworkInfo,
  ExecutionSigner,
  IndexedDepositProof,
  IntentStatus,
  IntentStatusResponse,
  NetworkInfo,
  SignedDepositProof,
  SparkNetworkInfo,
  VerifyDepositsRequest,
  VerifyDepositsResponse,
  VerifyDepositTransfer,
} from "./types";
export {
  canonicalIntentId,
  DEFAULT_INTENT_TTL_MS,
  depositAssetToWire,
  isTerminalIntentStatus,
  normalizeIntentStatus,
  PLACEHOLDER_DEPOSIT_PROOF,
  resolveExpiresAt,
  TERMINAL_INTENT_STATUSES,
  u256Hex,
} from "./types";

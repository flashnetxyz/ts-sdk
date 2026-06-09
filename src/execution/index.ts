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

// Core client
export {
  ExecutionClient,
  EXECUTION_NETWORK_CONFIGS,
  type ExecutionClientConfig,
  type DepositParams,
  type WithdrawParams,
  type WithdrawTokenParams,
  type ExecuteParams,
  type WaitForIntentOptions,
  type VerifyDepositParams,
  type ProofOptOut,
  VerifyDepositRejectedError,
} from "./client";

// SparkWallet → EVM account adapter
export {
  sparkWalletToEvmAccount,
  type SparkWalletInput,
} from "./spark-evm-account";

// Gateway calldata encoding and queries
export {
  encodeWithdrawSats,
  encodeWithdrawToken,
  querySparkTokenAddress,
  waitForSparkTokenAddress,
} from "./gateway";

// EVM read helpers
export {
  fetchTokenInfo,
  fetchTokenBalance,
  fetchNativeBalance,
  fetchAllowance,
  fetchNonce,
  fetchEip1559Fees,
  type TokenInfo,
} from "./evm";

// Pool queries
export {
  getPoolAddress,
  fetchPoolInfo,
  sortTokens,
  type PoolInfo,
} from "./pool";

// Pool creation encoding
export {
  encodeCreateBTCPool,
  encodeCreatePoolParams,
  type CreateBTCPoolParams,
  type CreatePoolParams,
  type PermitSignature,
} from "./pool-creation";

// Price math
export {
  priceToSqrtPriceX96,
  sqrtPriceX96ToPrice,
  fullRangeTicks,
  FEE_TIERS,
} from "./price-math";

// Conductor contract ABI — the single source of truth TradingClient encodes
// against internally. Exported for integrators building raw calldata via
// encodeFunctionData({ abi: conductorAbi, functionName, args }): all swap
// variants, LP entrypoints, and fee getters.
export { conductorAbi } from "./abis/conductor";

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
  ExecutionSigner,
  IndexedDepositProof,
  IntentStatus,
  IntentStatusResponse,
  NetworkInfo,
  SignedDepositProof,
  SparkNetworkInfo,
  ExecutionNetworkInfo,
  VerifyDepositsRequest,
  VerifyDepositsResponse,
  VerifyDepositTransfer,
} from "./types";
export {
  DEFAULT_INTENT_TTL_MS,
  TERMINAL_INTENT_STATUSES,
  PLACEHOLDER_DEPOSIT_PROOF,
  canonicalIntentId,
  depositAssetToWire,
  isTerminalIntentStatus,
  normalizeIntentStatus,
  resolveExpiresAt,
  u256Hex,
} from "./types";

// Revert reason decoding
export {
  decodeRevertReason,
  DEFAULT_REVERT_ERRORS,
  CONDUCTOR_REVERT_ERRORS,
  SPARK_GATEWAY_REVERT_ERRORS,
  SOLIDITY_BUILTIN_REVERT_ERRORS,
  type DecodedRevertReason,
  type DecodeRevertReasonOptions,
} from "./revert-reason";
export {
  traceInnermostRevert,
  extractTxHashFromStatusMessage,
  type InnermostRevertFrame,
  type TraceFrame,
} from "./trace-revert";
export {
  fetchAbiErrorsFromBlockscout,
  errorSelector,
} from "./blockscout-abi";

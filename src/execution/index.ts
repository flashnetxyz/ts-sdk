/**
 * Flashnet Execution Layer Module
 *
 * Core client for interacting with the Flashnet execution gateway.
 * Handles deposit, withdrawal, and raw execute intents.
 *
 * For AMM operations (swap, quote, createPool), use the AMMClient
 * from "@flashnet/sdk/amm" which wraps ExecutionClient.
 *
 * @example
 * ```typescript
 * import { ExecutionClient } from "@flashnet/sdk";
 *
 * const client = new ExecutionClient(sparkWallet, {
 *   gatewayUrl: "http://localhost:8080",
 *   rpcUrl: "http://localhost:8545",
 *   chainId: 21022,
 *   bridgeAddress: "0x...",
 * });
 * await client.authenticate();
 * await client.deposit({ deposits: [...] });
 * await client.withdraw({ amount: 1000n });
 * ```
 */

// Core client
export {
  ExecutionClient,
  type ExecutionClientConfig,
  type DepositParams,
  type WithdrawParams,
  type WithdrawTokenParams,
  type ExecuteParams,
} from "./client";

// SparkWallet → EVM account adapter
export {
  sparkWalletToEvmAccount,
  type SparkWalletInput,
} from "./spark-evm-account";

// Bridge calldata encoding and queries
export {
  encodeWithdrawSats,
  encodeWithdrawToken,
  queryBridgedTokenAddress,
  waitForBridgedTokenAddress,
} from "./bridge";

// Conductor calldata encoding (used by AMMClient)
export {
  Conductor,
  type ConductorConfig,
  type SwapParams as ConductorSwapParams,
  type SwapBTCParams,
} from "./conductor";

// EVM read helpers
export {
  fetchTokenInfo,
  fetchTokenBalance,
  fetchNativeBalance,
  fetchAllowance,
  fetchNonce,
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

// Types
export type {
  CanonicalIntentAction,
  CanonicalIntentMessage,
  CanonicalTransferEntry,
  Deposit,
  DepositAsset,
  ExecuteResponse,
  ExecutionSigner,
} from "./types";
export { DEFAULT_INTENT_TTL_MS, resolveExpiresAt } from "./types";

// Revert reason decoding
export {
  decodeRevertReason,
  DEFAULT_REVERT_ERRORS,
  CONDUCTOR_REVERT_ERRORS,
  SPARK_BRIDGE_REVERT_ERRORS,
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

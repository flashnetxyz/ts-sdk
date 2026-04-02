/**
 * Flashnet Execution Layer Module
 *
 * New execution-layer client for interacting with the Flashnet execution gateway.
 * This module is separate from the legacy AMM client (FlashnetClient) which talks
 * to flashnet-services/settlement.
 *
 * @example
 * ```typescript
 * import { ExecutionClient } from "@flashnet/sdk/execution";
 * ```
 */

export { ExecutionClient } from "./client";
export { Conductor, type SwapParams, type SwapBTCParams } from "./conductor";
export type {
  CanonicalIntentAction,
  CanonicalIntentMessage,
  CanonicalTransferEntry,
  Deposit,
  DepositAsset,
  DepositIntentParams,
  ExecuteIntentParams,
  ExecuteResponse,
  ExecutionClientConfig,
  ExecutionSigner,
} from "./types";

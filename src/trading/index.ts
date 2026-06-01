/**
 * Flashnet Trading Module
 *
 * High-level trading client for DEX operations through the Conductor
 * contract. Separate from the execution layer — depends on ExecutionClient
 * but contains no execution-layer primitives.
 */

export {
  TradingClient,
  SwapDepositStrandedError,
  type TradingConfig,
  type SwapParams,
  type SwapResult,
} from "./client";

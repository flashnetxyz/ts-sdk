/**
 * Flashnet AMM Module
 *
 * High-level AMM client for DEX operations through the Conductor contract.
 * Separate from the execution layer — depends on ExecutionClient but
 * contains no execution-layer primitives.
 */

export {
  AMMClient,
  type AMMConfig,
  type SwapParams,
  type SwapResult,
  // Liquidity management
  satsToWei,
  weiToSats,
  type AddLiquidityParams,
  type IncreaseLiquidityParams,
  type DecreaseLiquidityParams,
  type CollectFeesParams,
  type ModifyPositionParams,
  type LpWriteResult,
  type MintResult,
  type IncreaseResult,
  type WithdrawResult,
  type PositionInfo,
} from "./client";

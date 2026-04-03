/**
 * Flashnet Execution Layer Module
 *
 * Complete SDK for interacting with the Flashnet execution gateway,
 * Conductor contract (AMM aggregator), and on-chain EVM state.
 *
 * @example High-level swap (SDK does everything):
 * ```typescript
 * import { ExecutionClient, swap } from "@flashnet/sdk/execution";
 *
 * const client = new ExecutionClient({ gatewayUrl }, signer);
 * await client.authenticate();
 *
 * const result = await swap(client, conductorConfig, {
 *   tokenIn: USDB, tokenOut: WBTC, fee: 3000,
 *   amountIn: 1000000n, minAmountOut: 900000n,
 * }, deposits, evmSigner);
 * ```
 *
 * @example Low-level (calldata encoding only):
 * ```typescript
 * import { Conductor, fetchTokenBalance } from "@flashnet/sdk/execution";
 *
 * const calldata = Conductor.encodeSwap({ tokenIn, tokenOut, fee, amountIn, minAmountOut });
 * const balance = await fetchTokenBalance(rpcUrl, tokenAddress, myAddress);
 * ```
 */

// Core client
export { ExecutionClient } from "./client";

// Conductor: low-level encoding + high-level swap functions
export {
  Conductor,
  swap,
  swapBTC,
  approveToken,
  swapWithApproval,
  type SwapParams,
  type SwapBTCParams,
  type ConductorConfig,
  type EvmTransactionSigner,
  type UnsignedTransaction,
  type SwapResult,
  type SwapRequest,
  type SwapBTCRequest,
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
  DepositIntentParams,
  ExecuteIntentParams,
  ExecuteResponse,
  ExecutionClientConfig,
  ExecutionSigner,
} from "./types";

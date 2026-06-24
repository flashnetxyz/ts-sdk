/**
 * Gateway RPC contract the execution client honors.
 *
 * The gateway constrains the public JSON-RPC surface it accepts. This module
 * captures that contract as the SDK's single source of truth so the execution
 * client — and future work on it — stays within what the gateway accepts:
 *
 * - Stateful filter methods are not accepted on the public RPC surface: they
 *   allocate server-side filter state on a shared endpoint. Read logs with
 *   `eth_getLogs` range queries instead of server-side filters.
 * - A single JSON-RPC batch may carry at most `MAX_JSON_RPC_BATCH_REQUESTS`
 *   requests. The execution client uses Multicall3 to aggregate reads into one
 *   `eth_call` and a non-batching viem `http()` transport, so it does not emit
 *   JSON-RPC arrays today; cap any future batching at this limit.
 */

/** Maximum number of JSON-RPC requests the gateway accepts in a single batch. */
export const MAX_JSON_RPC_BATCH_REQUESTS = 100;

/**
 * Stateful filter methods the gateway does not accept on the public RPC
 * surface. They allocate server-side filter state and are unsafe on a shared
 * public RPC, so the SDK must not call them; use `eth_getLogs` instead.
 */
export const GATEWAY_BLOCKED_STATEFUL_FILTER_METHODS = [
  "eth_newFilter",
  "eth_newBlockFilter",
  "eth_newPendingTransactionFilter",
  "eth_uninstallFilter",
  "eth_getFilterChanges",
  "eth_getFilterLogs",
] as const;

export type GatewayBlockedFilterMethod =
  (typeof GATEWAY_BLOCKED_STATEFUL_FILTER_METHODS)[number];

const BLOCKED_FILTER_METHODS = new Set<string>(
  GATEWAY_BLOCKED_STATEFUL_FILTER_METHODS
);

/** True if `method` is a stateful filter method the gateway rejects. */
export function isGatewayBlockedStatefulFilter(method: string): boolean {
  return BLOCKED_FILTER_METHODS.has(method);
}

/**
 * Throws if a JSON-RPC batch would exceed the gateway's per-batch limit.
 * Call this before sending a batched request so the failure is local and clear
 * rather than a gateway `-32600` rejection of the whole batch.
 */
export function assertJsonRpcBatchWithinLimit(count: number): void {
  if (count > MAX_JSON_RPC_BATCH_REQUESTS) {
    throw new Error(
      `JSON-RPC batch of ${count} requests exceeds the gateway limit of ${MAX_JSON_RPC_BATCH_REQUESTS}`
    );
  }
}

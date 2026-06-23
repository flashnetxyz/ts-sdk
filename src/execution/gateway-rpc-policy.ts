/**
 * Gateway RPC contract the execution client must honor.
 *
 * The Flashnet execution gateway hardened its public RPC and admission surface
 * (see the linked flashnet-execution PRs). This module captures the resulting
 * contract as the SDK's single source of truth so the execution client — and
 * future work on it — stays aligned with what the gateway will actually accept:
 *
 * - Stateful filter methods are rejected on every public RPC lane because they
 *   allocate server-side reth filter state on a shared endpoint. Read logs with
 *   `eth_getLogs` range queries instead of server-side filters.
 *   (flashnet-execution #1028; also #1025 for the `/access/{apikey}` lane)
 * - A single JSON-RPC batch may carry at most `MAX_JSON_RPC_BATCH_REQUESTS`
 *   requests. The execution client uses Multicall3 to aggregate reads into one
 *   `eth_call` and a non-batching viem `http()` transport, so it does not emit
 *   JSON-RPC arrays today; cap any future batching at this limit.
 *   (flashnet-execution #1170)
 * - `/access/{apikey}` is read-only: a key's `allowed_methods` are intersected
 *   with the gateway's read-only whitelist, so write/admin methods are denied
 *   regardless of the key. (flashnet-execution #1025)
 * - `POST /v1/execute` rejects intents whose `chainId` does not match the
 *   execution chain with HTTP 400 before any signature/proof work. The client
 *   always sends `config.chainId`. (flashnet-execution #1090)
 * - `/v1/auth/challenge` and `/v1/auth/verify` reject a malformed `public_key`
 *   with HTTP 400 before any session write. The client always sends a valid
 *   compressed secp256k1 key. (flashnet-execution #1169)
 */

/** Maximum number of JSON-RPC requests the gateway accepts in a single batch. */
export const MAX_JSON_RPC_BATCH_REQUESTS = 100;

/**
 * Stateful filter methods the gateway blocks on all public RPC lanes. They
 * allocate server-side reth filter state and are unsafe on a shared public RPC,
 * so the SDK must not call them; use `eth_getLogs` instead.
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

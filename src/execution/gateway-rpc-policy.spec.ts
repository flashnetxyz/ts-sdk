import {
  assertJsonRpcBatchWithinLimit,
  GATEWAY_BLOCKED_STATEFUL_FILTER_METHODS,
  isGatewayBlockedStatefulFilter,
  MAX_JSON_RPC_BATCH_REQUESTS,
} from "./gateway-rpc-policy";

describe("gateway-rpc-policy", () => {
  it("blocks exactly the six stateful filter methods", () => {
    expect(GATEWAY_BLOCKED_STATEFUL_FILTER_METHODS).toHaveLength(6);
    for (const method of GATEWAY_BLOCKED_STATEFUL_FILTER_METHODS) {
      expect(isGatewayBlockedStatefulFilter(method)).toBe(true);
    }
  });

  it("does not block read-only methods the client uses", () => {
    for (const method of [
      "eth_getLogs",
      "eth_call",
      "eth_blockNumber",
      "eth_getTransactionReceipt",
      "eth_chainId",
    ]) {
      expect(isGatewayBlockedStatefulFilter(method)).toBe(false);
    }
  });

  it("enforces the batch limit at the boundary", () => {
    expect(MAX_JSON_RPC_BATCH_REQUESTS).toBe(100);
    expect(() =>
      assertJsonRpcBatchWithinLimit(MAX_JSON_RPC_BATCH_REQUESTS)
    ).not.toThrow();
    expect(() =>
      assertJsonRpcBatchWithinLimit(MAX_JSON_RPC_BATCH_REQUESTS + 1)
    ).toThrow(/exceeds the gateway limit/);
  });
});

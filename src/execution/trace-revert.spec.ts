import { extractTxHashFromStatusMessage, traceInnermostRevert } from "./trace-revert";

/**
 * Build a minimal JSON-RPC server-ish fetch mock: every POST to the
 * configured URL returns the given trace as `{ result }`.
 */
function mockRpc(trace: unknown) {
  return async (_url: string, _init?: unknown) => ({
    ok: true,
    json: async () => ({ result: trace }),
  });
}

describe("extractTxHashFromStatusMessage", () => {
  it("parses tx_hash out of a payload_flagged message", () => {
    const msg =
      "payload_flagged:stage=Execute outcome=Reverted intent_index=0 " +
      "tx_hash=0xabc123 reason=reverted:gas_used=100 output=0x1f2a2005";
    expect(extractTxHashFromStatusMessage(msg)).toBe("0xabc123");
  });

  it("returns null for messages without a tx_hash", () => {
    expect(extractTxHashFromStatusMessage("timeout")).toBeNull();
    expect(extractTxHashFromStatusMessage(undefined)).toBeNull();
  });

  it("lowercases the hash for consistent comparison", () => {
    expect(extractTxHashFromStatusMessage("tx_hash=0xABC123")).toBe("0xabc123");
  });
});

describe("traceInnermostRevert", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the deepest frame whose output matches on a pure bubble-up", async () => {
    // A → B → C, all revert with the same bytes. C is the originator.
    const trace = {
      type: "CALL",
      to: "0xA",
      output: "0x1f2a2005",
      error: "execution reverted",
      calls: [
        {
          type: "CALL",
          to: "0xB",
          output: "0x1f2a2005",
          error: "execution reverted",
          calls: [
            {
              type: "CALL",
              to: "0xC",
              output: "0x1f2a2005",
              error: "execution reverted",
            },
          ],
        },
      ],
    };
    global.fetch = mockRpc(trace) as unknown as typeof global.fetch;
    const result = await traceInnermostRevert("http://rpc", "0x1");
    expect(result?.address).toBe("0xc");
    expect(result?.output).toBe("0x1f2a2005");
    expect(result?.depth).toBe(2);
  });

  it("returns the outer frame when an inner revert was try/catch'd + re-thrown differently", async () => {
    // Inner C reverts with X. B catches, then reverts with Y. Tx output = Y.
    // Deepest frame matching Y is B (C doesn't match).
    const trace = {
      type: "CALL",
      to: "0xA",
      output: "0xYYYY",
      error: "execution reverted",
      calls: [
        {
          type: "CALL",
          to: "0xB",
          output: "0xYYYY",
          error: "execution reverted",
          calls: [
            {
              type: "CALL",
              to: "0xC",
              output: "0xXXXX",
              error: "execution reverted",
            },
          ],
        },
      ],
    };
    global.fetch = mockRpc(trace) as unknown as typeof global.fetch;
    const result = await traceInnermostRevert("http://rpc", "0x1");
    expect(result?.address).toBe("0xb");
    expect(result?.output).toBe("0xYYYY");
  });

  it("returns null when the tx did not revert", async () => {
    // No `error` on root, empty output. Nothing to locate.
    const trace = {
      type: "CALL",
      to: "0xA",
      output: "",
      calls: [{ type: "CALL", to: "0xB", output: "0xabcd" }],
    };
    global.fetch = mockRpc(trace) as unknown as typeof global.fetch;
    expect(await traceInnermostRevert("http://rpc", "0x1")).toBeNull();
  });

  it("returns null when the node returns an error", async () => {
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ error: { code: -32000, message: "unknown tx" } }),
    })) as unknown as typeof global.fetch;
    expect(await traceInnermostRevert("http://rpc", "0xdead")).toBeNull();
  });

  it("falls back to the deepest errored frame for Halt-class failures (empty output)", async () => {
    // OOG / invalid opcode — root has error but no output bytes. Pick the
    // deepest errored frame.
    const trace = {
      type: "CALL",
      to: "0xA",
      output: "",
      error: "out of gas",
      calls: [
        {
          type: "CALL",
          to: "0xB",
          output: "",
          error: "out of gas",
          calls: [{ type: "CALL", to: "0xC", output: "", error: "out of gas" }],
        },
      ],
    };
    global.fetch = mockRpc(trace) as unknown as typeof global.fetch;
    const result = await traceInnermostRevert("http://rpc", "0x1");
    expect(result?.address).toBe("0xc");
  });

  it("returns the root when only the root reverted (no child frames)", async () => {
    const trace = {
      type: "CALL",
      to: "0xA",
      output: "0x1f2a2005",
      error: "execution reverted",
    };
    global.fetch = mockRpc(trace) as unknown as typeof global.fetch;
    const result = await traceInnermostRevert("http://rpc", "0x1");
    expect(result?.address).toBe("0xa");
    expect(result?.depth).toBe(0);
  });
});

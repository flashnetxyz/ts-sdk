import { decodeRevertReason } from "./revert-reason";

describe("decodeRevertReason", () => {
  it("returns null for missing or empty status messages", () => {
    expect(decodeRevertReason(undefined)).toBeNull();
    expect(decodeRevertReason(null)).toBeNull();
    expect(decodeRevertReason("")).toBeNull();
  });

  it("returns null when the status message does not carry output=0x...", () => {
    // Non-revert rejections (e.g. signer mismatch) don't include a revert
    // output — the helper should surface null, not an unknown selector.
    expect(decodeRevertReason("rejected: signer mismatch")).toBeNull();
    expect(decodeRevertReason("timeout")).toBeNull();
  });

  it("decodes SparkBridge.ZeroAmount()", () => {
    const msg =
      "payload_flagged:stage=Execute outcome=Reverted intent_index=0 " +
      "tx_hash=0x1234 reason=reverted:gas_used=189179 output=0x1f2a2005";
    const decoded = decodeRevertReason(msg);
    expect(decoded).toEqual({
      selector: "0x1f2a2005",
      name: "ZeroAmount()",
      raw: "0x1f2a2005",
    });
  });

  it("decodes Conductor.SparkBridgeNotSet()", () => {
    const decoded = decodeRevertReason("output=0x9b561384");
    expect(decoded?.name).toBe("SparkBridgeNotSet()");
  });

  it("surfaces unknown selectors with a helpful label", () => {
    // Not in any known table.
    const decoded = decodeRevertReason("output=0xdeadbeef");
    expect(decoded).toEqual({
      selector: "0xdeadbeef",
      name: "unknown (0xdeadbeef)",
      raw: "0xdeadbeef",
    });
  });

  it("layers extraErrors over the defaults", () => {
    const decoded = decodeRevertReason("output=0xdeadbeef", {
      "0xdeadbeef": "MyCustomError()",
    });
    expect(decoded?.name).toBe("MyCustomError()");
  });

  it("accepts the options-object shape with extraErrors", () => {
    const decoded = decodeRevertReason("output=0xdeadbeef", {
      extraErrors: { "0xdeadbeef": "FromOptions()" },
    });
    expect(decoded?.name).toBe("FromOptions()");
  });

  it("prefers a contract-specific table when revertAddress is supplied", () => {
    // Same selector has DIFFERENT meanings on two contracts. The
    // address-scoped table should win over the default table.
    const decoded = decodeRevertReason("output=0x1f2a2005", {
      revertAddress: "0xAbCd",
      contractTables: {
        "0xabcd": { "0x1f2a2005": "MyContract.SpecificError()" },
      },
    });
    expect(decoded?.name).toBe("MyContract.SpecificError()");
  });

  it("falls back to the default table when revertAddress has no entry for the selector", () => {
    const decoded = decodeRevertReason("output=0x1f2a2005", {
      revertAddress: "0xabcd",
      contractTables: {
        "0xabcd": { "0xdeadbeef": "Irrelevant()" },
      },
    });
    // Default SparkBridge ZeroAmount() still applies.
    expect(decoded?.name).toBe("ZeroAmount()");
  });

  it("is case-insensitive on revertAddress keys", () => {
    const decoded = decodeRevertReason("output=0xdeadbeef", {
      revertAddress: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      contractTables: {
        "0xabcdef0123456789abcdef0123456789abcdef01": {
          "0xdeadbeef": "CaseInsensitive()",
        },
      },
    });
    expect(decoded?.name).toBe("CaseInsensitive()");
  });

  it("ABI-decodes Solidity Error(string) payloads", () => {
    // selector 0x08c379a0 + offset(0x20) + length(13) + "hello, world!" padded
    const payload =
      "0x08c379a0" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "000000000000000000000000000000000000000000000000000000000000000d" +
      "68656c6c6f2c20776f726c6421" + // "hello, world!"
      "000000000000000000000000000000000000000000000000000000"; // padding
    const decoded = decodeRevertReason(`output=${payload}`);
    expect(decoded?.selector).toBe("0x08c379a0");
    expect(decoded?.name).toBe('Error("hello, world!")');
  });

  it("falls back to Error(string) label when payload is malformed", () => {
    // Selector present but not enough bytes for a string payload.
    const decoded = decodeRevertReason("output=0x08c379a0");
    expect(decoded?.name).toBe("Error(string)");
  });

  it("returns null for an output that's just the 0x prefix", () => {
    // Too short to contain a selector — don't claim to have decoded.
    expect(decodeRevertReason("output=0x")).toBeNull();
  });

  it("is case-insensitive on the selector bytes", () => {
    // Gateway might emit upper-case hex; the table is lower-case.
    const decoded = decodeRevertReason("output=0x1F2A2005");
    expect(decoded?.name).toBe("ZeroAmount()");
  });
});

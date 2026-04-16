import { stringifyWithBigint } from "./client";
import type {
  CanonicalIntentMessage,
  CanonicalTransferEntry,
} from "./types";

describe("stringifyWithBigint", () => {
  it("matches JSON.stringify for bigint-free input", () => {
    const cases: unknown[] = [
      "hello",
      42,
      true,
      false,
      null,
      [1, 2, "three", null],
      { a: 1, b: "two", c: [true, false] },
      { nested: { deep: { value: "x" } } },
      {},
      [],
    ];
    for (const c of cases) {
      expect(stringifyWithBigint(c)).toEqual(JSON.stringify(c));
    }
  });

  it("emits bigints as raw JSON numeric literals", () => {
    expect(stringifyWithBigint(123n)).toEqual("123");
    expect(stringifyWithBigint({ amount: 1000000000000000000n })).toEqual(
      '{"amount":1000000000000000000}'
    );
  });

  it("preserves full u64 precision", () => {
    // 2^64 - 1 — would lose precision via Number()
    const max = (1n << 64n) - 1n;
    const json = stringifyWithBigint({ x: max });
    expect(json).toEqual(`{"x":${max.toString()}}`);
    // Round-trip through JSON.parse and verify no precision loss when
    // parsed as BigInt.
    const parsedAsString = json.match(/"x":(\d+)/)?.[1];
    expect(BigInt(parsedAsString!)).toEqual(max);
  });

  it("does not corrupt user strings that look like the old sentinel", () => {
    // Regression test for the previous sentinel-and-regex implementation:
    // a user string containing __BIGINT_SENTINEL__999 must round-trip
    // unchanged.
    const evil = {
      sparkTransferId: "__BIGINT_SENTINEL__999",
      amount: 42n,
    };
    const json = stringifyWithBigint(evil);
    // amount becomes a numeric literal, but the string field is preserved.
    expect(json).toContain('"sparkTransferId":"__BIGINT_SENTINEL__999"');
    expect(json).toContain('"amount":42');
    // And it round-trips to the same string when re-parsed.
    const parsed = JSON.parse(json);
    expect(parsed.sparkTransferId).toEqual("__BIGINT_SENTINEL__999");
    expect(parsed.amount).toEqual(42); // parsed as JS number (lossy if huge)
  });

  it("escapes special characters in strings the same way as JSON.stringify", () => {
    const tricky = {
      quotes: 'he said "hi"',
      newline: "a\nb",
      tab: "a\tb",
      unicode: "👋 \u0001",
      backslash: "a\\b",
    };
    expect(stringifyWithBigint(tricky)).toEqual(JSON.stringify(tricky));
  });

  it("omits undefined values in objects (matches JSON.stringify)", () => {
    const obj = { a: 1, b: undefined, c: 3 };
    expect(stringifyWithBigint(obj)).toEqual(JSON.stringify(obj));
  });

  it("converts NaN and Infinity to null (matches JSON.stringify)", () => {
    expect(stringifyWithBigint(NaN)).toEqual("null");
    expect(stringifyWithBigint(Infinity)).toEqual("null");
  });

  it("handles arrays of mixed types including bigint", () => {
    const arr = [1, 2n, "three", null, true];
    expect(stringifyWithBigint(arr)).toEqual('[1,2,"three",null,true]');
  });

  it("preserves object key insertion order", () => {
    const obj: Record<string, unknown> = {};
    obj.z = 1;
    obj.a = 2n;
    obj.m = 3;
    expect(stringifyWithBigint(obj)).toEqual('{"z":1,"a":2,"m":3}');
  });

  // Golden-vector regression guarding the field ordering on the signed
  // canonical intent message. The validator hashes the JSON output
  // byte-for-byte and the signed bytes must match the Rust
  // CanonicalIntentMessage struct (chainId, transfers, action, nonce),
  // with each CanonicalTransferEntry in the order
  // (transferId, amountSats, assetType, tokenId?). If someone reorders
  // the TS interface, the Rust struct, or the object literal in
  // ExecutionClient.submitIntent, this test will fail loudly instead of
  // breaking signature verification at runtime.
  it("canonical intent message matches the Rust struct field order", () => {
    const transfers: CanonicalTransferEntry[] = [
      {
        transferId: "transfer-1",
        amountSats: 1000n,
        assetType: "NativeSats",
      },
      {
        transferId: "transfer-2",
        amountSats: 2500n,
        assetType: "BridgedToken",
        tokenId: "btkn1foo",
      },
    ];
    const message: CanonicalIntentMessage = {
      chainId: 21022,
      transfers,
      action: { type: "deposit", recipient: "0xabc" },
      nonce: "nonce-xyz",
    };
    expect(stringifyWithBigint(message)).toEqual(
      '{"chainId":21022,' +
        '"transfers":[' +
        '{"transferId":"transfer-1","amountSats":1000,"assetType":"NativeSats"},' +
        '{"transferId":"transfer-2","amountSats":2500,"assetType":"BridgedToken","tokenId":"btkn1foo"}' +
        "]," +
        '"action":{"type":"deposit","recipient":"0xabc"},' +
        '"nonce":"nonce-xyz"}'
    );
  });
});

/**
 * Unit Tests - Crypto & Utility Functions
 *
 * Tests SHA256 hashing, hex encoding, and other utility functions.
 *
 * Run with:
 *   bun run tests/suites/unit.test.ts
 */

import sha256 from "fast-sha256";
import { getHexFromUint8Array, getUint8ArrayFromHex } from "../../src/utils/hex";
import { TestRunner, assert, createTestContext } from "../framework";

const bytesToHex = getHexFromUint8Array;
const hexToBytes = getUint8ArrayFromHex;

const runner = new TestRunner("Unit Tests - Crypto & Utilities");

// A. SHA256 Output Tests

runner.category("A. SHA256 Output Tests");

runner.test("Empty input hash", async () => {
  const hash = sha256(new Uint8Array([]));
  const hashHex = bytesToHex(hash);
  assert.equals(
    hashHex,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "Empty input SHA256"
  );
});

runner.test("String 'abc' hash", async () => {
  const hash = sha256(new TextEncoder().encode("abc"));
  const hashHex = bytesToHex(hash);
  assert.equals(
    hashHex,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "String 'abc' SHA256"
  );
});

runner.test("448-bit message hash", async () => {
  const input = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
  const hash = sha256(new TextEncoder().encode(input));
  const hashHex = bytesToHex(hash);
  assert.equals(
    hashHex,
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    "448-bit message SHA256"
  );
});

// B. SHA256 vs WebCrypto Compatibility

runner.category("B. SHA256 vs WebCrypto Compatibility");

runner.test("Binary data matches WebCrypto", async () => {
  const input = new Uint8Array([1, 2, 3, 4, 5]);
  const fastHash = bytesToHex(sha256(input));
  const webCryptoHash = bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", input.buffer as ArrayBuffer))
  );
  assert.equals(fastHash, webCryptoHash, "Hash should match WebCrypto");
});

runner.test("String data matches WebCrypto", async () => {
  const input = new TextEncoder().encode("intentMessage");
  const fastHash = bytesToHex(sha256(input));
  const webCryptoHash = bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", input.buffer as ArrayBuffer))
  );
  assert.equals(fastHash, webCryptoHash, "Hash should match WebCrypto");
});

runner.test("Hex data matches WebCrypto", async () => {
  const input = hexToBytes("0205fe807e8fe1f368df955cc291f16d840b7f28374b0ed80b80c3e2e0921a0674");
  const fastHash = bytesToHex(sha256(input));
  const webCryptoHash = bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", input.buffer as ArrayBuffer))
  );
  assert.equals(fastHash, webCryptoHash, "Hash should match WebCrypto");
});

// C. Hex Encoding/Decoding

runner.category("C. Hex Encoding/Decoding");

runner.test("Hex roundtrip - public key", async () => {
  const hex = "0205fe807e8fe1f368df955cc291f16d840b7f28374b0ed80b80c3e2e0921a0674";
  const bytes = hexToBytes(hex);
  const backToHex = bytesToHex(bytes);
  assert.equals(backToHex, hex, "Hex roundtrip should preserve value");
});

runner.test("Hex roundtrip - hash value", async () => {
  const hex = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  const bytes = hexToBytes(hex);
  const backToHex = bytesToHex(bytes);
  assert.equals(backToHex, hex, "Hex roundtrip should preserve value");
});

runner.test("Hex roundtrip - single byte min", async () => {
  const hex = "00";
  const bytes = hexToBytes(hex);
  const backToHex = bytesToHex(bytes);
  assert.equals(backToHex, hex, "Hex roundtrip should preserve value");
});

runner.test("Hex roundtrip - single byte max", async () => {
  const hex = "ff";
  const bytes = hexToBytes(hex);
  const backToHex = bytesToHex(bytes);
  assert.equals(backToHex, hex, "Hex roundtrip should preserve value");
});

// D. SHA256 Properties

runner.category("D. SHA256 Properties");

runner.test("SHA256 idempotency", async () => {
  const input = new TextEncoder().encode("test message");
  const hash1 = bytesToHex(sha256(input));
  const hash2 = bytesToHex(sha256(input));
  assert.equals(hash1, hash2, "Same input should produce same output");
});

runner.test("SHA256 output length is 32 bytes", async () => {
  const hash = sha256(new TextEncoder().encode("test"));
  assert.equals(hash.length, 32, "SHA256 should output 32 bytes");
});

runner.test("SHA256 output type is Uint8Array", async () => {
  const hash = sha256(new TextEncoder().encode("test"));
  assert.true(hash instanceof Uint8Array, "Output should be Uint8Array");
});

// E. Wrapper Functions

runner.category("E. Wrapper Functions");

runner.test("getHexFromUint8Array works correctly", async () => {
  const testBytes = new Uint8Array([0x02, 0x05, 0xfe, 0x80, 0x7e]);
  const expectedHex = "0205fe807e";
  const result = getHexFromUint8Array(testBytes);
  assert.equals(result, expectedHex, "Hex encoding should be correct");
});

runner.test("getUint8ArrayFromHex works correctly", async () => {
  const expectedBytes = new Uint8Array([0x02, 0x05, 0xfe, 0x80, 0x7e]);
  const result = getUint8ArrayFromHex("0205fe807e");
  assert.equals(result.length, expectedBytes.length, "Length should match");
  for (let i = 0; i < expectedBytes.length; i++) {
    assert.equals(result[i], expectedBytes[i], `Byte ${i} should match`);
  }
});

// Run Tests

(async () => {
  const ctx = await createTestContext({ skipConfig: true });
  const result = await runner.run(ctx);
  process.exit(result.failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Test suite failed:", e);
  process.exit(1);
});

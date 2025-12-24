/**
 * Verifies that fast-sha256 produces identical output to:
 * - crypto.subtle.digest (Web Crypto API)
 */

import sha256 from "fast-sha256";
import { getHexFromUint8Array, getUint8ArrayFromHex } from "../src/utils/hex";

// Aliases for convenience
const bytesToHex = getHexFromUint8Array;
const hexToBytes = getUint8ArrayFromHex;

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, message: string): void {
  results.push({
    name,
    passed: condition,
    message: condition ? "PASS" : `FAIL: ${message}`,
  });
}

function testSha256Output(): void {
  const testCases = [
    {
      input: new Uint8Array([]),
      expectedHash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      description: "Empty input",
    },
    {
      input: new TextEncoder().encode("abc"),
      expectedHash:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      description: "String: abc",
    },
    {
      input: new TextEncoder().encode(
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
      ),
      expectedHash:
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      description: "448-bit message",
    },
  ];

  for (const tc of testCases) {
    const hash = sha256(tc.input);
    const hashHex = bytesToHex(hash);
    assert(
      `SHA-256: ${tc.description}`,
      hashHex === tc.expectedHash,
      `Expected ${tc.expectedHash}, got ${hashHex}`
    );
  }
}

async function testSha256MatchesWebCrypto(): Promise<void> {
  const testInputs = [
    new Uint8Array([1, 2, 3, 4, 5]),
    new TextEncoder().encode("intentMessage"),
    hexToBytes(
      "0205fe807e8fe1f368df955cc291f16d840b7f28374b0ed80b80c3e2e0921a0674"
    ),
  ];

  for (let i = 0; i < testInputs.length; i++) {
    const input = testInputs[i];
    const fastHash = bytesToHex(sha256(input));
    const webCryptoHash = bytesToHex(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", input.buffer as ArrayBuffer)
      )
    );

    assert(
      `SHA-256 vs WebCrypto: test case ${i + 1}`,
      fastHash === webCryptoHash,
      `fast-sha256: ${fastHash}, WebCrypto: ${webCryptoHash}`
    );
  }
}

function testHexRoundtrip(): void {
  const testCases = [
    "0205fe807e8fe1f368df955cc291f16d840b7f28374b0ed80b80c3e2e0921a0674",
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "00",
    "ff",
  ];

  for (const hex of testCases) {
    const bytes = hexToBytes(hex);
    const backToHex = bytesToHex(bytes);
    assert(
      `Hex roundtrip: ${hex.substring(0, 16)}...`,
      hex === backToHex,
      `Input: ${hex}, Output: ${backToHex}`
    );
  }
}

function testWrapperFunctions(): void {
  const testBytes = new Uint8Array([0x02, 0x05, 0xfe, 0x80, 0x7e]);
  const expectedHex = "0205fe807e";

  const hexResult = getHexFromUint8Array(testBytes);
  assert(
    "getHexFromUint8Array",
    hexResult === expectedHex,
    `Expected ${expectedHex}, got ${hexResult}`
  );

  const bytesResult = getUint8ArrayFromHex(expectedHex);
  const bytesMatch =
    bytesResult.length === testBytes.length &&
    bytesResult.every((b, i) => b === testBytes[i]);
  assert(
    "getUint8ArrayFromHex",
    bytesMatch,
    `Expected ${Array.from(testBytes)}, got ${Array.from(bytesResult)}`
  );
}

function testSha256Properties(): void {
  const input = new TextEncoder().encode("test message");
  const hash1 = sha256(input);
  const hash2 = sha256(input);

  assert(
    "SHA-256 idempotency",
    bytesToHex(hash1) === bytesToHex(hash2),
    "Same input should produce same output"
  );

  assert(
    "SHA-256 output length",
    hash1.length === 32,
    `Expected 32 bytes, got ${hash1.length}`
  );

  assert(
    "SHA-256 output type",
    hash1 instanceof Uint8Array,
    `Expected Uint8Array, got ${typeof hash1}`
  );
}

async function runAllTests(): Promise<void> {
  console.log("Crypto Compatibility Test Suite\n");

  testSha256Output();
  await testSha256MatchesWebCrypto();
  testHexRoundtrip();
  testWrapperFunctions();
  testSha256Properties();

  console.log("Results:\n");

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${status} ${result.name}`);
    if (!result.passed) {
      console.log(`         ${result.message}`);
    }
    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();

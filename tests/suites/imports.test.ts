/**
 * Module Import Tests - ESM, CJS, Bun, and Modular Imports
 *
 * Tests that the SDK can be imported correctly in different module systems.
 * Also tests modular imports without wallet dependencies.
 *
 * Run with:
 *   bun run tests/suites/imports.test.ts
 *
 * Note: For true CJS testing, run separately:
 *   node tests/suites/imports.test.cjs
 */

import sha256 from "fast-sha256";
import { TestRunner, assert, createTestContext } from "../framework";

// Import from built dist for module format testing
import {
  ApiClient,
  TypedAmmApi,
  validatePublicKey,
  encodeSparkHumanReadableTokenIdentifier,
  getHumanReadableTokenIdentifier,
  getTokenIdentifierHashes,
  getTokenIdentifierWithHashes,
  SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
  getNetworkConfig,
  encodeSparkAddress,
  generateNonce,
  AuthManager,
} from "../../index";

const runner = new TestRunner("Module Import Tests");

// A. ESM Imports

runner.category("A. ESM Imports");

runner.test("ApiClient import and instantiation", async () => {
  assert.equals(typeof ApiClient, "function", "ApiClient should be a function");
  const client = new ApiClient({
    ammGatewayUrl: "https://api.example.com",
    mempoolApiUrl: "https://mempool.space",
    explorerUrl: "https://mempool.space",
  });
  assert.defined(client, "ApiClient should instantiate");
});

runner.test("TypedAmmApi import", async () => {
  assert.equals(typeof TypedAmmApi, "function", "TypedAmmApi should be a function");
});

runner.test("validatePublicKey import and function", async () => {
  assert.equals(typeof validatePublicKey, "function", "validatePublicKey should be a function");
  // Test validation catches errors
  try {
    validatePublicKey("ed25519:invalid");
  } catch {
    // Expected - validation should catch invalid keys
  }
});

// B. Modular Imports (No Wallet Dependencies)

runner.category("B. Modular Imports");

runner.test("getNetworkConfig works", async () => {
  assert.equals(typeof getNetworkConfig, "function", "getNetworkConfig should be a function");
  const config = getNetworkConfig("REGTEST");
  assert.defined(config.ammGatewayUrl, "Config should have ammGatewayUrl");
});

runner.test("generateNonce works", async () => {
  assert.equals(typeof generateNonce, "function", "generateNonce should be a function");
  const nonce = generateNonce();
  assert.true(nonce.length > 0, "Nonce should not be empty");
});

runner.test("encodeSparkAddress works", async () => {
  assert.equals(typeof encodeSparkAddress, "function", "encodeSparkAddress should be a function");
  const address = encodeSparkAddress({
    identityPublicKey: "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
    network: "REGTEST",
  });
  assert.true(address.length > 10, "Address should be generated");
  console.log(`    Generated address: ${address.slice(0, 20)}...`);
});

runner.test("AuthManager with custom signer", async () => {
  assert.equals(typeof AuthManager, "function", "AuthManager should be a function");

  class TestSigner {
    async signMessage(_message: Uint8Array): Promise<Uint8Array> {
      return new Uint8Array(64);
    }
  }

  const apiClient = new ApiClient({
    ammGatewayUrl: "https://api.example.com",
    mempoolApiUrl: "https://mempool.space",
    explorerUrl: "https://mempool.space",
  });
  const signer = new TestSigner();
  const authManager = new AuthManager(apiClient, "test-pubkey", signer as any);
  assert.defined(authManager, "AuthManager should instantiate with custom signer");
});

// C. Token Identifier Functions

runner.category("C. Token Identifier Functions");

runner.test("getHumanReadableTokenIdentifier produces correct address", async () => {
  const generatedAddress = getHumanReadableTokenIdentifier({
    issuerPublicKey: "029e4d50f931c170e100c1b7129e353cddd69c8ae50bf274e7a68b05144ef8b55e",
    decimals: 8,
    isFreezable: false,
    name: "FlashSparks",
    ticker: "FSPKS",
    maxSupply: 2100000000000000n,
    network: "MAINNET",
    creationEntityPublicKey: SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
  });

  assert.equals(
    generatedAddress,
    "btkn1daywtenlww42njymqzyegvcwuy3p9f26zknme0srxa7tagewvuys86h553",
    "Token address should match expected value"
  );
});

runner.test("getTokenIdentifierHashes and getTokenIdentifierWithHashes work", async () => {
  function bigintTo16ByteArray(value: bigint): Uint8Array {
    let valueToTrack = value;
    const buffer = new Uint8Array(16);
    for (let i = 15; i >= 0 && valueToTrack > 0n; i--) {
      buffer[i] = Number(valueToTrack & 255n);
      valueToTrack >>= 8n;
    }
    return buffer;
  }

  const issuerPublicKey = Buffer.from(
    "031111111111111111111111111111111111111111111111111111111111111111",
    "hex"
  );

  const hashes = getTokenIdentifierHashes({
    issuerPublicKey,
    decimals: 8,
    isFreezable: false,
    name: "FlashSparks",
    ticker: "FSPKS",
    maxSupply: 100_000_000_000_000_000n,
    network: "MAINNET",
    creationEntityPublicKey: SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
  });

  assert.defined(hashes, "Hashes should be returned");

  // Test that we can find a vanity suffix
  let maxSupply = 100_000_000_000_000_000n;
  let found = false;
  const maxIterations = 1000;

  for (let i = 0; i < maxIterations && !found; i++) {
    const tokenIdentifier = getTokenIdentifierWithHashes(hashes);
    const humanReadable = encodeSparkHumanReadableTokenIdentifier(tokenIdentifier, "MAINNET");

    if (humanReadable.length > 10) {
      found = true;
      console.log(`    Sample token identifier: ${humanReadable.slice(0, 20)}...`);
    }

    hashes.maxSupplyHash = sha256(bigintTo16ByteArray(++maxSupply));
  }

  assert.true(found, "Should be able to generate token identifiers");
});

// D. Bun Compatibility

runner.category("D. Bun Runtime");

runner.test("Bun global is available", async () => {
  // @ts-ignore
  if (typeof Bun !== "undefined") {
    // @ts-ignore
    console.log(`    Bun version: ${Bun.version}`);
    assert.true(true, "Running in Bun");
  } else {
    console.log("    Not running in Bun (this is OK for Node.js)");
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

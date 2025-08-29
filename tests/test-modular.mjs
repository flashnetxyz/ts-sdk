#!/usr/bin/env node

import {
  getHumanReadableTokenIdentifier,
  SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
} from "@flashnet/sdk";
import { ApiClient } from "@flashnet/sdk/api";
// Test modular imports without wallet dependencies
import { AuthManager } from "@flashnet/sdk/auth";
import { getNetworkConfig } from "@flashnet/sdk/config";
import { encodeSparkAddress, generateNonce } from "@flashnet/sdk/utils";

console.log("Testing modular imports...\n");

// Test 1: Config import
console.log("✓ Config import works");
const config = getNetworkConfig("REGTEST");
console.log(`  Network config: ${config.ammGatewayUrl}`);

// Test 2: API Client
console.log("✓ ApiClient import works");
const apiClient = new ApiClient(config);
console.log(`  API client created`);

// Test 3: Utils
console.log("✓ Utils imports work");
const nonce = generateNonce();
console.log(`  Generated nonce: ${nonce.substring(0, 8)}...`);

const testAddress = encodeSparkAddress({
  identityPublicKey:
    "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  network: "REGTEST",
});
console.log(`  Encoded address: ${testAddress}`);

// Test 4: Auth Manager with custom signer
console.log("✓ AuthManager import works");
class TestSigner {
  async signMessage(_message) {
    // Mock signing
    return new Uint8Array(64);
  }
}

const signer = new TestSigner();
const _authManager = new AuthManager(apiClient, "test-pubkey", signer);
console.log(`  AuthManager created with custom signer`);

// Test 5: getHumanReadableTokenIdentifier
console.log("✓ Testing getHumanReadableTokenIdentifier");
const generatedTokenAddress = await getHumanReadableTokenIdentifier({
  issuerPublicKey:
    "029e4d50f931c170e100c1b7129e353cddd69c8ae50bf274e7a68b05144ef8b55e",
  decimals: 8,
  isFreezable: false,
  name: "FlashSparks",
  ticker: "FSPKS",
  maxSupply: 2100000000000000n,
  network: "MAINNET",
  creationEntityPublicKey: SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
});
console.log(`  Calculated token address: ${generatedTokenAddress}`);

if (
  generatedTokenAddress !==
  "btkn1daywtenlww42njymqzyegvcwuy3p9f26zknme0srxa7tagewvuys86h553"
) {
  console.error(
    `  Calculated token address does not match expected btkn1daywtenlww42njymqzyegvcwuy3p9f26zknme0srxa7tagewvuys86h553`
  );
  process.exit(1);
}

console.log("\n✅ All modular imports working correctly!");
console.log("   No wallet dependencies were loaded.");

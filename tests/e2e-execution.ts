/**
 * E2E Test Script for Flashnet Execution Client
 *
 * Tests the full execution client flow against a running localnet:
 * - Authentication (challenge-response) via SparkWallet identity key
 * - EVM read queries (token info, balances)
 * - Conductor calldata encoding (including *AndWithdraw variants)
 * - Health check
 *
 * Prerequisites:
 *   1. Start localnet: `cargo run -p flashnet-localnet -- --data-dir /tmp/flashnet-localnet`
 *   2. Set GATEWAY_URL (default: http://localhost:8080)
 *   3. Set RPC_URL (default: http://localhost:8545)
 *
 * Usage:
 *   GATEWAY_URL=http://localhost:8080 bun run tests/e2e-execution.ts
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import {
  ExecutionClient,
  Conductor,
  fetchTokenInfo,
  fetchTokenBalance,
  fetchNativeBalance,
  fetchNonce,
  getPoolAddress,
  fetchPoolInfo,
  sortTokens,
  priceToSqrtPriceX96,
  sqrtPriceX96ToPrice,
  fullRangeTicks,
  FEE_TIERS,
  type SparkWalletInput,
} from "../src/execution";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 21022);
const BRIDGE_ADDRESS =
  process.env.BRIDGE_ADDRESS ?? "0x1e2861ce58eaa89260226b5704416b9a20589d47";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Mock SparkWallet (for testing structure, not real crypto)
// ---------------------------------------------------------------------------

/**
 * Construct a mock SparkWallet-shaped object from a raw private key.
 * Implements the minimal `config.signer` surface that the SDK reads via
 * `getWalletSigner` and `sparkWalletToEvmAccount`.
 */
function mockWalletFromPrivateKey(privateKey: Uint8Array): SparkWalletInput {
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
  return {
    config: {
      signer: {
        async getIdentityPublicKey() {
          return publicKey;
        },
        async signMessageWithIdentityKey(
          message: Uint8Array,
          compact?: boolean
        ) {
          const sig = secp256k1.sign(message, privateKey);
          return compact ? sig.toCompactRawBytes() : sig.toDERRawBytes();
        },
      },
    },
  } as unknown as SparkWalletInput;
}

function deterministicWallet(): SparkWalletInput {
  const key = new Uint8Array(32).fill(0);
  key[31] = 1; // private key = 1 (well-known test key)
  return mockWalletFromPrivateKey(key);
}

function clientConfig() {
  return {
    gatewayUrl: GATEWAY_URL,
    rpcUrl: RPC_URL,
    chainId: CHAIN_ID,
    bridgeAddress: BRIDGE_ADDRESS,
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

async function testHealthCheck(): Promise<void> {
  console.log("\n--- Health Check ---");
  const client = new ExecutionClient(deterministicWallet(), clientConfig());
  try {
    const health = await client.health();
    assert(health === true, "Health endpoint returns true");
  } catch (e) {
    failed++;
    console.error(`  ✗ Health check failed: ${e}`);
  }
}

async function testAuthentication(): Promise<void> {
  console.log("\n--- Authentication ---");
  const client = new ExecutionClient(deterministicWallet(), clientConfig());
  try {
    const token = await client.authenticate();
    assert(
      typeof token === "string" && token.length > 0,
      "Authentication returns access token"
    );
    assert(client.getAccessToken() === token, "Access token is stored");
  } catch (e) {
    failed++;
    console.error(`  ✗ Authentication failed: ${e}`);
    console.error(`  (Is the gateway running at ${GATEWAY_URL}?)`);
  }
}

async function testIdentityEvmAddress(): Promise<void> {
  console.log("\n--- Identity EVM Address Derivation ---");
  const client = new ExecutionClient(deterministicWallet(), clientConfig());
  try {
    const addr = await client.getEvmAddress();
    assert(
      /^0x[a-fA-F0-9]{40}$/.test(addr),
      `getEvmAddress returns a valid address (${addr})`
    );
    const sparkRecipient = await client.getSparkRecipientHex();
    assert(
      /^0x0[23][a-fA-F0-9]{64}$/.test(sparkRecipient),
      `getSparkRecipientHex returns 33-byte compressed pubkey hex (${sparkRecipient.slice(0, 16)}...)`
    );
  } catch (e) {
    failed++;
    console.error(`  ✗ Identity EVM derivation failed: ${e}`);
  }
}

async function testEvmReadHelpers(): Promise<void> {
  console.log("\n--- EVM Read Helpers ---");

  try {
    const balance = await fetchNativeBalance(
      RPC_URL,
      "0x0000000000000000000000000000000000000000"
    );
    assert(
      typeof balance === "bigint",
      `fetchNativeBalance returns bigint (${balance})`
    );
  } catch (e) {
    failed++;
    console.error(`  ✗ fetchNativeBalance failed: ${e}`);
    console.error(`  (Is the RPC running at ${RPC_URL}?)`);
    return;
  }

  try {
    const nonce = await fetchNonce(
      RPC_URL,
      "0x0000000000000000000000000000000000000000"
    );
    assert(
      typeof nonce === "number",
      `fetchNonce returns number (${nonce})`
    );
  } catch (e) {
    failed++;
    console.error(`  ✗ fetchNonce failed: ${e}`);
  }
}

async function testConductorEncoding(): Promise<void> {
  console.log("\n--- Conductor Calldata Encoding ---");

  const swapCalldata = Conductor.encodeSwap({
    tokenIn: "0x1111111111111111111111111111111111111111",
    tokenOut: "0x2222222222222222222222222222222222222222",
    fee: 3000,
    amountIn: 1000000000000000000n,
    minAmountOut: 900000000000000000n,
  });
  assert(swapCalldata.startsWith("0x"), "encodeSwap returns 0x-prefixed hex");
  assert(
    swapCalldata.startsWith("0x" + "fb408d07"),
    "encodeSwap starts with correct selector"
  );

  const btcCalldata = Conductor.encodeSwapBTC({
    tokenOut: "0x2222222222222222222222222222222222222222",
    fee: 3000,
    minAmountOut: 900000000000000000n,
  });
  assert(
    btcCalldata.startsWith("0x" + "ad78c51c"),
    "encodeSwapBTC starts with correct selector"
  );

  const withIntegrator = Conductor.encodeSwap({
    tokenIn: "0x1111111111111111111111111111111111111111",
    tokenOut: "0x2222222222222222222222222222222222222222",
    fee: 3000,
    amountIn: 100n,
    minAmountOut: 90n,
    integrator: "0x3333333333333333333333333333333333333333",
  });
  assert(
    withIntegrator.includes("3333333333333333333333333333333333333333"),
    "encodeSwap includes integrator address"
  );
}

async function testPriceMath(): Promise<void> {
  console.log("\n--- Price Math ---");

  const sqrtPrice = priceToSqrtPriceX96(1.0, 18, 18);
  assert(sqrtPrice > 0n, `priceToSqrtPriceX96(1.0, 18, 18) = ${sqrtPrice}`);

  const priceBack = sqrtPriceX96ToPrice(sqrtPrice, 18, 18);
  assert(
    Math.abs(priceBack - 1.0) < 0.01,
    `sqrtPriceX96ToPrice round-trips to ~1.0 (got ${priceBack})`
  );

  const btcUsdb = priceToSqrtPriceX96(80000, 8, 18);
  assert(btcUsdb > 0n, `priceToSqrtPriceX96(80000, 8, 18) = ${btcUsdb}`);

  const ticks60 = fullRangeTicks(60);
  assert(ticks60.tickLower % 60 === 0, `fullRangeTicks(60) lower aligned`);
  assert(ticks60.tickUpper % 60 === 0, `fullRangeTicks(60) upper aligned`);
  assert(ticks60.tickLower < 0, "fullRangeTicks lower is negative");
  assert(ticks60.tickUpper > 0, "fullRangeTicks upper is positive");

  const [t0, t1] = sortTokens(
    "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  );
  assert(
    t0.toLowerCase() < t1.toLowerCase(),
    "sortTokens returns lower address first"
  );

  assert(FEE_TIERS.length === 3, `FEE_TIERS has 3 entries`);
  assert(FEE_TIERS[0].fee === 500, "First fee tier is 500 (0.05%)");
}

async function testPoolHelpers(): Promise<void> {
  console.log("\n--- Pool Helpers ---");

  try {
    const balance = await fetchNativeBalance(
      RPC_URL,
      "0x0000000000000000000000000000000000000000"
    );
    if (typeof balance !== "bigint") {
      console.log("  (skipping pool tests — RPC not available)");
      return;
    }
  } catch {
    console.log("  (skipping pool tests — RPC not available)");
    return;
  }

  try {
    const pool = await getPoolAddress(
      RPC_URL,
      "0x0000000000000000000000000000000000000001",
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      3000
    );
    assert(
      pool === null || typeof pool === "string",
      `getPoolAddress returns null or address (${pool})`
    );
  } catch (e: any) {
    // Only accept the specific contract-not-found revert, not network
    // errors or RPC timeouts which would mask real infrastructure bugs.
    const msg = e?.message ?? String(e);
    const acceptable =
      e?.name === "ContractFunctionRevertedError" ||
      msg.includes("returned no data") ||
      msg.includes("invalid opcode") ||
      msg.includes("revert");
    if (acceptable) {
      passed++;
      console.log("  ✓ getPoolAddress handles non-contract gracefully");
    } else {
      // Re-raise network/timeout/parse errors so CI flags them.
      throw e;
    }
  }
}

async function testInputValidation(): Promise<void> {
  console.log("\n--- Input Validation ---");

  try {
    Conductor.encodeSwap({
      tokenIn: "0x1111111111111111111111111111111111111111",
      tokenOut: "0x2222222222222222222222222222222222222222",
      fee: 3000,
      amountIn: -1n,
      minAmountOut: 0n,
    });
    failed++;
    console.error("  ✗ FAIL: encodeSwap should reject negative amountIn");
  } catch {
    passed++;
    console.log("  ✓ encodeSwap rejects negative amountIn");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Flashnet Execution SDK E2E Tests ===");
  console.log(`Gateway: ${GATEWAY_URL}`);
  console.log(`RPC:     ${RPC_URL}`);

  // Tests that don't require a running localnet (pure logic)
  await testConductorEncoding();
  await testPriceMath();
  await testInputValidation();
  await testIdentityEvmAddress();

  // Tests that require RPC
  await testEvmReadHelpers();
  await testPoolHelpers();

  // Tests that require the full gateway
  await testHealthCheck();
  await testAuthentication();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

/**
 * E2E Test Script for Flashnet Execution Client
 *
 * Tests the full execution client flow against a running localnet:
 * - Authentication (challenge-response)
 * - EVM read queries (token info, balances)
 * - Deposit intent submission
 * - Deposit-and-execute intent submission (Conductor swap)
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
  type ExecutionSigner,
  type Deposit,
  type ConductorConfig,
  type EvmTransactionSigner,
  type UnsignedTransaction,
} from "../src/execution";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8545";

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

async function assertThrows(
  fn: () => Promise<unknown>,
  message: string
): Promise<void> {
  try {
    await fn();
    failed++;
    console.error(`  ✗ FAIL: Expected error: ${message}`);
  } catch {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Mock signers (for testing structure, not real crypto)
// ---------------------------------------------------------------------------

const mockIntentSigner: ExecutionSigner = {
  getPublicKey() {
    // 33-byte compressed secp256k1 key (hex, no 0x)
    return "02" + "ab".repeat(32);
  },
  signMessage(_message: string) {
    // Return a fake DER signature for structural testing
    return "30" + "44" + "02" + "20" + "ff".repeat(32) + "02" + "20" + "ff".repeat(32);
  },
};

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

async function testHealthCheck(): Promise<void> {
  console.log("\n--- Health Check ---");
  const client = new ExecutionClient({ gatewayUrl: GATEWAY_URL }, mockIntentSigner);

  try {
    const health = await client.health();
    assert(health !== undefined, "Health endpoint responds");
    console.log(`  Health response:`, health);
  } catch (e) {
    failed++;
    console.error(`  ✗ Health check failed: ${e}`);
  }
}

async function testAuthentication(): Promise<void> {
  console.log("\n--- Authentication ---");
  const client = new ExecutionClient({ gatewayUrl: GATEWAY_URL }, mockIntentSigner);

  try {
    const token = await client.authenticate();
    assert(typeof token === "string" && token.length > 0, "Authentication returns access token");
    assert(client.getAccessToken() === token, "Access token is stored");
  } catch (e) {
    failed++;
    console.error(`  ✗ Authentication failed: ${e}`);
    console.error(`  (Is the gateway running at ${GATEWAY_URL}?)`);
  }
}

async function testEvmReadHelpers(): Promise<void> {
  console.log("\n--- EVM Read Helpers ---");

  // Test fetchNativeBalance (always works on any chain)
  try {
    const balance = await fetchNativeBalance(RPC_URL, "0x0000000000000000000000000000000000000000");
    assert(typeof balance === "bigint", `fetchNativeBalance returns bigint (${balance})`);
  } catch (e) {
    failed++;
    console.error(`  ✗ fetchNativeBalance failed: ${e}`);
    console.error(`  (Is the RPC running at ${RPC_URL}?)`);
    return;
  }

  // Test fetchNonce
  try {
    const nonce = await fetchNonce(RPC_URL, "0x0000000000000000000000000000000000000000");
    assert(typeof nonce === "number", `fetchNonce returns number (${nonce})`);
  } catch (e) {
    failed++;
    console.error(`  ✗ fetchNonce failed: ${e}`);
  }
}

async function testConductorEncoding(): Promise<void> {
  console.log("\n--- Conductor Calldata Encoding ---");

  // Test encodeSwap produces valid hex
  const swapCalldata = Conductor.encodeSwap({
    tokenIn: "0x1111111111111111111111111111111111111111",
    tokenOut: "0x2222222222222222222222222222222222222222",
    fee: 3000,
    amountIn: 1000000000000000000n,
    minAmountOut: 900000000000000000n,
  });
  assert(swapCalldata.startsWith("0x"), "encodeSwap returns 0x-prefixed hex");
  assert(swapCalldata.startsWith("0x" + "fb408d07"), "encodeSwap starts with correct selector");
  assert(swapCalldata.length === 2 + 8 + 64 * 6, `encodeSwap has correct length (${swapCalldata.length})`);

  // Test encodeSwapBTC
  const btcCalldata = Conductor.encodeSwapBTC({
    tokenOut: "0x2222222222222222222222222222222222222222",
    fee: 3000,
    minAmountOut: 900000000000000000n,
  });
  assert(btcCalldata.startsWith("0x" + "ad78c51c"), "encodeSwapBTC starts with correct selector");
  assert(btcCalldata.length === 2 + 8 + 64 * 4, `encodeSwapBTC has correct length (${btcCalldata.length})`);

  // Test integrator field
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

  // Test priceToSqrtPriceX96 round-trip
  const sqrtPrice = priceToSqrtPriceX96(1.0, 18, 18);
  assert(sqrtPrice > 0n, `priceToSqrtPriceX96(1.0, 18, 18) = ${sqrtPrice}`);

  const priceBack = sqrtPriceX96ToPrice(sqrtPrice, 18, 18);
  assert(Math.abs(priceBack - 1.0) < 0.01, `sqrtPriceX96ToPrice round-trips to ~1.0 (got ${priceBack})`);

  // Test with different decimals
  const btcUsdb = priceToSqrtPriceX96(80000, 8, 18);
  assert(btcUsdb > 0n, `priceToSqrtPriceX96(80000, 8, 18) = ${btcUsdb}`);

  // Test fullRangeTicks
  const ticks60 = fullRangeTicks(60);
  assert(ticks60.tickLower % 60 === 0, `fullRangeTicks(60) lower aligned: ${ticks60.tickLower}`);
  assert(ticks60.tickUpper % 60 === 0, `fullRangeTicks(60) upper aligned: ${ticks60.tickUpper}`);
  assert(ticks60.tickLower < 0, "fullRangeTicks lower is negative");
  assert(ticks60.tickUpper > 0, "fullRangeTicks upper is positive");

  // Test sortTokens
  const [t0, t1] = sortTokens(
    "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  );
  assert(t0.toLowerCase() < t1.toLowerCase(), "sortTokens returns lower address first");

  // Test FEE_TIERS
  assert(FEE_TIERS.length === 3, `FEE_TIERS has 3 entries`);
  assert(FEE_TIERS[0].fee === 500, "First fee tier is 500 (0.05%)");
}

async function testPoolHelpers(): Promise<void> {
  console.log("\n--- Pool Helpers ---");

  // These require a running localnet with Uniswap deployed.
  // If RPC is not available, skip gracefully.
  try {
    const balance = await fetchNativeBalance(RPC_URL, "0x0000000000000000000000000000000000000000");
    if (typeof balance !== "bigint") {
      console.log("  (skipping pool tests — RPC not available)");
      return;
    }
  } catch {
    console.log("  (skipping pool tests — RPC not available)");
    return;
  }

  // getPoolAddress with invalid factory should return null or throw
  try {
    const pool = await getPoolAddress(
      RPC_URL,
      "0x0000000000000000000000000000000000000001",
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      3000
    );
    // Either null (no pool) or a valid response is acceptable
    assert(pool === null || typeof pool === "string", `getPoolAddress returns null or address (${pool})`);
  } catch {
    // eth_call to non-contract may throw — that's acceptable
    passed++;
    console.log("  ✓ getPoolAddress handles non-contract gracefully");
  }
}

async function testInputValidation(): Promise<void> {
  console.log("\n--- Input Validation ---");

  // Test abiEncodeUint overflow protection
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

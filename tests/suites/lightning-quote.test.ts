/**
 * Lightning Payment Quote Tests
 *
 * Tests the lightning payment quote functionality.
 * This test is designed to work against a live MAINNET environment.
 *
 * Run with:
 *   AMM_URL=https://api.flashnet.xyz \
 *   MEMPOOL_URL=https://mempool.space \
 *   SPARKSCAN_URL=https://api.sparkscan.io \
 *   FAUCET_URL=https://faucet.example.com \
 *   bun run tests/suites/lightning-quote.test.ts
 */

import { TestRunner, assert, createTestContext, type TestContext } from "../framework";
import {
  ApiClient,
  TypedAmmApi,
  BTC_ASSET_PUBKEY,
  decodeSparkHumanReadableTokenIdentifier,
  FlashnetClient,
} from "../../index";

const runner = new TestRunner("Lightning Payment Quote Tests");

// Sample USDB token (public token address)
const USDB_TOKEN = "btkn1xgrvjwey5ngcagvap2dzzvsy4uk8ua9x69k82dwvt5e7ef9drm9qztux87";

let api: ApiClient;
let typed: TypedAmmApi;
let poolId: string;
let tokenHex: string;

runner.beforeAll(async (ctx: TestContext) => {
  console.log("[Setup] Initializing API clients...");

  api = new ApiClient({
    ammGatewayUrl: ctx.config.ammUrl,
    mempoolApiUrl: ctx.config.mempoolUrl,
    explorerUrl: ctx.config.mempoolUrl,
    sparkScanUrl: ctx.config.sparkscanUrl,
  });
  typed = new TypedAmmApi(api);

  // Decode token
  const network = ctx.config.sparkNetwork === "MAINNET" ? "MAINNET" : "REGTEST";
  const decoded = decodeSparkHumanReadableTokenIdentifier(USDB_TOKEN as any, network as any);
  tokenHex = decoded.tokenIdentifier;
  console.log(`  Token hex: ${tokenHex.slice(0, 16)}...`);
});

// A. Pool Verification

runner.category("A. Pool Verification");

runner.test("A1: Find USDB/BTC pool", async () => {
  const pools = await typed.listPools({
    assetAAddress: tokenHex,
    assetBAddress: BTC_ASSET_PUBKEY,
  });

  assert.greater(pools.pools.length, 0, "Should find at least one pool");

  poolId = pools.pools[0].lpPublicKey;
  console.log(`    Pool ID: ${poolId.slice(0, 20)}...`);
});

runner.test("A2: Get pool details", async () => {
  const details = await typed.getPool(poolId);

  assert.defined(details.assetAReserve, "Should have asset A reserve");
  assert.defined(details.assetBReserve, "Should have asset B reserve");

  console.log(`    BTC Reserve: ${details.assetBReserve} sats`);
  console.log(`    Token Reserve: ${details.assetAReserve}`);
  console.log(`    Status: ${details.status}`);
  console.log(`    Bonding: ${details.bondingProgressPercent ?? "graduated"}`);
});

// B. Swap Simulation

runner.category("B. Swap Simulation");

runner.test("B1: Simulate token to BTC swap", async () => {
  const sim = await typed.simulateSwap({
    poolId,
    assetInAddress: tokenHex,
    assetOutAddress: BTC_ASSET_PUBKEY,
    amountIn: "1035",
  });

  assert.defined(sim.amountOut, "Should have amount out");
  console.log(`    1035 tokens -> ${sim.amountOut} sats`);
  console.log(`    Price impact: ${sim.priceImpactPct}%`);
});

runner.category("C. FlashnetClient Quote Methods");

runner.test("C1: findBestPoolForTokenToBtc", async (ctx) => {
  // Create mock wallet for FlashnetClient
  const mockWallet = {
    getIdentityPublicKey: async () => `03${"00".repeat(32)}`,
    getSparkAddress: async () => "spark1mock",
    getBalance: async () => ({ balance: 0n, tokenBalances: new Map() }),
    getTransfer: async () => null,
    cleanupConnections: async () => {},
    config: {
      signer: { signMessageWithIdentityKey: async () => new Uint8Array(64) },
    },
  };

  const fnClient = new FlashnetClient(mockWallet as any, {
    sparkNetworkType: ctx.config.sparkNetwork as any,
    clientConfig: {
      ammGatewayUrl: ctx.config.ammUrl,
      mempoolApiUrl: ctx.config.mempoolUrl,
      explorerUrl: ctx.config.mempoolUrl,
      sparkScanUrl: ctx.config.sparkscanUrl,
    },
  });

  // Access internal methods
  const clientAny = fnClient as any;
  clientAny.typedApi = typed;
  clientAny.isAuthenticated = true;
  clientAny.sparkNetwork = ctx.config.sparkNetwork;

  // Verify token hex conversion
  const convertedHex = clientAny.toHexTokenIdentifier(USDB_TOKEN);
  assert.equals(convertedHex, tokenHex, "Token hex conversion should match");

  // Test findBestPoolForTokenToBtc
  const poolQuote = await clientAny.findBestPoolForTokenToBtc(USDB_TOKEN, "1100", 0);

  assert.defined(poolQuote.poolId, "Should have pool ID");
  assert.defined(poolQuote.tokenAmountRequired, "Should have token amount required");
  assert.defined(poolQuote.estimatedAmmFee, "Should have estimated AMM fee");

  console.log(`    Pool ID: ${poolQuote.poolId.slice(0, 20)}...`);
  console.log(`    Token required: ${poolQuote.tokenAmountRequired}`);
  console.log(`    AMM fee: ${poolQuote.estimatedAmmFee}`);
  console.log(`    Execution price: ${parseFloat(poolQuote.executionPrice).toFixed(8)}`);
});

runner.run().then((result) => {
  process.exit(result.failed > 0 ? 1 : 0);
}).catch((e) => {
  console.error("Test suite failed:", e);
  process.exit(1);
});

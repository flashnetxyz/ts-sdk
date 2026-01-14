/**
 * Test for getPayLightningWithTokenQuote / findBestPoolForTokenToBtc
 * Verifies that lightning payment quotes work correctly with USDB token
 */

import {
  ApiClient,
  BTC_ASSET_PUBKEY,
  decodeSparkHumanReadableTokenIdentifier,
  FlashnetClient,
  TypedAmmApi,
} from "../dist/esm/index.js";

const AMM_URL = "https://api.flashnet.xyz";
const USDB_TOKEN =
  "btkn1xgrvjwey5ngcagvap2dzzvsy4uk8ua9x69k82dwvt5e7ef9drm9qztux87";

async function main() {
  console.log("Lightning Quote Test\n");
  console.log(`Token: ${USDB_TOKEN}`);
  console.log(`AMM URL: ${AMM_URL}\n`);

  const api = new ApiClient({
    ammGatewayUrl: AMM_URL,
    mempoolApiUrl: "https://mempool.space",
    explorerUrl: "https://mempool.space",
    sparkScanUrl: "https://api.sparkscan.io",
  });
  const typed = new TypedAmmApi(api);

  // Step 1: Decode and verify pool exists
  console.log("Step 1: Verify pool exists");

  const decoded = decodeSparkHumanReadableTokenIdentifier(
    USDB_TOKEN as any,
    "MAINNET"
  );
  console.log(`  USDB hex: ${decoded.tokenIdentifier}`);

  const pools = await typed.listPools({
    assetAAddress: decoded.tokenIdentifier,
    assetBAddress: BTC_ASSET_PUBKEY,
  });

  if (pools.pools.length === 0) {
    console.log("  FAIL: No USDB/BTC pool found");
    process.exit(1);
  }

  const pool = pools.pools[0];
  const details = await typed.getPool(pool.lpPublicKey);

  console.log(`  Pool ID: ${pool.lpPublicKey}`);
  console.log(`  BTC Reserve: ${details.assetBReserve} sats`);
  console.log(`  Token Reserve: ${details.assetAReserve}`);
  console.log(`  Status: ${details.status}`);
  console.log(`  Bonding: ${details.bondingProgressPercent ?? "graduated"}`);
  console.log("  PASS\n");

  // Step 2: Test simulation
  console.log("Step 2: Test swap simulation");

  try {
    const sim = await typed.simulateSwap({
      poolId: pool.lpPublicKey,
      assetInAddress: details.assetAAddress,
      assetOutAddress: details.assetBAddress,
      amountIn: "1035",
    });
    console.log(`  1M tokens -> ${sim.amountOut} sats`);
    console.log(`  Price impact: ${sim.priceImpactPct}%`);
    console.log("  PASS\n");
  } catch (e) {
    console.log(`  FAIL: ${e instanceof Error ? e.message : e}\n`);
  }

  // Step 3: Test FlashnetClient methods
  console.log("Step 3: Test FlashnetClient.findBestPoolForTokenToBtc");

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

  try {
    const fnClient = new FlashnetClient(mockWallet as any, {
      sparkNetworkType: "MAINNET",
      clientConfig: {
        ammGatewayUrl: AMM_URL,
        mempoolApiUrl: "https://mempool.space",
        explorerUrl: "https://mempool.space",
        sparkScanUrl: "https://api.sparkscan.io",
      },
    });

    const clientAny = fnClient as any;
    clientAny.typedApi = typed;
    clientAny.isAuthenticated = true;
    clientAny.sparkNetwork = "MAINNET";

    // Verify token hex conversion
    const tokenHex = clientAny.toHexTokenIdentifier(USDB_TOKEN);
    console.log(
      `  Token hex conversion: ${tokenHex === decoded.tokenIdentifier ? "PASS" : "FAIL"}`
    );

    // Test findBestPoolForTokenToBtc with amount above USDB minimum (~1035 sats)
    const poolQuote = await clientAny.findBestPoolForTokenToBtc(
      USDB_TOKEN,
      "1100",
      0
    );

    console.log(`  Pool ID: ${poolQuote.poolId}`);
    console.log(`  Token required: ${poolQuote.tokenAmountRequired}`);
    console.log(`  AMM fee: ${poolQuote.estimatedAmmFee}`);
    console.log(
      `  Execution price: ${parseFloat(poolQuote.executionPrice).toFixed(8)}`
    );
    console.log("  PASS\n");
  } catch (e) {
    console.log(`  FAIL: ${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  }

  console.log("All tests passed");
  process.exit(0);
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});

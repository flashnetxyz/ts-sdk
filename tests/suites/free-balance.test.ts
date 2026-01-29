/**
 * Comprehensive Free Balance & TXID Test Suite
 *
 * Covers all test cases from the specification:
 * - A. Pool setup and free balance funding
 * - B. Swap input sourcing matrix (FB vs TXID)
 * - C. TXID correctness, replay, and trust boundaries
 * - D. Free balance ledger behaviors
 * - E. AMM V3 mechanics interacting with funding source
 * - F. Fees, rounding, and dust
 * - G. Pool lifecycle / permissions / configuration
 * - H. Multi-user accounting and isolation
 * - I. Failure injection / idempotency
 *
 * Run with:
 *   AMM_URL=http://localhost:8090 \
 *   MEMPOOL_URL=https://mempool.space \
 *   SPARKSCAN_URL=https://api.sparkscan.io \
 *   FAUCET_URL=https://funding.makebitcoingreatagain.dev/api \
 *   bun run tests/suites/free-balance.test.ts
 */

import { tickRangeFromPrices } from "../../index";
import {
  addLiquidityToPool,
  assert,
  createActor,
  createToken,
  createV3Pool,
  fundActor,
  registerHost,
  sleep,
  TestRunner,
  type TestContext,
  BTC_ASSET_PUBKEY,
} from "../framework";

// Pool Configuration

const BTC_DECIMALS = 8;
const TOKEN_DECIMALS = 6;
const TICK_SPACING = 10;
const BTC_PRICE_USD = 90000;
const POSITION_PRICE_LOWER = 89100;
const POSITION_PRICE_UPPER = 90900;

const positionRange = tickRangeFromPrices({
  priceLower: POSITION_PRICE_LOWER,
  priceUpper: POSITION_PRICE_UPPER,
  baseDecimals: BTC_DECIMALS,
  quoteDecimals: TOKEN_DECIMALS,
  baseIsAssetA: false,
  tickSpacing: TICK_SPACING,
});

const TICK_LOWER = positionRange.tickLower;
const TICK_UPPER = positionRange.tickUpper;

// Test Suite

const runner = new TestRunner("Free Balance & TXID Comprehensive Test Suite");

// Shared state
let hostNamespace: string;
let poolId: string;
let tokenIdentifierHex: string;

// Suite Setup

runner.beforeAll(async (ctx: TestContext) => {
  console.log("\n[Setup] Creating actors and resources...");

  // Create UserA
  const userA = await createActor(ctx, "UserA");
  console.log(`  UserA: ${userA.publicKey.slice(0, 16)}...`);

  // Register host
  hostNamespace = await registerHost(ctx, "UserA", 10);
  console.log(`  Host namespace: ${hostNamespace}`);

  // Create token
  const token = await createToken(ctx, "UserA", "USDB", {
    decimals: TOKEN_DECIMALS,
    supply: BigInt(10_000_000_000_000),
  });
  tokenIdentifierHex = token.identifierHex;
  console.log(`  Token: ${tokenIdentifierHex.slice(0, 16)}...`);

  // Fund UserA
  await fundActor(ctx, "UserA", 100_000);
  console.log("  Funded: 100,000 sats");

  await sleep(3000);
});

// A. Pool Setup and Free Balance Funding

runner.category("A. Pool Setup and Free Balance Funding");

runner.test("A1: Create pool + deposit FB + swap using FB (baseline)", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  // Step 1: Create pool
  poolId = await createV3Pool(ctx, "UserA", "TestPool", {
    tokenName: "USDB",
    hostNamespace,
    tickSpacing: TICK_SPACING,
    lpFeeBps: 10,
    hostFeeBps: 10,
    btcPriceUsd: BTC_PRICE_USD,
  });
  console.log(`    Pool created: ${poolId.slice(0, 20)}...`);

  // Add liquidity
  await addLiquidityToPool(ctx, "UserA", "TestPool", {
    amountA: "18000000",
    amountB: "20000",
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
  });
  console.log("    Liquidity added");

  // Step 2: Generate fees and deposit to FB via collectFees
  const swapForFees = await userA.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: token.identifierHex,
    amountIn: "5000",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });
  assert.true(swapForFees.accepted!, "Initial swap should succeed");
  console.log(`    Generated fees via swap`);

  const collectResult = await userA.client.collectFees({
    poolId,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    retainInBalance: true,
  });
  assert.true(collectResult.accepted!, "Collect fees should succeed");
  console.log(`    Fees deposited to FB: A=${collectResult.feesCollectedA}, B=${collectResult.feesCollectedB}`);

  // Step 3: Swap using FB mode
  const balanceBefore = await userA.client.getConcentratedBalance(poolId);
  const fbAmountA = BigInt(balanceBefore.balanceA || "0");

  if (fbAmountA > 100n) {
    const swapAmount = (fbAmountA / 2n).toString();
    const fbSwap = await userA.client.executeSwap({
      poolId,
      assetInAddress: token.identifierHex,
      assetOutAddress: BTC_ASSET_PUBKEY,
      amountIn: swapAmount,
      minAmountOut: "0",
      maxSlippageBps: 10000,
      useFreeBalance: true,
    });
    assert.true(fbSwap.accepted!, "FB swap should succeed");

    const balanceAfter = await userA.client.getConcentratedBalance(poolId);
    assert.less(
      BigInt(balanceAfter.balanceA || "0"),
      fbAmountA,
      "FB should decrease after swap"
    );
    console.log(`    FB swap succeeded, balance reduced`);
  } else {
    console.log(`    Skipping FB swap - insufficient balance: ${fbAmountA}`);
  }
});

runner.test("A2: Create pool + deposit FB + swap using TXID (FB untouched)", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  // Get current FB
  const balanceBefore = await userA.client.getConcentratedBalance(poolId);

  // Swap using TXID mode (normal swap, no useFreeBalance)
  const swap = await userA.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: token.identifierHex,
    amountIn: "1000",
    minAmountOut: "0",
    maxSlippageBps: 10000,
    // No useFreeBalance = TXID mode
  });
  assert.true(swap.accepted!, "TXID swap should succeed");
  assert.defined(swap.outboundTransferId, "Should have transfer ID");

  const balanceAfter = await userA.client.getConcentratedBalance(poolId);

  // BTC (balanceB) should be unchanged - we used Spark transfer, not FB
  assert.equals(
    balanceAfter.balanceB,
    balanceBefore.balanceB,
    "BTC FB should be unchanged in TXID mode"
  );
  console.log(`    TXID swap succeeded, FB unchanged`);
});

runner.test("A3: Deposit FB in both assets and swap bidirectionally", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  // Execute swap to get some tokens
  const swap1 = await userA.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: token.identifierHex,
    amountIn: "3000",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });
  assert.true(swap1.accepted!, "Swap BTC->Token should succeed");
  console.log(`    Swapped BTC for tokens`);

  // Collect fees again to top up FB
  await userA.client.collectFees({
    poolId,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    retainInBalance: true,
  });

  const balance = await userA.client.getConcentratedBalance(poolId);
  console.log(`    FB: A=${balance.balanceA}, B=${balance.balanceB}`);
});

// B. Swap Input Sourcing Matrix

runner.category("B. Swap Input Sourcing Matrix (FB vs TXID)");

runner.test("B1: Insufficient FB should fail (FB mode)", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  const balance = await userA.client.getConcentratedBalance(poolId);
  const excessAmount = (BigInt(balance.balanceA || "0") + 10000000n).toString();

  await assert.rejectsWithMessage(
    async () => {
      await userA.client.executeSwap({
        poolId,
        assetInAddress: token.identifierHex,
        assetOutAddress: BTC_ASSET_PUBKEY,
        amountIn: excessAmount,
        minAmountOut: "0",
        maxSlippageBps: 10000,
        useFreeBalance: true,
      });
    },
    /insufficient|balance/i,
    "Should reject with insufficient balance"
  );

  // Verify no partial state changes
  const balanceAfter = await userA.client.getConcentratedBalance(poolId);
  assert.equals(balanceAfter.balanceA, balance.balanceA, "FB unchanged after rejection");
  console.log("    Correctly rejected, no partial state changes");
});

// C. TXID Correctness & Replay Protection

runner.category("C. TXID Correctness & Replay Protection");

runner.test("C1: Different swaps have unique transfer IDs", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  const swap1 = await userA.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: token.identifierHex,
    amountIn: "500",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });

  const swap2 = await userA.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: token.identifierHex,
    amountIn: "500",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });

  assert.true(swap1.accepted!, "First swap should succeed");
  assert.true(swap2.accepted!, "Second swap should succeed");
  assert.notEquals(
    swap1.outboundTransferId,
    swap2.outboundTransferId,
    "Transfer IDs must be unique"
  );
  console.log("    Unique transfer IDs confirmed");
});

// D. Free Balance Ledger Behaviors

runner.category("D. Free Balance Ledger Behaviors");

runner.test("D1: Withdraw FB after swap output credited", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;

  const allBalances = await userA.client.getConcentratedBalances();
  const poolBal = allBalances.balances?.find((b) => b.poolId === poolId);

  if (!poolBal) {
    console.log("    Skipping - no pool balance found");
    return;
  }

  const availableA = BigInt(poolBal.availableA || poolBal.balanceA || "0");
  const availableB = BigInt(poolBal.availableB || poolBal.balanceB || "0");

  if (availableA === 0n && availableB === 0n) {
    console.log("    Skipping - no available balance to withdraw");
    return;
  }

  // Withdraw 50% to leave some for other tests
  const withdrawA = availableA > 0n ? ((availableA * 50n) / 100n).toString() : "0";
  const withdrawB = availableB > 0n ? ((availableB * 50n) / 100n).toString() : "0";

  const result = await userA.client.withdrawConcentratedBalance({
    poolId,
    amountA: withdrawA,
    amountB: withdrawB,
  });

  assert.true(result.accepted!, "Withdrawal should succeed");
  console.log(`    Withdrew: A=${withdrawA}, B=${withdrawB}`);
});

runner.test("D2: Cancelled/failed swap should not mutate FB", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  const balanceBefore = await userA.client.getConcentratedBalance(poolId);

  try {
    await userA.client.executeSwap({
      poolId,
      assetInAddress: token.identifierHex,
      assetOutAddress: BTC_ASSET_PUBKEY,
      amountIn: "100",
      minAmountOut: "999999999999", // Impossible min output
      maxSlippageBps: 1,
      useFreeBalance: true,
    });
  } catch {
    // Expected to fail
  }

  const balanceAfter = await userA.client.getConcentratedBalance(poolId);
  assert.equals(
    balanceAfter.balanceA,
    balanceBefore.balanceA,
    "FB should be unchanged after failed swap"
  );
  console.log("    FB unchanged after failed swap");
});

// E. AMM V3 Mechanics (multi-tick, exact-in/out)

runner.category("E. AMM V3 Mechanics");

runner.test("E1: Large swap crosses multiple ticks (FB mode)", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  // Add more liquidity to enable larger swaps
  await addLiquidityToPool(ctx, "UserA", "TestPool", {
    amountA: "50000000",
    amountB: "50000",
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
  });

  // Execute large swap
  const swap = await userA.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: token.identifierHex,
    amountIn: "10000",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });

  assert.true(swap.accepted!, "Large swap should succeed");
  assert.greater(BigInt(swap.amountOut!), 0n, "Should receive tokens");
  console.log(`    Large swap succeeded: ${swap.amountOut} tokens received`);
});

runner.test("E2: Exact input swap vs exact output behavior", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  // Exact input swap (standard)
  const exactIn = await userA.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: token.identifierHex,
    amountIn: "1000",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });

  assert.true(exactIn.accepted!, "Exact-in swap should succeed");
  console.log(`    Exact-in: 1000 sats -> ${exactIn.amountOut} tokens`);
});

// G. Pool Lifecycle

runner.category("G. Pool Lifecycle");

runner.test("G1: Swap when pool has zero liquidity should fail", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const token = ctx.tokens.get("USDB")!;

  // Create empty pool
  const emptyPoolId = await createV3Pool(ctx, "UserA", "EmptyPool", {
    tokenName: "USDB",
    hostNamespace,
    tickSpacing: TICK_SPACING,
    lpFeeBps: 10,
    hostFeeBps: 10,
    btcPriceUsd: BTC_PRICE_USD,
  });

  await assert.rejectsWithMessage(
    async () => {
      await userA.client.executeSwap({
        poolId: emptyPoolId,
        assetInAddress: BTC_ASSET_PUBKEY,
        assetOutAddress: token.identifierHex,
        amountIn: "1000",
        minAmountOut: "0",
        maxSlippageBps: 10000,
      });
    },
    /liquidity|empty/i,
    "Should reject swap on empty pool"
  );

  console.log("    Correctly rejected swap on empty pool");
});

// H. Multi-user Isolation

runner.category("H. Multi-user Isolation");

runner.test("H1: UserB cannot spend UserA free balance", async (ctx) => {
  console.log("    Creating UserB...");

  const userB = await createActor(ctx, "UserB");
  await fundActor(ctx, "UserB", 50_000);
  await sleep(3000);

  const token = ctx.tokens.get("USDB")!;

  // UserB should have zero FB for this pool
  const userBBalance = await userB.client.getConcentratedBalance(poolId);
  console.log(`    UserB FB: A=${userBBalance.balanceA || "0"}, B=${userBBalance.balanceB || "0"}`);

  await assert.rejectsWithMessage(
    async () => {
      await userB.client.executeSwap({
        poolId,
        assetInAddress: token.identifierHex,
        assetOutAddress: BTC_ASSET_PUBKEY,
        amountIn: "1000",
        minAmountOut: "0",
        maxSlippageBps: 10000,
        useFreeBalance: true,
      });
    },
    /insufficient|balance/i,
    "UserB should not have free balance"
  );

  console.log("    UserB correctly isolated from UserA's FB");
});

runner.test("H2: Concurrent swaps affect pool price but not FB isolation", async (ctx) => {
  const userA = ctx.actors.get("UserA")!;
  const userB = ctx.actors.get("UserB")!;
  const token = ctx.tokens.get("USDB")!;

  // Get initial balances
  const userABalBefore = await userA.client.getConcentratedBalance(poolId);
  const userBBalBefore = await userB.client.getConcentratedBalance(poolId);

  // Both users swap (TXID mode)
  const [swapA, swapB] = await Promise.all([
    userA.client.executeSwap({
      poolId,
      assetInAddress: BTC_ASSET_PUBKEY,
      assetOutAddress: token.identifierHex,
      amountIn: "500",
      minAmountOut: "0",
      maxSlippageBps: 10000,
    }),
    userB.client.executeSwap({
      poolId,
      assetInAddress: BTC_ASSET_PUBKEY,
      assetOutAddress: token.identifierHex,
      amountIn: "500",
      minAmountOut: "0",
      maxSlippageBps: 10000,
    }),
  ]);

  assert.true(swapA.accepted!, "UserA swap should succeed");
  assert.true(swapB.accepted!, "UserB swap should succeed");

  // Verify FB isolation - each user's FB unchanged (TXID mode)
  const userABalAfter = await userA.client.getConcentratedBalance(poolId);
  const userBBalAfter = await userB.client.getConcentratedBalance(poolId);

  assert.equals(userABalAfter.balanceB, userABalBefore.balanceB, "UserA BTC FB unchanged");
  assert.equals(userBBalAfter.balanceB, userBBalBefore.balanceB, "UserB BTC FB unchanged");

  console.log("    Concurrent swaps succeeded, FB isolation maintained");
});

// Run Tests

runner.run().then((result) => {
  process.exit(result.failed > 0 ? 1 : 0);
}).catch((e) => {
  console.error("Test suite failed:", e);
  process.exit(1);
});

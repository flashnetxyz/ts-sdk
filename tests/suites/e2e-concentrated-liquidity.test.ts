/**
 * E2E Tests - V3 Concentrated Liquidity Pools
 *
 * Tests V3 concentrated liquidity pool creation, positions, swaps,
 * fee collection, free balance management, and position rebalancing.
 *
 * Run with:
 *   AMM_URL=http://localhost:8090 \
 *   MEMPOOL_URL=https://mempool.space \
 *   SPARKSCAN_URL=https://api.sparkscan.io \
 *   FAUCET_URL=https://funding.makebitcoingreatagain.dev/api \
 *   bun run tests/suites/e2e-concentrated-liquidity.test.ts
 */

import {
  TestRunner,
  assert,
  createActor,
  fundActor,
  createToken,
  registerHost,
  createV3Pool,
  addLiquidityToPool,
  sleep,
  type TestContext,
  BTC_ASSET_PUBKEY,
} from "../framework";

import { tickRangeFromPrices, humanPriceToPoolPrice } from "../../index";

const runner = new TestRunner("E2E Tests - V3 Concentrated Liquidity");

// Pool Configuration

const BTC_DECIMALS = 8;
const USDB_DECIMALS = 6;
const TICK_SPACING = 10;
const BTC_PRICE_USD = 90000;
const LP_FEE_BPS = 10;
const HOST_FEE_BPS = 10;

const POSITION_PRICE_LOWER = 89100;
const POSITION_PRICE_UPPER = 90900;
const REBALANCE_PRICE_LOWER = 85000;
const REBALANCE_PRICE_UPPER = 95000;

const INITIAL_PRICE = humanPriceToPoolPrice(BTC_PRICE_USD, BTC_DECIMALS, USDB_DECIMALS, false);

const positionRange = tickRangeFromPrices({
  priceLower: POSITION_PRICE_LOWER,
  priceUpper: POSITION_PRICE_UPPER,
  baseDecimals: BTC_DECIMALS,
  quoteDecimals: USDB_DECIMALS,
  baseIsAssetA: false,
  tickSpacing: TICK_SPACING,
});

const rebalanceRange = tickRangeFromPrices({
  priceLower: REBALANCE_PRICE_LOWER,
  priceUpper: REBALANCE_PRICE_UPPER,
  baseDecimals: BTC_DECIMALS,
  quoteDecimals: USDB_DECIMALS,
  baseIsAssetA: false,
  tickSpacing: TICK_SPACING,
});

const TICK_LOWER = positionRange.tickLower;
const TICK_UPPER = positionRange.tickUpper;
const REBALANCE_TICK_LOWER = rebalanceRange.tickLower;
const REBALANCE_TICK_UPPER = rebalanceRange.tickUpper;

// Amounts
const BTC_LIQUIDITY = "20000";
const USDB_LIQUIDITY = "18000000";

// Shared state
let poolId: string;
let hostNamespace: string;
let tokenIdentifierHex: string;

// Setup

runner.beforeAll(async (ctx: TestContext) => {
  console.log("\n[Setup] Creating actor and resources...");

  const user = await createActor(ctx, "User");
  console.log(`  User: ${user.publicKey.slice(0, 16)}...`);

  hostNamespace = await registerHost(ctx, "User", HOST_FEE_BPS);
  console.log(`  Host namespace: ${hostNamespace}`);

  const token = await createToken(ctx, "User", "USDB", {
    decimals: USDB_DECIMALS,
    supply: BigInt(10_000_000_000_000),
  });
  tokenIdentifierHex = token.identifierHex;
  console.log(`  Token: ${tokenIdentifierHex.slice(0, 16)}...`);

  await fundActor(ctx, "User", 100_000);
  console.log("  Funded: 100,000 sats");
});

// A. Pool Creation

runner.category("A. Pool Creation");

runner.test("A1: Create V3 concentrated liquidity pool", async (ctx) => {
  poolId = await createV3Pool(ctx, "User", "V3Pool", {
    tokenName: "USDB",
    hostNamespace,
    tickSpacing: TICK_SPACING,
    lpFeeBps: LP_FEE_BPS,
    hostFeeBps: HOST_FEE_BPS,
    btcPriceUsd: BTC_PRICE_USD,
  });

  console.log(`    Pool ID: ${poolId.slice(0, 20)}...`);
  console.log(`    Initial tick: based on $${BTC_PRICE_USD} BTC`);
});

// B. Liquidity Operations

runner.category("B. Liquidity Operations");

runner.test("B1: Add liquidity to position", async (ctx) => {
  await addLiquidityToPool(ctx, "User", "V3Pool", {
    amountA: USDB_LIQUIDITY,
    amountB: BTC_LIQUIDITY,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
  });

  console.log(`    Added: ${USDB_LIQUIDITY} USDB + ${BTC_LIQUIDITY} sats`);
  console.log(`    Tick range: ${TICK_LOWER} to ${TICK_UPPER}`);
});

runner.test("B2: List positions", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const positions = await user.client.listConcentratedPositions({ poolId });

  assert.defined(positions.positions, "Should have positions array");
  assert.greater(positions.positions!.length, 0, "Should have at least one position");

  const pos = positions.positions![0];
  console.log(`    Position found: ticks ${pos.tickLower} to ${pos.tickUpper}`);
  console.log(`    Liquidity: ${pos.liquidity}`);
});

// C. Swap Operations

runner.category("C. Swap Operations");

runner.test("C1: Swap BTC -> Token (buy tokens)", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const swap = await user.client.executeSwap({
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: tokenIdentifierHex,
    amountIn: "5000",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });

  assert.true(swap.accepted!, "Swap should be accepted");
  assert.greater(BigInt(swap.amountOut!), 0n, "Should receive tokens");
  console.log(`    Swapped 5000 sats for ${swap.amountOut} tokens`);
});

runner.test("C2: Swap Token -> BTC (sell tokens)", async (ctx) => {
  const user = ctx.actors.get("User")!;

  // Get token balance via wallet
  const balance = await user.wallet.getBalance();
  let tokenBal = 0n;
  for (const [, t] of balance.tokenBalances?.entries() || []) {
    const hex = Buffer.from(t.tokenMetadata.rawTokenIdentifier).toString("hex");
    if (hex === tokenIdentifierHex) {
      tokenBal = t.balance;
      break;
    }
  }

  if (tokenBal < 1000n) {
    console.log(`    Skipping - insufficient token balance: ${tokenBal}`);
    return;
  }

  const swap = await user.client.executeSwap({
    poolId,
    assetInAddress: tokenIdentifierHex,
    assetOutAddress: BTC_ASSET_PUBKEY,
    amountIn: "1000",
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });

  assert.true(swap.accepted!, "Swap should be accepted");
  console.log(`    Swapped 1000 tokens for ${swap.amountOut} sats`);
});

// D. Fee Collection

runner.category("D. Fee Collection");

runner.test("D1: Collect fees and retain in balance", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const result = await user.client.collectFees({
    poolId,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    retainInBalance: true,
  });

  assert.true(result.accepted!, "Collect fees should succeed");
  console.log(`    Fees collected: A=${result.feesCollectedA}, B=${result.feesCollectedB}`);
  console.log(`    Retained: ${result.retainedInBalance}`);
});

runner.test("D2: Check free balance", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const balance = await user.client.getConcentratedBalance(poolId);

  assert.defined(balance.balanceA, "Should have balance A");
  assert.defined(balance.balanceB, "Should have balance B");

  console.log(`    Free balance: A=${balance.balanceA}, B=${balance.balanceB}`);
});

// E. Free Balance Swaps

runner.category("E. Free Balance Swaps");

runner.test("E1: Swap using free balance", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const balance = await user.client.getConcentratedBalance(poolId);
  const availableA = BigInt(balance.balanceA || "0");

  if (availableA < 100n) {
    console.log(`    Skipping - insufficient free balance: ${availableA}`);
    return;
  }

  const swapAmount = (availableA / 2n).toString();

  const swap = await user.client.executeSwap({
    poolId,
    assetInAddress: tokenIdentifierHex,
    assetOutAddress: BTC_ASSET_PUBKEY,
    amountIn: swapAmount,
    minAmountOut: "0",
    maxSlippageBps: 10000,
    useFreeBalance: true,
  });

  assert.true(swap.accepted!, "Free balance swap should succeed");
  console.log(`    Swapped ${swapAmount} tokens (from FB) for ${swap.amountOut} sats`);
});

runner.test("E2: Insufficient free balance should fail", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const balance = await user.client.getConcentratedBalance(poolId);
  const excessAmount = (BigInt(balance.balanceA || "0") + 1000000n).toString();

  try {
    await user.client.executeSwap({
      poolId,
      assetInAddress: tokenIdentifierHex,
      assetOutAddress: BTC_ASSET_PUBKEY,
      amountIn: excessAmount,
      minAmountOut: "0",
      maxSlippageBps: 10000,
      useFreeBalance: true,
    });
    throw new Error("Should have failed");
  } catch (e: any) {
    assert.true(
      e.message.includes("insufficient") || e.message.includes("balance") || e.errorCode,
      "Should fail with balance error"
    );
    console.log("    Correctly rejected insufficient FB swap");
  }
});

// F. Position Rebalancing

runner.category("F. Position Rebalancing");

runner.test("F1: Decrease liquidity", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const positions = await user.client.listConcentratedPositions({ poolId });
  const pos = positions.positions?.[0];

  if (!pos || BigInt(pos.liquidity || "0") === 0n) {
    console.log("    Skipping - no liquidity to decrease");
    return;
  }

  const decreaseAmount = (BigInt(pos.liquidity!) / 4n).toString();

  const result = await user.client.decreaseLiquidity({
    poolId,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    liquidityToRemove: decreaseAmount,
    amountAMin: "0",
    amountBMin: "0",
    retainInBalance: true,
  });

  assert.true(result.accepted!, "Decrease liquidity should succeed");
  console.log(`    Decreased by ${decreaseAmount}`);
  console.log(`    Received: A=${result.amountA}, B=${result.amountB}`);
});

runner.test("F2: Add liquidity at different tick range (rebalance)", async (ctx) => {
  const user = ctx.actors.get("User")!;

  // Add liquidity at the rebalance range
  const result = await user.client.increaseLiquidity({
    poolId,
    tickLower: REBALANCE_TICK_LOWER,
    tickUpper: REBALANCE_TICK_UPPER,
    amountADesired: "1000000",
    amountBDesired: "1000",
    amountAMin: "0",
    amountBMin: "0",
  });

  assert.true(result.accepted!, "Rebalance should succeed");
  console.log(`    Added at new range: ${REBALANCE_TICK_LOWER} to ${REBALANCE_TICK_UPPER}`);
});

// G. Withdrawal

runner.category("G. Withdrawal");

runner.test("G1: Withdraw free balance to Spark wallet", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const allBalances = await user.client.getConcentratedBalances();
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

  // Withdraw 99% to avoid edge case
  const withdrawA = availableA > 0n ? ((availableA * 99n) / 100n).toString() : "0";
  const withdrawB = availableB > 0n ? ((availableB * 99n) / 100n).toString() : "0";

  console.log(`    Withdrawing: A=${withdrawA}, B=${withdrawB}`);

  const result = await user.client.withdrawConcentratedBalance({
    poolId,
    amountA: withdrawA,
    amountB: withdrawB,
  });

  assert.true(result.accepted!, "Withdrawal should succeed");
  console.log(`    Withdrawal successful`);
});

// Run Tests

runner.run().then((result) => {
  process.exit(result.failed > 0 ? 1 : 0);
}).catch((e) => {
  console.error("Test suite failed:", e);
  process.exit(1);
});

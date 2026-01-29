/**
 * E2E Tests - Single-Sided Pools
 *
 * Tests single-sided pool creation, swaps, and clawback functionality.
 *
 * Run with:
 *   AMM_URL=http://localhost:8090 \
 *   MEMPOOL_URL=https://mempool.space \
 *   SPARKSCAN_URL=https://api.sparkscan.io \
 *   FAUCET_URL=https://funding.makebitcoingreatagain.dev/api \
 *   bun run tests/suites/e2e-single-sided.test.ts
 */

import sha256 from "fast-sha256";
import {
  TestRunner,
  assert,
  createActor,
  fundActor,
  createToken,
  registerHost,
  sleep,
  type TestContext,
  BTC_ASSET_PUBKEY,
} from "../framework";

import {
  encodeSparkAddressNew,
  FlashnetClient,
  generateNonce,
  generatePoolSwapIntentMessage,
} from "../../index";

const runner = new TestRunner("E2E Tests - Single-Sided Pools");

// Config from env
const INITIAL_SUPPLY = BigInt(process.env.INITIAL_SUPPLY || "500000");
const GRADUATION_PCT = Number(process.env.GRADUATION_PCT || "80");
const TARGET_RAISE = BigInt(process.env.TARGET_RAISE || "40000");
const LP_FEE_BPS = Number(process.env.LP_FEE_BPS || "30");
const HOST_FEE_BPS = Number(process.env.HOST_FEE_BPS || "100");
const INTEGRATOR_FEE_BPS = Number(process.env.INTEGRATOR_FEE_BPS || "30");
const SWAP_IN_AMOUNT = BigInt(process.env.SWAP_IN_AMOUNT || "10000");
const MAX_SLIPPAGE_BPS = process.env.MAX_SLIPPAGE_BPS || "500000";
const MIN_OUT = process.env.MIN_OUT || "0";
const FAUCET_FUND_SATS = Number(process.env.FAUCET_FUND_SATS || "50000");

// Shared state
let poolId: string;
let hostNamespace: string;
let tokenIdentifierHex: string;
let tokenAddress: string;

// Setup

runner.beforeAll(async (ctx: TestContext) => {
  console.log("\n[Setup] Creating actor and resources...");

  // Create user
  const user = await createActor(ctx, "User");
  console.log(`  User: ${user.publicKey.slice(0, 16)}...`);

  // Register host
  hostNamespace = await registerHost(ctx, "User", HOST_FEE_BPS);
  console.log(`  Host namespace: ${hostNamespace}`);

  // Create token
  const token = await createToken(ctx, "User", "TestToken", {
    decimals: 0,
    supply: INITIAL_SUPPLY,
    ticker: "E2E",
  });
  tokenIdentifierHex = token.identifierHex;
  tokenAddress = token.address;
  console.log(`  Token: ${tokenIdentifierHex.slice(0, 16)}...`);

  // Fund user
  await fundActor(ctx, "User", FAUCET_FUND_SATS);
  console.log(`  Funded: ${FAUCET_FUND_SATS} sats`);
});

// A. Pool Creation

runner.category("A. Pool Creation");

runner.test("A1: Create single-sided pool", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const { virtualReserveA, virtualReserveB, threshold } =
    FlashnetClient.calculateVirtualReserves({
      initialTokenSupply: Number(INITIAL_SUPPLY),
      graduationThresholdPct: GRADUATION_PCT,
      targetRaise: Number(TARGET_RAISE),
    });

  const result = await user.client.createSingleSidedPool({
    assetAAddress: tokenIdentifierHex,
    assetBAddress: BTC_ASSET_PUBKEY,
    assetAInitialReserve: INITIAL_SUPPLY.toString(),
    virtualReserveA: virtualReserveA.toString(),
    virtualReserveB: virtualReserveB.toString(),
    threshold: threshold.toString(),
    lpFeeRateBps: LP_FEE_BPS,
    totalHostFeeRateBps: HOST_FEE_BPS,
    hostNamespace,
  });

  assert.defined(result.poolId, "Pool ID should be returned");
  poolId = result.poolId!;
  console.log(`    Pool ID: ${poolId.slice(0, 20)}...`);
});

// B. Swap Operations

runner.category("B. Swap Operations");

runner.test("B1: Execute swap BTC -> Token", async (ctx) => {
  const user = ctx.actors.get("User")!;
  const sparkNetwork = ctx.config.sparkNetwork;

  const lpSpark = encodeSparkAddressNew({
    identityPublicKey: poolId,
    network: sparkNetwork,
  });

  // Transfer BTC to pool
  const tx = await user.wallet.transfer({
    amountSats: Number(SWAP_IN_AMOUNT),
    receiverSparkAddress: lpSpark,
  });

  // Generate swap intent
  const nonce = generateNonce();
  const intent = generatePoolSwapIntentMessage({
    userPublicKey: user.publicKey,
    lpIdentityPublicKey: poolId,
    assetInSparkTransferId: tx.id,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: tokenIdentifierHex,
    amountIn: SWAP_IN_AMOUNT.toString(),
    maxSlippageBps: MAX_SLIPPAGE_BPS,
    minAmountOut: MIN_OUT,
    totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
    nonce,
  });

  // Sign and execute
  const hash = sha256(intent);
  const sig = await (user.wallet as any).config.signer.signMessageWithIdentityKey(hash, true);

  const resp = await (user.client as any).typedApi.executeSwap({
    userPublicKey: user.publicKey,
    poolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: tokenIdentifierHex,
    amountIn: SWAP_IN_AMOUNT.toString(),
    maxSlippageBps: MAX_SLIPPAGE_BPS,
    minAmountOut: MIN_OUT,
    assetInSparkTransferId: tx.id,
    nonce,
    totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
    integratorPublicKey: user.publicKey,
    signature: Buffer.from(sig).toString("hex"),
  });

  assert.true(resp.accepted!, "Swap should be accepted");
  assert.defined(resp.amountOut, "Should have amount out");
  console.log(`    Swapped ${SWAP_IN_AMOUNT} sats for ${resp.amountOut} tokens`);
});

runner.test("B2: Execute swap Token -> BTC", async (ctx) => {
  const user = ctx.actors.get("User")!;
  const sparkNetwork = ctx.config.sparkNetwork;
  const swapAmount = 1000n;

  const lpSpark = encodeSparkAddressNew({
    identityPublicKey: poolId,
    network: sparkNetwork,
  });

  // Transfer tokens to pool
  const txId = await user.wallet.transferTokens({
    tokenIdentifier: tokenAddress as any,
    tokenAmount: swapAmount,
    receiverSparkAddress: lpSpark,
  });

  // Generate swap intent
  const nonce = generateNonce();
  const intent = generatePoolSwapIntentMessage({
    userPublicKey: user.publicKey,
    lpIdentityPublicKey: poolId,
    assetInSparkTransferId: txId,
    assetInAddress: tokenIdentifierHex,
    assetOutAddress: BTC_ASSET_PUBKEY,
    amountIn: swapAmount.toString(),
    maxSlippageBps: MAX_SLIPPAGE_BPS,
    minAmountOut: MIN_OUT,
    totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
    nonce,
  });

  // Sign and execute
  const hash = sha256(intent);
  const sig = await (user.wallet as any).config.signer.signMessageWithIdentityKey(hash, true);

  const resp = await (user.client as any).typedApi.executeSwap({
    userPublicKey: user.publicKey,
    poolId,
    assetInAddress: tokenIdentifierHex,
    assetOutAddress: BTC_ASSET_PUBKEY,
    amountIn: swapAmount.toString(),
    maxSlippageBps: MAX_SLIPPAGE_BPS,
    minAmountOut: MIN_OUT,
    assetInSparkTransferId: txId,
    nonce,
    totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
    integratorPublicKey: user.publicKey,
    signature: Buffer.from(sig).toString("hex"),
  });

  assert.true(resp.accepted!, "Swap should be accepted");
  console.log(`    Swapped ${swapAmount} tokens for ${resp.amountOut} sats`);
});

// C. Pool State

runner.category("C. Pool State");

runner.test("C1: Get pool details", async (ctx) => {
  const user = ctx.actors.get("User")!;

  const pool = await (user.client as any).typedApi.getPool(poolId);

  assert.defined(pool.assetAReserve, "Should have asset A reserve");
  assert.defined(pool.assetBReserve, "Should have asset B reserve");

  console.log(`    Asset A Reserve: ${pool.assetAReserve}`);
  console.log(`    Asset B Reserve: ${pool.assetBReserve}`);
  console.log(`    Bonding Progress: ${pool.bondingProgressPercent ?? "graduated"}%`);
});

// D. Clawback

runner.category("D. Clawback");

let clawbackTransferId: string;

runner.test("D1: Transfer tokens to LP for clawback", async (ctx) => {
  const user = ctx.actors.get("User")!;
  const sparkNetwork = ctx.config.sparkNetwork;
  const clawbackAmount = 100n;

  const lpSpark = encodeSparkAddressNew({
    identityPublicKey: poolId,
    network: sparkNetwork,
  });

  // Check token balance
  const balance = await user.wallet.getBalance();
  let tokenBal = 0n;
  for (const [, t] of balance.tokenBalances.entries()) {
    const hex = Buffer.from(t.tokenMetadata.rawTokenIdentifier).toString("hex");
    if (hex === tokenIdentifierHex) {
      tokenBal = t.balance;
      break;
    }
  }

  if (tokenBal < clawbackAmount) {
    console.log(`    Skipping - insufficient token balance: ${tokenBal}`);
    return;
  }

  clawbackTransferId = await user.wallet.transferTokens({
    tokenIdentifier: tokenAddress as any,
    tokenAmount: clawbackAmount,
    receiverSparkAddress: lpSpark,
  });

  console.log(`    Transfer ID: ${clawbackTransferId.slice(0, 16)}...`);
});

runner.test("D2: Clawback transferred tokens", async (ctx) => {
  if (!clawbackTransferId) {
    console.log("    Skipping - no transfer from previous step");
    return;
  }

  const user = ctx.actors.get("User")!;

  // Wait for transfer to be visible
  await sleep(2000);

  // Check eligibility
  const eligibility = await user.client.checkClawbackEligibility({
    sparkTransferId: clawbackTransferId,
  });

  console.log(`    Eligibility: ${JSON.stringify(eligibility)}`);

  // Perform clawback
  const result = await user.client.clawback({
    sparkTransferId: clawbackTransferId,
    lpIdentityPublicKey: poolId,
  });

  assert.true(result.accepted!, "Clawback should be accepted");
  console.log(`    Clawback successful`);
});

// Run Tests

runner.run().then((result) => {
  process.exit(result.failed > 0 ? 1 : 0);
}).catch((e) => {
  console.error("Test suite failed:", e);
  process.exit(1);
});

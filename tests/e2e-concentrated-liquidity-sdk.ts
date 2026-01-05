/**
 * End-to-end test for V3 Concentrated Liquidity pools using FlashnetClient.
 *
 * This test demonstrates the FREE BALANCE MODEL where liquidity providers can
 * retain withdrawn funds within the pool rather than transferring them to their
 * Spark wallet. This eliminates on-chain overhead for market makers and HFTs.
 *
 * Creates a BTC/USDB pool simulating a $90k BTC price:
 * - Asset A: USDB token (6 decimals)
 * - Asset B: BTC (sats)
 * - Initial price: ~0.00111 sats per microUSDB (~$90k/BTC)
 *
 * Run with: npx tsx tests/e2e-concentrated-liquidity-sdk.ts
 */

import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import { randomBytes } from "crypto";

// Import from local SDK
import {
  BTC_ASSET_PUBKEY,
  encodeSparkAddressNew,
  FlashnetClient,
  humanPriceToPoolPrice,
  type SparkNetworkType,
  tickRangeFromPrices,
  // V3 Tick Math utilities
  V3TickMath,
} from "../index";

// Network configuration - hardcoded for local dev
const AMM_URL = process.env.AMM_URL;
const MEMPOOL_URL = process.env.MEMPOOL_URL;
const SPARKSCAN_URL = process.env.SPARKSCAN_URL;
const SPARK_NETWORK = process.env.SPARK_NETWORK || "REGTEST";
const FAUCET_URL = process.env.FAUCET_URL;

// ============================================================================
// Pool Configuration - Using V3TickMath utilities
// ============================================================================

// Pool assets
const BTC_DECIMALS = 8; // sats
const USDB_DECIMALS = 6; // microUSDB
const TICK_SPACING = 10; // Tighter spacing for more precise price boundaries

// Target prices (human-readable USD per BTC)
const BTC_PRICE_USD = 90000;

// INITIAL RANGE: ±1% around $90k (concentrated)
const POSITION_PRICE_LOWER = 89100; // $89.1k BTC (-1%)
const POSITION_PRICE_UPPER = 90900; // $90.9k BTC (+1%)

// ULTRA-TIGHT REBALANCE RANGE: ±0.25% around $90k for maximum capital efficiency
const REBALANCE_PRICE_LOWER = 89775; // $89.775k BTC (-0.25%)
const REBALANCE_PRICE_UPPER = 90225; // $90.225k BTC (+0.25%)

// Calculate pool price and ticks using V3TickMath
// For USDB/BTC pool: base=BTC (asset B), quote=USDB (asset A)
const INITIAL_PRICE = humanPriceToPoolPrice(
  BTC_PRICE_USD,
  BTC_DECIMALS,
  USDB_DECIMALS,
  false // baseIsAssetA = false (BTC is asset B)
);

// Get tick range for position ($80k - $100k)
const positionRange = tickRangeFromPrices({
  priceLower: POSITION_PRICE_LOWER,
  priceUpper: POSITION_PRICE_UPPER,
  baseDecimals: BTC_DECIMALS,
  quoteDecimals: USDB_DECIMALS,
  baseIsAssetA: false,
  tickSpacing: TICK_SPACING,
});
const TICK_LOWER = positionRange.tickLower;
const TICK_UPPER = positionRange.tickUpper;

// Get tick range for rebalance ($85k - $95k)
const rebalanceRange = tickRangeFromPrices({
  priceLower: REBALANCE_PRICE_LOWER,
  priceUpper: REBALANCE_PRICE_UPPER,
  baseDecimals: BTC_DECIMALS,
  quoteDecimals: USDB_DECIMALS,
  baseIsAssetA: false,
  tickSpacing: TICK_SPACING,
});
const NEW_TICK_LOWER = rebalanceRange.tickLower;
const NEW_TICK_UPPER = rebalanceRange.tickUpper;

// Fee configuration - 10bps each (0.1%) - minimum allowed
const LP_FEE_BPS = 10;
const HOST_FEE_BPS = 10;
const INTEGRATOR_FEE_BPS = 50; // 0.5% for integrator swap

// Faucet and liquidity amounts
const FAUCET_FUND_SATS = 1_000_000; // 1M sats
const BTC_LIQUIDITY = "400000"; // 400k sats for liquidity
const USDB_LIQUIDITY = "360000000"; // 360M microUSDB = $360 (matching 400k sats at ~$90k)

// Token supply
const INITIAL_USDB_SUPPLY = BigInt(10_000_000_000_000); // 10M USDB (with 6 decimals)

// ---------- Utility Functions ----------

function logSection(title: string): void {
  const line = "=".repeat(60);
  console.log("\n" + line);
  console.log(title);
  console.log(line);
}

function logKV(label: string, value?: unknown): void {
  if (typeof value === "undefined") {
    console.log(label);
  } else if (typeof value === "bigint") {
    console.log(`${label}:`, value.toString());
  } else if (typeof value === "object" && value !== null) {
    console.log(
      `${label}:`,
      JSON.stringify(
        value,
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        2
      )
    );
  } else {
    console.log(`${label}:`, String(value));
  }
}

function generateRandomTicker(): string {
  const num = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");
  return `USD${num}`; // 5 bytes, e.g. USD42
}

// ---------- New Faucet Integration ----------

interface FaucetResult {
  results: Array<{
    recipient: string;
    amount_sent: number;
    txid: string;
  }>;
}

async function fundViaFaucet(
  wallet: IssuerSparkWallet,
  sparkAddress: string,
  amountSats: number
): Promise<FaucetResult> {
  const before = await wallet.getBalance();
  const startSats = before.balance;

  logKV("Faucet request", { recipient: sparkAddress, amount_sats: amountSats });

  const resp = await fetch(`${FAUCET_URL}/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      funding_requests: [{ amount_sats: amountSats, recipient: sparkAddress }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Faucet error ${resp.status}: ${text}`);
  }

  const result: FaucetResult = await resp.json();
  logKV("Faucet response", result);

  if (!result.results || result.results.length === 0) {
    throw new Error("No results from faucet");
  }
  const fundResult = result.results[0];
  if (!fundResult.txid) {
    throw new Error(`Faucet failed: ${JSON.stringify(fundResult)}`);
  }
  logKV("Faucet txid", fundResult.txid);

  // Wait for wallet balance to reflect funding
  const deadline = Date.now() + 60_000;
  let currentSats = startSats;
  while (Date.now() < deadline) {
    try {
      const bal = await wallet.getBalance();
      currentSats = bal.balance;
      if (currentSats > startSats) {
        logKV("New balance (sats)", currentSats);
        return result;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Faucet funds not detected in wallet within timeout");
}

// ---------- Main Test ----------

async function main(): Promise<void> {
  logSection("1. Create Wallet");

  const seed = randomBytes(32);
  const { wallet } = await IssuerSparkWallet.initialize({
    mnemonicOrSeed: seed,
    options: { network: SPARK_NETWORK as SparkNetworkType },
  });

  const userPub = await wallet.getIdentityPublicKey();
  const userSpark = await wallet.getSparkAddress();

  logKV("Seed (hex)", seed.toString("hex"));
  logKV("User public key", userPub);
  logKV("Spark address", userSpark);

  logSection("2. Initialize FlashnetClient");

  const client = new FlashnetClient(wallet, {
    sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
    clientNetworkConfig: {
      ammGatewayUrl: AMM_URL!,
      mempoolApiUrl: MEMPOOL_URL!,
      explorerUrl: MEMPOOL_URL!,
      sparkScanUrl: SPARKSCAN_URL,
    },
    autoAuthenticate: true,
  });

  await client.initialize();
  logKV("FlashnetClient", "Initialized");

  logSection("3. Register Host");

  const hostNamespace = Math.random().toString(36).substring(2, 7);
  const hostResult = await client.registerHost({
    namespace: hostNamespace,
    minFeeBps: HOST_FEE_BPS,
  });
  logKV("Host namespace", hostNamespace);
  logKV("Host registration", hostResult.namespace ? "Success" : "Failed");

  logSection("4. Create USDB Token (6 decimals)");

  const tokenTicker = generateRandomTicker();
  logKV("Creating token", tokenTicker);

  await wallet.createToken({
    tokenName: "USD Test", // Max 20 bytes
    tokenTicker: tokenTicker,
    decimals: USDB_DECIMALS,
    isFreezable: false,
    maxSupply: INITIAL_USDB_SUPPLY,
  });
  await wallet.mintTokens(INITIAL_USDB_SUPPLY);

  const wBalance = await wallet.getBalance();
  if (!wBalance.tokenBalances || wBalance.tokenBalances.size === 0) {
    throw new Error("No token balances found after minting");
  }

  const tokenEntry = wBalance.tokenBalances.entries().next().value!;
  const tokenAddressBech32 = tokenEntry[0];
  const tokenIdentifierHex = Buffer.from(
    tokenEntry[1].tokenMetadata.rawTokenIdentifier
  ).toString("hex");

  logKV("Token address (Bech32m)", tokenAddressBech32);
  logKV("Token identifier (hex)", tokenIdentifierHex);
  logKV("Token balance", tokenEntry[1].balance.toString());
  logKV(
    "Token balance (USDB)",
    (Number(tokenEntry[1].balance) / 1e6).toFixed(2)
  );

  logSection("5. Create V3 Concentrated Liquidity Pool (BTC/USDB)");

  console.log("\nPool Configuration (calculated via V3TickMath):");
  console.log(`  - Asset A: ${tokenTicker} (${USDB_DECIMALS} decimals)`);
  console.log(`  - Asset B: BTC (sats)`);
  console.log(`  - Initial Price: ${INITIAL_PRICE} sats per microUSDB`);
  console.log(`  - Equivalent BTC Price: ~$${BTC_PRICE_USD.toLocaleString()}`);
  console.log(`  - Tick Spacing: ${TICK_SPACING}`);
  console.log(`  - LP Fee: ${LP_FEE_BPS} bps (${LP_FEE_BPS / 100}%)`);
  console.log(`  - Host Fee: ${HOST_FEE_BPS} bps (${HOST_FEE_BPS / 100}%)`);
  console.log(`\nPosition Range (from V3TickMath.rangeFromPrices):`);
  console.log(
    `  - Price range: $${POSITION_PRICE_LOWER.toLocaleString()} - $${POSITION_PRICE_UPPER.toLocaleString()}`
  );
  console.log(`  - Tick range: ${TICK_LOWER} to ${TICK_UPPER}`);
  console.log(
    `  - Actual prices: $${positionRange.actualPriceLower.toFixed(
      0
    )} - $${positionRange.actualPriceUpper.toFixed(0)}`
  );

  const t1 = Date.now();
  const createResult = await client.createConcentratedPool({
    assetAAddress: tokenIdentifierHex, // USDB token
    assetBAddress: BTC_ASSET_PUBKEY, // BTC
    tickSpacing: TICK_SPACING,
    initialPrice: INITIAL_PRICE,
    lpFeeRateBps: LP_FEE_BPS,
    hostFeeRateBps: HOST_FEE_BPS,
    hostNamespace: hostNamespace,
  });
  const t2 = Date.now();

  if (!createResult.poolId) {
    logKV("Create pool failed", createResult);
    throw new Error(`Failed to create pool: ${JSON.stringify(createResult)}`);
  }

  const POOL_ID = createResult.poolId;
  logKV("Pool ID", POOL_ID);
  logKV("Initial tick", createResult.initialTick);
  logKV("Create time (ms)", t2 - t1);

  const poolSparkAddress = encodeSparkAddressNew({
    identityPublicKey: POOL_ID,
    network: SPARK_NETWORK as SparkNetworkType,
  });
  logKV("Pool Spark address", poolSparkAddress);

  logSection("6. Fund via Faucet (1M sats)");

  await fundViaFaucet(wallet, userSpark, FAUCET_FUND_SATS);
  logKV("Funding", "Complete");

  logSection("7. Add Liquidity to Position");

  console.log(`\nAdding liquidity:`);
  console.log(
    `  - USDB (A): ${USDB_LIQUIDITY} microUSDB ($${(
      Number(USDB_LIQUIDITY) / 1e6
    ).toFixed(2)})`
  );
  console.log(
    `  - BTC (B): ${BTC_LIQUIDITY} sats ($${(
      (Number(BTC_LIQUIDITY) / 1e8) *
      BTC_PRICE_USD
    ).toFixed(2)})`
  );
  console.log(`  - Tick range: ${TICK_LOWER} to ${TICK_UPPER}`);

  const t3 = Date.now();
  const increaseResult = await client.increaseLiquidity({
    poolId: POOL_ID,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    amountADesired: USDB_LIQUIDITY, // USDB is asset A
    amountBDesired: BTC_LIQUIDITY, // BTC is asset B
    amountAMin: "0",
    amountBMin: "0",
  });
  const t4 = Date.now();

  logKV("Increase liquidity result", increaseResult);
  logKV("Time (ms)", t4 - t3);

  if (!increaseResult.accepted) {
    throw new Error(`Failed to add liquidity: ${increaseResult.error}`);
  }

  logSection("8. List Positions");

  const positions = await client.listConcentratedPositions({ poolId: POOL_ID });
  logKV("Positions", positions);

  logSection("9. Execute Swap #1: BTC -> USDB (NO integrator)");

  const swap1Amount = "10000"; // 10k sats = ~$9
  console.log(`\nSwapping ${swap1Amount} sats for USDB (no integrator fee)...`);
  console.log(
    `  - Expected out at price 900: ~${
      Number(swap1Amount) * 900
    } microUSDB ($${((Number(swap1Amount) * 900) / 1e6).toFixed(4)})`
  );

  const t5 = Date.now();
  const swap1Result = await client.executeSwap({
    poolId: POOL_ID,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: tokenIdentifierHex,
    amountIn: swap1Amount,
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });
  const t6 = Date.now();

  logKV("Swap #1 result", swap1Result);
  logKV("Time (ms)", t6 - t5);

  if (swap1Result.accepted && swap1Result.amountOut) {
    const expectedOut = Number(swap1Amount) * 900;
    const actualOut = Number(swap1Result.amountOut);
    const slippage = ((expectedOut - actualOut) / expectedOut) * 100;
    console.log(`\n  Slippage Analysis:`);
    console.log(`    Expected: ${expectedOut} microUSDB`);
    console.log(`    Actual:   ${actualOut} microUSDB`);
    console.log(`    Slippage: ${slippage.toFixed(4)}%`);
  }

  logSection("10. Execute Swap #2: USDB -> BTC (NO integrator)");

  const swap2Amount = "5000000"; // 5M microUSDB = $5
  console.log(
    `\nSwapping ${swap2Amount} microUSDB ($${(
      Number(swap2Amount) / 1e6
    ).toFixed(2)}) for BTC (no integrator)...`
  );
  console.log(
    `  - Expected out at price 900: ~${Math.floor(
      Number(swap2Amount) / 900
    )} sats`
  );

  const t7 = Date.now();
  const swap2Result = await client.executeSwap({
    poolId: POOL_ID,
    assetInAddress: tokenIdentifierHex,
    assetOutAddress: BTC_ASSET_PUBKEY,
    amountIn: swap2Amount,
    minAmountOut: "0",
    maxSlippageBps: 10000,
  });
  const t8 = Date.now();

  logKV("Swap #2 result", swap2Result);
  logKV("Time (ms)", t8 - t7);

  if (swap2Result.accepted && swap2Result.amountOut) {
    const expectedOut = Math.floor(Number(swap2Amount) / 900);
    const actualOut = Number(swap2Result.amountOut);
    const slippage = ((expectedOut - actualOut) / expectedOut) * 100;
    console.log(`\n  Slippage Analysis:`);
    console.log(`    Expected: ${expectedOut} sats`);
    console.log(`    Actual:   ${actualOut} sats`);
    console.log(`    Slippage: ${slippage.toFixed(4)}%`);
  }

  // ============================================================================
  // FREE BALANCE WORKFLOW DEMONSTRATION
  // ============================================================================

  logSection("11. Collect Fees with retainInBalance (FREE BALANCE DEMO)");

  console.log(`\n--- FREE BALANCE MODEL DEMONSTRATION ---`);
  console.log(`Instead of sending fees to your Spark wallet, retain them`);
  console.log(`in the pool's free balance for immediate reuse.`);

  const t9 = Date.now();
  const collectResult = await client.collectFees({
    poolId: POOL_ID,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    retainInBalance: true, // NEW: Retain fees in pool free balance
  });
  const t10 = Date.now();

  logKV("Collect fees result", collectResult);
  logKV("Time (ms)", t10 - t9);

  if (collectResult.accepted) {
    console.log(`\n  Fees retained in pool free balance:`);
    console.log(`    Asset A (USDB): ${collectResult.feesCollectedA || "0"}`);
    console.log(`    Asset B (BTC):  ${collectResult.feesCollectedB || "0"}`);
    console.log(`    Retained: ${collectResult.retainedInBalance ? "Yes" : "No"}`);
    if (collectResult.currentBalance) {
      console.log(`\n  Current free balance:`);
      console.log(`    Balance A: ${collectResult.currentBalance.balanceA}`);
      console.log(`    Balance B: ${collectResult.currentBalance.balanceB}`);
    }
  }

  logSection("12. Check Free Balance");

  try {
    const freeBalance = await client.getConcentratedBalance(POOL_ID);
    logKV("Free balance for pool", freeBalance);
    console.log(`\n  Your free balance in this pool:`);
    console.log(`    USDB (A): ${freeBalance.balanceA} (available: ${freeBalance.availableA})`);
    console.log(`    BTC (B):  ${freeBalance.balanceB} (available: ${freeBalance.availableB})`);
  } catch (e) {
    console.log(`  Free balance query not available (may need backend support)`);
  }

  logSection("13. Rebalance with retainInBalance");

  const positionsBeforeRebalance = await client.listConcentratedPositions({
    poolId: POOL_ID,
  });
  let liquidityToMove = "0";
  if (
    positionsBeforeRebalance.positions &&
    positionsBeforeRebalance.positions.length > 0
  ) {
    const currentPos = positionsBeforeRebalance.positions.find(
      (p) => p.tickLower === TICK_LOWER && p.tickUpper === TICK_UPPER
    );
    if (currentPos) {
      liquidityToMove = currentPos.liquidity;
    }
  }

  let currentTickLower = TICK_LOWER;
  let currentTickUpper = TICK_UPPER;

  if (liquidityToMove === "0") {
    logKV("No liquidity to rebalance", "Skipping");
  } else {
    console.log(
      `\nRebalancing to ultra-tight range for maximum capital efficiency:`
    );
    console.log(
      `  - Old range: ${TICK_LOWER} to ${TICK_UPPER} ($${positionRange.actualPriceLower.toFixed(
        0
      )} - $${positionRange.actualPriceUpper.toFixed(0)}) [±1%]`
    );
    console.log(
      `  - New range: ${NEW_TICK_LOWER} to ${NEW_TICK_UPPER} ($${rebalanceRange.actualPriceLower.toFixed(
        0
      )} - $${rebalanceRange.actualPriceUpper.toFixed(0)}) [±0.25%]`
    );
    console.log(`  - Liquidity: ${liquidityToMove}`);
    console.log(`  - retainInBalance: true (excess stays in pool)`);

    const t11 = Date.now();
    const rebalanceResult = await client.rebalancePosition({
      poolId: POOL_ID,
      oldTickLower: TICK_LOWER,
      oldTickUpper: TICK_UPPER,
      newTickLower: NEW_TICK_LOWER,
      newTickUpper: NEW_TICK_UPPER,
      liquidityToMove: "0", // 0 = move all
      retainInBalance: true, // NEW: Retain any excess in free balance
    });
    const t12 = Date.now();

    logKV("Rebalance result", rebalanceResult);
    logKV("Time (ms)", t12 - t11);

    if (rebalanceResult.accepted) {
      currentTickLower = NEW_TICK_LOWER;
      currentTickUpper = NEW_TICK_UPPER;
      logKV(
        "Position rebalanced",
        `New range: ${NEW_TICK_LOWER} to ${NEW_TICK_UPPER}`
      );

      console.log(`\n  Capital efficiency analysis:`);
      console.log(`    - Old liquidity: ${rebalanceResult.oldLiquidity}`);
      console.log(`    - New liquidity: ${rebalanceResult.newLiquidity}`);
      console.log(`    - Fees collected A: ${rebalanceResult.feesCollectedA || "0"}`);
      console.log(`    - Fees collected B: ${rebalanceResult.feesCollectedB || "0"}`);
      console.log(`    - Retained in balance: ${rebalanceResult.retainedInBalance ? "Yes" : "No"}`);

      if (rebalanceResult.currentBalance) {
        console.log(`\n  Updated free balance:`);
        console.log(`    Balance A: ${rebalanceResult.currentBalance.balanceA}`);
        console.log(`    Balance B: ${rebalanceResult.currentBalance.balanceB}`);
      }

      const oldLiq = BigInt(rebalanceResult.oldLiquidity || "0");
      const newLiq = BigInt(rebalanceResult.newLiquidity || "0");
      if (oldLiq > 0n) {
        const multiplier = Number(newLiq) / Number(oldLiq);
        console.log(`    - Liquidity multiplier: ${multiplier.toFixed(1)}x`);
      }
    }
  }

  logSection(
    "14. Execute Swap #3: BTC -> USDB (WITH integrator fee, AFTER rebalance)"
  );

  const swap3Amount = "50000"; // 50k sats = ~$45
  console.log(
    `\nSwapping ${swap3Amount} sats for USDB WITH ${INTEGRATOR_FEE_BPS}bps integrator fee...`
  );
  console.log(
    `  - Expected out at price 900: ~${Number(swap3Amount) * 900} microUSDB`
  );
  console.log(
    `  - After ${INTEGRATOR_FEE_BPS}bps fee: ~${Math.floor(
      Number(swap3Amount) * 900 * (1 - INTEGRATOR_FEE_BPS / 10000)
    )} microUSDB`
  );
  console.log(`  - Liquidity is now in ±0.25% range = higher capital efficiency!`);

  const t13 = Date.now();
  const swap3Result = await client.executeSwap({
    poolId: POOL_ID,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: tokenIdentifierHex,
    amountIn: swap3Amount,
    minAmountOut: "0",
    maxSlippageBps: 10000,
    integratorFeeRateBps: INTEGRATOR_FEE_BPS,
    integratorPublicKey: userPub, // Self as integrator for testing
  });
  const t14 = Date.now();

  logKV("Swap #3 result", swap3Result);
  logKV("Time (ms)", t14 - t13);

  if (swap3Result.accepted && swap3Result.amountOut) {
    const expectedOutBeforeFees = Number(swap3Amount) * 900;
    const expectedOutAfterIntegratorFee =
      expectedOutBeforeFees * (1 - INTEGRATOR_FEE_BPS / 10000);
    const actualOut = Number(swap3Result.amountOut);
    const slippageFromIdeal =
      ((expectedOutBeforeFees - actualOut) / expectedOutBeforeFees) * 100;
    const slippageFromExpected =
      ((expectedOutAfterIntegratorFee - actualOut) /
        expectedOutAfterIntegratorFee) *
      100;
    console.log(`\n  Slippage Analysis (AFTER rebalance to ±0.25%):`);
    console.log(
      `    Expected (no fees):       ${expectedOutBeforeFees} microUSDB`
    );
    console.log(
      `    Expected (after ${INTEGRATOR_FEE_BPS}bps fee): ${Math.floor(
        expectedOutAfterIntegratorFee
      )} microUSDB`
    );
    console.log(`    Actual:                   ${actualOut} microUSDB`);
    console.log(
      `    Total slippage from ideal: ${slippageFromIdeal.toFixed(4)}%`
    );
    console.log(
      `    Slippage beyond fees:      ${slippageFromExpected.toFixed(
        4
      )}% (price impact only)`
    );
  }

  logSection("15. Decrease Liquidity with retainInBalance");

  const positionsAfterRebalance = await client.listConcentratedPositions({
    poolId: POOL_ID,
  });
  let liquidityToRemove = "0";
  if (
    positionsAfterRebalance.positions &&
    positionsAfterRebalance.positions.length > 0
  ) {
    const currentPos = positionsAfterRebalance.positions.find(
      (p) =>
        p.tickLower === currentTickLower && p.tickUpper === currentTickUpper
    );
    if (currentPos) {
      liquidityToRemove = currentPos.liquidity;
    }
  }

  if (liquidityToRemove === "0") {
    logKV("No liquidity to remove", "Skipping");
  } else {
    console.log(`\nRemoving liquidity with retainInBalance=true:`);
    console.log(`  - Tick range: ${currentTickLower} to ${currentTickUpper}`);
    console.log(`  - Liquidity: ${liquidityToRemove}`);
    console.log(`  - Funds will be retained in pool free balance`);

    const t15 = Date.now();
    const decreaseResult = await client.decreaseLiquidity({
      poolId: POOL_ID,
      tickLower: currentTickLower,
      tickUpper: currentTickUpper,
      liquidityToRemove,
      amountAMin: "0",
      amountBMin: "0",
      retainInBalance: true, // NEW: Retain in free balance
    });
    const t16 = Date.now();

    logKV("Decrease liquidity result", decreaseResult);
    logKV("Time (ms)", t16 - t15);

    if (decreaseResult.accepted) {
      console.log(`\n  Liquidity removed and retained in balance:`);
      console.log(`    Amount A (USDB): ${decreaseResult.amountA || "0"}`);
      console.log(`    Amount B (BTC):  ${decreaseResult.amountB || "0"}`);
      console.log(`    Fees A:          ${decreaseResult.feesCollectedA || "0"}`);
      console.log(`    Fees B:          ${decreaseResult.feesCollectedB || "0"}`);
      console.log(`    Retained:        ${decreaseResult.retainedInBalance ? "Yes" : "No"}`);
      if (decreaseResult.currentBalance) {
        console.log(`\n  Updated free balance:`);
        console.log(`    Balance A: ${decreaseResult.currentBalance.balanceA}`);
        console.log(`    Balance B: ${decreaseResult.currentBalance.balanceB}`);
      }
    }
  }

  logSection("16. Check All Free Balances");

  try {
    const allBalances = await client.getConcentratedBalances();
    logKV("All free balances", allBalances);

    if (allBalances.balances && allBalances.balances.length > 0) {
      console.log(`\n  Your free balances across all pools:`);
      for (const bal of allBalances.balances) {
        console.log(`    Pool ${bal.poolId.slice(0, 16)}...:`);
        console.log(`      Balance A: ${bal.balanceA} (available: ${bal.availableA})`);
        console.log(`      Balance B: ${bal.balanceB} (available: ${bal.availableB})`);
      }
    }
  } catch (e) {
    console.log(`  Free balances query not available (may need backend support)`);
  }

  logSection("17. Withdraw Free Balance to Spark Wallet");

  try {
    console.log(`\nWithdrawing all free balance from pool to Spark wallet...`);
    console.log(`  - Using "max" to withdraw all available balance`);

    const t17 = Date.now();
    const withdrawResult = await client.withdrawConcentratedBalance({
      poolId: POOL_ID,
      amountA: "max", // Withdraw all USDB
      amountB: "max", // Withdraw all BTC
    });
    const t18 = Date.now();

    logKV("Withdraw result", withdrawResult);
    logKV("Time (ms)", t18 - t17);

    if (withdrawResult.accepted) {
      console.log(`\n  Withdrawal successful:`);
      console.log(`    USDB withdrawn: ${withdrawResult.amountAWithdrawn || "0"}`);
      console.log(`    BTC withdrawn:  ${withdrawResult.amountBWithdrawn || "0"}`);
      console.log(`    Remaining A:    ${withdrawResult.remainingBalanceA || "0"}`);
      console.log(`    Remaining B:    ${withdrawResult.remainingBalanceB || "0"}`);
      if (withdrawResult.outboundTransferIds && withdrawResult.outboundTransferIds.length > 0) {
        console.log(`    Transfer IDs:   ${withdrawResult.outboundTransferIds.join(", ")}`);
      }
    }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.log(`  Withdraw not available or no balance to withdraw: ${errorMessage}`);
  }

  logSection("18. Final Position and Balance Check");

  const finalPositions = await client.listConcentratedPositions({
    poolId: POOL_ID,
  });
  logKV("Final positions", finalPositions);

  const finalBalance = await wallet.getBalance();
  logKV("Final BTC balance (sats)", finalBalance.balance);

  if (finalBalance.tokenBalances) {
    for (const [addr, info] of finalBalance.tokenBalances) {
      const usdbValue = Number(info.balance) / 1e6;
      logKV(`Token ${addr}`, `${info.balance} (${usdbValue.toFixed(2)} USDB)`);
    }
  }

  logSection("19. Test Complete - Summary");

  console.log("\nV3 Concentrated Liquidity Pool Summary:");
  console.log(`  POOL_ID=${POOL_ID}`);
  console.log(`  ASSET_A=${tokenTicker} (${tokenIdentifierHex})`);
  console.log(`  ASSET_B=BTC (${BTC_ASSET_PUBKEY})`);
  console.log(
    `  INITIAL_PRICE=${INITIAL_PRICE} sats/microUSDB (~$${BTC_PRICE_USD}/BTC)`
  );
  console.log(`  TICK_SPACING=${TICK_SPACING}`);
  console.log(`  LP_FEE=${LP_FEE_BPS}bps, HOST_FEE=${HOST_FEE_BPS}bps`);
  console.log(`  HOST_NAMESPACE=${hostNamespace}`);

  console.log("\n--- FREE BALANCE MODEL FEATURES DEMONSTRATED ---");
  console.log("  1. collectFees with retainInBalance=true");
  console.log("  2. rebalancePosition with retainInBalance=true");
  console.log("  3. decreaseLiquidity with retainInBalance=true");
  console.log("  4. getConcentratedBalance - check single pool balance");
  console.log("  5. getConcentratedBalances - check all pool balances");
  console.log("  6. withdrawConcentratedBalance - withdraw to Spark wallet");

  console.log("\nE2E V3 Concentrated Liquidity SDK test with FREE BALANCE MODEL complete!");
}

main().catch((e) => {
  console.error("\nTest failed:", e);
  process.exit(1);
});

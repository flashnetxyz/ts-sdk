/*
 E2E Lightning Payment Test - V2 + V3 Pools

 Creates both single-sided (V2) and concentrated (V3) pools,
 funds them, creates a Lightning invoice via spark-sdk, gets quotes,
 and pays the invoice with tokens via payLightningWithToken.

 Usage:
   npx tsx tests/e2e-lightning-pools.ts
   npx tsx tests/e2e-lightning-pools.ts --v2-only
   npx tsx tests/e2e-lightning-pools.ts --v3-only
*/

import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import { randomBytes } from "crypto";
import {
  BTC_ASSET_PUBKEY,
  FlashnetClient,
  generateNonce,
  generateRegisterHostIntentMessage,
  ApiClient,
  TypedAmmApi,
  AuthManager,
  humanPriceToPoolPrice,
  tickRangeFromPrices,
  type SparkNetworkType,
} from "../index";

const args = process.argv.slice(2);
const V2_ONLY = args.includes("--v2-only");
const V3_ONLY = args.includes("--v3-only");

const AMM_URL = process.env.AMM_URL || "http://localhost:8090";
const MEMPOOL_URL = process.env.MEMPOOL_URL;
const SPARKSCAN_URL = process.env.SPARKSCAN_URL;
const SPARK_NETWORK = process.env.SPARK_NETWORK || "REGTEST";
const FAUCET_URL = process.env.FAUCET_URL;

if (!MEMPOOL_URL || !SPARKSCAN_URL || !FAUCET_URL) {
  console.error("Missing required environment variables: MEMPOOL_URL, SPARKSCAN_URL, FAUCET_URL");
  console.error("See .env.example for reference.");
  process.exit(1);
}

const V2_INITIAL_SUPPLY = BigInt(process.env.V2_INITIAL_SUPPLY || "500000");
const V2_GRADUATION_PCT = Number(process.env.V2_GRADUATION_PCT || "80");
const V2_TARGET_RAISE = BigInt(process.env.V2_TARGET_RAISE || "40000");
const V2_LP_FEE_BPS = Number(process.env.V2_LP_FEE_BPS || "30");
const V2_HOST_FEE_BPS = Number(process.env.V2_HOST_FEE_BPS || "100");

const BTC_DECIMALS = 8;
const USDB_DECIMALS = 6;
const TICK_SPACING = 10;
const BTC_PRICE_USD = 90000;
const POSITION_PRICE_LOWER = 89100;
const POSITION_PRICE_UPPER = 90900;
const V3_LP_FEE_BPS = 10;
const V3_HOST_FEE_BPS = 10;
const V3_FAUCET_FUND_SATS = 100_000;
const V3_BTC_LIQUIDITY = "20000";
const V3_USDB_LIQUIDITY = "18000000";
const V3_INITIAL_USDB_SUPPLY = BigInt(10_000_000_000_000);

const INVOICE_AMOUNT_SATS = Number(process.env.INVOICE_AMOUNT_SATS || "2000");
const FAUCET_FUND_SATS = Number(process.env.FAUCET_FUND_SATS || "100000");

function stringify(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
  }
  return String(value);
}

function logSection(title: string) {
  console.log(`\n[${title}]`);
}

function logKV(label: string, value?: unknown) {
  if (typeof value === "undefined") {
    console.log(label);
  } else {
    console.log(`${label}:`, stringify(value));
  }
}

async function fundViaFaucet(wallet: any, address: string, amount: number) {
  const before = await wallet.getBalance();
  const startSats = before.balance;

  const healthResp = await fetch(`${FAUCET_URL}/balance`);
  if (!healthResp.ok) {
    throw new Error(`Funding server health check failed at ${FAUCET_URL}/balance`);
  }

  const requestBody = {
    funding_requests: [{ amount_sats: amount, recipient: address }],
  };

  console.log(`Requesting ${amount} sats from funding server for address: ${address}`);

  const resp = await fetch(`${FAUCET_URL}/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "unknown");
    throw new Error(`Funding server error ${resp.status}: ${errorText}`);
  }

  const data: any = await resp.json();
  if (!data.results || data.results.length === 0) {
    throw new Error("Funding server response contained no results");
  }

  const entry = data.results[0];
  if (entry.error) throw new Error(`Funding error: ${entry.error}`);

  console.log(`Funding request successful: txids=${JSON.stringify(entry.txids)}, amm_operation_id=${entry.amm_operation_id}`);

  console.log("Waiting for async funding to complete...");
  await new Promise((r) => setTimeout(r, 5000));

  const deadline = Date.now() + 60_000;
  let currentSats = startSats;
  while (Date.now() < deadline) {
    try {
      const bal = await wallet.getBalance();
      currentSats = bal.balance;
      if (currentSats > startSats) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (currentSats <= startSats) {
    throw new Error("Faucet funds not detected in wallet balance within timeout");
  }

  return { message: `Funded ${entry.amount_sent || amount} sats` };
}

async function getTokenBalanceByHex(wallet: any, hexId: string): Promise<bigint> {
  const bal = await wallet.getBalance();
  for (const [, t] of bal.tokenBalances?.entries() || []) {
    if (
      Buffer.from(t.tokenMetadata.rawTokenIdentifier).toString("hex") === hexId
    ) {
      return t.ownedBalance;
    }
  }
  return 0n;
}

async function main() {
  logSection("E2E Lightning Payment Test - V2 + V3 Pools");

  logSection("1. Create Wallet A (payer)");

  const seedA = randomBytes(32);
  const { wallet: walletA } = await IssuerSparkWallet.initialize({
    mnemonicOrSeed: seedA,
    options: { network: SPARK_NETWORK as any },
  });
  const userPubA = await walletA.getIdentityPublicKey();
  const userSparkA = await walletA.getSparkAddress();

  logKV("Seed A (hex)", seedA.toString("hex"));
  logKV("User A public key", userPubA);
  logKV("User A Spark address", userSparkA);

  logSection("2. API setup + authentication");

  const api = new ApiClient({
    ammGatewayUrl: AMM_URL!,
    mempoolApiUrl: MEMPOOL_URL!,
    explorerUrl: MEMPOOL_URL!,
    sparkScanUrl: SPARKSCAN_URL,
  });
  const typed = new TypedAmmApi(api);
  const auth = new AuthManager(api, userPubA, walletA);
  await auth.authenticate();
  logKV("Auth", "Authenticated");

  logSection("3. Create V2 token (0 decimals)");

  await walletA.createToken({
    tokenName: "LNTEST",
    tokenTicker: "LNT",
    decimals: 0,
    isFreezable: false,
    maxSupply: V2_INITIAL_SUPPLY,
  });
  await walletA.mintTokens(V2_INITIAL_SUPPLY);

  const wBalanceA = await walletA.getBalance();
  if (!wBalanceA.tokenBalances || wBalanceA.tokenBalances.size === 0) {
    throw new Error("No token balances found after minting V2 token");
  }

  const v2Entry = wBalanceA.tokenBalances.entries().next().value!;
  const v2TokenAddress = v2Entry[0];
  const v2TokenIdentifierHex = Buffer.from(
    v2Entry[1].tokenMetadata.rawTokenIdentifier
  ).toString("hex");

  logKV("V2 token address (Bech32m)", v2TokenAddress);
  logKV("V2 token identifier (hex)", v2TokenIdentifierHex);
  logKV("V2 token balance", v2Entry[1].ownedBalance.toString());

  logSection("4. Initialize FlashnetClient");

  const clientA = new FlashnetClient(walletA, {
    sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
    clientNetworkConfig: {
      ammGatewayUrl: AMM_URL!,
      mempoolApiUrl: MEMPOOL_URL!,
      explorerUrl: MEMPOOL_URL!,
      sparkScanUrl: SPARKSCAN_URL,
    },
    autoAuthenticate: true,
  });
  await clientA.initialize();
  logKV("FlashnetClient", "Initialized");

  logSection("5. Fund Wallet A via faucet");

  await fundViaFaucet(walletA, userSparkA, FAUCET_FUND_SATS);
  logKV("Wallet A funded", `${FAUCET_FUND_SATS} sats`);

  logSection("6. Register host");

  const namespace = Math.random().toString(36).substring(2, 7);
  {
    const nonce = generateNonce();
    const intent = generateRegisterHostIntentMessage({
      namespace,
      minFeeBps: V2_HOST_FEE_BPS,
      feeRecipientPublicKey: userPubA,
      nonce,
    });
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", intent as any));
    const sig = await (walletA as any).config.signer.signMessageWithIdentityKey(hash, true);
    await typed.registerHost({
      namespace,
      minFeeBps: V2_HOST_FEE_BPS,
      feeRecipientPublicKey: userPubA,
      nonce,
      signature: Buffer.from(sig).toString("hex"),
    });
  }
  logKV("Host namespace", namespace);

  let v2PoolId: string | null = null;
  let v3PoolId: string | null = null;
  let v3TokenIdentifierHex: string | null = null;

  if (!V3_ONLY) {
    logSection("7. Create V2 single-sided pool");

    const { virtualReserveA, virtualReserveB, threshold } =
      FlashnetClient.calculateVirtualReserves({
        initialTokenSupply: Number(V2_INITIAL_SUPPLY),
        graduationThresholdPct: V2_GRADUATION_PCT,
        targetRaise: Number(V2_TARGET_RAISE),
      });

    logKV("Virtual reserve A", virtualReserveA);
    logKV("Virtual reserve B", virtualReserveB);
    logKV("Threshold", threshold);

    const createResp = await clientA.createSingleSidedPool({
      assetAAddress: v2TokenIdentifierHex,
      assetBAddress: BTC_ASSET_PUBKEY,
      assetAInitialReserve: V2_INITIAL_SUPPLY.toString(),
      virtualReserveA: virtualReserveA.toString(),
      virtualReserveB: virtualReserveB.toString(),
      threshold: threshold.toString(),
      lpFeeRateBps: V2_LP_FEE_BPS,
      totalHostFeeRateBps: V2_HOST_FEE_BPS,
      hostNamespace: namespace,
    });

    v2PoolId = createResp.poolId;
    logKV("V2 Pool ID", v2PoolId);

    logSection("7b. Seed V2 pool with BTC (buy tokens)");

    const buyAmount = "10000";
    const swapResult = await clientA.executeSwap({
      poolId: v2PoolId,
      assetInAddress: BTC_ASSET_PUBKEY,
      assetOutAddress: v2TokenIdentifierHex,
      amountIn: buyAmount,
      minAmountOut: "0",
      maxSlippageBps: 50000,
    });
    logKV("V2 seed swap accepted", swapResult.accepted);
    logKV("V2 seed swap amountOut", swapResult.amountOut);
    if (!swapResult.accepted) {
      logKV("V2 seed swap error", swapResult.error);
    }

    const poolAfterSeed = await typed.getPool(v2PoolId);
    logKV("V2 pool reserves after seed", {
      assetAReserve: poolAfterSeed.assetAReserve,
      assetBReserve: poolAfterSeed.assetBReserve,
      curveType: poolAfterSeed.curveType,
    });
  }

  if (!V2_ONLY) {
    logSection("8. Create V3 token (6 decimals) + concentrated pool");

    const { wallet: v3Wallet } = await IssuerSparkWallet.initialize({
      mnemonicOrSeed: seedA,
      accountNumber: 1,
      options: { network: SPARK_NETWORK as any },
    });
    const v3Spark = await v3Wallet.getSparkAddress();
    const v3Pub = await v3Wallet.getIdentityPublicKey();

    logKV("V3 wallet spark address", v3Spark);

    await fundViaFaucet(v3Wallet, v3Spark, FAUCET_FUND_SATS);
    logKV("V3 wallet funded", `${FAUCET_FUND_SATS} sats`);

    const v3Ticker = `U${Math.floor(Math.random() * 100).toString().padStart(2, "0")}`;
    await v3Wallet.createToken({
      tokenName: "USD Test",
      tokenTicker: v3Ticker,
      decimals: USDB_DECIMALS,
      isFreezable: false,
      maxSupply: V3_INITIAL_USDB_SUPPLY,
    });
    await v3Wallet.mintTokens(V3_INITIAL_USDB_SUPPLY);

    const v3Balance = await v3Wallet.getBalance();
    const v3TokenEntry = v3Balance.tokenBalances!.entries().next().value!;
    const v3TokenAddressBech32 = v3TokenEntry[0];
    v3TokenIdentifierHex = Buffer.from(
      v3TokenEntry[1].tokenMetadata.rawTokenIdentifier
    ).toString("hex");

    logKV("V3 token address (Bech32m)", v3TokenAddressBech32);
    logKV("V3 token identifier (hex)", v3TokenIdentifierHex);
    logKV("V3 token balance", v3TokenEntry[1].ownedBalance.toString());

    const clientV3 = new FlashnetClient(v3Wallet, {
      sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
      clientNetworkConfig: {
        ammGatewayUrl: AMM_URL!,
        mempoolApiUrl: MEMPOOL_URL!,
        explorerUrl: MEMPOOL_URL!,
        sparkScanUrl: SPARKSCAN_URL,
      },
      autoAuthenticate: true,
    });
    await clientV3.initialize();

    await clientV3.registerHost({
      namespace: namespace + "v3",
      minFeeBps: V3_HOST_FEE_BPS,
    });

    const initialPrice = humanPriceToPoolPrice(
      BTC_PRICE_USD,
      BTC_DECIMALS,
      USDB_DECIMALS,
      false
    );

    logKV("V3 initial price", initialPrice);
    logKV("V3 equivalent BTC price", `~$${BTC_PRICE_USD.toLocaleString()}`);

    const createResult = await clientV3.createConcentratedPool({
      assetAAddress: v3TokenIdentifierHex,
      assetBAddress: BTC_ASSET_PUBKEY,
      tickSpacing: TICK_SPACING,
      initialPrice,
      lpFeeRateBps: V3_LP_FEE_BPS,
      hostFeeRateBps: V3_HOST_FEE_BPS,
      hostNamespace: namespace + "v3",
    });

    if (!createResult.poolId) {
      throw new Error(`Failed to create V3 pool: ${JSON.stringify(createResult)}`);
    }

    v3PoolId = createResult.poolId;
    logKV("V3 Pool ID", v3PoolId);

    const positionRange = tickRangeFromPrices({
      priceLower: POSITION_PRICE_LOWER,
      priceUpper: POSITION_PRICE_UPPER,
      baseDecimals: BTC_DECIMALS,
      quoteDecimals: USDB_DECIMALS,
      baseIsAssetA: false,
      tickSpacing: TICK_SPACING,
    });

    logKV("V3 tick range", `${positionRange.tickLower} to ${positionRange.tickUpper}`);
    logKV("V3 price range", `$${positionRange.actualPriceLower.toFixed(0)} - $${positionRange.actualPriceUpper.toFixed(0)}`);

    const increaseResult = await clientV3.increaseLiquidity({
      poolId: v3PoolId,
      tickLower: positionRange.tickLower,
      tickUpper: positionRange.tickUpper,
      amountADesired: V3_USDB_LIQUIDITY,
      amountBDesired: V3_BTC_LIQUIDITY,
      amountAMin: "0",
      amountBMin: "0",
    });

    logKV("V3 increase liquidity accepted", increaseResult.accepted);
    if (!increaseResult.accepted) {
      logKV("V3 increase liquidity error", increaseResult.error);
      throw new Error(`Failed to add V3 liquidity: ${increaseResult.error}`);
    }

    logKV("V3 liquidity added", increaseResult.liquidityAdded);
  }

  logSection("9. Create Wallet B (Lightning invoice receiver)");

  const seedB = randomBytes(32);
  const { wallet: walletB } = await IssuerSparkWallet.initialize({
    mnemonicOrSeed: seedB,
    options: { network: SPARK_NETWORK as any },
  });
  const userPubB = await walletB.getIdentityPublicKey();
  const userSparkB = await walletB.getSparkAddress();

  logKV("User B public key", userPubB);
  logKV("User B Spark address", userSparkB);

  await fundViaFaucet(walletB, userSparkB, 10000);
  logKV("Wallet B funded", "10000 sats (for Lightning receive)");

  logSection("10. Create Lightning invoice from Wallet B");

  logKV("Invoice amount", `${INVOICE_AMOUNT_SATS} sats`);

  const invoiceResult = await walletB.createLightningInvoice({
    amountSats: INVOICE_AMOUNT_SATS,
    memo: "e2e-lightning-pools-test",
    expirySeconds: 3600,
  });

  const invoice = invoiceResult.invoice.encodedInvoice;
  logKV("Lightning invoice created", typeof invoice === "string" ? invoice.substring(0, 80) + "..." : invoice);
  logKV("Full invoice object", invoiceResult);

  if (!invoice || typeof invoice !== "string") {
    throw new Error(`Failed to create Lightning invoice: ${JSON.stringify(invoiceResult)}`);
  }

  if (!V3_ONLY && v2PoolId) {
    logSection("11. Get Lightning quote - V2 token (LNT)");

    try {
      const quote = await clientA.getPayLightningWithTokenQuote(
        invoice,
        v2TokenIdentifierHex,
      );

      logKV("Quote result", {
        poolId: quote.poolId,
        tokenAmountRequired: quote.tokenAmountRequired,
        btcAmountRequired: quote.btcAmountRequired,
        invoiceAmountSats: quote.invoiceAmountSats,
        estimatedAmmFee: quote.estimatedAmmFee,
        estimatedLightningFee: quote.estimatedLightningFee,
        executionPrice: quote.executionPrice,
        priceImpactPct: quote.priceImpactPct,
        tokenIsAssetA: quote.tokenIsAssetA,
        curveType: quote.curveType,
        poolReserves: quote.poolReserves,
        warningMessage: quote.warningMessage,
      });

      if (quote.poolId === v2PoolId) {
        logKV("Quote selected V2 pool", v2PoolId);
      } else {
        logKV("Quote selected different pool", quote.poolId);
      }
    } catch (e: any) {
      logKV("V2 quote error", e.message || String(e));
      console.log("  This may indicate insufficient V2 pool liquidity for the invoice amount.");
    }
  }

  if (!V2_ONLY && v3PoolId && v3TokenIdentifierHex) {
    logSection("12. Get Lightning quote - V3 token (USD)");

    const clientV3ForQuote = new FlashnetClient(walletA, {
      sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
      clientNetworkConfig: {
        ammGatewayUrl: AMM_URL!,
        mempoolApiUrl: MEMPOOL_URL!,
        explorerUrl: MEMPOOL_URL!,
        sparkScanUrl: SPARKSCAN_URL,
      },
      autoAuthenticate: true,
    });
    await clientV3ForQuote.initialize();

    try {
      const quote = await clientV3ForQuote.getPayLightningWithTokenQuote(
        invoice,
        v3TokenIdentifierHex,
      );

      logKV("Quote result", {
        poolId: quote.poolId,
        tokenAmountRequired: quote.tokenAmountRequired,
        btcAmountRequired: quote.btcAmountRequired,
        invoiceAmountSats: quote.invoiceAmountSats,
        estimatedAmmFee: quote.estimatedAmmFee,
        estimatedLightningFee: quote.estimatedLightningFee,
        executionPrice: quote.executionPrice,
        priceImpactPct: quote.priceImpactPct,
        tokenIsAssetA: quote.tokenIsAssetA,
        curveType: quote.curveType,
        poolReserves: quote.poolReserves,
        warningMessage: quote.warningMessage,
      });

      if (quote.poolId === v3PoolId) {
        logKV("Quote selected V3 pool", v3PoolId);
      } else {
        logKV("Quote selected different pool", quote.poolId);
      }
    } catch (e: any) {
      logKV("V3 quote error", e.message || String(e));
      console.log("  This may indicate insufficient V3 pool liquidity for the invoice amount.");
    }
  }

  if (!V3_ONLY && v2PoolId) {
    logSection("13. Pay Lightning invoice with V2 token (LNT)");

    const balBefore = await walletA.getBalance();
    const v2TokenBal = await getTokenBalanceByHex(walletA, v2TokenIdentifierHex);
    const btcBalBefore = balBefore.balance;
    logKV("Token balance before", v2TokenBal.toString());
    logKV("BTC balance before (sats)", btcBalBefore.toString());

    try {
      const payResult = await clientA.payLightningWithToken({
        invoice,
        tokenAddress: v2TokenIdentifierHex,
        maxSlippageBps: 5000,
        useExistingBtcBalance: false,
      });

      logKV("Payment result", {
        success: payResult.success,
        poolId: payResult.poolId,
        tokenAmountSpent: payResult.tokenAmountSpent,
        btcAmountReceived: payResult.btcAmountReceived,
        swapTransferId: payResult.swapTransferId,
        ammFeePaid: payResult.ammFeePaid,
        lightningPaymentId: payResult.lightningPaymentId,
        sparkTokenTransferId: payResult.sparkTokenTransferId,
        sparkLightningTransferId: payResult.sparkLightningTransferId,
        error: payResult.error,
      });

      if (payResult.success) {
        logKV("V2 Lightning payment", "SUCCESS");
      } else {
        logKV("V2 Lightning payment FAILED", payResult.error);
      }
    } catch (e: any) {
      logKV("V2 payLightningWithToken error", e.message || String(e));
      if (e.response) {
        logKV("Error response", e.response);
      }
    }

    const balAfter = await walletA.getBalance();
    const v2TokenBalAfter = await getTokenBalanceByHex(walletA, v2TokenIdentifierHex);
    logKV("Token balance after", v2TokenBalAfter.toString());
    logKV("BTC balance after (sats)", balAfter.balance.toString());
    logKV("Token spent", (v2TokenBal - v2TokenBalAfter).toString());
    logKV("BTC change (sats)", (balAfter.balance - btcBalBefore).toString());
  }

  if (!V2_ONLY && v3PoolId && v3TokenIdentifierHex) {
    logSection("14. Pay Lightning invoice with V3 token (USD)");

    const invoiceResult2 = await walletB.createLightningInvoice({
      amountSats: INVOICE_AMOUNT_SATS,
      memo: "e2e-lightning-v3-test",
      expirySeconds: 3600,
    });

    const invoice2 = invoiceResult2.invoice.encodedInvoice;
    logKV("Fresh invoice for V3 test", typeof invoice2 === "string" ? invoice2.substring(0, 80) + "..." : invoice2);

    if (!invoice2 || typeof invoice2 !== "string") {
      logKV("Failed to create second Lightning invoice", invoiceResult2);
    } else {
      const { wallet: v3PayerWallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: seedA,
        accountNumber: 1,
        options: { network: SPARK_NETWORK as any },
      });

      const clientV3Payer = new FlashnetClient(v3PayerWallet, {
        sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
        clientNetworkConfig: {
          ammGatewayUrl: AMM_URL!,
          mempoolApiUrl: MEMPOOL_URL!,
          explorerUrl: MEMPOOL_URL!,
          sparkScanUrl: SPARKSCAN_URL,
        },
        autoAuthenticate: true,
      });
      await clientV3Payer.initialize();

      const v3BalBefore = await v3PayerWallet.getBalance();
      const v3TokenBalBefore = await getTokenBalanceByHex(v3PayerWallet, v3TokenIdentifierHex);
      logKV("V3 token balance before", v3TokenBalBefore.toString());
      logKV("V3 BTC balance before (sats)", v3BalBefore.balance.toString());

      try {
        const payResult = await clientV3Payer.payLightningWithToken({
          invoice: invoice2,
          tokenAddress: v3TokenIdentifierHex,
          maxSlippageBps: 5000,
          useExistingBtcBalance: false,
        });

        logKV("V3 Payment result", {
          success: payResult.success,
          poolId: payResult.poolId,
          tokenAmountSpent: payResult.tokenAmountSpent,
          btcAmountReceived: payResult.btcAmountReceived,
          swapTransferId: payResult.swapTransferId,
          ammFeePaid: payResult.ammFeePaid,
          lightningPaymentId: payResult.lightningPaymentId,
          sparkTokenTransferId: payResult.sparkTokenTransferId,
          sparkLightningTransferId: payResult.sparkLightningTransferId,
          error: payResult.error,
        });

        if (payResult.success) {
          logKV("V3 Lightning payment", "SUCCESS");
        } else {
          logKV("V3 Lightning payment FAILED", payResult.error);
        }
      } catch (e: any) {
        logKV("V3 payLightningWithToken error", e.message || String(e));
        if (e.response) logKV("Error response", e.response);
      }

      const v3BalAfter = await v3PayerWallet.getBalance();
      const v3TokenBalAfter = await getTokenBalanceByHex(v3PayerWallet, v3TokenIdentifierHex);
      logKV("V3 token balance after", v3TokenBalAfter.toString());
      logKV("V3 BTC balance after (sats)", v3BalAfter.balance.toString());
    }
  }

  logSection("Summary");

  console.log("\nPools created:");
  if (v2PoolId) console.log(`  V2 Pool: ${v2PoolId}`);
  if (v3PoolId) console.log(`  V3 Pool: ${v3PoolId}`);
  console.log(`\nTokens used:`);
  console.log(`  V2 token (LNT): ${v2TokenIdentifierHex}`);
  if (v3TokenIdentifierHex) console.log(`  V3 token (USD): ${v3TokenIdentifierHex}`);
  console.log(`\nInvoice amount: ${INVOICE_AMOUNT_SATS} sats`);
  console.log(`\nNetwork: ${SPARK_NETWORK}`);
  console.log(`AMM: ${AMM_URL}`);

  logSection("E2E Lightning Payment Test Complete");
}

main().catch((err) => {
  console.error("\n\nFATAL ERROR");
  console.error(err);
  process.exit(1);
});

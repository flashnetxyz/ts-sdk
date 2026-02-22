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
  const failures: string[] = [];

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
      failures.push(`V2 quote: ${e.message || String(e)}`);
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
      failures.push(`V3 quote: ${e.message || String(e)}`);
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
        failures.push(`V2 payment failed: ${payResult.error}`);
      }
    } catch (e: any) {
      logKV("V2 payLightningWithToken error", e.message || String(e));
      if (e.response) {
        logKV("Error response", e.response);
      }
      failures.push(`V2 payment error: ${e.message || String(e)}`);
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
          failures.push(`V3 payment failed: ${payResult.error}`);
        }
      } catch (e: any) {
        logKV("V3 payLightningWithToken error", e.message || String(e));
        if (e.response) logKV("Error response", e.response);
        failures.push(`V3 payment error: ${e.message || String(e)}`);
      }

      const v3BalAfter = await v3PayerWallet.getBalance();
      const v3TokenBalAfter = await getTokenBalanceByHex(v3PayerWallet, v3TokenIdentifierHex);
      logKV("V3 token balance after", v3TokenBalAfter.toString());
      logKV("V3 BTC balance after (sats)", v3BalAfter.balance.toString());
    }
  }
  // Low BTC reserve liquidity test:
  // A V2 pool with large token supply but low BTC reserve fails to get
  // a quote for 1455 sats. The error is "No pool has sufficient liquidity"
  // even though the pool has plenty of tokens. The root cause is the BTC
  // reserve being too low for the required swap output after bit masking.
  //
  // This test creates a V2 pool with 117M tokens but a small BTC seed,
  // then tests with a 1455-sat invoice.
  logSection("15. Low BTC reserve liquidity test (1455 sats)");

  const LOW_BTC_INVOICE_SATS = 1455;
  const LOW_BTC_TOKEN_SUPPLY = BigInt(117_000_000); // 117M tokens (0 decimals)

  // Create a fresh wallet for this test
  const lowBtcSeed = randomBytes(32);
  const { wallet: lowBtcWallet } = await IssuerSparkWallet.initialize({
    mnemonicOrSeed: lowBtcSeed,
    options: { network: SPARK_NETWORK as any },
  });
  const lowBtcPub = await lowBtcWallet.getIdentityPublicKey();
  const lowBtcSpark = await lowBtcWallet.getSparkAddress();

  logKV("Low BTC test wallet", lowBtcSpark);

  // Fund wallet
  await fundViaFaucet(lowBtcWallet, lowBtcSpark, FAUCET_FUND_SATS);
  logKV("Low BTC wallet funded", `${FAUCET_FUND_SATS} sats`);

  // Create token with large supply
  await lowBtcWallet.createToken({
    tokenName: "LBR Test",
    tokenTicker: "LBR",
    decimals: 0,
    isFreezable: false,
    maxSupply: LOW_BTC_TOKEN_SUPPLY,
  });
  await lowBtcWallet.mintTokens(LOW_BTC_TOKEN_SUPPLY);

  const lowBtcBalance = await lowBtcWallet.getBalance();
  const lowBtcTokenEntry = lowBtcBalance.tokenBalances!.entries().next().value!;
  const lowBtcTokenHex = Buffer.from(
    lowBtcTokenEntry[1].tokenMetadata.rawTokenIdentifier
  ).toString("hex");

  logKV("LBR token identifier (hex)", lowBtcTokenHex);
  logKV("LBR token balance", lowBtcTokenEntry[1].ownedBalance.toString());

  // Initialize FlashnetClient
  const lowBtcClient = new FlashnetClient(lowBtcWallet, {
    sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
    clientNetworkConfig: {
      ammGatewayUrl: AMM_URL!,
      mempoolApiUrl: MEMPOOL_URL!,
      explorerUrl: MEMPOOL_URL!,
      sparkScanUrl: SPARKSCAN_URL,
    },
    autoAuthenticate: true,
  });
  await lowBtcClient.initialize();

  // Register host
  const lowBtcNs = Math.random().toString(36).substring(2, 7);
  await lowBtcClient.registerHost({
    namespace: lowBtcNs,
    minFeeBps: V2_HOST_FEE_BPS,
  });

  // Create V2 pool with all tokens
  const lowBtcReserves = FlashnetClient.calculateVirtualReserves({
    initialTokenSupply: Number(LOW_BTC_TOKEN_SUPPLY),
    graduationThresholdPct: V2_GRADUATION_PCT,
    targetRaise: Number(V2_TARGET_RAISE),
  });

  const lowBtcPoolResp = await lowBtcClient.createSingleSidedPool({
    assetAAddress: lowBtcTokenHex,
    assetBAddress: BTC_ASSET_PUBKEY,
    assetAInitialReserve: LOW_BTC_TOKEN_SUPPLY.toString(),
    virtualReserveA: lowBtcReserves.virtualReserveA.toString(),
    virtualReserveB: lowBtcReserves.virtualReserveB.toString(),
    threshold: lowBtcReserves.threshold.toString(),
    lpFeeRateBps: V2_LP_FEE_BPS,
    totalHostFeeRateBps: V2_HOST_FEE_BPS,
    hostNamespace: lowBtcNs,
  });

  const lowBtcPoolId = lowBtcPoolResp.poolId;
  logKV("Low BTC Pool ID", lowBtcPoolId);

  // Seed pool with a small BTC buy (low BTC reserve scenario)
  const lowBtcSeedAmount = "5000"; // Only 5k sats to keep BTC reserve low
  const lowBtcSwap = await lowBtcClient.executeSwap({
    poolId: lowBtcPoolId,
    assetInAddress: BTC_ASSET_PUBKEY,
    assetOutAddress: lowBtcTokenHex,
    amountIn: lowBtcSeedAmount,
    minAmountOut: "0",
    maxSlippageBps: 50000,
  });
  logKV("Low BTC pool seed swap accepted", lowBtcSwap.accepted);
  logKV("Low BTC pool seed swap amountOut", lowBtcSwap.amountOut);

  // Check reserves after seeding
  const lowBtcPoolDetails = await typed.getPool(lowBtcPoolId);
  logKV("Low BTC pool reserves", {
    assetAReserve: lowBtcPoolDetails.assetAReserve,
    assetBReserve: lowBtcPoolDetails.assetBReserve,
    curveType: lowBtcPoolDetails.curveType,
  });

  // Create a 1455 sats invoice
  const lowBtcInvoice = await walletB.createLightningInvoice({
    amountSats: LOW_BTC_INVOICE_SATS,
    memo: "low-btc-reserve-test",
    expirySeconds: 3600,
  });

  const lowBtcInv = lowBtcInvoice.invoice.encodedInvoice;
  logKV("Low BTC test invoice", typeof lowBtcInv === "string" ? lowBtcInv.substring(0, 80) + "..." : lowBtcInv);
  logKV("Low BTC test invoice amount", `${LOW_BTC_INVOICE_SATS} sats`);

  // Try to get a quote at 1455 sats with low BTC reserve
  logSection("15b. Get quote for low BTC reserve pool at 1455 sats");

  try {
    const lowBtcQuote = await lowBtcClient.getPayLightningWithTokenQuote(
      lowBtcInv,
      lowBtcTokenHex,
    );

    logKV("Low BTC quote result", {
      poolId: lowBtcQuote.poolId,
      tokenAmountRequired: lowBtcQuote.tokenAmountRequired,
      btcAmountRequired: lowBtcQuote.btcAmountRequired,
      invoiceAmountSats: lowBtcQuote.invoiceAmountSats,
      estimatedAmmFee: lowBtcQuote.estimatedAmmFee,
      estimatedLightningFee: lowBtcQuote.estimatedLightningFee,
      executionPrice: lowBtcQuote.executionPrice,
      priceImpactPct: lowBtcQuote.priceImpactPct,
      tokenIsAssetA: lowBtcQuote.tokenIsAssetA,
      curveType: lowBtcQuote.curveType,
      poolReserves: lowBtcQuote.poolReserves,
      warningMessage: lowBtcQuote.warningMessage,
    });

    logKV("Low BTC quote success", "Quote obtained for 1455 sats");

    // Also try paying the invoice
    logSection("15c. Pay low BTC reserve invoice");

    try {
      const lowBtcPayResult = await lowBtcClient.payLightningWithToken({
        invoice: lowBtcInv,
        tokenAddress: lowBtcTokenHex,
        maxSlippageBps: 5000,
        useExistingBtcBalance: false,
      });

      logKV("Low BTC payment result", {
        success: lowBtcPayResult.success,
        poolId: lowBtcPayResult.poolId,
        tokenAmountSpent: lowBtcPayResult.tokenAmountSpent,
        btcAmountReceived: lowBtcPayResult.btcAmountReceived,
        sparkTokenTransferId: lowBtcPayResult.sparkTokenTransferId,
        sparkLightningTransferId: lowBtcPayResult.sparkLightningTransferId,
        error: lowBtcPayResult.error,
      });
    } catch (e: any) {
      logKV("Low BTC payment error", e.message || String(e));
    }
  } catch (e: any) {
    logKV("Low BTC quote error (expected)", e.message || String(e));
    console.log("  Pool reserves:", JSON.stringify({
      assetAReserve: lowBtcPoolDetails.assetAReserve,
      assetBReserve: lowBtcPoolDetails.assetBReserve,
    }));
    console.log("  Pool has sufficient token reserves but insufficient BTC reserve.");
  }

  // Token-only payer test:
  // A wallet that holds only tokens (zero BTC balance) attempts to pay
  // a Lightning invoice using payLightningWithToken. The wallet must swap
  // tokens for BTC via the existing V2 pool, then pay the invoice with
  // the received BTC.
  if (!V3_ONLY && v2PoolId) {
    logSection("16. Token-only payer test (0 BTC wallet)");

    // Re-seed V2 pool with BTC (previous payment may have depleted it)
    const reSeedAmount = "20000";
    logKV("Re-seeding V2 pool with BTC", `${reSeedAmount} sats`);
    const reSeedSwap = await clientA.executeSwap({
      poolId: v2PoolId,
      assetInAddress: BTC_ASSET_PUBKEY,
      assetOutAddress: v2TokenIdentifierHex,
      amountIn: reSeedAmount,
      minAmountOut: "0",
      maxSlippageBps: 50000,
    });
    logKV("Re-seed swap accepted", reSeedSwap.accepted);
    logKV("V2 pool BTC reserve after re-seed", (await typed.getPool(v2PoolId)).assetBReserve);

    // Create wallet C - the token-only payer (do NOT fund with BTC)
    const seedC = randomBytes(32);
    const { wallet: walletC } = await IssuerSparkWallet.initialize({
      mnemonicOrSeed: seedC,
      options: { network: SPARK_NETWORK as any },
    });
    const userPubC = await walletC.getIdentityPublicKey();
    const userSparkC = await walletC.getSparkAddress();

    logKV("Wallet C public key", userPubC);
    logKV("Wallet C Spark address", userSparkC);

    // Confirm wallet C has 0 BTC
    const balC = await walletC.getBalance();
    logKV("Wallet C BTC balance", balC.balance.toString());
    logKV("Wallet C token balances", balC.tokenBalances?.size.toString() || "0");

    // Transfer LNT tokens from wallet A to wallet C
    const tokenTransferAmount = 50000n;
    logKV("Transferring tokens from wallet A to wallet C", tokenTransferAmount.toString());

    const transferTxId = await walletA.transferTokens({
      tokenIdentifier: v2TokenAddress as any,
      tokenAmount: tokenTransferAmount,
      receiverSparkAddress: userSparkC,
    });
    logKV("Token transfer tx ID", transferTxId);

    // Wait for transfer to settle
    await new Promise((r) => setTimeout(r, 5000));

    // Check wallet C balances after receiving tokens
    const balCAfterTransfer = await walletC.getBalance();
    const tokenBalC = await getTokenBalanceByHex(walletC, v2TokenIdentifierHex);
    logKV("Wallet C BTC balance after transfer", balCAfterTransfer.balance.toString());
    logKV("Wallet C LNT token balance", tokenBalC.toString());

    if (tokenBalC === 0n) {
      logKV("ERROR", "Wallet C did not receive tokens, skipping payment test");
    } else {
      // Initialize FlashnetClient for wallet C
      const clientC = new FlashnetClient(walletC, {
        sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
        clientNetworkConfig: {
          ammGatewayUrl: AMM_URL!,
          mempoolApiUrl: MEMPOOL_URL!,
          explorerUrl: MEMPOOL_URL!,
          sparkScanUrl: SPARKSCAN_URL,
        },
        autoAuthenticate: true,
      });
      await clientC.initialize();

      // Create a fresh invoice from wallet B
      const invoiceC = await walletB.createLightningInvoice({
        amountSats: INVOICE_AMOUNT_SATS,
        memo: "token-only-payer-test",
        expirySeconds: 3600,
      });

      const invC = invoiceC.invoice.encodedInvoice;
      logKV("Token-only payer invoice", typeof invC === "string" ? invC.substring(0, 80) + "..." : invC);
      logKV("Invoice amount", `${INVOICE_AMOUNT_SATS} sats`);

      // Get a quote first
      logSection("16b. Get quote for token-only payer");

      try {
        const quoteC = await clientC.getPayLightningWithTokenQuote(
          invC,
          v2TokenIdentifierHex,
        );

        logKV("Token-only payer quote", {
          poolId: quoteC.poolId,
          tokenAmountRequired: quoteC.tokenAmountRequired,
          btcAmountRequired: quoteC.btcAmountRequired,
          invoiceAmountSats: quoteC.invoiceAmountSats,
          estimatedAmmFee: quoteC.estimatedAmmFee,
          curveType: quoteC.curveType,
        });
      } catch (e: any) {
        logKV("Token-only payer quote error", e.message || String(e));
        failures.push(`Token-only payer quote: ${e.message || String(e)}`);
      }

      // Pay the Lightning invoice with tokens only (0 BTC in wallet)
      logSection("16c. Pay Lightning invoice with 0 BTC (token-only)");

      logKV("Wallet C BTC balance", balCAfterTransfer.balance.toString());
      logKV("Wallet C LNT balance", tokenBalC.toString());

      try {
        const payResultC = await clientC.payLightningWithToken({
          invoice: invC,
          tokenAddress: v2TokenIdentifierHex,
          maxSlippageBps: 5000,
          useExistingBtcBalance: false,
        });

        logKV("Token-only payment result", {
          success: payResultC.success,
          poolId: payResultC.poolId,
          tokenAmountSpent: payResultC.tokenAmountSpent,
          btcAmountReceived: payResultC.btcAmountReceived,
          swapTransferId: payResultC.swapTransferId,
          ammFeePaid: payResultC.ammFeePaid,
          lightningPaymentId: payResultC.lightningPaymentId,
          sparkTokenTransferId: payResultC.sparkTokenTransferId,
          sparkLightningTransferId: payResultC.sparkLightningTransferId,
          error: payResultC.error,
        });

        if (payResultC.success) {
          logKV("Token-only Lightning payment", "SUCCESS");
        } else {
          logKV("Token-only Lightning payment FAILED", payResultC.error);
          failures.push(`Token-only payment failed: ${payResultC.error}`);
        }
      } catch (e: any) {
        logKV("Token-only payLightningWithToken error", e.message || String(e));
        if (e.response) {
          logKV("Error response", e.response);
        }
        failures.push(`Token-only payment error: ${e.message || String(e)}`);
      }

      // Final balances
      const balCFinal = await walletC.getBalance();
      const tokenBalCFinal = await getTokenBalanceByHex(walletC, v2TokenIdentifierHex);
      logKV("Wallet C final BTC balance", balCFinal.balance.toString());
      logKV("Wallet C final LNT balance", tokenBalCFinal.toString());
      logKV("Tokens spent", (tokenBalC - tokenBalCFinal).toString());
    }
  }

  // Wallet with partial BTC (< invoice) + tokens pays via token swap.
  // Verifies minAmountOut >= invoiceAmount + fee at all slippage levels.
  if (!V3_ONLY && v2PoolId) {
    logSection("17. Partial-BTC payer + minAmountOut vulnerability proof");

    const PARTIAL_BTC_SATS = 500;

    const pool17 = await typed.getPool(v2PoolId);
    if (BigInt(pool17.assetBReserve) < 5000n) {
      logKV("Re-seeding V2 pool with BTC", "10000 sats");
      await clientA.executeSwap({
        poolId: v2PoolId,
        assetInAddress: BTC_ASSET_PUBKEY,
        assetOutAddress: v2TokenIdentifierHex,
        amountIn: "10000",
        minAmountOut: "0",
        maxSlippageBps: 50000,
      });
    }

    const seedD = randomBytes(32);
    const { wallet: walletD } = await IssuerSparkWallet.initialize({
      mnemonicOrSeed: seedD,
      options: { network: SPARK_NETWORK as any },
    });
    const userSparkD = await walletD.getSparkAddress();
    logKV("Wallet D Spark address", userSparkD);

    logKV("Funding Wallet D with partial BTC", `${PARTIAL_BTC_SATS} sats (< ${INVOICE_AMOUNT_SATS} invoice)`);
    await fundViaFaucet(walletD, userSparkD, PARTIAL_BTC_SATS);

    const tokensForD = 50000n;
    const walletATokenBal = await getTokenBalanceByHex(walletA, v2TokenIdentifierHex);
    if (walletATokenBal >= tokensForD) {
      logKV("Transferring tokens to Wallet D", tokensForD.toString());
      await walletA.transferTokens({
        tokenIdentifier: v2TokenAddress as any,
        tokenAmount: tokensForD,
        receiverSparkAddress: userSparkD,
      });
      await new Promise((r) => setTimeout(r, 5000));
    } else {
      logKV("WARNING", `Wallet A has only ${walletATokenBal} tokens, need ${tokensForD}. Skipping section 17.`);
    }

    const balD = await walletD.getBalance();
    const tokenBalD = await getTokenBalanceByHex(walletD, v2TokenIdentifierHex);
    logKV("Wallet D BTC balance", balD.balance.toString());
    logKV("Wallet D token balance", tokenBalD.toString());

    if (tokenBalD > 0n) {
      const clientD = new FlashnetClient(walletD, {
        sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
        clientNetworkConfig: {
          ammGatewayUrl: AMM_URL!,
          mempoolApiUrl: MEMPOOL_URL!,
          explorerUrl: MEMPOOL_URL!,
          sparkScanUrl: SPARKSCAN_URL,
        },
        autoAuthenticate: true,
      });
      await clientD.initialize();

      const invoiceD = await walletB.createLightningInvoice({
        amountSats: INVOICE_AMOUNT_SATS,
        memo: "partial-btc-vuln-proof",
        expirySeconds: 3600,
      });
      const invD = invoiceD.invoice.encodedInvoice;

      const quoteD = await clientD.getPayLightningWithTokenQuote(invD, v2TokenIdentifierHex);
      logKV("Quote", {
        btcAmountRequired: quoteD.btcAmountRequired,
        tokenAmountRequired: quoteD.tokenAmountRequired,
        invoiceAmountSats: quoteD.invoiceAmountSats,
        estimatedLightningFee: quoteD.estimatedLightningFee,
      });

      const baseBtcNeeded = BigInt(quoteD.invoiceAmountSats) + BigInt(quoteD.estimatedLightningFee);
      logKV("baseBtcNeeded (invoice + fee)", baseBtcNeeded.toString());

      for (const slippageBps of [500, 1000, 5000]) {
        const btcReq = BigInt(quoteD.btcAmountRequired);
        const oldMin = (btcReq * BigInt(10000 - slippageBps)) / 10000n;
        const fixedMin = oldMin >= baseBtcNeeded ? oldMin : baseBtcNeeded;

        logKV(`  slippage=${slippageBps}bps`, `OLD min=${oldMin} VULNERABLE=${oldMin < baseBtcNeeded}, FIXED min=${fixedMin} VULNERABLE=${fixedMin < baseBtcNeeded}`);

        if (fixedMin < baseBtcNeeded) {
          failures.push(`Fix failed at ${slippageBps}bps: fixedMin (${fixedMin}) < baseBtcNeeded (${baseBtcNeeded})`);
        }
      }

      logSection("17b. Pay Lightning with partial BTC + tokens");

      try {
        const payResultD = await clientD.payLightningWithToken({
          invoice: invD,
          tokenAddress: v2TokenIdentifierHex,
          maxSlippageBps: 5000,
          useExistingBtcBalance: false,
        });

        logKV("Partial-BTC payment result", {
          success: payResultD.success,
          tokenAmountSpent: payResultD.tokenAmountSpent,
          btcAmountReceived: payResultD.btcAmountReceived,
          lightningPaymentId: payResultD.lightningPaymentId,
          error: payResultD.error,
        });

        if (payResultD.success) {
          logKV("Partial-BTC Lightning payment", "SUCCESS");
        } else {
          logKV("Partial-BTC Lightning payment FAILED", payResultD.error);
          if (payResultD.error?.includes("Insufficient balance")) {
            failures.push(`Partial-BTC payment insufficient balance: ${payResultD.error}`);
          }
        }
      } catch (e: any) {
        logKV("Partial-BTC payLightningWithToken error", e.message || String(e));
        failures.push(`Partial-BTC payment error: ${e.message || String(e)}`);
      }

      const balDFinal = await walletD.getBalance();
      const tokenBalDFinal = await getTokenBalanceByHex(walletD, v2TokenIdentifierHex);
      logKV("Wallet D final BTC balance", balDFinal.balance.toString());
      logKV("Wallet D final token balance", tokenBalDFinal.toString());
    }
  }

  // Concurrent swap while another wallet pays via payLightningWithToken.
  if (!V3_ONLY && v2PoolId) {
    logSection("18. Concurrent pool drain test");

    const pool18 = await typed.getPool(v2PoolId);
    if (BigInt(pool18.assetBReserve) < 5000n) {
      logKV("Re-seeding V2 pool", "10000 sats");
      await clientA.executeSwap({
        poolId: v2PoolId,
        assetInAddress: BTC_ASSET_PUBKEY,
        assetOutAddress: v2TokenIdentifierHex,
        amountIn: "10000",
        minAmountOut: "0",
        maxSlippageBps: 50000,
      });
    }

    const seedE = randomBytes(32);
    const { wallet: walletE } = await IssuerSparkWallet.initialize({
      mnemonicOrSeed: seedE,
      options: { network: SPARK_NETWORK as any },
    });
    const userSparkE = await walletE.getSparkAddress();

    const tokensForE = 50000n;
    const walletATokenBal18 = await getTokenBalanceByHex(walletA, v2TokenIdentifierHex);
    if (walletATokenBal18 >= tokensForE) {
      await walletA.transferTokens({
        tokenIdentifier: v2TokenAddress as any,
        tokenAmount: tokensForE,
        receiverSparkAddress: userSparkE,
      });
      await new Promise((r) => setTimeout(r, 5000));
    }

    const tokenBalE = await getTokenBalanceByHex(walletE, v2TokenIdentifierHex);
    logKV("Wallet E BTC balance", (await walletE.getBalance()).balance.toString());
    logKV("Wallet E token balance", tokenBalE.toString());

    if (tokenBalE > 0n) {
      const clientE = new FlashnetClient(walletE, {
        sparkNetworkType: SPARK_NETWORK as SparkNetworkType,
        clientNetworkConfig: {
          ammGatewayUrl: AMM_URL!,
          mempoolApiUrl: MEMPOOL_URL!,
          explorerUrl: MEMPOOL_URL!,
          sparkScanUrl: SPARKSCAN_URL,
        },
        autoAuthenticate: true,
      });
      await clientE.initialize();

      const invoiceE = await walletB.createLightningInvoice({
        amountSats: INVOICE_AMOUNT_SATS,
        memo: "concurrent-drain-test",
        expirySeconds: 3600,
      });
      const invE = invoiceE.invoice.encodedInvoice;

      logKV("Pool BTC reserve before drain", (await typed.getPool(v2PoolId)).assetBReserve);
      logKV("Starting concurrent: Wallet E payment + Wallet A drain (3000 sats)");

      const [payRes, drainRes] = await Promise.allSettled([
        clientE.payLightningWithToken({
          invoice: invE,
          tokenAddress: v2TokenIdentifierHex,
          maxSlippageBps: 5000,
          useExistingBtcBalance: false,
          rollbackOnFailure: true,
        }),
        (async () => {
          await new Promise((r) => setTimeout(r, 200));
          return clientA.executeSwap({
            poolId: v2PoolId!,
            assetInAddress: BTC_ASSET_PUBKEY,
            assetOutAddress: v2TokenIdentifierHex,
            amountIn: "3000",
            minAmountOut: "0",
            maxSlippageBps: 50000,
          });
        })(),
      ]);

      logKV("Drain result", drainRes.status === "fulfilled"
        ? `accepted=${drainRes.value.accepted}`
        : `error=${(drainRes as any).reason?.message}`);

      if (payRes.status === "fulfilled") {
        const r = payRes.value;
        logKV("Concurrent payment result", {
          success: r.success,
          btcAmountReceived: r.btcAmountReceived,
          tokenAmountSpent: r.tokenAmountSpent,
          error: r.error,
        });

        if (r.success) {
          logKV("Concurrent drain payment", "SUCCESS (race did not trigger)");
        } else if (r.error?.includes("Insufficient balance")) {
          logKV("Concurrent drain payment", "BUG: Insufficient balance");
          failures.push(`Concurrent drain: ${r.error}`);
        } else {
          logKV("Concurrent drain payment failed (non-balance)", r.error);
        }
      } else {
        const err = (payRes as any).reason?.message || String((payRes as any).reason);
        logKV("Concurrent payment exception", err);
        if (err.includes("Insufficient balance")) {
          failures.push(`Concurrent drain exception: ${err}`);
        }
      }
    } else {
      logKV("No tokens available for concurrent drain test", "skipping");
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

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }

  console.log("\nAll tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n\nFATAL ERROR");
  console.error(err);
  process.exit(1);
});

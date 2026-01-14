/**
 * E2E Test for @flashnet/sdk
 *
 * Tests the built SDK with real API calls:
 * - Wallet creation and authentication
 * - Token creation and minting
 * - Pool creation (single-sided)
 * - Swap execution (BTC -> Token, Token -> BTC)
 * - Liquidity operations (add/remove)
 *
 * All configuration via environment variables.
 */

import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import { randomBytes } from "crypto";
import sha256 from "fast-sha256";
import {
  ApiClient,
  AuthManager,
  BTC_ASSET_PUBKEY,
  encodeSparkAddressNew,
  FlashnetClient,
  generateNonce,
  generatePoolSwapIntentMessage,
  generateRegisterHostIntentMessage,
  TypedAmmApi,
} from "../dist/esm/index.js";
import { getHexFromUint8Array } from "../src/utils/hex";

const bytesToHex = getHexFromUint8Array;

const AMM_URL = process.env.AMM_URL;
const MEMPOOL_URL = process.env.MEMPOOL_URL;
const SPARKSCAN_URL = process.env.SPARKSCAN_URL;
const SPARK_NETWORK = process.env.SPARK_NETWORK || "REGTEST";
const FAUCET_URL = process.env.FAUCET_URL;

if (!AMM_URL || !MEMPOOL_URL || !SPARKSCAN_URL || !FAUCET_URL) {
  console.error("Missing required environment variables. See .env.example");
  process.exit(1);
}

const config = {
  ammUrl: AMM_URL as string,
  mempoolUrl: MEMPOOL_URL as string,
  sparkscanUrl: SPARKSCAN_URL as string,
  faucetUrl: FAUCET_URL as string,
};

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

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string, value?: unknown): void {
  if (value !== undefined) {
    const stringified =
      typeof value === "bigint"
        ? value.toString()
        : typeof value === "object"
          ? JSON.stringify(value, (_, v) =>
              typeof v === "bigint" ? v.toString() : v
            )
          : String(value);
    console.log(`${message}: ${stringified}`);
  } else {
    console.log(message);
  }
}

function section(title: string): void {
  console.log(`\n${title}\n`);
}

async function fundViaFaucet(
  wallet: IssuerSparkWallet,
  address: string,
  amount: number
): Promise<void> {
  const before = await wallet.getBalance();
  const startSats = before.balance;

  const resp = await fetch(`${config.faucetUrl}/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amount }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(
      `Faucet error ${resp.status}: ${(data as { error?: string }).error || "unknown"}`
    );
  }

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
    throw new Error("Faucet funds not detected in wallet within timeout");
  }
}

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<boolean> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    log(`[PASS] ${name} (${Date.now() - start}ms)`);
    return true;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    results.push({ name, passed: false, duration: Date.now() - start, error });
    log(`[FAIL] ${name}: ${error}`);
    return false;
  }
}

async function main(): Promise<void> {
  section("E2E Test Suite");

  let wallet: IssuerSparkWallet;
  let userPub: string;
  let userSpark: string;
  let api: ApiClient;
  let typed: TypedAmmApi;
  let fnClient: FlashnetClient;
  let tokenAddress: string;
  let tokenIdentifierHex: string;
  let poolId: string;
  let namespace: string;

  await runTest("Initialize wallet", async () => {
    const seed = randomBytes(32);
    const result = await IssuerSparkWallet.initialize({
      mnemonicOrSeed: seed,
      options: { network: SPARK_NETWORK as "REGTEST" | "MAINNET" },
    });
    wallet = result.wallet;
    userPub = await wallet.getIdentityPublicKey();
    userSpark = await wallet.getSparkAddress();
    log("User public key", userPub);
    log("Spark address", userSpark);
  });

  await runTest("API authentication", async () => {
    api = new ApiClient({
      ammGatewayUrl: config.ammUrl,
      mempoolApiUrl: config.mempoolUrl,
      explorerUrl: config.mempoolUrl,
      sparkScanUrl: config.sparkscanUrl,
    });
    typed = new TypedAmmApi(api);
    const auth = new AuthManager(api, userPub, wallet);
    await auth.authenticate();
  });

  await runTest("Fund wallet via faucet", async () => {
    await fundViaFaucet(wallet, userSpark, FAUCET_FUND_SATS);
  });

  await runTest("Create and mint token", async () => {
    await wallet.createToken({
      tokenName: "E2ETEST",
      tokenTicker: "E2E",
      decimals: 0,
      isFreezable: false,
      maxSupply: INITIAL_SUPPLY,
    });
    await wallet.mintTokens(INITIAL_SUPPLY);

    const balance = await wallet.getBalance();
    if (!balance.tokenBalances || balance.tokenBalances.size === 0) {
      throw new Error("No token balances found after minting");
    }

    const firstEntry = balance.tokenBalances.entries().next().value;
    if (!firstEntry) {
      throw new Error("Token balance entry not found");
    }
    tokenAddress = firstEntry[0];
    tokenIdentifierHex = Buffer.from(
      firstEntry[1].tokenMetadata.rawTokenIdentifier
    ).toString("hex");

    log("Token address", tokenAddress);
    log("Token identifier", tokenIdentifierHex);
  });

  await runTest("Initialize FlashnetClient", async () => {
    fnClient = new FlashnetClient(wallet, {
      sparkNetworkType: SPARK_NETWORK as "REGTEST" | "MAINNET",
      clientConfig: {
        ammGatewayUrl: config.ammUrl,
        mempoolApiUrl: config.mempoolUrl,
        explorerUrl: config.mempoolUrl,
        sparkScanUrl: config.sparkscanUrl,
      },
    });
    await fnClient.initialize();
  });

  await runTest("Register host", async () => {
    namespace = Math.random().toString(36).substring(2, 7);
    const nonce = generateNonce();
    const intent = generateRegisterHostIntentMessage({
      namespace,
      minFeeBps: HOST_FEE_BPS,
      feeRecipientPublicKey: userPub,
      nonce,
    });
    const hash = sha256(intent);
    const sig = await (wallet as any).config.signer.signMessageWithIdentityKey(
      hash,
      true
    );
    await typed.registerHost({
      namespace,
      minFeeBps: HOST_FEE_BPS,
      feeRecipientPublicKey: userPub,
      nonce,
      signature: Buffer.from(sig).toString("hex"),
    });
    log("Host namespace", namespace);
  });

  await runTest("Create single-sided pool", async () => {
    const { virtualReserveA, virtualReserveB, threshold } =
      FlashnetClient.calculateVirtualReserves({
        initialTokenSupply: Number(INITIAL_SUPPLY),
        graduationThresholdPct: GRADUATION_PCT,
        targetRaise: Number(TARGET_RAISE),
      });

    const createResp = await fnClient.createSingleSidedPool({
      assetAAddress: tokenIdentifierHex,
      assetBAddress: BTC_ASSET_PUBKEY,
      assetAInitialReserve: INITIAL_SUPPLY.toString(),
      virtualReserveA: virtualReserveA.toString(),
      virtualReserveB: virtualReserveB.toString(),
      threshold: threshold.toString(),
      lpFeeRateBps: LP_FEE_BPS,
      totalHostFeeRateBps: HOST_FEE_BPS,
      hostNamespace: namespace,
    });

    poolId = createResp.poolId;
    log("Pool created", poolId);
  });

  await runTest("Execute swap: BTC -> Token", async () => {
    const lpSpark = encodeSparkAddressNew({
      identityPublicKey: poolId,
      network: SPARK_NETWORK as "REGTEST" | "MAINNET",
    });

    const tx = await wallet.transfer({
      amountSats: Number(SWAP_IN_AMOUNT),
      receiverSparkAddress: lpSpark,
    });

    const nonce = generateNonce();
    const intent = generatePoolSwapIntentMessage({
      userPublicKey: userPub,
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

    const hash = sha256(intent);
    const sig = await (wallet as any).config.signer.signMessageWithIdentityKey(
      hash,
      true
    );

    const resp = await typed.executeSwap({
      userPublicKey: userPub,
      poolId,
      assetInAddress: BTC_ASSET_PUBKEY,
      assetOutAddress: tokenIdentifierHex,
      amountIn: SWAP_IN_AMOUNT.toString(),
      maxSlippageBps: MAX_SLIPPAGE_BPS,
      minAmountOut: MIN_OUT,
      assetInSparkTransferId: tx.id,
      nonce,
      totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
      integratorPublicKey: userPub,
      signature: Buffer.from(sig).toString("hex"),
    });

    if (!resp.accepted) throw new Error(resp.error || "Swap rejected");
    log("Swap result", {
      amountOut: resp.amountOut,
      transferId: resp.outboundTransferId,
    });
  });

  // Stress test: 3 swaps in each direction
  const SWAP_COUNT = 3;
  const SMALL_SWAP_AMOUNT = 500n;

  await runTest(`Execute ${SWAP_COUNT} swaps: BTC -> Token`, async () => {
    const lpSpark = encodeSparkAddressNew({
      identityPublicKey: poolId,
      network: SPARK_NETWORK as "REGTEST" | "MAINNET",
    });

    let successCount = 0;
    for (let i = 0; i < SWAP_COUNT; i++) {
      try {
        const tx = await wallet.transfer({
          amountSats: Number(SMALL_SWAP_AMOUNT),
          receiverSparkAddress: lpSpark,
        });

        const nonce = generateNonce();
        const intent = generatePoolSwapIntentMessage({
          userPublicKey: userPub,
          lpIdentityPublicKey: poolId,
          assetInSparkTransferId: tx.id,
          assetInAddress: BTC_ASSET_PUBKEY,
          assetOutAddress: tokenIdentifierHex,
          amountIn: SMALL_SWAP_AMOUNT.toString(),
          maxSlippageBps: MAX_SLIPPAGE_BPS,
          minAmountOut: MIN_OUT,
          totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
          nonce,
        });

        const hash = sha256(intent);
        const sig = await (
          wallet as any
        ).config.signer.signMessageWithIdentityKey(hash, true);

        const resp = await typed.executeSwap({
          userPublicKey: userPub,
          poolId,
          assetInAddress: BTC_ASSET_PUBKEY,
          assetOutAddress: tokenIdentifierHex,
          amountIn: SMALL_SWAP_AMOUNT.toString(),
          maxSlippageBps: MAX_SLIPPAGE_BPS,
          minAmountOut: MIN_OUT,
          assetInSparkTransferId: tx.id,
          nonce,
          totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
          integratorPublicKey: userPub,
          signature: Buffer.from(sig).toString("hex"),
        });

        if (resp.accepted) {
          successCount++;
          if ((i + 1) % 10 === 0)
            log(`BTC->Token swap ${i + 1}/${SWAP_COUNT}`, resp.amountOut);
        }
      } catch (e) {
        log(`Swap ${i + 1} failed`, e instanceof Error ? e.message : String(e));
      }
    }
    log(`BTC->Token swaps completed`, `${successCount}/${SWAP_COUNT}`);
    if (successCount < SWAP_COUNT / 2)
      throw new Error(`Too many failures: ${successCount}/${SWAP_COUNT}`);
  });

  await runTest(`Execute ${SWAP_COUNT} swaps: Token -> BTC`, async () => {
    const lpSpark = encodeSparkAddressNew({
      identityPublicKey: poolId,
      network: SPARK_NETWORK as "REGTEST" | "MAINNET",
    });

    let successCount = 0;
    for (let i = 0; i < SWAP_COUNT; i++) {
      try {
        const txId = await wallet.transferTokens({
          tokenIdentifier: tokenAddress as any,
          tokenAmount: SMALL_SWAP_AMOUNT * 10n,
          receiverSparkAddress: lpSpark,
        });

        const nonce = generateNonce();
        const intent = generatePoolSwapIntentMessage({
          userPublicKey: userPub,
          lpIdentityPublicKey: poolId,
          assetInSparkTransferId: txId,
          assetInAddress: tokenIdentifierHex,
          assetOutAddress: BTC_ASSET_PUBKEY,
          amountIn: (SMALL_SWAP_AMOUNT * 10n).toString(),
          maxSlippageBps: MAX_SLIPPAGE_BPS,
          minAmountOut: MIN_OUT,
          totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
          nonce,
        });

        const hash = sha256(intent);
        const sig = await (
          wallet as any
        ).config.signer.signMessageWithIdentityKey(hash, true);

        const resp = await typed.executeSwap({
          userPublicKey: userPub,
          poolId,
          assetInAddress: tokenIdentifierHex,
          assetOutAddress: BTC_ASSET_PUBKEY,
          amountIn: (SMALL_SWAP_AMOUNT * 10n).toString(),
          maxSlippageBps: MAX_SLIPPAGE_BPS,
          minAmountOut: MIN_OUT,
          assetInSparkTransferId: txId,
          nonce,
          totalIntegratorFeeRateBps: INTEGRATOR_FEE_BPS.toString(),
          integratorPublicKey: userPub,
          signature: Buffer.from(sig).toString("hex"),
        });

        if (resp.accepted) {
          successCount++;
          if ((i + 1) % 10 === 0)
            log(`Token->BTC swap ${i + 1}/${SWAP_COUNT}`, resp.amountOut);
        }
      } catch (e) {
        log(`Swap ${i + 1} failed`, e instanceof Error ? e.message : String(e));
      }
    }
    log(`Token->BTC swaps completed`, `${successCount}/${SWAP_COUNT}`);
    if (successCount < SWAP_COUNT / 2)
      throw new Error(`Too many failures: ${successCount}/${SWAP_COUNT}`);
  });

  await runTest("Get pool details", async () => {
    const pool = await typed.getPool(poolId);
    log("Pool state", {
      assetAReserve: pool.assetAReserve,
      assetBReserve: pool.assetBReserve,
      bondingProgress: pool.bondingProgressPercent,
    });
  });

  // Clawback test: transfer tokens to LP and claw them back
  const CLAWBACK_AMOUNT = 100n;

  await runTest("Transfer tokens to LP (for clawback test)", async () => {
    const lpSpark = encodeSparkAddressNew({
      identityPublicKey: poolId,
      network: SPARK_NETWORK as "REGTEST" | "MAINNET",
    });

    const balance = await wallet.getBalance();
    let tokenBal = 0n;
    for (const [, t] of balance.tokenBalances.entries()) {
      const hex = Buffer.from(t.tokenMetadata.rawTokenIdentifier).toString(
        "hex"
      );
      if (hex === tokenIdentifierHex) {
        tokenBal = t.balance;
        break;
      }
    }

    if (tokenBal < CLAWBACK_AMOUNT) {
      throw new Error(
        `Insufficient token balance for clawback test: ${tokenBal}`
      );
    }

    const transferId = await wallet.transferTokens({
      tokenIdentifier: tokenAddress as any,
      tokenAmount: CLAWBACK_AMOUNT,
      receiverSparkAddress: lpSpark,
    });

    log("Transfer ID for clawback", transferId);

    // Store for next test
    (globalThis as any).__clawbackTransferId = transferId;
  });

  await runTest("Clawback transferred tokens", async () => {
    const transferId = (globalThis as any).__clawbackTransferId;
    if (!transferId) throw new Error("No transfer ID from previous step");

    // Small delay for transfer to be visible
    await new Promise((r) => setTimeout(r, 2000));

    // Check eligibility
    const eligibility = await fnClient.checkClawbackEligibility({
      sparkTransferId: transferId,
    });
    log("Clawback eligibility", eligibility);

    // Perform clawback
    const clawbackResp = await fnClient.clawback({
      sparkTransferId: transferId,
      lpIdentityPublicKey: poolId,
    });

    log("Clawback response", clawbackResp);

    if (!clawbackResp.accepted) {
      throw new Error(clawbackResp.error || "Clawback rejected");
    }
  });

  section("Results");

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) passed++;
    else failed++;
  }

  console.log(
    `\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`
  );

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results) {
      if (!r.passed) {
        console.log(`  - ${r.name}: ${r.error}`);
      }
    }
    process.exit(1);
  }

  console.log("\nE2E test completed successfully");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

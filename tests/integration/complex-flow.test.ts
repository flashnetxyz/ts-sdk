import { describe, test, expect } from "bun:test";
import { FlashnetClient } from '../../src/client/FlashnetClient';
import { BTC_ASSET_PUBKEY } from '../../src/config';
import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';
import { getFundedUserWalletsInfo, getFundedWalletInfo } from './wallet-server-handlers';
import { DEFAULT_PARAMS, NETWORK, CLIENT_CONFIG, INFINITE_TIMEOUT } from './config';
import { generateRandomHostNamespace, testLogging } from './utils';
import { type AddLiquidityResponse, type RemoveLiquidityResponse, type SwapResponse } from '../../src/types';

const flowName = "Complex Flows";
const multipleUsersTestName = "Multiple Users";

describe(flowName, () => {
  test(multipleUsersTestName, async () => {
    const stepStartTime = Date.now();

    // ===== Setup =====
    const startUserTokenBalance = 10000;
    const startUserSatsBalance = 500;
    const startPoolOwnerSatsBalance = 1000;
    const startPoolOwnerTokenBalance = 100000;
    const numberOfUsers = 10;

    const { mnemonic: poolOwnerMnemonic } = await getFundedWalletInfo(startPoolOwnerSatsBalance, startPoolOwnerTokenBalance);

    // Initialize pool owner wallet
    const { wallet: poolOwnerWallet } = await IssuerSparkWallet.initialize({
      mnemonicOrSeed: poolOwnerMnemonic,
      options: { network: NETWORK },
    });

    const poolOwnerClient = new FlashnetClient(poolOwnerWallet, CLIENT_CONFIG);

    // Register pool owner as host
    const hostNamespace = generateRandomHostNamespace();
    await poolOwnerClient.registerHost({
      namespace: hostNamespace,
      minFeeBps: DEFAULT_PARAMS.host_pool.min_fee_bps,
    });

    // Get funded user wallets
    const { mnemonics, tokenIdentifier } = await getFundedUserWalletsInfo(
      numberOfUsers,
      startUserSatsBalance,
      startUserTokenBalance
    );

    const userWallets = [];
    const userClients = [];

    for (const mnemonic of mnemonics) {
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });
      userWallets.push(wallet);
      userClients.push(new FlashnetClient(wallet, CLIENT_CONFIG));
    }

    testLogging(`Setup completed in: ${Date.now() - stepStartTime}ms`, [flowName, multipleUsersTestName]);

    // ===== Create AMM pool =====
    const poolCreationStartTime = Date.now();
    
    const assetAInitialReserve = 10000;
    const graduationThresholdPct = 1;
    const targetBRaisedAtGraduation = 100;
    const lpFeeRateBps = 1000;
    const totalHostFeeRateBps = 1000;

    const poolResponse = await poolOwnerClient.createSingleSidedPool({
      assetAAddress: tokenIdentifier,
      assetBAddress: BTC_ASSET_PUBKEY,
      assetAInitialReserve: assetAInitialReserve.toString(),
      assetAPctSoldAtGraduation: graduationThresholdPct,
      targetBRaisedAtGraduation: targetBRaisedAtGraduation.toString(),
      lpFeeRateBps: lpFeeRateBps,
      totalHostFeeRateBps: totalHostFeeRateBps,
      hostNamespace: hostNamespace,
    });

    console.log(`AMM pool creation completed in: ${Date.now() - poolCreationStartTime}ms`);

    // Get pool details and verify it exists
    const pool = await poolOwnerClient.getPool(poolResponse.poolId);
    expect(pool.status).toBe("ACTIVE");

    const transferAmount = 100;

    // ===== Concurrent Swaps =====
    const swapLoopStartTime = Date.now();
    
    const swapPromises = userClients.map((client, userIndex) => {
      return new Promise<{ userIndex: number, swapResponse: SwapResponse, success: boolean }>(async (resolve, reject) => {
        try {
          // Execute swap (FlashnetClient handles transfers automatically)
          const swapResponse = await client.executeSwap({
            poolId: poolResponse.poolId,
            assetInAddress: BTC_ASSET_PUBKEY,
            assetOutAddress: tokenIdentifier,
            amountIn: transferAmount.toString(),
            maxSlippageBps: DEFAULT_PARAMS.max_slippage_bps,
            minAmountOut: "0",
          });

          expect(swapResponse.accepted).toBe(true);

          resolve({ userIndex, swapResponse, success: true });
        } catch (error) {
          reject({ userIndex, error, success: false });
        }
      });
    });

    const swapResults = await Promise.all(swapPromises);
    for (const result of swapResults) {
      expect(result.success).toBe(true);

      const walletBalance = await userClients[result.userIndex]!.getBalance();
      const tokenBalance = walletBalance.tokenBalances.get(tokenIdentifier)!.balance;

      const expectedTokenBalance = BigInt(startUserTokenBalance) + BigInt(result.swapResponse.amountOut || "0");

      if (tokenBalance !== expectedTokenBalance) {
        testLogging(`User ${result.userIndex} token balance: ${tokenBalance}, expected: ${expectedTokenBalance}`, [flowName, multipleUsersTestName]);
      }
      // expect(tokenBalance).toBe(expectedTokenBalance);
    }

    testLogging(`Concurrent swap loop (${numberOfUsers} iterations) completed in: ${Date.now() - swapLoopStartTime}ms`, [flowName, multipleUsersTestName]);

    // Wait for asynchronous operations to complete
    testLogging("Waiting 180 seconds for asynchronous operations to complete...", [flowName, multipleUsersTestName]);
    await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes

    // ===== Add Liquidity =====
    const addLiquidityStartTime = Date.now();

    // Get current pool state
    const poolState = await poolOwnerClient.getPool(poolResponse.poolId);
    const reserveA = BigInt(poolState.assetAReserve || "0");
    const reserveB = BigInt(poolState.assetBReserve || "0");

    const addLiquidityTokenAmount = Number(reserveA) / 5;
    const addLiquiditySatsAmount = addLiquidityTokenAmount * Number(reserveB) / Number(reserveA);

    const addLiquidityRefundSatsAmount = new Map<number, bigint>();
    const addLiquidityRefundTokenAmount = new Map<number, bigint>();

    const addLiquidityLpTokens = new Map<number, number>();

    const startLiquidityBalances: number[] = [];

    const addLiquidityPromises = userClients.map((client, userIndex) => {
      return new Promise<{ userIndex: number, addLiquidityResponse: AddLiquidityResponse, success: boolean }>(async (resolve, reject) => {
        try {
          const balance = await client.getBalance();
          const tokenBalance = balance.tokenBalances.get(tokenIdentifier);
          startLiquidityBalances[userIndex] = Number(tokenBalance?.balance || 0);

          // Add liquidity (FlashnetClient handles transfers automatically)
          const addLiquidityResponse = await client.addLiquidity({
            poolId: poolResponse.poolId,
            assetAAmount: addLiquidityTokenAmount.toString(),
            assetBAmount: addLiquiditySatsAmount.toString(),
          });

          expect(addLiquidityResponse.accepted).toBe(true);

          addLiquidityRefundSatsAmount.set(userIndex, BigInt(addLiquidityResponse.refund?.assetBAmount || "0"));
          addLiquidityRefundTokenAmount.set(userIndex, BigInt(addLiquidityResponse.refund?.assetAAmount || "0"));

          addLiquidityLpTokens.set(userIndex, Number(addLiquidityResponse.lpTokensMinted || "0"));

          resolve({ userIndex, addLiquidityResponse, success: true });
        } catch (error) {
          reject({ userIndex, error, success: false });
        }
      });
    });

    const addLiquidityResults = await Promise.all(addLiquidityPromises);
    for (const result of addLiquidityResults) {
      expect(result.success).toBe(true);
    }

    testLogging(`Add liquidity operations completed in: ${Date.now() - addLiquidityStartTime}ms`, [flowName, multipleUsersTestName]);

    // Wait for asynchronous operations to complete
    testLogging("Waiting 180 seconds for asynchronous operations to complete...", [flowName, multipleUsersTestName]);
    await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes

    // ===== Token to BTC Swaps =====
    const tokenSwapStartTime = Date.now();
    const tokensPerSwap = 100;

    const tokenSwapPromises = userClients.map(async (client, userIndex) => {
      return new Promise<{ userIndex: number, swapResponse: SwapResponse, success: boolean }>(async (resolve, reject) => {
        try {
          // Execute swap (FlashnetClient handles transfers automatically)
          const swapResponse = await client.executeSwap({
            poolId: poolResponse.poolId,
            assetInAddress: tokenIdentifier,
            assetOutAddress: BTC_ASSET_PUBKEY,
            amountIn: tokensPerSwap.toString(),
            maxSlippageBps: DEFAULT_PARAMS.max_slippage_bps,
            minAmountOut: "0",
          });

          expect(swapResponse.accepted).toBe(true);

          resolve({ userIndex, swapResponse, success: true });
        } catch (error) {
          reject({ userIndex, error, success: false });
        }
      });
    });

    const tokenSwapResults = await Promise.all(tokenSwapPromises);

    // Wait for asynchronous operations to complete
    await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes

    // Verify token swap results
    for (const result of tokenSwapResults) {
      expect(result.success).toBe(true);

      const walletBalance = await userClients[result.userIndex]!.getBalance();
      const satsBalance = walletBalance.balance;

      const expectedSatsBalance = BigInt(startUserSatsBalance) - 
        BigInt(transferAmount) - BigInt(addLiquiditySatsAmount) + BigInt(result.swapResponse.amountOut || "0") 
        + addLiquidityRefundSatsAmount.get(result.userIndex)!;

      if (satsBalance !== expectedSatsBalance) {
        testLogging(`User ${result.userIndex} sats balance: ${satsBalance}, expected: ${expectedSatsBalance}`, [flowName, multipleUsersTestName]);
      }
      // expect(satsBalance).toBe(expectedSatsBalance);
    }

    testLogging(`Token to BTC swap operations completed in: ${Date.now() - tokenSwapStartTime}ms`, [flowName, multipleUsersTestName]);

    // ===== Remove Liquidity =====
    const removeLiquidityStartTime = Date.now();

    const removeLiquidityPromises = userClients.map(async (client, userIndex) => {
      return new Promise<{ userIndex: number, removeLiquidityResponse: RemoveLiquidityResponse, startTokenBalance: number, success: boolean }>(async (resolve, reject) => {
        try {
          const balance = await client.getBalance();
          const startTokenBalance = Number(balance.tokenBalances.get(tokenIdentifier)?.balance || 0);
          const userLpTokens = addLiquidityLpTokens.get(userIndex) || 0;

          const removeLiquidityResponse = await client.removeLiquidity({
            poolId: poolResponse.poolId,
            lpTokensToRemove: userLpTokens.toString(),
          });

          expect(removeLiquidityResponse.accepted).toBe(true);

          resolve({ userIndex, removeLiquidityResponse, startTokenBalance, success: true });
        } catch (error) {
          reject({ userIndex, error, success: false });
        }
      });
    });

    const removeLiquidityResults = await Promise.all(removeLiquidityPromises);
    for (const result of removeLiquidityResults) {
      expect(result.success).toBe(true);
    }

    testLogging(`Remove liquidity operations completed in: ${Date.now() - removeLiquidityStartTime}ms`, [flowName, multipleUsersTestName]);

    testLogging(`Total test completed in: ${Date.now() - stepStartTime}ms`, [flowName, multipleUsersTestName]);
  }, INFINITE_TIMEOUT);
});
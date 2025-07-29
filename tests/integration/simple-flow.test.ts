import { describe, test, expect } from "bun:test";
import { FlashnetClient } from '../../src/client/FlashnetClient';
import { BTC_ASSET_PUBKEY } from '../../src/config';
import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';
import { getFundedWalletInfo } from './wallet-server-handlers';
import { DEFAULT_PARAMS, NETWORK, CLIENT_CONFIG, TEST_TIMEOUT } from './config';
import { generateRandomHostNamespace } from './utils';

describe('Simple Flows', () => {
  describe('User Pool Creation', () => {
    test('should create a user pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(10, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet, CLIENT_CONFIG);

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: "10000",
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).toBe("ACTIVE");
    }, TEST_TIMEOUT);
  });

  describe('Host Pool Creation', () => {
    test('should create a host pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(10, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet, CLIENT_CONFIG);

      // Get host namespace (assuming the wallet has been registered as a host)
      const hostNamespace = generateRandomHostNamespace();

      await client.registerHost({
        namespace: hostNamespace,
        minFeeBps: 10,
      });

      // Create pool using host pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: "10000",
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.host_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.host_pool.total_host_fee_bps,
        hostNamespace: hostNamespace,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).toBe("ACTIVE");
    }, TEST_TIMEOUT);
  });

  describe('Swap on Pool', () => {
    test('should execute a swap on a pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(250, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet, CLIENT_CONFIG);

      // Register as host
      const hostNamespace = generateRandomHostNamespace();
      await client.registerHost({
        namespace: hostNamespace,
        minFeeBps: DEFAULT_PARAMS.host_pool.min_fee_bps,
      });

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: "10000",
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
        hostNamespace: hostNamespace,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).toBe("ACTIVE");

      // Calculate swap parameters
      const satoshiIn = DEFAULT_PARAMS.graduation_threshold_pct * 2;
      const maxSlippageBps = DEFAULT_PARAMS.max_slippage_bps;

      // Execute swap
      const swapResponse = await client.executeSwap({
        poolId: poolResponse.poolId,
        assetInAddress: BTC_ASSET_PUBKEY,
        assetOutAddress: tokenIdentifier,
        amountIn: satoshiIn.toString(),
        maxSlippageBps: maxSlippageBps,
        minAmountOut: "1", // Minimum amount out
      });

      // Verify swap was accepted
      expect(swapResponse.accepted).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Add Liquidity', () => {
    test('should add liquidity to a pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(500, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet, CLIENT_CONFIG);

      // Register as host
      const hostNamespace = generateRandomHostNamespace();
      await client.registerHost({
        namespace: hostNamespace,
        minFeeBps: 10,
      });

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: "10000",
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
        hostNamespace: hostNamespace,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).toBe("ACTIVE");

      // Calculate swap parameters
      const satoshiIn = DEFAULT_PARAMS.graduation_threshold_pct * 2;
      const maxSlippageBps = DEFAULT_PARAMS.max_slippage_bps;

      // Execute swap to create some liquidity in the pool
      const swapResponse = await client.executeSwap({
        poolId: poolResponse.poolId,
        assetInAddress: BTC_ASSET_PUBKEY,
        assetOutAddress: tokenIdentifier,
        amountIn: satoshiIn.toString(),
        maxSlippageBps: maxSlippageBps,
        minAmountOut: "1", // Minimum amount out
      });

      // Verify swap was accepted
      expect(swapResponse.accepted).toBe(true);

      // Add liquidity to the pool
      const assetAAmount = 100;
      const assetBAmount = 100;

      const addLiquidityResponse = await client.addLiquidity({
        poolId: poolResponse.poolId,
        assetAAmount: assetAAmount.toString(),
        assetBAmount: assetBAmount.toString(),
      });

      // Verify liquidity was added successfully
      expect(addLiquidityResponse.accepted).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Remove Liquidity', () => {
    test('should remove liquidity from a pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(500, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet, CLIENT_CONFIG);

      // Register as host
      const hostNamespace = generateRandomHostNamespace();
      await client.registerHost({
        namespace: hostNamespace,
        minFeeBps: 10,
      });

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: "10000",
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
        hostNamespace: hostNamespace,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).toBe("ACTIVE");

      // Calculate swap parameters
      const satoshiIn = DEFAULT_PARAMS.graduation_threshold_pct * 2;
      const maxSlippageBps = DEFAULT_PARAMS.max_slippage_bps;

      // Execute swap to create some liquidity in the pool
      await client.executeSwap({
        poolId: poolResponse.poolId,
        assetInAddress: BTC_ASSET_PUBKEY,
        assetOutAddress: tokenIdentifier,
        amountIn: satoshiIn.toString(),
        maxSlippageBps: maxSlippageBps,
        minAmountOut: "1", // Minimum amount out
      });

      // Add liquidity to the pool
      const assetAAmount = 200;
      const assetBAmount = 200;

      const addLiquidityResponse = await client.addLiquidity({
        poolId: poolResponse.poolId,
        assetAAmount: assetAAmount.toString(),
        assetBAmount: assetBAmount.toString(),
      });

      // Verify liquidity was added successfully
      expect(addLiquidityResponse.accepted).toBe(true);

      // Remove liquidity using the LP tokens that were minted
      const removeLiquidityResponse = await client.removeLiquidity({
        poolId: poolResponse.poolId,
        lpTokensToRemove: addLiquidityResponse.lpTokensMinted || "0",
      });

      // Verify liquidity was removed successfully
      expect(removeLiquidityResponse.accepted).toBe(true);
    }, TEST_TIMEOUT);
  });
}); 
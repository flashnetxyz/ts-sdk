import { expect } from 'chai';
import { FlashnetClient } from '../../src/client/FlashnetClient';
import { BTC_ASSET_PUBKEY } from '../../src/config';
import { IssuerSparkWallet } from '@buildonspark/issuer-sdk';
import { getFundedWalletInfo } from './wallet-server-handlers';
import { DEFAULT_PARAMS, NETWORK } from './config';

describe('Pool Creation Tests', () => {
  describe('User Pool Creation', () => {
    it('should create a user pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(100, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet);

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: DEFAULT_PARAMS.user_pool.asset_a_initial_reserve.toString(),
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.user_pool.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.user_pool.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).equal("accepted");
    });
  });

  describe('Host Pool Creation', () => {
    it('should create a host pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(100, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet);

      // Get host namespace (assuming the wallet has been registered as a host)
      const hostNamespace = 'test-host-namespace'; // You might need to register this first

      // Create pool using host pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: DEFAULT_PARAMS.host_pool.asset_a_initial_reserve.toString(),
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.host_pool.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.host_pool.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.host_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.host_pool.total_host_fee_bps,
        hostNamespace: hostNamespace,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).equal("accepted");
    });
  });

  describe('Swap on Pool', () => {
    it('should execute a swap on a pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(100, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet);

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: DEFAULT_PARAMS.user_pool.asset_a_initial_reserve.toString(),
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.user_pool.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.user_pool.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).to.equal("accepted");

      // Calculate swap parameters
      const satoshiIn = DEFAULT_PARAMS.user_pool.graduation_threshold_pct * 2;
      const maxSlippageBps = 10000;

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
      expect(swapResponse.accepted).to.be.true;
    });
  });

  describe('Add Liquidity', () => {
    it('should add liquidity to a pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(100, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet);

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: DEFAULT_PARAMS.user_pool.asset_a_initial_reserve.toString(),
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.user_pool.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.user_pool.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).to.equal("accepted");

      // Calculate swap parameters
      const satoshiIn = DEFAULT_PARAMS.user_pool.graduation_threshold_pct * 2;
      const maxSlippageBps = 10000;

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
      expect(swapResponse.accepted).to.be.true;

      // Add liquidity to the pool
      const assetAAmount = 100;
      const assetBAmount = 100;

      const addLiquidityResponse = await client.addLiquidity({
        poolId: poolResponse.poolId,
        assetAAmount: assetAAmount.toString(),
        assetBAmount: assetBAmount.toString(),
      });

      // Verify liquidity was added successfully
      expect(addLiquidityResponse.accepted).to.be.true;
    });
  });

  describe('Remove Liquidity', () => {
    it('should remove liquidity from a pool successfully', async () => {
      // Generate funded wallet
      const { mnemonic, tokenIdentifier } = await getFundedWalletInfo(100, 10000);
      
      // Initialize wallet
      const { wallet } = await IssuerSparkWallet.initialize({
        mnemonicOrSeed: mnemonic,
        options: { network: NETWORK },
      });

      // Create SDK client
      const client = new FlashnetClient(wallet);

      // Create pool using user pool parameters
      const poolResponse = await client.createSingleSidedPool({
        assetAAddress: tokenIdentifier,
        assetBAddress: BTC_ASSET_PUBKEY,
        assetAInitialReserve: DEFAULT_PARAMS.user_pool.asset_a_initial_reserve.toString(),
        assetAPctSoldAtGraduation: DEFAULT_PARAMS.user_pool.graduation_threshold_pct,
        targetBRaisedAtGraduation: DEFAULT_PARAMS.user_pool.target_b_raised_at_graduation.toString(),
        lpFeeRateBps: DEFAULT_PARAMS.user_pool.lp_fee_bps,
        totalHostFeeRateBps: DEFAULT_PARAMS.user_pool.total_host_fee_bps,
      });

      // Get pool details and verify it exists
      const pool = await client.getPool(poolResponse.poolId);
      expect(pool.status).to.equal("accepted");

      // Calculate swap parameters
      const satoshiIn = DEFAULT_PARAMS.user_pool.graduation_threshold_pct * 2;
      const maxSlippageBps = 10000;

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
      expect(addLiquidityResponse.accepted).to.be.true;

      // Remove liquidity using the LP tokens that were minted
      const removeLiquidityResponse = await client.removeLiquidity({
        poolId: poolResponse.poolId,
        lpTokensToRemove: addLiquidityResponse.lpTokensMinted || "0",
      });

      // Verify liquidity was removed successfully
      expect(removeLiquidityResponse.accepted).to.be.true;
    });
  });
}); 
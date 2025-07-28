import type { FlashnetClientCustomConfig } from "../../src/types/index"

// Default pool parameters matching the Rust tests
export const DEFAULT_PARAMS = {
  user_pool: {
    asset_a_initial_reserve: 10000,
    lp_fee_bps: 500,
    total_host_fee_bps: 200,
    graduation_threshold_pct: 100,
    target_b_raised_at_graduation: 10000,
  },
  host_pool: {
    asset_a_initial_reserve: 10000,
    lp_fee_bps: 100,
    total_host_fee_bps: 50,
    graduation_threshold_pct: 100,
    target_b_raised_at_graduation: 10000,
  },
};

export const NETWORK = 'REGTEST';

export const CLIENT_CONFIG: FlashnetClientCustomConfig = {
  sparkNetworkType: "REGTEST",
  clientNetworkConfig: {
    ammGatewayUrl: "http://localhost:8090",
    mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
    explorerUrl: "https://mempool.regtest.flashnet.xyz",
  },
};
import type { FlashnetClientCustomConfig } from "../../src/types/index"

// Default pool parameters matching the Rust tests
export const DEFAULT_PARAMS = {
  user_pool: {
    lp_fee_bps: 500,
    total_host_fee_bps: 200,
  },
  host_pool: {
    lp_fee_bps: 100,
    total_host_fee_bps: 50,
    min_fee_bps: 10,
  },
  graduation_threshold_pct: 1,
  target_b_raised_at_graduation: 100,
  max_slippage_bps: 10000,
};

export const NETWORK = 'REGTEST';

export const CLIENT_CONFIG: FlashnetClientCustomConfig = {
  sparkNetworkType: NETWORK,
  clientNetworkConfig: {
    ammGatewayUrl: "http://localhost:8090",
    mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
    explorerUrl: "https://mempool.regtest.flashnet.xyz",
  },
};

export const TEST_TIMEOUT = 300000;
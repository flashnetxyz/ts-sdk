import type { NetworkType } from "../types";

export interface NetworkConfig {
  ammGatewayUrl: string;
  mempoolApiUrl: string;
  explorerUrl: string;
  sparkScanUrl?: string;
}

export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  MAINNET: {
    ammGatewayUrl: "https://api.amm.flashnet.xyz",
    mempoolApiUrl: "https://mempool.space",
    explorerUrl: "https://mempool.space",
    sparkScanUrl: "https://api.sparkscan.io",
  },
  REGTEST: {
    ammGatewayUrl: "http://localhost:8090",
    mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
    explorerUrl: "https://mempool.regtest.flashnet.xyz",
    sparkScanUrl: "https://api.sparkscan.io",
  },
  TESTNET: {
    ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
    mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
    explorerUrl: "https://mempool.regtest.flashnet.xyz",
    sparkScanUrl: "https://api.sparkscan.io",
  },
  SIGNET: {
    ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
    mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
    explorerUrl: "https://mempool.regtest.flashnet.xyz",
    sparkScanUrl: "https://api.sparkscan.io",
  },
  LOCAL: {
    ammGatewayUrl: "http://localhost:8083",
    mempoolApiUrl: "http://localhost:8083",
    explorerUrl: "http://localhost:8083",
    sparkScanUrl: "https://api.sparkscan.io",
  },
};

export const BTC_ASSET_PUBKEY =
  "020202020202020202020202020202020202020202020202020202020202020202";
export const BTC_DECIMALS = 8;
export const DEFAULT_SLIPPAGE_BPS = 500; // 5%
export const DEFAULT_HOST_NAMESPACE = "flashnet_pools";

export function getNetworkConfig(network: NetworkType): NetworkConfig {
  return NETWORK_CONFIGS[network];
}

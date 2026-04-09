/**
 * Shared viem PublicClient factory with Multicall3 support.
 */

import {
  createPublicClient,
  defineChain,
  http,
  type PublicClient,
} from "viem";

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const clientCache = new Map<string, PublicClient>();

export function getClient(rpcUrl: string): PublicClient {
  let client = clientCache.get(rpcUrl);
  if (!client) {
    const chain = defineChain({
      id: 0,
      name: "flashnet",
      nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
      contracts: {
        multicall3: { address: MULTICALL3_ADDRESS },
      },
    });
    client = createPublicClient({ chain, transport: http(rpcUrl) });
    clientCache.set(rpcUrl, client);
  }
  return client;
}

/**
 * Shared viem PublicClient factory with Multicall3 support.
 *
 * The gateway's public RPC is read-only and constrained (see ./gateway-rpc-policy):
 * stateful `eth_*Filter` methods are rejected and JSON-RPC batches are capped.
 * This transport intentionally relies on Multicall3 to aggregate reads into a
 * single `eth_call` and does NOT enable viem's `http({ batch })` array batching
 * or filter-based event watching, so it stays within that contract. Read logs
 * with `eth_getLogs` range queries rather than server-side filters.
 */

import { createPublicClient, defineChain, http, type PublicClient } from "viem";

const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

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

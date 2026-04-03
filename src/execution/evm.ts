/**
 * EVM Read Helpers
 *
 * Token metadata, balance, allowance, and nonce queries using viem.
 *
 * @example
 * ```typescript
 * import { fetchTokenInfo, fetchTokenBalance } from "@flashnet/sdk/execution";
 *
 * const info = await fetchTokenInfo("http://localhost:8545", "0x...");
 * const balance = await fetchTokenBalance("http://localhost:8545", "0x...", myAddress);
 * ```
 */

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type Transport,
  type Chain,
} from "viem";
import { erc20Abi } from "./abis/erc20";

// Types

/** ERC-20 token metadata. */
export interface TokenInfo {
  /** Token contract address (0x-prefixed, checksummed or lowercase). */
  address: string;
  /** Token symbol (e.g. "USDB"). */
  symbol: string;
  /** Human-readable token name (e.g. "Bridged USD"). */
  name: string;
  /** Number of decimal places (e.g. 18). */
  decimals: number;
}

// Client cache

const clientCache = new Map<string, PublicClient<Transport, Chain | undefined>>();

function getClient(rpcUrl: string): PublicClient<Transport, Chain | undefined> {
  let client = clientCache.get(rpcUrl);
  if (!client) {
    client = createPublicClient({ transport: http(rpcUrl) });
    clientCache.set(rpcUrl, client);
  }
  return client;
}

// Public API

/**
 * Fetch ERC-20 token metadata (symbol, name, decimals) in a single multicall.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param tokenAddress - Token contract address (0x-prefixed)
 * @returns Token metadata
 */
export async function fetchTokenInfo(
  rpcUrl: string,
  tokenAddress: string
): Promise<TokenInfo> {
  const client = getClient(rpcUrl);
  const addr = tokenAddress as Address;

  const results = await client.multicall({
    contracts: [
      { address: addr, abi: erc20Abi, functionName: "symbol" },
      { address: addr, abi: erc20Abi, functionName: "name" },
      { address: addr, abi: erc20Abi, functionName: "decimals" },
    ],
  });

  return {
    address: tokenAddress,
    symbol: results[0].status === "success" ? results[0].result : "",
    name: results[1].status === "success" ? results[1].result : "",
    decimals: results[2].status === "success" ? results[2].result : 0,
  };
}

/**
 * Fetch ERC-20 token balance for an account.
 */
export async function fetchTokenBalance(
  rpcUrl: string,
  tokenAddress: string,
  account: string
): Promise<bigint> {
  const client = getClient(rpcUrl);
  return client.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account as Address],
  });
}

/**
 * Fetch native balance (BTC/ETH) for an account.
 */
export async function fetchNativeBalance(
  rpcUrl: string,
  account: string
): Promise<bigint> {
  const client = getClient(rpcUrl);
  return client.getBalance({ address: account as Address });
}

/**
 * Fetch ERC-20 allowance (how much `spender` can transfer from `owner`).
 */
export async function fetchAllowance(
  rpcUrl: string,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const client = getClient(rpcUrl);
  return client.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner as Address, spender as Address],
  });
}

/**
 * Fetch the current nonce (transaction count) for an account.
 */
export async function fetchNonce(
  rpcUrl: string,
  account: string
): Promise<number> {
  const client = getClient(rpcUrl);
  return client.getTransactionCount({ address: account as Address });
}

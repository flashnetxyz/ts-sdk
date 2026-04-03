/**
 * EVM Read Helpers
 *
 * Zero-dependency EVM read utilities using raw JSON-RPC calls via fetch().
 * Provides token metadata, balance, and allowance queries without requiring
 * viem, ethers, or any other EVM library.
 *
 * @example
 * ```typescript
 * import { fetchTokenInfo, fetchTokenBalance } from "@flashnet/sdk/execution";
 *
 * const info = await fetchTokenInfo("http://localhost:8545", "0x...");
 * const balance = await fetchTokenBalance("http://localhost:8545", "0x...", myAddress);
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ABI function selectors (4 bytes, 0x-prefixed)
// ---------------------------------------------------------------------------

/** keccak256("symbol()") */
const SEL_SYMBOL = "0x95d89b41";
/** keccak256("name()") */
const SEL_NAME = "0x06fdde03";
/** keccak256("decimals()") */
const SEL_DECIMALS = "0x313ce567";
/** keccak256("balanceOf(address)") */
const SEL_BALANCE_OF = "0x70a08231";
/** keccak256("allowance(address,address)") */
const SEL_ALLOWANCE = "0xdd62ed3e";

// ---------------------------------------------------------------------------
// Raw JSON-RPC helper
// ---------------------------------------------------------------------------

let rpcIdCounter = 1;

async function ethCall(
  rpcUrl: string,
  to: string,
  data: string
): Promise<string> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcIdCounter++,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });

  const json = (await resp.json()) as {
    result?: string;
    error?: { message: string };
  };
  if (json.error) {
    throw new Error(`eth_call failed: ${json.error.message}`);
  }
  return json.result ?? "0x";
}

async function ethGetBalance(
  rpcUrl: string,
  address: string
): Promise<string> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcIdCounter++,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
  });

  const json = (await resp.json()) as {
    result?: string;
    error?: { message: string };
  };
  if (json.error) {
    throw new Error(`eth_getBalance failed: ${json.error.message}`);
  }
  return json.result ?? "0x0";
}

async function ethGetTransactionCount(
  rpcUrl: string,
  address: string
): Promise<number> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcIdCounter++,
      method: "eth_getTransactionCount",
      params: [address, "latest"],
    }),
  });

  const json = (await resp.json()) as {
    result?: string;
    error?: { message: string };
  };
  if (json.error) {
    throw new Error(`eth_getTransactionCount failed: ${json.error.message}`);
  }
  return Number(json.result ?? "0x0");
}

// ---------------------------------------------------------------------------
// ABI decoding helpers
// ---------------------------------------------------------------------------

function padAddress(address: string): string {
  const clean = address.startsWith("0x") ? address.slice(2) : address;
  return clean.toLowerCase().padStart(64, "0");
}

function decodeString(hex: string): string {
  // ABI-encoded string: offset (32 bytes) + length (32 bytes) + data
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length < 128) return "";
  const length = Number("0x" + clean.substring(64, 128));
  const data = clean.substring(128, 128 + length * 2);
  let result = "";
  for (let i = 0; i < data.length; i += 2) {
    result += String.fromCharCode(Number.parseInt(data.substring(i, i + 2), 16));
  }
  return result;
}

function decodeUint(hex: string): bigint {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0) return 0n;
  return BigInt("0x" + (clean.replace(/^0+/, "") || "0"));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch ERC-20 token metadata (symbol, name, decimals).
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param tokenAddress - Token contract address (0x-prefixed)
 * @returns Token metadata
 */
export async function fetchTokenInfo(
  rpcUrl: string,
  tokenAddress: string
): Promise<TokenInfo> {
  const [symbolHex, nameHex, decimalsHex] = await Promise.all([
    ethCall(rpcUrl, tokenAddress, SEL_SYMBOL),
    ethCall(rpcUrl, tokenAddress, SEL_NAME),
    ethCall(rpcUrl, tokenAddress, SEL_DECIMALS),
  ]);

  return {
    address: tokenAddress,
    symbol: decodeString(symbolHex),
    name: decodeString(nameHex),
    decimals: Number(decodeUint(decimalsHex)),
  };
}

/**
 * Fetch ERC-20 token balance for an account.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param tokenAddress - Token contract address (0x-prefixed)
 * @param account - Account address to query (0x-prefixed)
 * @returns Balance in token base units
 */
export async function fetchTokenBalance(
  rpcUrl: string,
  tokenAddress: string,
  account: string
): Promise<bigint> {
  const data = SEL_BALANCE_OF + padAddress(account);
  const result = await ethCall(rpcUrl, tokenAddress, data);
  return decodeUint(result);
}

/**
 * Fetch native balance (BTC/ETH) for an account.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param account - Account address to query (0x-prefixed)
 * @returns Balance in wei
 */
export async function fetchNativeBalance(
  rpcUrl: string,
  account: string
): Promise<bigint> {
  const result = await ethGetBalance(rpcUrl, account);
  return BigInt(result);
}

/**
 * Fetch ERC-20 allowance (how much `spender` can transfer from `owner`).
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param tokenAddress - Token contract address (0x-prefixed)
 * @param owner - Token owner address (0x-prefixed)
 * @param spender - Approved spender address (0x-prefixed)
 * @returns Allowance in token base units
 */
export async function fetchAllowance(
  rpcUrl: string,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const data = SEL_ALLOWANCE + padAddress(owner) + padAddress(spender);
  const result = await ethCall(rpcUrl, tokenAddress, data);
  return decodeUint(result);
}

/**
 * Fetch the current nonce (transaction count) for an account.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param account - Account address to query (0x-prefixed)
 * @returns Current nonce
 */
export async function fetchNonce(
  rpcUrl: string,
  account: string
): Promise<number> {
  return ethGetTransactionCount(rpcUrl, account);
}

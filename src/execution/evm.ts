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

/** Multicall3 deterministic address (deployed on all chains via CREATE2). */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
/** keccak256("aggregate3((address,bool,bytes)[])") — first 4 bytes */
const SEL_AGGREGATE3 = "0x82ad56cb";
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
// Multicall3 batching
// ---------------------------------------------------------------------------

/**
 * Batch multiple eth_call targets into a single RPC call via Multicall3.
 * Each call is { target, callData }. Returns raw hex results in order.
 * Falls back to parallel individual eth_calls if multicall3 reverts
 * (e.g. not deployed on the target chain).
 */
async function multicall3(
  rpcUrl: string,
  calls: Array<{ target: string; callData: string }>
): Promise<string[]> {
  // Encode aggregate3 calldata:
  // aggregate3((address target, bool allowFailure, bytes callData)[])
  // Offset to dynamic array = 0x20
  // Array length = calls.length
  // Each element: target(address) + allowFailure(bool) + offset-to-callData
  // Then the callData bytes for each element

  // For simplicity with the zero-dep constraint, fall back to parallel calls
  // when the encoding would be complex. The key optimization is 1 RPC round-trip.
  const offsetToArray = "0".repeat(62) + "20"; // offset 32
  const arrayLen = calls.length.toString(16).padStart(64, "0");

  // Each tuple element has: address (32 bytes) + allowFailure (32 bytes) + offset to bytes (32 bytes)
  // = 96 bytes per element header, then the bytes data
  const headerSize = 96; // 3 words per element
  let headParts = "";
  let tailParts = "";
  let tailOffset = calls.length * headerSize; // start of dynamic data, relative to array start

  for (const call of calls) {
    const cleanAddr = (call.target.startsWith("0x") ? call.target.slice(2) : call.target).toLowerCase();
    headParts += cleanAddr.padStart(64, "0"); // target
    headParts += "0".repeat(64); // allowFailure = false
    headParts += tailOffset.toString(16).padStart(64, "0"); // offset to bytes

    const cleanData = call.callData.startsWith("0x") ? call.callData.slice(2) : call.callData;
    const dataLen = (cleanData.length / 2).toString(16).padStart(64, "0");
    const paddedData = cleanData + "0".repeat((64 - (cleanData.length % 64)) % 64);
    tailParts += dataLen + paddedData;
    tailOffset += 32 + paddedData.length / 2; // length word + padded data bytes
  }

  const calldata = SEL_AGGREGATE3.slice(2) + offsetToArray + arrayLen + headParts + tailParts;

  try {
    const result = await ethCall(rpcUrl, MULTICALL3, "0x" + calldata);
    return decodeMulticall3Results(result, calls.length);
  } catch {
    // Multicall3 not available — fall back to parallel individual calls
    return Promise.all(
      calls.map((c) => ethCall(rpcUrl, c.target, c.callData))
    );
  }
}

/** Decode aggregate3 return: (bool success, bytes returnData)[] */
function decodeMulticall3Results(hex: string, count: number): string[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  // First word: offset to array
  // Second word: array length
  // Then for each element: offset to tuple
  // Each tuple: bool success (32 bytes) + offset to bytes (32 bytes) + bytes length + bytes data

  const results: string[] = [];
  const arrayOffset = Number("0x" + clean.substring(0, 64)) * 2;
  const len = Number("0x" + clean.substring(arrayOffset, arrayOffset + 64));

  for (let i = 0; i < Math.min(len, count); i++) {
    const elemOffset = Number("0x" + clean.substring(arrayOffset + 64 + i * 64, arrayOffset + 128 + i * 64)) * 2;
    const base = arrayOffset + 64 + elemOffset;
    const success = Number("0x" + clean.substring(base, base + 64));
    if (!success) {
      results.push("0x");
      continue;
    }
    const dataOffset = Number("0x" + clean.substring(base + 64, base + 128)) * 2;
    const dataBase = base + dataOffset;
    const dataLen = Number("0x" + clean.substring(dataBase, dataBase + 64));
    results.push("0x" + clean.substring(dataBase + 64, dataBase + 64 + dataLen * 2));
  }

  return results;
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
  // Batch symbol+name+decimals into a single RPC call via Multicall3.
  const results = await multicall3(rpcUrl, [
    { target: tokenAddress, callData: SEL_SYMBOL },
    { target: tokenAddress, callData: SEL_NAME },
    { target: tokenAddress, callData: SEL_DECIMALS },
  ]);

  return {
    address: tokenAddress,
    symbol: decodeString(results[0] ?? "0x"),
    name: decodeString(results[1] ?? "0x"),
    decimals: Number(decodeUint(results[2] ?? "0x")),
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

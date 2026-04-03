/**
 * Spark Bridge SDK Helpers
 *
 * Zero-dependency calldata encoding for SparkBridge contract operations
 * (withdrawals, token resolution) and high-level withdraw functions.
 *
 * @example
 * ```typescript
 * import { encodeWithdrawSats, queryBridgedTokenAddress } from "@flashnet/sdk";
 *
 * const calldata = encodeWithdrawSats(sparkRecipientHex);
 * const tokenAddr = await queryBridgedTokenAddress(rpcUrl, bridgeAddress, sparkTokenIdHex);
 * ```
 */

import type { ExecutionClient } from "./client";
import type { Deposit, ExecuteResponse } from "./types";
import type { EvmTransactionSigner } from "./conductor";
import { fetchNonce } from "./evm";

// ---------------------------------------------------------------------------
// ABI selectors
// ---------------------------------------------------------------------------

// cast sig "withdrawSats(bytes)" → 0x3b97d7d7
const SEL_WITHDRAW_SATS = "3b97d7d7";
// cast sig "withdrawBtkn(address,uint256,bytes)" → 0x482c9eea
const SEL_WITHDRAW_BTKN = "482c9eea";
// cast sig "tokenBySparkId(bytes32)" → 0x0414ff43
const SEL_TOKEN_BY_SPARK_ID = "0414ff43";

// ---------------------------------------------------------------------------
// ABI encoding helpers (minimal, no dependencies)
// ---------------------------------------------------------------------------

function padAddress(addr: string): string {
  const clean = addr.startsWith("0x") ? addr.slice(2) : addr;
  return clean.toLowerCase().padStart(64, "0");
}

function padUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function padBytes32(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return clean.padStart(64, "0");
}

// ---------------------------------------------------------------------------
// Raw JSON-RPC helper
// ---------------------------------------------------------------------------

let rpcIdCounter = 10000;

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

// ---------------------------------------------------------------------------
// Calldata encoding
// ---------------------------------------------------------------------------

/**
 * Encode calldata for SparkBridge.withdrawSats(sparkRecipient).
 *
 * @param sparkRecipient - 33-byte compressed public key as hex (with or without 0x prefix)
 * @returns 0x-prefixed calldata hex
 */
export function encodeWithdrawSats(sparkRecipient: string): string {
  const clean = sparkRecipient.startsWith("0x")
    ? sparkRecipient.slice(2)
    : sparkRecipient;

  // ABI encode dynamic bytes: offset (32) + length (32) + padded data
  const offset = padUint256(32n); // offset to bytes data
  const dataLen = padUint256(BigInt(clean.length / 2)); // byte length
  const paddedData =
    clean + "0".repeat((64 - (clean.length % 64)) % 64);

  return "0x" + SEL_WITHDRAW_SATS + offset + dataLen + paddedData;
}

/**
 * Encode calldata for SparkBridge.withdrawBtkn(tokenAddress, amount, sparkRecipient).
 *
 * @param tokenAddress - ERC20 token contract address (0x-prefixed)
 * @param amount - Amount in token base units
 * @param sparkRecipient - 33-byte compressed public key as hex
 * @returns 0x-prefixed calldata hex
 */
export function encodeWithdrawToken(
  tokenAddress: string,
  amount: bigint,
  sparkRecipient: string
): string {
  const cleanRecipient = sparkRecipient.startsWith("0x")
    ? sparkRecipient.slice(2)
    : sparkRecipient;

  // address + uint256 are static; bytes is dynamic
  const addr = padAddress(tokenAddress);
  const amt = padUint256(amount);
  const bytesOffset = padUint256(96n); // offset to bytes (3 * 32 = 96)
  const dataLen = padUint256(BigInt(cleanRecipient.length / 2));
  const paddedData =
    cleanRecipient + "0".repeat((64 - (cleanRecipient.length % 64)) % 64);

  return (
    "0x" + SEL_WITHDRAW_BTKN + addr + amt + bytesOffset + dataLen + paddedData
  );
}

// ---------------------------------------------------------------------------
// Bridge queries
// ---------------------------------------------------------------------------

/**
 * Query the EVM token address for a bridged Spark token via SparkBridge.tokenBySparkId().
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param bridgeAddress - SparkBridge contract address
 * @param sparkTokenIdHex - 32-byte Spark token ID as hex
 * @returns EVM token address, or null if not yet bridged
 */
export async function queryBridgedTokenAddress(
  rpcUrl: string,
  bridgeAddress: string,
  sparkTokenIdHex: string
): Promise<string | null> {
  const calldata = "0x" + SEL_TOKEN_BY_SPARK_ID + padBytes32(sparkTokenIdHex);
  const result = await ethCall(rpcUrl, bridgeAddress, calldata);

  const clean = result.startsWith("0x") ? result.slice(2) : result;
  if (clean.length < 64 || clean === "0".repeat(64)) {
    return null;
  }

  const addr = "0x" + clean.slice(24, 64);
  if (addr === "0x" + "0".repeat(40)) {
    return null;
  }
  return addr;
}

/**
 * Poll for a bridged token address until it appears or timeout.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param bridgeAddress - SparkBridge contract address
 * @param sparkTokenIdHex - 32-byte Spark token ID as hex
 * @param timeoutMs - Maximum wait time (default 20s)
 * @param pollIntervalMs - Poll interval (default 500ms)
 * @returns EVM token address, or null if not found within timeout
 */
export async function waitForBridgedTokenAddress(
  rpcUrl: string,
  bridgeAddress: string,
  sparkTokenIdHex: string,
  timeoutMs: number = 20_000,
  pollIntervalMs: number = 500
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const addr = await queryBridgedTokenAddress(
      rpcUrl,
      bridgeAddress,
      sparkTokenIdHex
    );
    if (addr) return addr;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return null;
}

// ---------------------------------------------------------------------------
// High-level withdraw functions
// ---------------------------------------------------------------------------

/** Configuration for bridge operations. */
export interface BridgeConfig {
  /** SparkBridge contract address (0x-prefixed). */
  bridgeAddress: string;
  /** JSON-RPC endpoint for EVM read queries. */
  rpcUrl: string;
  /** Chain ID of the Flashnet EVM. */
  chainId: number;
}

/** Result of a withdraw operation. */
export interface WithdrawResult {
  submissionId: string;
  intentId: string;
  status: string;
}

/**
 * Withdraw native BTC from EVM back to Spark.
 *
 * Encodes a SparkBridge.withdrawSats() call, signs it, and submits
 * as an execute intent. The caller must have sufficient EVM balance.
 *
 * @param client - Authenticated ExecutionClient
 * @param config - Bridge and chain configuration
 * @param sparkRecipient - 33-byte compressed public key hex of the Spark recipient
 * @param amount - Amount in wei to withdraw
 * @param evmSigner - Signs the withdrawal transaction
 * @returns Submission result from the execution gateway
 */
export async function withdrawSats(
  client: ExecutionClient,
  config: BridgeConfig,
  sparkRecipient: string,
  amount: bigint,
  evmSigner: EvmTransactionSigner
): Promise<WithdrawResult> {
  const calldata = encodeWithdrawSats(sparkRecipient);
  const senderAddress = await evmSigner.getAddress();
  const nonce = await fetchNonce(config.rpcUrl, senderAddress);

  const signedTx = await evmSigner.signTransaction({
    to: config.bridgeAddress,
    data: calldata,
    value: amount,
    chainId: config.chainId,
    nonce,
    gasLimit: 200_000n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  });

  const response: ExecuteResponse = await client.submitExecute({
    chainId: config.chainId,
    deposits: [],
    signedTx,
  });

  return {
    submissionId: response.submissionId,
    intentId: response.intentId,
    status: response.status,
  };
}

/**
 * Withdraw an ERC20 token from EVM back to Spark.
 *
 * Encodes a SparkBridge.withdrawBtkn() call, signs it, and submits
 * as an execute intent.
 *
 * @param client - Authenticated ExecutionClient
 * @param config - Bridge and chain configuration
 * @param tokenAddress - ERC20 token contract address
 * @param amount - Amount in token base units
 * @param sparkRecipient - 33-byte compressed public key hex of the Spark recipient
 * @param evmSigner - Signs the withdrawal transaction
 * @returns Submission result from the execution gateway
 */
export async function withdrawToken(
  client: ExecutionClient,
  config: BridgeConfig,
  tokenAddress: string,
  amount: bigint,
  sparkRecipient: string,
  evmSigner: EvmTransactionSigner
): Promise<WithdrawResult> {
  const calldata = encodeWithdrawToken(tokenAddress, amount, sparkRecipient);
  const senderAddress = await evmSigner.getAddress();
  const nonce = await fetchNonce(config.rpcUrl, senderAddress);

  const signedTx = await evmSigner.signTransaction({
    to: config.bridgeAddress,
    data: calldata,
    value: 0n,
    chainId: config.chainId,
    nonce,
    gasLimit: 200_000n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  });

  const response: ExecuteResponse = await client.submitExecute({
    chainId: config.chainId,
    deposits: [],
    signedTx,
  });

  return {
    submissionId: response.submissionId,
    intentId: response.intentId,
    status: response.status,
  };
}

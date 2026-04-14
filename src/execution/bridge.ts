/**
 * Spark Bridge SDK Helpers
 *
 * Calldata encoding for SparkBridge contract operations (withdrawals,
 * token resolution) and high-level withdraw functions using viem.
 *
 * @example
 * ```typescript
 * import { encodeWithdrawSats, queryBridgedTokenAddress } from "@flashnet/sdk";
 *
 * const calldata = encodeWithdrawSats(sparkRecipientHex);
 * const tokenAddr = await queryBridgedTokenAddress(rpcUrl, bridgeAddress, sparkTokenIdHex);
 * ```
 */

import {
  encodeFunctionData,
  zeroAddress,
  type Address,
} from "viem";
import { sparkBridgeAbi } from "./abis/sparkBridge";
import { getClient } from "./rpc";

// Calldata encoding

/**
 * Encode calldata for SparkBridge.withdrawSats(sparkRecipient).
 *
 * @param sparkRecipient - 33-byte compressed public key as hex (with or without 0x prefix)
 * @returns 0x-prefixed calldata hex
 */
export function encodeWithdrawSats(sparkRecipient: string): string {
  const hex = sparkRecipient.startsWith("0x")
    ? sparkRecipient
    : `0x${sparkRecipient}`;
  return encodeFunctionData({
    abi: sparkBridgeAbi,
    functionName: "withdrawSats",
    args: [hex as `0x${string}`],
  });
}

/**
 * Encode calldata for SparkBridge.withdrawBtkn(tokenAddress, amount, sparkRecipient).
 */
export function encodeWithdrawToken(
  tokenAddress: string,
  amount: bigint,
  sparkRecipient: string
): string {
  const hex = sparkRecipient.startsWith("0x")
    ? sparkRecipient
    : `0x${sparkRecipient}`;
  return encodeFunctionData({
    abi: sparkBridgeAbi,
    functionName: "withdrawBtkn",
    args: [tokenAddress as Address, amount, hex as `0x${string}`],
  });
}

// Bridge queries

/**
 * Query the EVM token address for a bridged Spark token.
 * Returns null if not yet bridged.
 */
export async function queryBridgedTokenAddress(
  rpcUrl: string,
  bridgeAddress: string,
  sparkTokenIdHex: string
): Promise<string | null> {
  const client = getClient(rpcUrl);
  const hex = sparkTokenIdHex.startsWith("0x")
    ? sparkTokenIdHex
    : `0x${sparkTokenIdHex}`;

  const result = await client.readContract({
    address: bridgeAddress as Address,
    abi: sparkBridgeAbi,
    functionName: "tokenBySparkId",
    args: [hex as `0x${string}`],
  });

  if (result === zeroAddress) return null;
  return result;
}

/**
 * Poll for a bridged token address until it appears or timeout.
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


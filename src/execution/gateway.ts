/**
 * Spark Gateway SDK helpers.
 *
 * Calldata encoding for SparkGateway contract operations (withdrawals,
 * Spark-token address resolution) and high-level withdraw helpers using
 * viem.
 *
 * @example
 * ```typescript
 * import { encodeWithdrawSats, querySparkTokenAddress } from "@flashnet/sdk";
 *
 * const calldata = encodeWithdrawSats(sparkRecipientHex);
 * const tokenAddr = await querySparkTokenAddress(rpcUrl, gatewayAddress, sparkTokenIdHex);
 * ```
 */

import {
  encodeFunctionData,
  zeroAddress,
  type Address,
} from "viem";
import { sparkGatewayAbi } from "./abis/sparkGateway";
import { getClient } from "./rpc";

// Calldata encoding

/**
 * Encode calldata for SparkGateway.withdrawSats(sparkRecipient).
 *
 * @param sparkRecipient - 33-byte compressed public key as hex (with or without 0x prefix)
 * @returns 0x-prefixed calldata hex
 */
export function encodeWithdrawSats(sparkRecipient: string): string {
  const hex = sparkRecipient.startsWith("0x")
    ? sparkRecipient
    : `0x${sparkRecipient}`;
  return encodeFunctionData({
    abi: sparkGatewayAbi,
    functionName: "withdrawSats",
    args: [hex as `0x${string}`],
  });
}

/**
 * Encode calldata for SparkGateway.withdrawBtkn(tokenAddress, amount, sparkRecipient).
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
    abi: sparkGatewayAbi,
    functionName: "withdrawBtkn",
    args: [tokenAddress as Address, amount, hex as `0x${string}`],
  });
}

// Gateway queries

/**
 * Query the EVM ERC20 address for a Spark token deployed by the gateway.
 * Returns null if no token has been deployed yet for that Spark token id.
 */
export async function querySparkTokenAddress(
  rpcUrl: string,
  gatewayAddress: string,
  sparkTokenIdHex: string
): Promise<string | null> {
  const client = getClient(rpcUrl);
  const hex = sparkTokenIdHex.startsWith("0x")
    ? sparkTokenIdHex
    : `0x${sparkTokenIdHex}`;

  const result = await client.readContract({
    address: gatewayAddress as Address,
    abi: sparkGatewayAbi,
    functionName: "tokenBySparkId",
    args: [hex as `0x${string}`],
  });

  if (result === zeroAddress) return null;
  return result;
}

/**
 * Poll for a Spark token's EVM address until it appears or timeout.
 */
export async function waitForSparkTokenAddress(
  rpcUrl: string,
  gatewayAddress: string,
  sparkTokenIdHex: string,
  timeoutMs: number = 20_000,
  pollIntervalMs: number = 500
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const addr = await querySparkTokenAddress(
      rpcUrl,
      gatewayAddress,
      sparkTokenIdHex
    );
    if (addr) return addr;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return null;
}

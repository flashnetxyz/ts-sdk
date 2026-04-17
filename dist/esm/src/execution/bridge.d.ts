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
/**
 * Encode calldata for SparkBridge.withdrawSats(sparkRecipient).
 *
 * @param sparkRecipient - 33-byte compressed public key as hex (with or without 0x prefix)
 * @returns 0x-prefixed calldata hex
 */
export declare function encodeWithdrawSats(sparkRecipient: string): string;
/**
 * Encode calldata for SparkBridge.withdrawBtkn(tokenAddress, amount, sparkRecipient).
 */
export declare function encodeWithdrawToken(tokenAddress: string, amount: bigint, sparkRecipient: string): string;
/**
 * Query the EVM token address for a bridged Spark token.
 * Returns null if not yet bridged.
 */
export declare function queryBridgedTokenAddress(rpcUrl: string, bridgeAddress: string, sparkTokenIdHex: string): Promise<string | null>;
/**
 * Poll for a bridged token address until it appears or timeout.
 */
export declare function waitForBridgedTokenAddress(rpcUrl: string, bridgeAddress: string, sparkTokenIdHex: string, timeoutMs?: number, pollIntervalMs?: number): Promise<string | null>;
//# sourceMappingURL=bridge.d.ts.map
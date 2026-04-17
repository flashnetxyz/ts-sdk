import { encodeFunctionData, zeroAddress } from 'viem';
import { sparkBridgeAbi } from './abis/sparkBridge.js';
import { getClient } from './rpc.js';

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
// Calldata encoding
/**
 * Encode calldata for SparkBridge.withdrawSats(sparkRecipient).
 *
 * @param sparkRecipient - 33-byte compressed public key as hex (with or without 0x prefix)
 * @returns 0x-prefixed calldata hex
 */
function encodeWithdrawSats(sparkRecipient) {
    const hex = sparkRecipient.startsWith("0x")
        ? sparkRecipient
        : `0x${sparkRecipient}`;
    return encodeFunctionData({
        abi: sparkBridgeAbi,
        functionName: "withdrawSats",
        args: [hex],
    });
}
/**
 * Encode calldata for SparkBridge.withdrawBtkn(tokenAddress, amount, sparkRecipient).
 */
function encodeWithdrawToken(tokenAddress, amount, sparkRecipient) {
    const hex = sparkRecipient.startsWith("0x")
        ? sparkRecipient
        : `0x${sparkRecipient}`;
    return encodeFunctionData({
        abi: sparkBridgeAbi,
        functionName: "withdrawBtkn",
        args: [tokenAddress, amount, hex],
    });
}
// Bridge queries
/**
 * Query the EVM token address for a bridged Spark token.
 * Returns null if not yet bridged.
 */
async function queryBridgedTokenAddress(rpcUrl, bridgeAddress, sparkTokenIdHex) {
    const client = getClient(rpcUrl);
    const hex = sparkTokenIdHex.startsWith("0x")
        ? sparkTokenIdHex
        : `0x${sparkTokenIdHex}`;
    const result = await client.readContract({
        address: bridgeAddress,
        abi: sparkBridgeAbi,
        functionName: "tokenBySparkId",
        args: [hex],
    });
    if (result === zeroAddress)
        return null;
    return result;
}
/**
 * Poll for a bridged token address until it appears or timeout.
 */
async function waitForBridgedTokenAddress(rpcUrl, bridgeAddress, sparkTokenIdHex, timeoutMs = 20_000, pollIntervalMs = 500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const addr = await queryBridgedTokenAddress(rpcUrl, bridgeAddress, sparkTokenIdHex);
        if (addr)
            return addr;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return null;
}

export { encodeWithdrawSats, encodeWithdrawToken, queryBridgedTokenAddress, waitForBridgedTokenAddress };
//# sourceMappingURL=bridge.js.map

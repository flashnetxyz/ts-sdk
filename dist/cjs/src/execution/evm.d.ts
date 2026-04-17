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
/**
 * Fetch ERC-20 token metadata (symbol, name, decimals) in a single multicall.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param tokenAddress - Token contract address (0x-prefixed)
 * @returns Token metadata
 */
export declare function fetchTokenInfo(rpcUrl: string, tokenAddress: string): Promise<TokenInfo>;
/**
 * Fetch ERC-20 token balance for an account.
 */
export declare function fetchTokenBalance(rpcUrl: string, tokenAddress: string, account: string): Promise<bigint>;
/**
 * Fetch native balance (BTC/ETH) for an account.
 */
export declare function fetchNativeBalance(rpcUrl: string, account: string): Promise<bigint>;
/**
 * Fetch ERC-20 allowance (how much `spender` can transfer from `owner`).
 */
export declare function fetchAllowance(rpcUrl: string, tokenAddress: string, owner: string, spender: string): Promise<bigint>;
/**
 * Fetch the current nonce (transaction count) for an account.
 */
export declare function fetchNonce(rpcUrl: string, account: string): Promise<number>;
/**
 * Fetch current EIP-1559 fee parameters (maxFeePerGas, maxPriorityFeePerGas).
 *
 * On Flashnet both are effectively 0 today, but a partner running their own
 * chain or a future base-fee activation would make hardcoded 0s incorrect.
 * This queries the node and returns the values to use for tx construction.
 *
 * Falls back to 0/0 if the node doesn't support `eth_feeHistory` or returns
 * an empty response — correct for today's Flashnet.
 */
export declare function fetchEip1559Fees(rpcUrl: string): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}>;
//# sourceMappingURL=evm.d.ts.map
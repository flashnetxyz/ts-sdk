'use strict';

require('viem');
var erc20 = require('./abis/erc20.js');
var rpc = require('./rpc.js');

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
// Public API
/**
 * Fetch ERC-20 token metadata (symbol, name, decimals) in a single multicall.
 *
 * @param rpcUrl - JSON-RPC endpoint URL
 * @param tokenAddress - Token contract address (0x-prefixed)
 * @returns Token metadata
 */
async function fetchTokenInfo(rpcUrl, tokenAddress) {
    const client = rpc.getClient(rpcUrl);
    const addr = tokenAddress;
    const results = await client.multicall({
        contracts: [
            { address: addr, abi: erc20.erc20Abi, functionName: "symbol" },
            { address: addr, abi: erc20.erc20Abi, functionName: "name" },
            { address: addr, abi: erc20.erc20Abi, functionName: "decimals" },
        ],
    });
    // All three multicall results must succeed. Matches the strictness of
    // fetchPoolInfo: silent fallbacks ("", 0) look like a valid token with
    // no decimals and feed dangerous values into downstream scaling
    // (decimals: 0 → amount math off by up to 10^18), so surface the RPC
    // error instead.
    if (results[0].status !== "success") {
        throw new Error(`Failed to read symbol from token ${tokenAddress}`);
    }
    if (results[1].status !== "success") {
        throw new Error(`Failed to read name from token ${tokenAddress}`);
    }
    if (results[2].status !== "success") {
        throw new Error(`Failed to read decimals from token ${tokenAddress}`);
    }
    return {
        address: tokenAddress,
        symbol: results[0].result,
        name: results[1].result,
        decimals: results[2].result,
    };
}
/**
 * Fetch ERC-20 token balance for an account.
 */
async function fetchTokenBalance(rpcUrl, tokenAddress, account) {
    const client = rpc.getClient(rpcUrl);
    return client.readContract({
        address: tokenAddress,
        abi: erc20.erc20Abi,
        functionName: "balanceOf",
        args: [account],
    });
}
/**
 * Fetch native balance (BTC/ETH) for an account.
 */
async function fetchNativeBalance(rpcUrl, account) {
    const client = rpc.getClient(rpcUrl);
    return client.getBalance({ address: account });
}
/**
 * Fetch ERC-20 allowance (how much `spender` can transfer from `owner`).
 */
async function fetchAllowance(rpcUrl, tokenAddress, owner, spender) {
    const client = rpc.getClient(rpcUrl);
    return client.readContract({
        address: tokenAddress,
        abi: erc20.erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
    });
}
/**
 * Fetch the current nonce (transaction count) for an account.
 */
async function fetchNonce(rpcUrl, account) {
    const client = rpc.getClient(rpcUrl);
    return client.getTransactionCount({ address: account });
}
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
async function fetchEip1559Fees(rpcUrl) {
    const client = rpc.getClient(rpcUrl);
    try {
        const est = await client.estimateFeesPerGas();
        return {
            maxFeePerGas: est.maxFeePerGas ?? 0n,
            maxPriorityFeePerGas: est.maxPriorityFeePerGas ?? 0n,
        };
    }
    catch {
        return { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n };
    }
}

exports.fetchAllowance = fetchAllowance;
exports.fetchEip1559Fees = fetchEip1559Fees;
exports.fetchNativeBalance = fetchNativeBalance;
exports.fetchNonce = fetchNonce;
exports.fetchTokenBalance = fetchTokenBalance;
exports.fetchTokenInfo = fetchTokenInfo;
//# sourceMappingURL=evm.js.map

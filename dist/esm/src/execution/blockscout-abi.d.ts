/**
 * Pull the ABI of a verified contract from a Blockscout deployment and
 * index its `error` entries by 4-byte selector, so
 * {@link decodeRevertReason} can name custom errors we don't have
 * hard-coded tables for.
 *
 * Works against any Blockscout-compatible API (the localnet deploys one
 * at `:4001/api/v2`, mainnet Blockscout instances expose the same
 * shape). Returns an empty table on any failure — a best-effort lookup,
 * never a hard dependency.
 */
/**
 * Return a `selector → error-signature` map for all custom errors
 * declared in the ABI of `contractAddress`.
 *
 * @param blockscoutApiUrl - e.g. `http://127.0.0.1:4001/api/v2` (localnet)
 *                           or `https://eth.blockscout.com/api/v2` (public).
 * @param contractAddress  - EVM address of the contract whose errors to index.
 * @param options          - `timeoutMs` defaults to 10 000.
 */
export declare function fetchAbiErrorsFromBlockscout(blockscoutApiUrl: string, contractAddress: string, options?: {
    timeoutMs?: number;
}): Promise<Record<string, string>>;
/**
 * Compute the 4-byte selector (`0x`-prefixed, lowercase) for a Solidity
 * error or function signature.
 */
export declare function errorSelector(signature: string): string;
//# sourceMappingURL=blockscout-abi.d.ts.map
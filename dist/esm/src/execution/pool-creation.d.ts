/**
 * Conductor Pool Creation Helpers
 *
 * ABI encoding for Conductor.createBTCPool() using viem.
 *
 * @example
 * ```typescript
 * import { encodeCreateBTCPool } from "@flashnet/sdk/execution";
 *
 * const { calldata, wbtcAmountWei } = encodeCreateBTCPool({
 *   wbtcAddress: "0x...", otherTokenAddress: "0x...",
 *   fee: 3000, tickSpacing: 60, sqrtPriceX96: 79228162514264337593543950336n,
 *   wbtcAmount: 1000000000000000000n, otherAmount: 1000000000000000000n,
 *   hostId: "0x...", feeRecipient: "0x...",
 *   permit: { value: 1000n, deadline: 9999999999n, v: 27, r: "0x...", s: "0x..." },
 * });
 * ```
 */
/** EIP-2612 permit signature data for Conductor pool creation. */
export interface PermitSignature {
    value: bigint;
    deadline: bigint;
    v: number;
    r: string;
    s: string;
}
/** Parameters for creating a BTC + ERC-20 pool via Conductor. */
export interface CreateBTCPoolParams {
    wbtcAddress: string;
    otherTokenAddress: string;
    fee: number;
    tickSpacing: number;
    sqrtPriceX96: bigint;
    wbtcAmount: bigint;
    otherAmount: bigint;
    hostId: string;
    feeRecipient: string;
    permit: PermitSignature;
}
/** Parameters for creating an ERC-20 only pool via Conductor (Permit2). */
export interface CreatePoolParams {
    tokenA: string;
    tokenB: string;
    fee: number;
    tickSpacing: number;
    sqrtPriceX96: bigint;
    amountA: bigint;
    amountB: bigint;
    hostId: string;
    feeRecipient: string;
}
/**
 * Encode calldata for Conductor.createBTCPool().
 * Handles token sorting, full-range tick calculation, and permit struct encoding.
 */
export declare function encodeCreateBTCPool(params: CreateBTCPoolParams): {
    calldata: string;
    wbtcAmountWei: bigint;
};
/**
 * Encode pool parameters for Conductor.createPool() (ERC20-only pools via Permit2).
 * Returns sorted token info for the caller to build the full Permit2 transaction.
 */
export declare function encodeCreatePoolParams(params: CreatePoolParams): {
    token0: string;
    token1: string;
    amount0Desired: bigint;
    amount1Desired: bigint;
    tickLower: number;
    tickUpper: number;
};
//# sourceMappingURL=pool-creation.d.ts.map
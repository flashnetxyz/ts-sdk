/**
 * Conductor Contract ABI Encoding
 *
 * Low-level calldata encoding for the Conductor contract.
 * Used internally by AMMClient — consumers should use AMMClient.swap() instead.
 */
/** Parameters for Conductor.swap() — ERC20 to ERC20. */
export interface SwapParams {
    tokenIn: string;
    tokenOut: string;
    fee: number;
    amountIn: bigint;
    minAmountOut: bigint;
    integrator?: string;
}
/** Parameters for Conductor.swapBTC() — native BTC to ERC20. */
export interface SwapBTCParams {
    tokenOut: string;
    fee: number;
    minAmountOut: bigint;
    integrator?: string;
}
/**
 * Conductor contract ABI encoding helpers.
 */
export declare const Conductor: {
    /** Encode calldata for Conductor.swap(). */
    encodeSwap(params: SwapParams): string;
    /** Encode calldata for Conductor.swapBTC(). */
    encodeSwapBTC(params: SwapBTCParams): string;
};
/** AMM-specific configuration (Conductor and Uniswap addresses). */
export interface ConductorConfig {
    conductorAddress: string;
    wbtcAddress: string;
    factoryAddress: string;
    rpcUrl: string;
    chainId: number;
}
//# sourceMappingURL=conductor.d.ts.map
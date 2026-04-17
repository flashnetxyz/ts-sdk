import { encodeFunctionData } from 'viem';
import { conductorAbi } from './abis/conductor.js';

/**
 * Conductor Contract ABI Encoding
 *
 * Low-level calldata encoding for the Conductor contract.
 * Used internally by AMMClient — consumers should use AMMClient.swap() instead.
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
/**
 * Conductor contract ABI encoding helpers.
 */
const Conductor = {
    /** Encode calldata for Conductor.swap(). */
    encodeSwap(params) {
        return encodeFunctionData({
            abi: conductorAbi,
            functionName: "swap",
            args: [
                params.tokenIn,
                params.tokenOut,
                params.fee,
                params.amountIn,
                params.minAmountOut,
                (params.integrator ?? ZERO_ADDRESS),
            ],
        });
    },
    /** Encode calldata for Conductor.swapBTC(). */
    encodeSwapBTC(params) {
        return encodeFunctionData({
            abi: conductorAbi,
            functionName: "swapBTC",
            args: [
                params.tokenOut,
                params.fee,
                params.minAmountOut,
                (params.integrator ?? ZERO_ADDRESS),
            ],
        });
    },
};

export { Conductor };
//# sourceMappingURL=conductor.js.map

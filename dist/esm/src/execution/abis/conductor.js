const conductorAbi = [
    {
        type: "function",
        name: "swap",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "amountIn", type: "uint256" },
            { name: "minAmountOut", type: "uint256" },
            { name: "integrator", type: "address" },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    {
        type: "function",
        name: "swapBTC",
        stateMutability: "payable",
        inputs: [
            { name: "tokenOut", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "minAmountOut", type: "uint256" },
            { name: "integrator", type: "address" },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    // Native BTC → ERC20 swap, then withdraw the ERC20 output to Spark.
    {
        type: "function",
        name: "swapBTCAndWithdraw",
        stateMutability: "payable",
        inputs: [
            { name: "tokenOut", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "minAmountOut", type: "uint256" },
            { name: "sparkRecipient", type: "bytes" },
            { name: "integrator", type: "address" },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    // ERC20 → native BTC swap, then withdraw the BTC output to Spark.
    {
        type: "function",
        name: "swapAndWithdrawBTC",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenIn", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "amountIn", type: "uint256" },
            { name: "minAmountOut", type: "uint256" },
            { name: "sparkRecipient", type: "bytes" },
            { name: "integrator", type: "address" },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    // ERC20 → ERC20 swap, then withdraw the output token to Spark.
    {
        type: "function",
        name: "swapAndWithdraw",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "amountIn", type: "uint256" },
            { name: "minAmountOut", type: "uint256" },
            { name: "sparkRecipient", type: "bytes" },
            { name: "integrator", type: "address" },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    // Permit2 variants — authorize transfer via signed EIP-712 PermitTransferFrom
    // instead of a prior ERC-20 approve. No standing allowance.
    {
        type: "function",
        name: "swapAndWithdrawBTCWithPermit2",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenIn", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "amountIn", type: "uint256" },
            { name: "minAmountOut", type: "uint256" },
            { name: "sparkRecipient", type: "bytes" },
            { name: "integrator", type: "address" },
            {
                name: "permitTransfer",
                type: "tuple",
                components: [
                    {
                        name: "permitted",
                        type: "tuple",
                        components: [
                            { name: "token", type: "address" },
                            { name: "amount", type: "uint256" },
                        ],
                    },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            },
            { name: "signature", type: "bytes" },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    {
        type: "function",
        name: "swapAndWithdrawWithPermit2",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "amountIn", type: "uint256" },
            { name: "minAmountOut", type: "uint256" },
            { name: "sparkRecipient", type: "bytes" },
            { name: "integrator", type: "address" },
            {
                name: "permitTransfer",
                type: "tuple",
                components: [
                    {
                        name: "permitted",
                        type: "tuple",
                        components: [
                            { name: "token", type: "address" },
                            { name: "amount", type: "uint256" },
                        ],
                    },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            },
            { name: "signature", type: "bytes" },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    // EIP-2612 variants — use the token's own `permit(...)` to grant an inline
    // allowance and then `transferFrom`. Unlike Permit2 these require NO prior
    // on-chain approve from the caller, so they can be bundled with a fresh
    // bridge-deposit in a single execute intent. Tokens must implement
    // ERC20Permit (BridgedSparkToken does).
    {
        type: "function",
        name: "swapAndWithdrawBTCWithEIP2612",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenIn", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "amountIn", type: "uint256" },
            { name: "minAmountOut", type: "uint256" },
            { name: "sparkRecipient", type: "bytes" },
            { name: "integrator", type: "address" },
            {
                name: "tokenPermit",
                type: "tuple",
                components: [
                    { name: "value", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                    { name: "v", type: "uint8" },
                    { name: "r", type: "bytes32" },
                    { name: "s", type: "bytes32" },
                ],
            },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
    {
        type: "function",
        name: "swapAndWithdrawWithEIP2612",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "amountIn", type: "uint256" },
            { name: "minAmountOut", type: "uint256" },
            { name: "sparkRecipient", type: "bytes" },
            { name: "integrator", type: "address" },
            {
                name: "tokenPermit",
                type: "tuple",
                components: [
                    { name: "value", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                    { name: "v", type: "uint8" },
                    { name: "r", type: "bytes32" },
                    { name: "s", type: "bytes32" },
                ],
            },
        ],
        outputs: [{ name: "amountOut", type: "uint256" }],
    },
];

export { conductorAbi };
//# sourceMappingURL=conductor.js.map

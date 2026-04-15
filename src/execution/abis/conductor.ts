export const conductorAbi = [
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
] as const;

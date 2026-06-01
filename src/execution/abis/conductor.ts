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
  // EIP-2612 variants — use the token's own `permit(...)` to grant an inline
  // allowance and then `transferFrom`. Unlike Permit2 these require NO prior
  // on-chain approve from the caller, so they can be bundled with a fresh
  // deposit-and-call in a single execute intent. Tokens must implement
  // ERC20Permit (SparkToken does).
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
  // ── Liquidity management ──────────────────────────────────────
  //
  // ERC20 legs use Permit2 (permit tuple + detached signature). Ops on an
  // existing position take an `ERC721PermitSig`. `*BTC` variants are payable —
  // `msg.value` funds the WBTC leg (1:1 wei). Dust and proceeds route to Spark.
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "sparkRecipient", type: "bytes" },
        ],
      },
      {
        name: "permitA",
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
      { name: "signatureA", type: "bytes" },
      {
        name: "permitB",
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
      { name: "signatureB", type: "bytes" },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "used0", type: "uint256" },
      { name: "used1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "addLiquidityBTC",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "sparkRecipient", type: "bytes" },
        ],
      },
      {
        name: "erc20Permit",
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
      { name: "erc20Signature", type: "bytes" },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "used0", type: "uint256" },
      { name: "used1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "increaseLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "sparkRecipient", type: "bytes" },
        ],
      },
      {
        name: "permitA",
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
      { name: "signatureA", type: "bytes" },
      {
        name: "permitB",
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
      { name: "signatureB", type: "bytes" },
    ],
    outputs: [
      { name: "liquidity", type: "uint128" },
      { name: "used0", type: "uint256" },
      { name: "used1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "increaseLiquidityBTC",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "sparkRecipient", type: "bytes" },
        ],
      },
      {
        name: "erc20Permit",
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
      { name: "erc20Signature", type: "bytes" },
    ],
    outputs: [
      { name: "liquidity", type: "uint128" },
      { name: "used0", type: "uint256" },
      { name: "used1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "decreaseLiquidityAndWithdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0Min", type: "uint256" },
      { name: "amount1Min", type: "uint256" },
      { name: "deadline", type: "uint256" },
      {
        name: "nftPermit",
        type: "tuple",
        components: [
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      { name: "sparkRecipient", type: "bytes" },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "collectFeesAndWithdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      {
        name: "nftPermit",
        type: "tuple",
        components: [
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      { name: "sparkRecipient", type: "bytes" },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "modifyPosition",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "newTickLower", type: "int24" },
          { name: "newTickUpper", type: "int24" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "additionalAmount0Desired", type: "uint256" },
          { name: "additionalAmount1Desired", type: "uint256" },
          { name: "newAmount0Min", type: "uint256" },
          { name: "newAmount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "sparkRecipient", type: "bytes" },
        ],
      },
      {
        name: "nftPermit",
        type: "tuple",
        components: [
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      {
        name: "permitA",
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
      { name: "signatureA", type: "bytes" },
      {
        name: "permitB",
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
      { name: "signatureB", type: "bytes" },
    ],
    outputs: [
      { name: "newTokenId", type: "uint256" },
      { name: "newLiquidity", type: "uint128" },
      { name: "used0", type: "uint256" },
      { name: "used1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "modifyPositionBTC",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "newTickLower", type: "int24" },
          { name: "newTickUpper", type: "int24" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "additionalAmount0Desired", type: "uint256" },
          { name: "additionalAmount1Desired", type: "uint256" },
          { name: "newAmount0Min", type: "uint256" },
          { name: "newAmount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "sparkRecipient", type: "bytes" },
        ],
      },
      {
        name: "nftPermit",
        type: "tuple",
        components: [
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      {
        name: "erc20Permit",
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
      { name: "erc20Signature", type: "bytes" },
    ],
    outputs: [
      { name: "newTokenId", type: "uint256" },
      { name: "newLiquidity", type: "uint128" },
      { name: "used0", type: "uint256" },
      { name: "used1", type: "uint256" },
    ],
  },
  // ── LP events ────────────────────────────────────────────────
  {
    type: "event",
    name: "LiquidityAdded",
    inputs: [
      { name: "provider", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "token0", type: "address", indexed: false },
      { name: "token1", type: "address", indexed: false },
      { name: "fee", type: "uint24", indexed: false },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LiquidityIncreased",
    inputs: [
      { name: "funder", type: "address", indexed: true },
      { name: "tokenOwner", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "liquidityAdded", type: "uint128", indexed: false },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LiquidityDecreased",
    inputs: [
      { name: "provider", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "liquidityRemoved", type: "uint128", indexed: false },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
      { name: "burned", type: "bool", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FeesCollected",
    inputs: [
      { name: "provider", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PositionModified",
    inputs: [
      { name: "provider", type: "address", indexed: true },
      { name: "oldTokenId", type: "uint256", indexed: true },
      { name: "newTokenId", type: "uint256", indexed: true },
      { name: "newTickLower", type: "int24", indexed: false },
      { name: "newTickUpper", type: "int24", indexed: false },
      { name: "newLiquidity", type: "uint128", indexed: false },
      { name: "used0", type: "uint256", indexed: false },
      { name: "used1", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LPBTCDustToSender",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "weiAmount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

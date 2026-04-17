const uniswapV3FactoryAbi = [
    {
        type: "function",
        name: "getPool",
        stateMutability: "view",
        inputs: [
            { name: "tokenA", type: "address" },
            { name: "tokenB", type: "address" },
            { name: "fee", type: "uint24" },
        ],
        outputs: [{ name: "pool", type: "address" }],
    },
];
const uniswapV3PoolAbi = [
    {
        type: "function",
        name: "slot0",
        stateMutability: "view",
        inputs: [],
        outputs: [
            { name: "sqrtPriceX96", type: "uint160" },
            { name: "tick", type: "int24" },
            { name: "observationIndex", type: "uint16" },
            { name: "observationCardinality", type: "uint16" },
            { name: "observationCardinalityNext", type: "uint16" },
            { name: "feeProtocol", type: "uint8" },
            { name: "unlocked", type: "bool" },
        ],
    },
    {
        type: "function",
        name: "liquidity",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint128" }],
    },
    {
        type: "function",
        name: "token0",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
    {
        type: "function",
        name: "token1",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
];

export { uniswapV3FactoryAbi, uniswapV3PoolAbi };
//# sourceMappingURL=uniswapV3.js.map

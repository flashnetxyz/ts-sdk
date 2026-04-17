export declare const uniswapV3FactoryAbi: readonly [{
    readonly type: "function";
    readonly name: "getPool";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "tokenA";
        readonly type: "address";
    }, {
        readonly name: "tokenB";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }];
    readonly outputs: readonly [{
        readonly name: "pool";
        readonly type: "address";
    }];
}];
export declare const uniswapV3PoolAbi: readonly [{
    readonly type: "function";
    readonly name: "slot0";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "sqrtPriceX96";
        readonly type: "uint160";
    }, {
        readonly name: "tick";
        readonly type: "int24";
    }, {
        readonly name: "observationIndex";
        readonly type: "uint16";
    }, {
        readonly name: "observationCardinality";
        readonly type: "uint16";
    }, {
        readonly name: "observationCardinalityNext";
        readonly type: "uint16";
    }, {
        readonly name: "feeProtocol";
        readonly type: "uint8";
    }, {
        readonly name: "unlocked";
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "liquidity";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint128";
    }];
}, {
    readonly type: "function";
    readonly name: "token0";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "token1";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
}];
//# sourceMappingURL=uniswapV3.d.ts.map
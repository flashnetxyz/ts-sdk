export declare const conductorPoolCreationAbi: readonly [{
    readonly type: "function";
    readonly name: "createBTCPool";
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly name: "params";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "token0";
            readonly type: "address";
        }, {
            readonly name: "token1";
            readonly type: "address";
        }, {
            readonly name: "fee";
            readonly type: "uint24";
        }, {
            readonly name: "sqrtPriceX96";
            readonly type: "uint160";
        }, {
            readonly name: "tickLower";
            readonly type: "int24";
        }, {
            readonly name: "tickUpper";
            readonly type: "int24";
        }, {
            readonly name: "amount0Desired";
            readonly type: "uint256";
        }, {
            readonly name: "amount1Desired";
            readonly type: "uint256";
        }, {
            readonly name: "amount0Min";
            readonly type: "uint256";
        }, {
            readonly name: "amount1Min";
            readonly type: "uint256";
        }, {
            readonly name: "hostId";
            readonly type: "bytes32";
        }, {
            readonly name: "feeRecipient";
            readonly type: "address";
        }];
    }, {
        readonly name: "tokenPermit";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "value";
            readonly type: "uint256";
        }, {
            readonly name: "deadline";
            readonly type: "uint256";
        }, {
            readonly name: "v";
            readonly type: "uint8";
        }, {
            readonly name: "r";
            readonly type: "bytes32";
        }, {
            readonly name: "s";
            readonly type: "bytes32";
        }];
    }];
    readonly outputs: readonly [{
        readonly name: "pool";
        readonly type: "address";
    }, {
        readonly name: "tokenId";
        readonly type: "uint256";
    }, {
        readonly name: "liquidity";
        readonly type: "uint128";
    }, {
        readonly name: "amount0";
        readonly type: "uint256";
    }, {
        readonly name: "amount1";
        readonly type: "uint256";
    }];
}];
//# sourceMappingURL=conductorPoolCreation.d.ts.map
export declare const conductorAbi: readonly [{
    readonly type: "function";
    readonly name: "swap";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenIn";
        readonly type: "address";
    }, {
        readonly name: "tokenOut";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "integrator";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapBTC";
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly name: "tokenOut";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "integrator";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapBTCAndWithdraw";
    readonly stateMutability: "payable";
    readonly inputs: readonly [{
        readonly name: "tokenOut";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }, {
        readonly name: "integrator";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapAndWithdrawBTC";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenIn";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }, {
        readonly name: "integrator";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapAndWithdraw";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenIn";
        readonly type: "address";
    }, {
        readonly name: "tokenOut";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }, {
        readonly name: "integrator";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapAndWithdrawBTCWithPermit2";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenIn";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }, {
        readonly name: "integrator";
        readonly type: "address";
    }, {
        readonly name: "permitTransfer";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "permitted";
            readonly type: "tuple";
            readonly components: readonly [{
                readonly name: "token";
                readonly type: "address";
            }, {
                readonly name: "amount";
                readonly type: "uint256";
            }];
        }, {
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly name: "deadline";
            readonly type: "uint256";
        }];
    }, {
        readonly name: "signature";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapAndWithdrawWithPermit2";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenIn";
        readonly type: "address";
    }, {
        readonly name: "tokenOut";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }, {
        readonly name: "integrator";
        readonly type: "address";
    }, {
        readonly name: "permitTransfer";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "permitted";
            readonly type: "tuple";
            readonly components: readonly [{
                readonly name: "token";
                readonly type: "address";
            }, {
                readonly name: "amount";
                readonly type: "uint256";
            }];
        }, {
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly name: "deadline";
            readonly type: "uint256";
        }];
    }, {
        readonly name: "signature";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapAndWithdrawBTCWithEIP2612";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenIn";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }, {
        readonly name: "integrator";
        readonly type: "address";
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
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "swapAndWithdrawWithEIP2612";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenIn";
        readonly type: "address";
    }, {
        readonly name: "tokenOut";
        readonly type: "address";
    }, {
        readonly name: "fee";
        readonly type: "uint24";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
    }, {
        readonly name: "minAmountOut";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }, {
        readonly name: "integrator";
        readonly type: "address";
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
        readonly name: "amountOut";
        readonly type: "uint256";
    }];
}];
//# sourceMappingURL=conductor.d.ts.map
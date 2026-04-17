export declare const sparkBridgeAbi: readonly [{
    readonly type: "function";
    readonly name: "withdrawSats";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "withdrawBtkn";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "tokenAddress";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "sparkRecipient";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "tokenBySparkId";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "sparkTokenId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
}];
//# sourceMappingURL=sparkBridge.d.ts.map
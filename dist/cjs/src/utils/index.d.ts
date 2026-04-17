export * from "./auth";
export * from "./intents";
export * from "./spark-address";
export * from "./tick-math";
export * from "./tokenAddress";
export declare function generateNonce(): string;
export declare function toSmallestUnit(amount: number, decimals: number): bigint;
export declare function fromSmallestUnit(amount: bigint | string | number, decimals: number): number;
export declare function compareDecimalStrings(a: string, b: string): number;
export { createWalletSigner } from "../utils/signer";
export { safeBigInt } from "./bigint";
//# sourceMappingURL=index.d.ts.map
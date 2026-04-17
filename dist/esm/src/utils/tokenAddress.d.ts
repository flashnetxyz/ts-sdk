import type { NetworkType, SparkNetworkType } from "../types";
export type SparkHumanReadableTokenIdentifier = `btkn1${string}` | `btknrt1${string}` | `btknt1${string}` | `btkns1${string}` | `btknl1${string}`;
type TokenIdentifierHashes = {
    versionHash: Uint8Array;
    issuerPublicKeyHash: Uint8Array;
    nameHash: Uint8Array;
    tickerHash: Uint8Array;
    decimalsHash: Uint8Array;
    maxSupplyHash: Uint8Array;
    isFreezableHash: Uint8Array;
    networkHash: Uint8Array;
    creationEntityPublicKeyHash: Uint8Array;
};
declare const NETWORK_MAGIC: {
    MAINNET: number;
    TESTNET: number;
    REGTEST: number;
    SIGNET: number;
};
export declare const SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY = "0205fe807e8fe1f368df955cc291f16d840b7f28374b0ed80b80c3e2e0921a0674";
/**
 * Encode token identifier using Spark network type
 * @param tokenIdentifier Token identifier as hex string or Uint8Array
 * @param network Spark network type
 * @returns Human-readable token identifier
 */
export declare function encodeSparkHumanReadableTokenIdentifier(tokenIdentifier: string | Uint8Array, network: SparkNetworkType): SparkHumanReadableTokenIdentifier;
/**
 * Decode human-readable token identifier using Spark network type
 * @param humanReadableTokenIdentifier Human-readable token identifier
 * @param network Expected Spark network type
 * @returns Object containing token identifier and network
 */
export declare function decodeSparkHumanReadableTokenIdentifier(humanReadableTokenIdentifier: SparkHumanReadableTokenIdentifier, network: SparkNetworkType): {
    tokenIdentifier: string;
    network: SparkNetworkType;
};
/**
 * @deprecated Use SparkHumanReadableTokenIdentifier instead
 */
export type HumanReadableTokenIdentifier = `btkn1${string}` | `btknrt1${string}` | `btknt1${string}` | `btkns1${string}` | `btknl1${string}`;
/**
 * @deprecated Use encodeSparkHumanReadableTokenIdentifier with SparkNetworkType instead
 */
export declare function encodeHumanReadableTokenIdentifier(tokenIdentifier: string | Uint8Array, network: NetworkType): HumanReadableTokenIdentifier;
/**
 * @deprecated Use decodeSparkHumanReadableTokenIdentifier with SparkNetworkType instead
 */
export declare function decodeHumanReadableTokenIdentifier(humanReadableTokenIdentifier: HumanReadableTokenIdentifier, network: NetworkType): {
    tokenIdentifier: string;
    network: NetworkType;
};
export declare function getTokenIdentifierHashes(token: {
    issuerPublicKey: string | Uint8Array;
    name: string;
    ticker: string;
    decimals: number;
    maxSupply: bigint;
    isFreezable: boolean;
    network: keyof typeof NETWORK_MAGIC;
    creationEntityPublicKey: string | Uint8Array;
}): TokenIdentifierHashes;
export declare function getTokenIdentifierWithHashes(hashes: TokenIdentifierHashes): Uint8Array<ArrayBufferLike>;
export declare function getTokenIdentifier(token: {
    issuerPublicKey: string | Uint8Array;
    name: string;
    ticker: string;
    decimals: number;
    maxSupply: bigint;
    isFreezable: boolean;
    network: keyof typeof NETWORK_MAGIC;
    creationEntityPublicKey: string | Uint8Array;
}): Uint8Array;
export declare function getHumanReadableTokenIdentifier(token: {
    issuerPublicKey: string | Uint8Array;
    name: string;
    ticker: string;
    decimals: number;
    maxSupply: bigint;
    isFreezable: boolean;
    network: keyof typeof NETWORK_MAGIC;
    creationEntityPublicKey: string | Uint8Array;
}): SparkHumanReadableTokenIdentifier;
export {};
//# sourceMappingURL=tokenAddress.d.ts.map
import type { NetworkType, SparkNetworkType } from "../types";
declare const SparkAddressNetworkPrefix: Record<SparkNetworkType, string>;
export type SparkAddressFormat = `${(typeof SparkAddressNetworkPrefix)[keyof typeof SparkAddressNetworkPrefix]}1${string}`;
export interface SparkAddressDataNew {
    identityPublicKey: string;
    network: SparkNetworkType;
}
export interface SparkAddressData {
    identityPublicKey: string;
    /** @deprecated Use SparkNetworkType instead */
    network: NetworkType;
}
/**
 * Encodes a public key and Spark network into a Spark address
 * @param payload Object containing hex public key and Spark network type
 * @returns Bech32m encoded Spark address
 */
export declare function encodeSparkAddressNew(payload: SparkAddressDataNew): SparkAddressFormat;
/**
 * Decodes a Spark address to extract the public key using Spark network type
 * @param address Bech32m encoded Spark address
 * @param network Expected Spark network type (used to check prefix)
 * @returns Hex-encoded public key
 * @throws Error if address format, prefix, or decoded key is invalid
 */
export declare function decodeSparkAddressNew(address: string, network: SparkNetworkType): string;
/**
 * Attempts to determine the Spark network type from a Spark address prefix.
 * @param address The potential Spark address.
 * @returns The SparkNetworkType or null if the prefix is invalid.
 */
export declare function getSparkNetworkFromAddress(address: string): SparkNetworkType | null;
/**
 * Checks if a string is a valid Spark address for *any* known Spark network,
 * and optionally validates against a specific Spark network.
 * @param address String to validate
 * @param network Optional specific Spark network type to check against
 * @returns Boolean indicating validity
 */
export declare function isValidSparkAddressNew(address: string, network?: SparkNetworkType): boolean;
/**
 * Converts a Spark address to a specific Spark network.
 * If the address is already on the requested network, it returns the original address.
 * Otherwise, it extracts the public key and creates a new address for the target network.
 *
 * @param sparkAddress The Spark address to convert
 * @param targetNetwork The target Spark network
 * @returns The Spark address for the target network or null if conversion fails
 */
export declare function convertSparkAddressToSparkNetwork(sparkAddress: string, targetNetwork: SparkNetworkType): string | null;
/**
 * Encodes a public key and network into a Spark address
 * @param payload Object containing hex public key and network type
 * @returns Bech32m encoded Spark address
 * @deprecated Use encodeSparkAddressNew with SparkNetworkType instead
 */
export declare function encodeSparkAddress(payload: SparkAddressData): SparkAddressFormat;
/**
 * Decodes a Spark address to extract the public key
 * @param address Bech32m encoded Spark address
 * @param network Expected network type (used to check prefix)
 * @returns Hex-encoded public key
 * @throws Error if address format, prefix, or decoded key is invalid
 * @deprecated Use decodeSparkAddressNew with SparkNetworkType instead
 */
export declare function decodeSparkAddress(address: string, network: NetworkType): string;
/**
 * Attempts to determine the network type from a Spark address prefix.
 * @param address The potential Spark address.
 * @returns The NetworkType ('MAINNET', 'REGTEST', etc.) or null if the prefix is invalid.
 * @deprecated Use getSparkNetworkFromAddress instead
 */
export declare function getNetworkFromAddress(address: string): NetworkType | null;
/**
 * Checks if a string is a valid Spark address for *any* known network,
 * and optionally validates against a specific network.
 * @param address String to validate
 * @param network Optional specific network type to check against
 * @returns Boolean indicating validity
 * @deprecated Use isValidSparkAddressNew with SparkNetworkType instead
 */
export declare function isValidSparkAddress(address: string, network?: NetworkType): boolean;
/**
 * Converts a Spark address to a specific network.
 * If the address is already on the requested network, it returns the original address.
 * Otherwise, it extracts the public key and creates a new address for the target network.
 *
 * @param sparkAddress The Spark address to convert
 * @param targetNetwork The target network ('mainnet' or 'regtest')
 * @returns The Spark address for the target network or null if conversion fails
 * @deprecated Use convertSparkAddressToSparkNetwork with SparkNetworkType instead
 */
export declare function convertSparkAddressToNetwork(sparkAddress: string, targetNetwork: "mainnet" | "regtest"): string | null;
/**
 * Checks if a string looks like a valid hex-encoded public key (basic check).
 * Does NOT validate point on curve here, use isValidPublicKey for that.
 * @param key The potential public key hex string.
 * @returns True if it matches the basic format, false otherwise.
 */
export declare function looksLikePublicKey(key: string): boolean;
/**
 * Validates a secp256k1 public key format and curve point.
 * @param publicKey Hex-encoded public key
 * @throws Error if public key is invalid
 */
export declare function isValidPublicKey(publicKey: string): void;
export {};
//# sourceMappingURL=spark-address.d.ts.map
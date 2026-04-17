'use strict';

var bech32 = require('bech32');
var hex = require('./hex.js');

const SparkAddressNetworkPrefix = {
    MAINNET: "spark",
    TESTNET: "sparkt",
    REGTEST: "sparkrt",
    SIGNET: "sparks",
    LOCAL: "sparkl",
};
const SparkPrefixToNetwork = Object.fromEntries(Object.entries(SparkAddressNetworkPrefix).map(([network, prefix]) => [
    prefix,
    network,
]));
const SECP_256_K_1_PRIME_MOD = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
// BACKWARD COMPATIBILITY LAYER
/**
 * @deprecated Use SparkAddressNetworkPrefix instead
 */
const AddressNetworkPrefix = {
    MAINNET: "sp",
    TESTNET: "spt",
    REGTEST: "sprt",
    SIGNET: "sps",
    LOCAL: "spl",
};
/**
 * @deprecated Use SparkPrefixToNetwork instead
 */
const PrefixToNetwork = Object.fromEntries(Object.entries(AddressNetworkPrefix).map(([network, prefix]) => [
    prefix,
    network,
]));
// Map legacy prefixes to SparkNetworkType and combine with modern prefixes
const LegacySparkPrefixToNetwork = Object.fromEntries(Object.entries(AddressNetworkPrefix).map(([network, prefix]) => [
    prefix,
    network,
]));
const AllSparkPrefixToNetwork = {
    ...SparkPrefixToNetwork,
    ...LegacySparkPrefixToNetwork,
};
// Map modern prefixes back to legacy NetworkType and combine with legacy prefixes
const ModernPrefixToLegacyNetwork = Object.fromEntries(Object.entries(SparkAddressNetworkPrefix).map(([network, prefix]) => [
    prefix,
    network,
]));
const AllPrefixToLegacyNetwork = {
    ...PrefixToNetwork,
    ...ModernPrefixToLegacyNetwork,
};
/**
 * Simple implementation of protobuf-style encoding for SparkAddress
 * Field 1: identityPublicKey (bytes type)
 */
function encodeProto(publicKeyBytes) {
    // Calculate the total length: tag (1 byte) + length prefix (1 byte) + key bytes
    const length = 2 + publicKeyBytes.length;
    const result = new Uint8Array(length);
    // Field 1, wire type 2 (length-delimited) = tag 10 (1 << 3 | 2)
    result[0] = 10;
    // Length of the key bytes
    result[1] = publicKeyBytes.length;
    // Copy the key bytes
    result.set(publicKeyBytes, 2);
    return result;
}
/**
 * Simple implementation of protobuf-style decoding for SparkAddress
 */
function decodeProto(data) {
    let pos = 0;
    const result = {
        identityPublicKey: new Uint8Array(0),
    };
    while (pos < data.length) {
        // Read tag
        const tag = data[pos++];
        // Field 1, wire type 2 (length-delimited) = tag 10
        if (tag === 10) {
            // Read length
            const length = data[pos++] ?? 0;
            // Read bytes
            result.identityPublicKey = data.slice(pos, pos + length);
            pos += length;
        }
        else {
            // Skip unknown fields
            // For simplicity, we only handle field 1 and assume no other fields exist
            break;
        }
    }
    // Basic validation: check if a public key was actually decoded
    if (result.identityPublicKey.length === 0) {
        throw new Error("Failed to decode public key from proto bytes");
    }
    return result;
}
/**
 * Encodes a public key and Spark network into a Spark address
 * @param payload Object containing hex public key and Spark network type
 * @returns Bech32m encoded Spark address
 */
function encodeSparkAddressNew(payload) {
    isValidPublicKey(payload.identityPublicKey);
    // Convert hex public key to bytes
    const publicKeyBytes = hex.getUint8ArrayFromHex(payload.identityPublicKey);
    // Use proto-style encoding to match the original implementation
    const protoEncoded = encodeProto(publicKeyBytes);
    // Convert to bech32m words
    const words = bech32.bech32m.toWords(protoEncoded);
    // Encode with bech32m
    const prefix = SparkAddressNetworkPrefix[payload.network];
    const encoded = bech32.bech32m.encode(prefix, words, 200);
    return encoded;
}
/**
 * Decodes a Spark address to extract the public key using Spark network type
 * @param address Bech32m encoded Spark address
 * @param network Expected Spark network type (used to check prefix)
 * @returns Hex-encoded public key
 * @throws Error if address format, prefix, or decoded key is invalid
 */
function decodeSparkAddressNew(address, network) {
    const modernPrefix = SparkAddressNetworkPrefix[network];
    const legacyPrefix = AddressNetworkPrefix[network];
    const hasAllowedPrefix = !!address?.startsWith(modernPrefix) || !!address?.startsWith(legacyPrefix);
    if (!hasAllowedPrefix) {
        throw new Error(`Invalid Spark address: expected prefix ${modernPrefix} or ${legacyPrefix}`);
    }
    // Decode the bech32m address
    const sparkAddress = address;
    const decoded = bech32.bech32m.decode(sparkAddress, 200);
    // Convert words back to bytes
    const protoBytes = bech32.bech32m.fromWords(decoded.words);
    // Decode the proto format to get the SparkAddress
    const sparkAddressData = decodeProto(new Uint8Array(protoBytes));
    // Convert the public key bytes back to hex
    const publicKey = hex.getHexFromUint8Array(sparkAddressData.identityPublicKey);
    // Validate the extracted public key
    isValidPublicKey(publicKey);
    return publicKey;
}
/**
 * Attempts to determine the Spark network type from a Spark address prefix.
 * @param address The potential Spark address.
 * @returns The SparkNetworkType or null if the prefix is invalid.
 */
function getSparkNetworkFromAddress(address) {
    if (!address || typeof address !== "string") {
        return null;
    }
    const parts = address.split("1");
    if (parts.length < 2) {
        return null; // Missing separator '1'
    }
    const prefix = parts[0] ?? "";
    return AllSparkPrefixToNetwork[prefix] || null; // Return SparkNetworkType or null
}
/**
 * Checks if a string is a valid Spark address for *any* known Spark network,
 * and optionally validates against a specific Spark network.
 * @param address String to validate
 * @param network Optional specific Spark network type to check against
 * @returns Boolean indicating validity
 */
function isValidSparkAddressNew(address, network) {
    try {
        if (!address?.includes("1")) {
            return false;
        }
        const addressAsPossibleFormat = address;
        const decoded = bech32.bech32m.decode(addressAsPossibleFormat, 200);
        const prefix = decoded.prefix;
        // Check if prefix is known
        const networkFromPrefix = AllSparkPrefixToNetwork[prefix];
        if (!networkFromPrefix) {
            return false; // Unknown prefix
        }
        // If a specific network is required, check if it matches
        if (network && network !== networkFromPrefix) {
            return false;
        }
        // Try to decode the payload and validate the pubkey
        const protoBytes = bech32.bech32m.fromWords(decoded.words);
        const sparkAddressData = decodeProto(new Uint8Array(protoBytes));
        const publicKey = hex.getHexFromUint8Array(sparkAddressData.identityPublicKey);
        isValidPublicKey(publicKey); // Throws on invalid key
        return true; // All checks passed
    }
    catch (_error) {
        return false;
    }
}
/**
 * Converts a Spark address to a specific Spark network.
 * If the address is already on the requested network, it returns the original address.
 * Otherwise, it extracts the public key and creates a new address for the target network.
 *
 * @param sparkAddress The Spark address to convert
 * @param targetNetwork The target Spark network
 * @returns The Spark address for the target network or null if conversion fails
 */
function convertSparkAddressToSparkNetwork(sparkAddress, targetNetwork) {
    try {
        // Check if the address is valid
        if (!isValidSparkAddressNew(sparkAddress)) {
            return null;
        }
        // Extract the current network from the address
        const currentNetworkType = getSparkNetworkFromAddress(sparkAddress);
        if (!currentNetworkType) {
            return null;
        }
        // If already on the target network, return the original address
        if (currentNetworkType === targetNetwork) {
            return sparkAddress;
        }
        // Extract the public key from the address
        const decoded = bech32.bech32m.decode(sparkAddress, 200);
        const protoBytes = bech32.bech32m.fromWords(decoded.words);
        const sparkAddressData = decodeProto(new Uint8Array(protoBytes));
        const publicKey = hex.getHexFromUint8Array(sparkAddressData.identityPublicKey);
        // Create a new address for the target network
        return encodeSparkAddressNew({
            identityPublicKey: publicKey,
            network: targetNetwork,
        });
    }
    catch (_error) {
        return null;
    }
}
// BACKWARD COMPATIBILITY FUNCTIONS
/**
 * Encodes a public key and network into a Spark address
 * @param payload Object containing hex public key and network type
 * @returns Bech32m encoded Spark address
 * @deprecated Use encodeSparkAddressNew with SparkNetworkType instead
 */
function encodeSparkAddress(payload) {
    isValidPublicKey(payload.identityPublicKey);
    // Convert hex public key to bytes
    const publicKeyBytes = hex.getUint8ArrayFromHex(payload.identityPublicKey);
    // Use proto-style encoding to match the original implementation
    const protoEncoded = encodeProto(publicKeyBytes);
    // Convert to bech32m words
    const words = bech32.bech32m.toWords(protoEncoded);
    // Encode with bech32m
    const prefix = AddressNetworkPrefix[payload.network];
    const encoded = bech32.bech32m.encode(prefix, words, 200);
    return encoded;
}
/**
 * Decodes a Spark address to extract the public key
 * @param address Bech32m encoded Spark address
 * @param network Expected network type (used to check prefix)
 * @returns Hex-encoded public key
 * @throws Error if address format, prefix, or decoded key is invalid
 * @deprecated Use decodeSparkAddressNew with SparkNetworkType instead
 */
function decodeSparkAddress(address, network) {
    const legacyPrefix = AddressNetworkPrefix[network];
    const modernPrefix = SparkAddressNetworkPrefix[network];
    const hasAllowedPrefix = !!address?.startsWith(legacyPrefix) || !!address?.startsWith(modernPrefix);
    if (!hasAllowedPrefix) {
        throw new Error(`Invalid Spark address: expected prefix ${legacyPrefix} or ${modernPrefix}`);
    }
    // Decode the bech32m address
    const sparkAddress = address;
    const decoded = bech32.bech32m.decode(sparkAddress, 200);
    // Convert words back to bytes
    const protoBytes = bech32.bech32m.fromWords(decoded.words);
    // Decode the proto format to get the SparkAddress
    const sparkAddressData = decodeProto(new Uint8Array(protoBytes));
    // Convert the public key bytes back to hex
    const publicKey = hex.getHexFromUint8Array(sparkAddressData.identityPublicKey);
    // Validate the extracted public key
    isValidPublicKey(publicKey);
    return publicKey;
}
/**
 * Attempts to determine the network type from a Spark address prefix.
 * @param address The potential Spark address.
 * @returns The NetworkType ('MAINNET', 'REGTEST', etc.) or null if the prefix is invalid.
 * @deprecated Use getSparkNetworkFromAddress instead
 */
function getNetworkFromAddress(address) {
    if (!address || typeof address !== "string") {
        return null;
    }
    const parts = address.split("1");
    if (parts.length < 2) {
        return null; // Missing separator '1'
    }
    const prefix = parts[0] ?? "";
    return AllPrefixToLegacyNetwork[prefix] || null; // Return NetworkType or null
}
/**
 * Checks if a string is a valid Spark address for *any* known network,
 * and optionally validates against a specific network.
 * @param address String to validate
 * @param network Optional specific network type to check against
 * @returns Boolean indicating validity
 * @deprecated Use isValidSparkAddressNew with SparkNetworkType instead
 */
function isValidSparkAddress(address, network) {
    try {
        if (!address?.includes("1")) {
            return false;
        }
        const addressAsPossibleFormat = address;
        const decoded = bech32.bech32m.decode(addressAsPossibleFormat, 200);
        const prefix = decoded.prefix;
        // Check if prefix is known
        const networkFromPrefix = AllPrefixToLegacyNetwork[prefix];
        if (!networkFromPrefix) {
            return false; // Unknown prefix
        }
        // If a specific network is required, check if it matches
        if (network && network !== networkFromPrefix) {
            return false;
        }
        // Try to decode the payload and validate the pubkey
        const protoBytes = bech32.bech32m.fromWords(decoded.words);
        const sparkAddressData = decodeProto(new Uint8Array(protoBytes));
        const publicKey = hex.getHexFromUint8Array(sparkAddressData.identityPublicKey);
        isValidPublicKey(publicKey); // Throws on invalid key
        return true; // All checks passed
    }
    catch (_error) {
        return false;
    }
}
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
function convertSparkAddressToNetwork(sparkAddress, targetNetwork) {
    try {
        // Check if the address is valid
        if (!isValidSparkAddress(sparkAddress)) {
            return null;
        }
        // Extract the current network from the address
        const currentNetworkType = getNetworkFromAddress(sparkAddress);
        if (!currentNetworkType) {
            return null;
        }
        // Map the input string to NetworkType
        const targetNetworkType = targetNetwork === "mainnet" ? "MAINNET" : "REGTEST";
        // If already on the target network, return the original address
        if (currentNetworkType === targetNetworkType) {
            return sparkAddress;
        }
        // Extract the public key from the address
        const decoded = bech32.bech32m.decode(sparkAddress, 200);
        const protoBytes = bech32.bech32m.fromWords(decoded.words);
        const sparkAddressData = decodeProto(new Uint8Array(protoBytes));
        const publicKey = hex.getHexFromUint8Array(sparkAddressData.identityPublicKey);
        // Create a new address for the target network
        return encodeSparkAddress({
            identityPublicKey: publicKey,
            network: targetNetworkType,
        });
    }
    catch (_error) {
        return null;
    }
}
/**
 * Checks if a string looks like a valid hex-encoded public key (basic check).
 * Does NOT validate point on curve here, use isValidPublicKey for that.
 * @param key The potential public key hex string.
 * @returns True if it matches the basic format, false otherwise.
 */
function looksLikePublicKey(key) {
    if (!key || typeof key !== "string") {
        return false;
    }
    return key.length === 66 && /^(02|03)[0-9a-fA-F]{64}$/.test(key);
}
/**
 * Validates a secp256k1 public key format and curve point.
 * @param publicKey Hex-encoded public key
 * @throws Error if public key is invalid
 */
function isValidPublicKey(publicKey) {
    if (!looksLikePublicKey(publicKey)) {
        throw new Error("Invalid public key format/length.");
    }
    const xComponent = BigInt(`0x${publicKey.substring(2)}`);
    if (xComponent === 0n || xComponent >= SECP_256_K_1_PRIME_MOD) {
        throw new Error("Invalid public key point: x coordinate outside curve modulus");
    }
}

exports.convertSparkAddressToNetwork = convertSparkAddressToNetwork;
exports.convertSparkAddressToSparkNetwork = convertSparkAddressToSparkNetwork;
exports.decodeSparkAddress = decodeSparkAddress;
exports.decodeSparkAddressNew = decodeSparkAddressNew;
exports.encodeSparkAddress = encodeSparkAddress;
exports.encodeSparkAddressNew = encodeSparkAddressNew;
exports.getNetworkFromAddress = getNetworkFromAddress;
exports.getSparkNetworkFromAddress = getSparkNetworkFromAddress;
exports.isValidPublicKey = isValidPublicKey;
exports.isValidSparkAddress = isValidSparkAddress;
exports.isValidSparkAddressNew = isValidSparkAddressNew;
exports.looksLikePublicKey = looksLikePublicKey;
//# sourceMappingURL=spark-address.js.map

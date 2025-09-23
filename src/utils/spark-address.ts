import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { bech32m } from "@scure/base";
import type { NetworkType, SparkNetworkType } from "../types";

// Simple interface just storing the public key bytes
interface SparkAddress {
  identityPublicKey: Uint8Array;
}

const SparkAddressNetworkPrefix: Record<SparkNetworkType, string> = {
  MAINNET: "spark",
  TESTNET: "sparkt",
  REGTEST: "sparkrt",
  SIGNET: "sparks",
  LOCAL: "sparkl",
} as const;

const SparkPrefixToNetwork: Record<string, SparkNetworkType> =
  Object.fromEntries(
    Object.entries(SparkAddressNetworkPrefix).map(([network, prefix]) => [
      prefix,
      network as SparkNetworkType,
    ])
  );

export type SparkAddressFormat =
  `${(typeof SparkAddressNetworkPrefix)[keyof typeof SparkAddressNetworkPrefix]}1${string}`;

export interface SparkAddressDataNew {
  identityPublicKey: string;
  network: SparkNetworkType;
}

// ===== BACKWARD COMPATIBILITY LAYER =====

/**
 * @deprecated Use SparkAddressNetworkPrefix instead
 */
const AddressNetworkPrefix: Record<NetworkType, string> = {
  MAINNET: "sp",
  TESTNET: "spt",
  REGTEST: "sprt",
  SIGNET: "sps",
  LOCAL: "spl",
} as const;

/**
 * @deprecated Use SparkPrefixToNetwork instead
 */
const PrefixToNetwork: Record<string, NetworkType> = Object.fromEntries(
  Object.entries(AddressNetworkPrefix).map(([network, prefix]) => [
    prefix,
    network as NetworkType,
  ])
);

export interface SparkAddressData {
  identityPublicKey: string;
  /** @deprecated Use SparkNetworkType instead */
  network: NetworkType;
}

/**
 * Simple implementation of protobuf-style encoding for SparkAddress
 * Field 1: identityPublicKey (bytes type)
 */
function encodeProto(publicKeyBytes: Uint8Array): Uint8Array {
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
function decodeProto(data: Uint8Array): SparkAddress {
  let pos = 0;
  const result: SparkAddress = {
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
    } else {
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
export function encodeSparkAddressNew(
  payload: SparkAddressDataNew
): SparkAddressFormat {
  isValidPublicKey(payload.identityPublicKey);

  // Convert hex public key to bytes
  const publicKeyBytes = hexToBytes(payload.identityPublicKey);

  // Use proto-style encoding to match the original implementation
  const protoEncoded = encodeProto(publicKeyBytes);

  // Convert to bech32m words
  const words = bech32m.toWords(protoEncoded);

  // Encode with bech32m
  const prefix = SparkAddressNetworkPrefix[payload.network];
  const encoded = bech32m.encode(prefix, words, 200);

  return encoded as SparkAddressFormat;
}

/**
 * Decodes a Spark address to extract the public key using Spark network type
 * @param address Bech32m encoded Spark address
 * @param network Expected Spark network type (used to check prefix)
 * @returns Hex-encoded public key
 * @throws Error if address format, prefix, or decoded key is invalid
 */
export function decodeSparkAddressNew(
  address: string,
  network: SparkNetworkType
): string {
  const prefix = SparkAddressNetworkPrefix[network];
  if (!address?.startsWith(prefix)) {
    throw new Error(`Invalid Spark address: expected prefix ${prefix}`);
  }

  // Decode the bech32m address
  const sparkAddress = address as SparkAddressFormat;
  const decoded = bech32m.decode(sparkAddress, 200);

  // Convert words back to bytes
  const protoBytes = bech32m.fromWords(decoded.words);

  // Decode the proto format to get the SparkAddress
  const sparkAddressData = decodeProto(protoBytes);

  // Convert the public key bytes back to hex
  const publicKey = bytesToHex(sparkAddressData.identityPublicKey);

  // Validate the extracted public key
  isValidPublicKey(publicKey);

  return publicKey;
}

/**
 * Attempts to determine the Spark network type from a Spark address prefix.
 * @param address The potential Spark address.
 * @returns The SparkNetworkType or null if the prefix is invalid.
 */
export function getSparkNetworkFromAddress(
  address: string
): SparkNetworkType | null {
  if (!address || typeof address !== "string") {
    return null;
  }
  const parts = address.split("1");
  if (parts.length < 2) {
    return null; // Missing separator '1'
  }
  const prefix = parts[0] ?? "";
  return SparkPrefixToNetwork[prefix] || null; // Return SparkNetworkType or null
}

/**
 * Checks if a string is a valid Spark address for *any* known Spark network,
 * and optionally validates against a specific Spark network.
 * @param address String to validate
 * @param network Optional specific Spark network type to check against
 * @returns Boolean indicating validity
 */
export function isValidSparkAddressNew(
  address: string,
  network?: SparkNetworkType
): boolean {
  try {
    if (!address?.includes("1")) {
      return false;
    }

    const addressAsPossibleFormat = address as SparkAddressFormat;
    const decoded = bech32m.decode(addressAsPossibleFormat, 200);
    const prefix = decoded.prefix;

    // Check if prefix is known
    const networkFromPrefix = SparkPrefixToNetwork[prefix];
    if (!networkFromPrefix) {
      return false; // Unknown prefix
    }

    // If a specific network is required, check if it matches
    if (network && network !== networkFromPrefix) {
      return false;
    }

    // Try to decode the payload and validate the pubkey
    const protoBytes = bech32m.fromWords(decoded.words);
    const sparkAddressData = decodeProto(protoBytes);
    const publicKey = bytesToHex(sparkAddressData.identityPublicKey);
    isValidPublicKey(publicKey); // Throws on invalid key

    return true; // All checks passed
  } catch (_error: unknown) {
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
export function convertSparkAddressToSparkNetwork(
  sparkAddress: string,
  targetNetwork: SparkNetworkType
): string | null {
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
    const decoded = bech32m.decode(sparkAddress as SparkAddressFormat, 200);
    const protoBytes = bech32m.fromWords(decoded.words);
    const sparkAddressData = decodeProto(protoBytes);
    const publicKey = bytesToHex(sparkAddressData.identityPublicKey);

    // Create a new address for the target network
    return encodeSparkAddressNew({
      identityPublicKey: publicKey,
      network: targetNetwork,
    });
  } catch (_error: unknown) {
    return null;
  }
}

// ===== BACKWARD COMPATIBILITY FUNCTIONS =====

/**
 * Encodes a public key and network into a Spark address
 * @param payload Object containing hex public key and network type
 * @returns Bech32m encoded Spark address
 * @deprecated Use encodeSparkAddressNew with SparkNetworkType instead
 */
export function encodeSparkAddress(
  payload: SparkAddressData
): SparkAddressFormat {
  isValidPublicKey(payload.identityPublicKey);

  // Convert hex public key to bytes
  const publicKeyBytes = hexToBytes(payload.identityPublicKey);

  // Use proto-style encoding to match the original implementation
  const protoEncoded = encodeProto(publicKeyBytes);

  // Convert to bech32m words
  const words = bech32m.toWords(protoEncoded);

  // Encode with bech32m
  const prefix = AddressNetworkPrefix[payload.network];
  const encoded = bech32m.encode(prefix, words, 200);

  return encoded as SparkAddressFormat;
}

/**
 * Decodes a Spark address to extract the public key
 * @param address Bech32m encoded Spark address
 * @param network Expected network type (used to check prefix)
 * @returns Hex-encoded public key
 * @throws Error if address format, prefix, or decoded key is invalid
 * @deprecated Use decodeSparkAddressNew with SparkNetworkType instead
 */
export function decodeSparkAddress(
  address: string,
  network: NetworkType
): string {
  const prefix = AddressNetworkPrefix[network];
  if (!address?.startsWith(prefix)) {
    throw new Error(`Invalid Spark address: expected prefix ${prefix}`);
  }

  // Decode the bech32m address
  const sparkAddress = address as SparkAddressFormat;
  const decoded = bech32m.decode(sparkAddress, 200);

  // Convert words back to bytes
  const protoBytes = bech32m.fromWords(decoded.words);

  // Decode the proto format to get the SparkAddress
  const sparkAddressData = decodeProto(protoBytes);

  // Convert the public key bytes back to hex
  const publicKey = bytesToHex(sparkAddressData.identityPublicKey);

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
export function getNetworkFromAddress(address: string): NetworkType | null {
  if (!address || typeof address !== "string") {
    return null;
  }
  const parts = address.split("1");
  if (parts.length < 2) {
    return null; // Missing separator '1'
  }
  const prefix = parts[0] ?? "";
  return PrefixToNetwork[prefix] || null; // Return NetworkType or null
}

/**
 * Checks if a string is a valid Spark address for *any* known network,
 * and optionally validates against a specific network.
 * @param address String to validate
 * @param network Optional specific network type to check against
 * @returns Boolean indicating validity
 * @deprecated Use isValidSparkAddressNew with SparkNetworkType instead
 */
export function isValidSparkAddress(
  address: string,
  network?: NetworkType
): boolean {
  try {
    if (!address?.includes("1")) {
      return false;
    }

    const addressAsPossibleFormat = address as SparkAddressFormat;
    const decoded = bech32m.decode(addressAsPossibleFormat, 200);
    const prefix = decoded.prefix;

    // Check if prefix is known
    const networkFromPrefix = PrefixToNetwork[prefix];
    if (!networkFromPrefix) {
      return false; // Unknown prefix
    }

    // If a specific network is required, check if it matches
    if (network && network !== networkFromPrefix) {
      return false;
    }

    // Try to decode the payload and validate the pubkey
    const protoBytes = bech32m.fromWords(decoded.words);
    const sparkAddressData = decodeProto(protoBytes);
    const publicKey = bytesToHex(sparkAddressData.identityPublicKey);
    isValidPublicKey(publicKey); // Throws on invalid key

    return true; // All checks passed
  } catch (_error: unknown) {
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
export function convertSparkAddressToNetwork(
  sparkAddress: string,
  targetNetwork: "mainnet" | "regtest"
): string | null {
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
    const targetNetworkType: NetworkType =
      targetNetwork === "mainnet" ? "MAINNET" : "REGTEST";

    // If already on the target network, return the original address
    if (currentNetworkType === targetNetworkType) {
      return sparkAddress;
    }

    // Extract the public key from the address
    const decoded = bech32m.decode(sparkAddress as SparkAddressFormat, 200);
    const protoBytes = bech32m.fromWords(decoded.words);
    const sparkAddressData = decodeProto(protoBytes);
    const publicKey = bytesToHex(sparkAddressData.identityPublicKey);

    // Create a new address for the target network
    return encodeSparkAddress({
      identityPublicKey: publicKey,
      network: targetNetworkType,
    });
  } catch (_error: unknown) {
    return null;
  }
}

/**
 * Checks if a string looks like a valid hex-encoded public key (basic check).
 * Does NOT validate point on curve here, use isValidPublicKey for that.
 * @param key The potential public key hex string.
 * @returns True if it matches the basic format, false otherwise.
 */
export function looksLikePublicKey(key: string): boolean {
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
export function isValidPublicKey(publicKey: string) {
  if (!looksLikePublicKey(publicKey)) {
    throw new Error("Invalid public key format/length.");
  }
  try {
    const point = secp256k1.Point.fromHex(publicKey);
    point.assertValidity();
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Invalid public key point: ${errorMessage}`);
  }
}

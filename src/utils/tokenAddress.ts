import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { bech32m } from "@scure/base";
import type { NetworkType, SparkNetworkType } from "../types";

const SparkHumanReadableTokenIdentifierNetworkPrefix: Record<
  SparkNetworkType,
  string
> = {
  MAINNET: "btkn",
  REGTEST: "btknrt",
  TESTNET: "btknt",
  SIGNET: "btkns",
  LOCAL: "btknl",
};

export type SparkHumanReadableTokenIdentifier =
  | `btkn1${string}`
  | `btknrt1${string}`
  | `btknt1${string}`
  | `btkns1${string}`
  | `btknl1${string}`;

/**
 * Encode token identifier using Spark network type
 * @param tokenIdentifier Token identifier as hex string or Uint8Array
 * @param network Spark network type
 * @returns Human-readable token identifier
 */
export function encodeSparkHumanReadableTokenIdentifier(
  tokenIdentifier: string | Uint8Array,
  network: SparkNetworkType
): SparkHumanReadableTokenIdentifier {
  try {
    // Convert hex string to bytes if needed
    const tokenIdentifierBytes =
      typeof tokenIdentifier === "string"
        ? hexToBytes(tokenIdentifier)
        : tokenIdentifier;

    const words = bech32m.toWords(tokenIdentifierBytes);
    return bech32m.encode(
      SparkHumanReadableTokenIdentifierNetworkPrefix[network],
      words,
      500
    ) as SparkHumanReadableTokenIdentifier;
  } catch {
    throw new Error("Failed to encode Spark human readable token identifier");
  }
}

/**
 * Decode human-readable token identifier using Spark network type
 * @param humanReadableTokenIdentifier Human-readable token identifier
 * @param network Expected Spark network type
 * @returns Object containing token identifier and network
 */
export function decodeSparkHumanReadableTokenIdentifier(
  humanReadableTokenIdentifier: SparkHumanReadableTokenIdentifier,
  network: SparkNetworkType
): { tokenIdentifier: string; network: SparkNetworkType } {
  try {
    const decoded = bech32m.decode(
      humanReadableTokenIdentifier as SparkHumanReadableTokenIdentifier,
      500
    );

    if (
      decoded.prefix !== SparkHumanReadableTokenIdentifierNetworkPrefix[network]
    ) {
      throw new Error(
        `Invalid Spark human readable token identifier prefix, expected '${SparkHumanReadableTokenIdentifierNetworkPrefix[network]}' but got '${decoded.prefix}'`
      );
    }

    const tokenIdentifier = bech32m.fromWords(decoded.words);

    return {
      tokenIdentifier: bytesToHex(tokenIdentifier),
      network,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to decode Spark human readable token identifier");
  }
}

// ===== BACKWARD COMPATIBILITY LAYER =====

/**
 * @deprecated Use SparkHumanReadableTokenIdentifierNetworkPrefix instead
 */
const HumanReadableTokenIdentifierNetworkPrefix: Record<NetworkType, string> = {
  MAINNET: "btkn",
  REGTEST: "btknrt",
  TESTNET: "btknt",
  SIGNET: "btkns",
  LOCAL: "btknl",
};

/**
 * @deprecated Use SparkHumanReadableTokenIdentifier instead
 */
export type HumanReadableTokenIdentifier =
  | `btkn1${string}`
  | `btknrt1${string}`
  | `btknt1${string}`
  | `btkns1${string}`
  | `btknl1${string}`;

/**
 * @deprecated Use encodeSparkHumanReadableTokenIdentifier with SparkNetworkType instead
 */
export function encodeHumanReadableTokenIdentifier(
  tokenIdentifier: string | Uint8Array,
  network: NetworkType
): HumanReadableTokenIdentifier {
  try {
    // Convert hex string to bytes if needed
    const tokenIdentifierBytes =
      typeof tokenIdentifier === "string"
        ? hexToBytes(tokenIdentifier)
        : tokenIdentifier;

    const words = bech32m.toWords(tokenIdentifierBytes);
    return bech32m.encode(
      HumanReadableTokenIdentifierNetworkPrefix[network],
      words,
      500
    ) as HumanReadableTokenIdentifier;
  } catch {
    throw new Error("Failed to encode human readable token identifier");
  }
}

/**
 * @deprecated Use decodeSparkHumanReadableTokenIdentifier with SparkNetworkType instead
 */
export function decodeHumanReadableTokenIdentifier(
  humanReadableTokenIdentifier: HumanReadableTokenIdentifier,
  network: NetworkType
): { tokenIdentifier: string; network: NetworkType } {
  try {
    const decoded = bech32m.decode(
      humanReadableTokenIdentifier as HumanReadableTokenIdentifier,
      500
    );

    if (decoded.prefix !== HumanReadableTokenIdentifierNetworkPrefix[network]) {
      throw new Error(
        `Invalid human readable token identifier prefix, expected '${HumanReadableTokenIdentifierNetworkPrefix[network]}' but got '${decoded.prefix}'`
      );
    }

    const tokenIdentifier = bech32m.fromWords(decoded.words);

    return {
      tokenIdentifier: bytesToHex(tokenIdentifier),
      network,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to decode human readable token identifier");
  }
}

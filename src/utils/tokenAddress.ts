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

const NETWORK_MAGIC = {
  MAINNET: 3652501241,
  TESTNET: 118034699,
  REGTEST: 3669344250,
  SIGNET: 1294402529,
};

export const SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY =
  "0205fe807e8fe1f368df955cc291f16d840b7f28374b0ed80b80c3e2e0921a0674";

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

async function sha256(buffer: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
}

function bigintTo16ByteArray(value: bigint) {
  let valueToTrack = value;
  const buffer = new Uint8Array(16);
  for (let i = 15; i >= 0 && valueToTrack > 0n; i--) {
    buffer[i] = Number(valueToTrack & 255n);
    valueToTrack >>= 8n;
  }
  return buffer;
}

export async function getTokenIdentifier(token: {
  issuerPublicKey: string;
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: bigint;
  isFreezable: boolean;
  network: keyof typeof NETWORK_MAGIC;
  creationEntityPublicKey: string;
}): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const allHashes = [
    await sha256(new Uint8Array([1])),
    await sha256(hexToBytes(token.issuerPublicKey)),
    await sha256(encoder.encode(token.name)),
    await sha256(encoder.encode(token.ticker)),
    await sha256(new Uint8Array([token.decimals])),
  ];

  const maxSupplyBytes = bigintTo16ByteArray(token.maxSupply);
  if (maxSupplyBytes.length !== 16) {
    throw Error(
      `Max supply must be exactly 16 bytes, got ${maxSupplyBytes.length}`
    );
  }
  allHashes.push(await sha256(maxSupplyBytes));
  allHashes.push(await sha256(new Uint8Array([token.isFreezable ? 1 : 0])));

  const networkMagic = NETWORK_MAGIC[token.network];
  const networkBytes = new Uint8Array(4);
  new DataView(networkBytes.buffer).setUint32(0, networkMagic, false);
  allHashes.push(await sha256(networkBytes));

  const creationEntityBytes = hexToBytes(token.creationEntityPublicKey);
  const isL1 =
    !creationEntityBytes ||
    (creationEntityBytes.length === 33 &&
      creationEntityBytes.every((byte) => byte === 0));

  if (isL1) {
    allHashes.push(await sha256(new Uint8Array([1])));
  } else {
    const layerData = new Uint8Array(34);
    layerData[0] = 2;
    layerData.set(creationEntityBytes, 1);
    allHashes.push(await sha256(layerData));
  }

  const concatenated = new Uint8Array(
    allHashes.reduce((acc, h) => acc + h.length, 0)
  );
  let offset = 0;
  for (const h of allHashes) {
    concatenated.set(h, offset);
    offset += h.length;
  }

  return await sha256(concatenated);
}

export async function getHumanReadableTokenIdentifier(token: {
  issuerPublicKey: string;
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: bigint;
  isFreezable: boolean;
  network: keyof typeof NETWORK_MAGIC;
  creationEntityPublicKey: string;
}): Promise<SparkHumanReadableTokenIdentifier> {
  return encodeSparkHumanReadableTokenIdentifier(
    await getTokenIdentifier(token),
    token.network
  );
}

import { bech32m } from "@scure/base";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { NetworkType } from "../types";

const HumanReadableTokenIdentifierNetworkPrefix: Record<NetworkType, string> = {
  MAINNET: "btkn",
  REGTEST: "btknrt",
  TESTNET: "btknt",
  SIGNET: "btkns",
  LOCAL: "btknl",
};

export type HumanReadableTokenIdentifier =
  | `btkn1${string}`
  | `btknrt1${string}`
  | `btknt1${string}`
  | `btkns1${string}`
  | `btknl1${string}`;

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

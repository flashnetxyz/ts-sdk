import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export function getHexFromUint8Array(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

export function getUint8ArrayFromHex(hex: string): Uint8Array {
  return hexToBytes(hex);
}


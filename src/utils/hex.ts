export function getHexFromUint8Array(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getUint8ArrayFromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) {
    throw new Error("Invalid hex string");
  }

  return Uint8Array.from(
    hex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );
}

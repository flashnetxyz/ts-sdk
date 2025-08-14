import { randomUUID } from "crypto";

export * from "./auth";
export * from "./intents";
export * from "./spark-address";

// Helper function to generate UUID (nonce)
export function generateNonce(): string {
  return randomUUID();
}

// Helper function to convert decimal amounts to smallest units
export function toSmallestUnit(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * 10 ** decimals));
}

// Helper function to convert from smallest units to decimal
export function fromSmallestUnit(
  amount: bigint | string | number,
  decimals: number
): number {
  const bigintAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  return Number(bigintAmount) / 10 ** decimals;
}

// Helper function to compare two non-negative decimal strings.
// Returns -1 if a < b, 0 if equal, and 1 if a > b.
export function compareDecimalStrings(a: string, b: string): number {
  const normalize = (s: string): [string, string] => {
    const [whole = "", fraction = ""] = s.split(".");
    const wholeClean = whole.replace(/^0+/, "") || "0";
    const fractionClean = fraction.replace(/0+$/, "");
    return [wholeClean, fractionClean];
  };

  const [wholeA, fracA] = normalize(a);
  const [wholeB, fracB] = normalize(b);

  // Compare integer part length
  if (wholeA.length !== wholeB.length) {
    return wholeA.length < wholeB.length ? -1 : 1;
  }

  // Compare integer parts lexicographically
  if (wholeA !== wholeB) {
    return wholeA < wholeB ? -1 : 1;
  }

  // Integers are equal – compare fractional parts
  const maxFracLen = Math.max(fracA.length, fracB.length);
  const fracAPadded = fracA.padEnd(maxFracLen, "0");
  const fracBPadded = fracB.padEnd(maxFracLen, "0");

  if (fracAPadded === fracBPadded) {
    return 0;
  }
  return fracAPadded < fracBPadded ? -1 : 1;
}

// Export the createWalletSigner utility
export { createWalletSigner } from "../utils/signer";

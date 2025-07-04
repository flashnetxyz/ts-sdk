export * from "./auth";
export * from "./intents";
export * from "./spark-address";

// Helper function to generate UUID (nonce)
export function generateNonce(): string {
  return crypto.randomUUID();
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

// Export the createWalletSigner utility
export { createWalletSigner } from "../utils/signer";

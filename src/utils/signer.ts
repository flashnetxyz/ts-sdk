import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import type { Signer } from "../types";

/**
 * Creates a Signer implementation from a SparkWallet
 * This allows using SparkWallet's signing capabilities through the generic Signer interface
 *
 * @param wallet - The SparkWallet instance
 * @returns A Signer implementation
 */
export function createWalletSigner(
  wallet: IssuerSparkWallet | SparkWallet
): Signer {
  return {
    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      // @ts-expect-error - accessing internal wallet API
      const signature = await wallet.config.signer.signMessageWithIdentityKey(
        message,
        true
      );
      return signature;
    },
  };
}

/**
 * Example of a custom signer implementation using a private key
 * This is just an example - users would implement their own signers
 *
 * @example
 * ```typescript
 * class PrivateKeySigner implements Signer {
 *   constructor(private privateKey: Uint8Array) {}
 *
 *   async signMessage(message: Uint8Array): Promise<Uint8Array> {
 *     // Implementation would use the private key to sign the message
 *     // This is just a placeholder
 *     throw new Error("Not implemented - use your own signing library");
 *   }
 * }
 * ```
 */

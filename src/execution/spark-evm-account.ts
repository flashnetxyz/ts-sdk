/**
 * SparkWallet → viem LocalAccount adapter
 *
 * Derives an EVM signing account from a SparkWallet's identity key.
 * Convention: the Spark identity key IS the EVM signing key — one key,
 * one identity, deterministic EVM address from Spark pubkey.
 *
 * No Spark SDK modifications required. Uses the existing
 * `signMessageWithIdentityKey(message, compact)` and
 * `getIdentityPublicKey()` methods.
 *
 * @example
 * ```typescript
 * import { sparkWalletToEvmAccount } from "@flashnet/sdk";
 *
 * const account = await sparkWalletToEvmAccount(sparkWallet);
 * console.log(account.address); // deterministic EVM address
 * ```
 */

import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import {
  type Address,
  type Hex,
  type SignableMessage,
  hashMessage,
  keccak256,
  recoverAddress,
  serializeTransaction,
  toHex,
} from "viem";
import { toAccount, type LocalAccount } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";

/** Accepted wallet types */
export type SparkWalletInput = SparkWallet | IssuerSparkWallet;

/** Internal signer interface extracted from SparkWallet. */
interface SparkSigner {
  getIdentityPublicKey(): Promise<Uint8Array>;
  signMessageWithIdentityKey(
    message: Uint8Array,
    compact?: boolean
  ): Promise<Uint8Array>;
}

/**
 * Extract the signer from a SparkWallet.
 * SparkWallet.config is protected, so we cast through any
 */
export function getWalletSigner(wallet: SparkWalletInput): SparkSigner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (wallet as any).config.signer;
}

/**
 * Derive an EVM address from a 33-byte compressed secp256k1 public key.
 * EVM address = keccak256(uncompressed[1:])[12:]
 */
function evmAddressFromCompressedPubkey(compressed: Uint8Array): Address {
  const point = secp256k1.ProjectivePoint.fromHex(compressed);
  const uncompressed = point.toRawBytes(false); // 65 bytes: 04 + x + y
  const hash = keccak256(toHex(uncompressed.slice(1)));
  return `0x${hash.slice(-40)}` as Address;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Sign a 32-byte hash with the SparkWallet identity key and recover
 * the yParity (v) value by trying both 0 and 1.
 */
async function signHash(
  signer: SparkSigner,
  hash: Hex,
  expectedAddress: Address
): Promise<{ r: Hex; s: Hex; yParity: number }> {
  const hashBytes = hexToBytes(hash);
  const compact = await signer.signMessageWithIdentityKey(hashBytes, true);
  const r = toHex(compact.slice(0, 32));
  const s = toHex(compact.slice(32, 64));

  // Try yParity=0, check if it recovers to our address
  try {
    const recovered = await recoverAddress({
      hash,
      signature: { r, s, yParity: 0 },
    });
    if (recovered.toLowerCase() === expectedAddress.toLowerCase()) {
      return { r, s, yParity: 0 };
    }
  } catch {
    // yParity=0 didn't work
  }

  return { r, s, yParity: 1 };
}

/**
 * Create a viem `LocalAccount` from a SparkWallet.
 *
 * The account uses the wallet's identity key for EVM transaction signing.
 * The EVM address is deterministically derived from the identity public key.
 *
 * @param wallet - A SparkWallet or IssuerSparkWallet instance
 * @returns A viem LocalAccount that can be used with any viem API
 */
export async function sparkWalletToEvmAccount(
  wallet: SparkWalletInput
): Promise<LocalAccount> {
  const signer = getWalletSigner(wallet);
  const compressedPubkey = await signer.getIdentityPublicKey();
  const address = evmAddressFromCompressedPubkey(compressedPubkey);

  const account = toAccount({
    address,

    async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
      const hash = hashMessage(message);
      const { r, s, yParity } = await signHash(signer, hash, address);
      const v = yParity === 0 ? "1b" : "1c";
      return `0x${r.slice(2)}${s.slice(2)}${v}` as Hex;
    },

    async signTransaction(transaction: any): Promise<Hex> {
      const serialized = serializeTransaction(transaction);
      const hash = keccak256(serialized);
      const { r, s, yParity } = await signHash(signer, hash, address);

      return serializeTransaction(transaction, {
        r,
        s,
        yParity,
      } as any) as Hex;
    },

    async signTypedData(): Promise<Hex> {
      throw new Error(
        "signTypedData not yet implemented for SparkWallet EVM accounts"
      );
    },
  });

  return account as LocalAccount;
}

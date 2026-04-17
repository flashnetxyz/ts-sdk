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
import { type LocalAccount } from "viem/accounts";
/** Accepted wallet types */
export type SparkWalletInput = SparkWallet | IssuerSparkWallet;
/** Internal signer interface extracted from SparkWallet. */
interface SparkSigner {
    getIdentityPublicKey(): Promise<Uint8Array>;
    signMessageWithIdentityKey(message: Uint8Array, compact?: boolean): Promise<Uint8Array>;
}
/**
 * Extract the signer from a SparkWallet.
 *
 * `SparkWallet.config` is protected in the upstream Spark SDK, so we reach
 * through `as any` and validate the shape at runtime. If the SparkWallet
 * is ever refactored to rename `config.signer`, this guard turns a silent
 * runtime failure ("getIdentityPublicKey is not a function") into an
 * actionable error at the entry point.
 */
export declare function getWalletSigner(wallet: SparkWalletInput): SparkSigner;
/**
 * Create a viem `LocalAccount` from a SparkWallet.
 *
 * The account uses the wallet's identity key for EVM transaction signing.
 * The EVM address is deterministically derived from the identity public key.
 *
 * @param wallet - A SparkWallet or IssuerSparkWallet instance
 * @returns A viem LocalAccount that can be used with any viem API
 */
export declare function sparkWalletToEvmAccount(wallet: SparkWalletInput): Promise<LocalAccount>;
export {};
//# sourceMappingURL=spark-evm-account.d.ts.map
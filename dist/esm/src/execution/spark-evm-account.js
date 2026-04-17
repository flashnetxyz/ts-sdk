import { hashTypedData, serializeTransaction, keccak256, hashMessage, toHex, recoverAddress } from 'viem';
import { toAccount } from 'viem/accounts';
import { secp256k1 } from '@noble/curves/secp256k1';

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
/**
 * Extract the signer from a SparkWallet.
 *
 * `SparkWallet.config` is protected in the upstream Spark SDK, so we reach
 * through `as any` and validate the shape at runtime. If the SparkWallet
 * is ever refactored to rename `config.signer`, this guard turns a silent
 * runtime failure ("getIdentityPublicKey is not a function") into an
 * actionable error at the entry point.
 */
function getWalletSigner(wallet) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeSigner = wallet?.config?.signer;
    if (!maybeSigner ||
        typeof maybeSigner.getIdentityPublicKey !== "function" ||
        typeof maybeSigner.signMessageWithIdentityKey !== "function") {
        throw new Error("SparkWallet does not expose the expected `config.signer` shape " +
            "(getIdentityPublicKey, signMessageWithIdentityKey). Likely the " +
            "upstream SparkWallet internals were refactored — update the SDK " +
            "or pin to a compatible @buildonspark/spark-sdk version.");
    }
    return maybeSigner;
}
/**
 * Derive an EVM address from a 33-byte compressed secp256k1 public key.
 * EVM address = keccak256(uncompressed[1:])[12:]
 */
function evmAddressFromCompressedPubkey(compressed) {
    const point = secp256k1.ProjectivePoint.fromHex(compressed);
    const uncompressed = point.toRawBytes(false); // 65 bytes: 04 + x + y
    const hash = keccak256(toHex(uncompressed.slice(1)));
    return `0x${hash.slice(-40)}`;
}
function hexToBytes(hex) {
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
async function signHash(signer, hash, expectedAddress) {
    const hashBytes = hexToBytes(hash);
    const compact = await signer.signMessageWithIdentityKey(hashBytes, true);
    const r = toHex(compact.slice(0, 32));
    const s = toHex(compact.slice(32, 64));
    const expectedLower = expectedAddress.toLowerCase();
    // Try yParity=0
    try {
        const recovered = await recoverAddress({
            hash,
            signature: { r, s, yParity: 0 },
        });
        if (recovered.toLowerCase() === expectedLower) {
            return { r, s, yParity: 0 };
        }
    }
    catch {
        // yParity=0 failed to recover at all — fall through to try yParity=1
    }
    // Try yParity=1
    try {
        const recovered = await recoverAddress({
            hash,
            signature: { r, s, yParity: 1 },
        });
        if (recovered.toLowerCase() === expectedLower) {
            return { r, s, yParity: 1 };
        }
    }
    catch {
        // yParity=1 also failed — malformed signature or wrong key
    }
    // Neither yParity value produced a recovery matching the expected
    // address. Returning a bogus signature here would fail signer recovery
    // on the node and surface as an opaque flagged-tx decode error;
    // throwing here makes the cause debuggable.
    throw new Error(`sparkWalletToEvmAccount: signature does not recover to ${expectedAddress} ` +
        `with either yParity. Likely the SparkWallet signed with a key that ` +
        `does not match the identity pubkey, or the signature is malformed.`);
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
async function sparkWalletToEvmAccount(wallet) {
    const signer = getWalletSigner(wallet);
    const compressedPubkey = await signer.getIdentityPublicKey();
    const address = evmAddressFromCompressedPubkey(compressedPubkey);
    const account = toAccount({
        address,
        async signMessage({ message }) {
            const hash = hashMessage(message);
            const { r, s, yParity } = await signHash(signer, hash, address);
            const v = yParity === 0 ? "1b" : "1c";
            return `0x${r.slice(2)}${s.slice(2)}${v}`;
        },
        async signTransaction(transaction) {
            const serialized = serializeTransaction(transaction);
            const hash = keccak256(serialized);
            const { r, s, yParity } = await signHash(signer, hash, address);
            return serializeTransaction(transaction, {
                r,
                s,
                yParity,
            });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async signTypedData(typedData) {
            // Hash the EIP-712 typed data and sign the digest with the identity
            // key. Used primarily for Permit2 signatures in swap flows.
            const hash = hashTypedData(typedData);
            const { r, s, yParity } = await signHash(signer, hash, address);
            const v = yParity === 0 ? "1b" : "1c";
            return `0x${r.slice(2)}${s.slice(2)}${v}`;
        },
    });
    return account;
}

export { getWalletSigner, sparkWalletToEvmAccount };
//# sourceMappingURL=spark-evm-account.js.map

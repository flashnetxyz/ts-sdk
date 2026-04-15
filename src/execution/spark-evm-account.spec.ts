import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { keccak256, toHex, serializeTransaction, recoverAddress, parseTransaction } from "viem";
import { sparkWalletToEvmAccount, getWalletSigner } from "./spark-evm-account";
import type { SparkWalletInput } from "./spark-evm-account";

/**
 * Create a mock SparkWallet from a raw private key.
 * Mimics the real SparkWallet structure: config.signer with
 * getIdentityPublicKey and signMessageWithIdentityKey.
 */
function mockWalletFromPrivateKey(privateKey: Uint8Array): SparkWalletInput {
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed

  return {
    config: {
      signer: {
        async getIdentityPublicKey() {
          return publicKey;
        },
        async signMessageWithIdentityKey(
          message: Uint8Array,
          compact?: boolean
        ) {
          const sig = secp256k1.sign(message, privateKey);
          if (compact) {
            return sig.toCompactRawBytes();
          }
          return sig.toDERRawBytes();
        },
      },
    },
  } as unknown as SparkWalletInput;
}

// Deterministic test key (DO NOT use in production)
const TEST_PRIVATE_KEY = new Uint8Array(32).fill(0);
TEST_PRIVATE_KEY[31] = 1; // private key = 1

describe("sparkWalletToEvmAccount", () => {
  it("derives a deterministic EVM address from the identity pubkey", async () => {
    const wallet = mockWalletFromPrivateKey(TEST_PRIVATE_KEY);
    const account = await sparkWalletToEvmAccount(wallet);

    // The EVM address should be deterministic for a given key
    expect(account.address).toMatch(/^0x[0-9a-f]{40}$/);

    // Verify it matches manual derivation:
    // pubkey for private key 1 is well-known
    const pubkey = secp256k1.getPublicKey(TEST_PRIVATE_KEY, false); // uncompressed
    const expectedHash = keccak256(toHex(pubkey.slice(1)));
    const expectedAddress = `0x${expectedHash.slice(-40)}`;
    expect(account.address.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });

  it("signs an EVM transaction with correct recovery (v/yParity)", async () => {
    const wallet = mockWalletFromPrivateKey(TEST_PRIVATE_KEY);
    const account = await sparkWalletToEvmAccount(wallet);

    const tx = {
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
      value: 1000000000000n,
      chainId: 21022,
      nonce: 0,
      gas: 21000n,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      type: "eip1559" as const,
    };

    const signedTx = await account.signTransaction(tx);

    // signedTx should be a valid RLP-encoded hex string
    expect(signedTx).toMatch(/^0x/);
    expect(signedTx.length).toBeGreaterThan(10);

    // Parse the signed tx to extract the signature components
    const parsed = parseTransaction(signedTx as `0x${string}`);
    const txHash = keccak256(serializeTransaction(tx));

    // Recover the signer from the signature and verify it matches
    const recoveredAddress = await recoverAddress({
      hash: txHash,
      signature: {
        r: parsed.r!,
        s: parsed.s!,
        yParity: parsed.yParity!,
      },
    });

    expect(recoveredAddress.toLowerCase()).toBe(
      account.address.toLowerCase()
    );
  });

  it("recovery works for multiple different private keys", async () => {
    // Test several keys to ensure v recovery logic handles both yParity=0 and yParity=1
    const keys = [
      (() => { const k = new Uint8Array(32); k[31] = 1; return k; })(),
      (() => { const k = new Uint8Array(32); k[31] = 2; return k; })(),
      (() => { const k = new Uint8Array(32); k[31] = 42; return k; })(),
      (() => { const k = new Uint8Array(32); k[0] = 0xff; k[31] = 0xab; return k; })(),
    ];

    const tx = {
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
      value: 0n,
      chainId: 21022,
      nonce: 5,
      gas: 100000n,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      type: "eip1559" as const,
    };

    for (const key of keys) {
      const wallet = mockWalletFromPrivateKey(key);
      const account = await sparkWalletToEvmAccount(wallet);
      const signedTx = await account.signTransaction(tx);

      const parsed = parseTransaction(signedTx as `0x${string}`);
      const txHash = keccak256(serializeTransaction(tx));
      const recoveredAddress = await recoverAddress({
        hash: txHash,
        signature: {
          r: parsed.r!,
          s: parsed.s!,
          yParity: parsed.yParity!,
        },
      });

      expect(recoveredAddress.toLowerCase()).toBe(
        account.address.toLowerCase()
      );
    }
  });

  it("signs a message with correct EIP-191 prefix", async () => {
    const wallet = mockWalletFromPrivateKey(TEST_PRIVATE_KEY);
    const account = await sparkWalletToEvmAccount(wallet);

    const signature = await account.signMessage({ message: "hello world" });

    // Should be 65 bytes (r + s + v) as hex
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);

    // The last byte should be 1b or 1c (v = 27 or 28)
    const vByte = signature.slice(-2);
    expect(["1b", "1c"]).toContain(vByte);
  });
});

describe("getWalletSigner", () => {
  it("extracts the signer from a mock wallet", async () => {
    const wallet = mockWalletFromPrivateKey(TEST_PRIVATE_KEY);
    const signer = getWalletSigner(wallet);

    const pubkey = await signer.getIdentityPublicKey();
    expect(pubkey).toBeInstanceOf(Uint8Array);
    expect(pubkey.length).toBe(33); // compressed
    expect(pubkey[0]).toBeGreaterThanOrEqual(2);
    expect(pubkey[0]).toBeLessThanOrEqual(3);
  });
});

describe("ExecutionClient constructor signer derivation", () => {
  it("derives the same gateway auth pubkey as the EVM address key", async () => {
    const wallet = mockWalletFromPrivateKey(TEST_PRIVATE_KEY);

    // Get the identity pubkey that would be used for gateway auth
    const signer = getWalletSigner(wallet);
    const pubkey = await signer.getIdentityPublicKey();
    const pubkeyHex = bytesToHex(pubkey);

    // Get the EVM address from the same key
    const account = await sparkWalletToEvmAccount(wallet);

    // The EVM address should be derived from the same pubkey
    const uncompressed = secp256k1.ProjectivePoint.fromHex(pubkey).toRawBytes(false);
    const hash = keccak256(toHex(uncompressed.slice(1)));
    const expectedAddress = `0x${hash.slice(-40)}`;

    expect(account.address.toLowerCase()).toBe(expectedAddress.toLowerCase());
    // And the pubkey should be the compressed 33-byte form
    expect(pubkeyHex.length).toBe(66); // 33 bytes * 2 hex chars
  });
});

describe("yParity recovery failure", () => {
  it("throws when the signer returns a signature that recovers to neither yParity", async () => {
    // Construct a wallet whose identity pubkey is derived from key A, but
    // whose sign method signs with key B — so no yParity produces a
    // signature recovering to the expected address.
    const keyA = new Uint8Array(32);
    keyA[31] = 1;
    const keyB = new Uint8Array(32);
    keyB[31] = 2;

    const pubkeyA = secp256k1.getPublicKey(keyA, true);
    const malicious: SparkWalletInput = {
      config: {
        signer: {
          async getIdentityPublicKey() {
            return pubkeyA; // claim to be key A
          },
          async signMessageWithIdentityKey(message: Uint8Array, compact?: boolean) {
            // but sign with key B — signature won't recover to A's address
            const sig = secp256k1.sign(message, keyB);
            return compact ? sig.toCompactRawBytes() : sig.toDERRawBytes();
          },
        },
      },
    } as unknown as SparkWalletInput;

    const account = await sparkWalletToEvmAccount(malicious);
    await expect(
      account.signTransaction({
        to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
        value: 0n,
        chainId: 21022,
        nonce: 0,
        gas: 21000n,
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        type: "eip1559" as const,
      })
    ).rejects.toThrow(/does not recover/);
  });
});

describe("getWalletSigner runtime guard", () => {
  it("throws a helpful error when config.signer is missing", () => {
    const broken = {} as unknown as SparkWalletInput;
    expect(() => getWalletSigner(broken)).toThrow(
      /does not expose the expected `config.signer` shape/
    );
  });

  it("throws when config.signer lacks getIdentityPublicKey", () => {
    const broken = {
      config: { signer: { signMessageWithIdentityKey: async () => new Uint8Array() } },
    } as unknown as SparkWalletInput;
    expect(() => getWalletSigner(broken)).toThrow(
      /does not expose the expected `config.signer` shape/
    );
  });

  it("throws when config.signer lacks signMessageWithIdentityKey", () => {
    const broken = {
      config: { signer: { getIdentityPublicKey: async () => new Uint8Array(33) } },
    } as unknown as SparkWalletInput;
    expect(() => getWalletSigner(broken)).toThrow(
      /does not expose the expected `config.signer` shape/
    );
  });
});

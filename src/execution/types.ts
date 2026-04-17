/**
 * Flashnet Execution Layer Types
 *
 * Types for interacting with the Flashnet execution gateway.
 * These map directly to the Rust gateway API types in flashnet-execution.
 */

/** Asset type for a deposit from Spark into the EVM. */
export type DepositAsset =
  | { type: "btc" }
  | { type: "token"; tokenId: string };

/** A single deposit funding an intent from a Spark transfer. */
export interface Deposit {
  /** Spark transfer ID (hex string, no 0x prefix). Bitcoin: 16 bytes, Token: 32 bytes. */
  sparkTransferId: string;
  /** The asset being deposited. */
  asset: DepositAsset;
  /** Amount in base units (sats for BTC, smallest unit for tokens). Use bigint for precision with large token amounts. */
  amount: number | bigint;
}

/** Request to submit a deposit-only intent (credit recipient without executing). */
export interface DepositIntentParams {
  chainId: number;
  deposits: Deposit[];
  /** EVM address to credit with the deposited funds (0x-prefixed). */
  recipient: string;
  /**
   * Absolute unix-millisecond timestamp past which the intent expires.
   * Optional — defaults to `DEFAULT_INTENT_TTL_MS` (15 minutes) from now.
   *
   * This value is part of the signed canonical preimage; the gateway rejects
   * past or >24h-future timestamps. See
   * `flashnet-execution/plan/deposit-oracle-admission-check.md`.
   */
  expiresAt?: number;
}

/** Request to submit a deposit-and-execute intent. */
export interface ExecuteIntentParams {
  chainId: number;
  deposits: Deposit[];
  /** Hex-encoded signed EVM transaction (RLP-serialized, 0x-prefixed). */
  signedTx: string;
  /** Optional signed expiry timestamp (unix ms). See `DepositIntentParams.expiresAt`. */
  expiresAt?: number;
}

/** Response from the execution gateway after submitting an intent. */
export interface ExecuteResponse {
  /** Unique handle for this submission attempt. */
  submissionId: string;
  /** Canonical identifier of the logical intent content. */
  intentId: string;
  /** Current status of the intent. */
  status: string;
}

/** Configuration for the execution client. */
export interface ExecutionClientConfig {
  /** Base URL of the execution gateway (e.g. "http://localhost:8080"). */
  gatewayUrl: string;
}

/**
 * Signer interface for the execution client.
 *
 * Signs raw byte arrays (SHA-256 hash of the canonical intent message)
 * and returns a DER-encoded secp256k1 ECDSA signature as hex.
 */
export interface ExecutionSigner {
  /** Compressed secp256k1 public key as hex (66 chars, no 0x prefix). */
  getPublicKey(): string | Promise<string>;

  /**
   * Sign a UTF-8 message string.
   *
   * The implementation must:
   * 1. UTF-8 encode the message to bytes
   * 2. SHA-256 hash the bytes
   * 3. Sign the hash with secp256k1 ECDSA
   * 4. Return the DER-encoded signature as hex (no 0x prefix)
   */
  signMessage(message: string): string | Promise<string>;
}

/**
 * Canonical transfer entry in the signed intent message.
 * Must match the Rust CanonicalTransferEntry serialization (camelCase).
 */
export interface CanonicalTransferEntry {
  transferId: string;
  amountSats: number | bigint;
  assetType: "NativeSats" | "BridgedToken";
  tokenId?: string;
}

/**
 * Canonical intent action in the signed intent message.
 * Must match the Rust CanonicalIntentAction serialization
 * (camelCase, internally tagged with "type").
 */
export type CanonicalIntentAction =
  | { type: "deposit"; recipient: string }
  | { type: "execute"; signedTxHash: string };

/**
 * Canonical intent message that gets signed by the client.
 * Must match the Rust CanonicalIntentMessage serialization (camelCase).
 */
export interface CanonicalIntentMessage {
  chainId: number;
  transfers: CanonicalTransferEntry[];
  action: CanonicalIntentAction;
  nonce: string;
  /**
   * Absolute unix-millisecond timestamp past which the sequencer refuses
   * to admit, include, or settle this intent. Part of the signed preimage
   * so the validator's signature check matches the gateway's.
   *
   * Note: JSON `number` is precise for any value within the safe-integer
   * range (up to 9.007e15 ms ≈ year 287396). Unix-ms timestamps are well
   * inside that range indefinitely.
   */
  expiresAt: number;
}

/**
 * Default client-side TTL applied when `expiresAt` is not explicitly provided.
 * 15 minutes is long enough for normal Spark transfer propagation to appear in
 * the operator DB even under load, and well inside the gateway's 24h max.
 */
export const DEFAULT_INTENT_TTL_MS = 15 * 60 * 1000;

/**
 * Resolve an `expiresAt` value, defaulting to `DEFAULT_INTENT_TTL_MS` from
 * `Date.now()` when the caller did not provide one.
 */
export function resolveExpiresAt(expiresAt?: number): number {
  return typeof expiresAt === "number" && Number.isFinite(expiresAt)
    ? expiresAt
    : Date.now() + DEFAULT_INTENT_TTL_MS;
}

/**
 * Flashnet Execution Layer Types
 *
 * Types for interacting with the Flashnet execution gateway.
 * These map directly to the Rust gateway API types in flashnet-execution.
 */

import { blake3 } from "@noble/hashes/blake3";

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
  /**
   * Optional signed deposit proof obtained from `POST /api/v1/verifyDeposit`.
   *
   * When present, the gateway re-verifies the proof on `/execute` before
   * forwarding the intent. When absent, the SDK either fetches one
   * automatically (the default) or sends a placeholder shape that the
   * gateway treats as "not configured" and falls through to the legacy
   * admission path.
   */
  depositProof?: SignedDepositProof;
}

/**
 * Signed deposit proof returned by `POST /api/v1/verifyDeposit`.
 *
 * Both fields are hex-encoded byte strings; the gateway accepts the
 * value with or without a leading `0x` and emits it with the prefix.
 * `payloadBytes` is opaque (canonical proof payload, variable length)
 * and `signature` is the compact 64-byte ECDSA signature over it.
 * Callers should treat both fields as opaque and pass the value
 * through unchanged when submitting the intent.
 */
export interface SignedDepositProof {
  payloadBytes: string;
  signature: string;
}

/**
 * Request body for `POST /api/v1/verifyDeposit`.
 *
 * `intentId` is the canonical 32-byte BLAKE3 hash of the intent the SDK
 * is about to submit on `/execute`. The returned proofs bind to this
 * value, so a proof minted for intent A cannot be re-attached to a
 * request whose body hashes to intent B. Compute it via
 * {@link canonicalIntentId} from the message you intend to sign.
 *
 * Each transfer's `sparkTransferId` may be supplied as a dashed UUID, a
 * raw hex string (with or without `0x`), or a 64-char hex string for
 * token transfers. The gateway canonicalises before lookup.
 */
export interface VerifyDepositsRequest {
  intentId: string;
  transfers: VerifyDepositTransfer[];
}

/** One transfer in a {@link VerifyDepositsRequest}. */
export interface VerifyDepositTransfer {
  sparkTransferId: string;
}

/**
 * Response body for `POST /api/v1/verifyDeposit`.
 *
 * `proofs` and `rejections` together cover every input transfer by
 * `index` (zero-based, matching the request order). A transfer never
 * appears in both. Rejections carry a stable machine-readable `reason`
 * so callers can branch on it programmatically.
 */
export interface VerifyDepositsResponse {
  proofs: IndexedDepositProof[];
  rejections: DepositRejection[];
}

/** One signed proof in a {@link VerifyDepositsResponse}. */
export interface IndexedDepositProof {
  index: number;
  proof: SignedDepositProof;
}

/** One rejected transfer in a {@link VerifyDepositsResponse}. */
export interface DepositRejection {
  index: number;
  sparkTransferId: string;
  /**
   * Stable machine-readable reason. See the gateway docs for the full
   * enumeration; common values include `transfer_not_found`,
   * `condition_a_failed`, `condition_b_failed`, `status_terminal`,
   * `amount_mismatch`, `network_mismatch`, `token_id_mismatch`,
   * `transfer_too_old`, `decode_error`, `database_error`, `sign_failed`.
   */
  reason: string;
  message: string;
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
  status: IntentStatus;
}

/**
 * Lifecycle status of an intent on the execution gateway.
 *
 * Wire format mirrors the Rust `IntentStatus` enum, which serializes as
 * SCREAMING_SNAKE_CASE (`crates/storage/execution-store/src/lib.rs`). The
 * authoritative `GET /api/v1/intents/{id}` endpoint returns exactly these
 * four values.
 *
 * Lifecycle order under the happy path:
 *   `ACCEPTED → INCLUDED_PENDING_FINALITY → FINALIZED`
 *
 * `EXPIRED` is the single terminal failure state. The v1 `REJECTED` and
 * `ORACLE_PENDING` sub-states were collapsed in migration 0008 (rejected →
 * `EXPIRED` with the original failure kind carried in `statusMessage`;
 * oracle-pending → `ACCEPTED`).
 *
 * Note: `POST /api/v1/execute` returns the initial status as the lowercase
 * string `"accepted"`. The SDK normalizes every status it surfaces to the
 * canonical SCREAMING_SNAKE_CASE form via {@link normalizeIntentStatus}.
 */
export type IntentStatus =
  | "ACCEPTED"
  | "INCLUDED_PENDING_FINALITY"
  | "FINALIZED"
  | "EXPIRED";

/** Statuses that represent terminal lifecycle states (no further updates). */
export const TERMINAL_INTENT_STATUSES = [
  "FINALIZED",
  "EXPIRED",
] as const satisfies readonly IntentStatus[];

/**
 * Normalize a raw status string from any gateway endpoint to the canonical
 * {@link IntentStatus} (SCREAMING_SNAKE_CASE). Tolerates the lowercase
 * `"accepted"` that `POST /execute` returns and any case the gateway emits.
 * Unknown values are upper-cased and returned as-is so forward-compatible
 * statuses don't throw.
 */
export function normalizeIntentStatus(raw: string): IntentStatus {
  return raw.toUpperCase() as IntentStatus;
}

/**
 * Returns true when the status is a terminal lifecycle state — i.e. the
 * intent has reached a final outcome and will receive no further updates.
 * Accepts any case; normalizes before comparing.
 */
export function isTerminalIntentStatus(status: string): boolean {
  return (TERMINAL_INTENT_STATUSES as readonly string[]).includes(
    status.toUpperCase()
  );
}

/**
 * Response from `GET /api/v1/intents/{submission_id}`.
 *
 * Mirrors the Rust `IntentStatusResponse` (camelCase). All timestamp fields
 * are RFC3339 strings as serialized by the gateway; consumers may parse
 * them with `new Date(...)`.
 */
export interface IntentStatusResponse {
  /** The submission lifecycle handle. */
  submissionId: string;
  /** Canonical content identifier of the intent. */
  intentId: string;
  /** Current lifecycle status. */
  status: IntentStatus;
  /**
   * Machine-readable status detail (e.g. rejection reason). Absent when
   * not applicable.
   */
  statusMessage?: string;
  /**
   * Attributable execution transaction hash. Absent before inclusion.
   */
  executionTxHash?: string;
  /** When the intent was accepted (RFC3339). */
  createdAt: string;
  /** When the status was last updated (RFC3339). */
  updatedAt: string;
}

/**
 * Runtime discovery info returned by `GET /api/v1/network/info`.
 *
 * This is the single source of truth for where deposits land (Spark side)
 * and where on-chain transactions go (execution side). Clients call
 * `ExecutionClient.getNetworkInfo()` once per session (memoized, 60s TTL)
 * and read fields here instead of hard-coding them in environment config.
 *
 * Trading-stack contract addresses are intentionally absent — they live in
 * `TradingConfig`, and the compile-time guardrail below
 * {@link ExecutionNetworkInfo} keeps them off this surface.
 */
export interface NetworkInfo {
  spark: SparkNetworkInfo;
  execution: ExecutionNetworkInfo;
  /**
   * When true, the gateway is advising consumers to stop offering new
   * deposits (maintenance, incident). The gateway still accepts signed
   * intents — this is a UX signal, not an enforcement boundary.
   */
  paused: boolean;
  /**
   * Advisory minimum deposit size for client-side pre-validation. The
   * gateway enforces its own bounds at admission regardless.
   */
  minDepositSats: number;
}

/** Spark-side discovery fields. */
export interface SparkNetworkInfo {
  /** Bech32m Spark address where deposits must be sent. */
  depositAddress: string;
  /** Spark network, either `"MAINNET"` or `"REGTEST"`. */
  network: string;
}

/** Execution-chain discovery fields. */
export interface ExecutionNetworkInfo {
  /** 0x-prefixed 20-byte contract address for deposit / withdrawal calls. */
  contractAddress: string;
  /** Execution-chain chain id. */
  chainId: number;
}

/**
 * Guardrail: trading-stack addresses stay off `/network/info`.
 *
 * The gateway publishes execution concerns only (Spark deposit address, bridge
 * contract, chain id, paused flag, min deposit). Conductor / WBTC / factory /
 * NonfungiblePositionManager / Permit2 addresses live in `TradingConfig`, because
 * they move on the trading stack's own release cadence. The aliases below fail
 * `tsc` if any such field is added to {@link NetworkInfo},
 * {@link ExecutionNetworkInfo}, or {@link SparkNetworkInfo}; they are erased at
 * runtime. Runtime counterpart: `network-info-address-invariant.spec.ts`.
 */
type ForbiddenTradingAddressKey =
  // Known trading-stack address fields.
  | "conductorAddress"
  | "wbtcAddress"
  | "factoryAddress"
  | "positionManagerAddress"
  | "permit2Address"
  | "uniswapFactoryAddress"
  // Defensive synonyms a future contributor might reach for instead.
  | "nonfungiblePositionManagerAddress"
  | "npmAddress"
  | "routerAddress"
  | "swapRouterAddress"
  | "quoterAddress"
  | "v3FactoryAddress";

/**
 * `true` when `T` has no forbidden trading-stack address key.
 *
 * Checks top-level literal keys only (matching the flat wire shape) — it does
 * not recurse, and an index signature would make it vacuously `true`. Keep the
 * response interfaces flat and literal-keyed so the guard stays meaningful.
 */
type HasNoTradingAddress<T> = Extract<
  keyof T,
  ForbiddenTradingAddressKey
> extends never
  ? true
  : false;

/** Resolves only when `T` is exactly `true`; any other input is a compile error. */
type AssertTrue<T extends true> = T;

// Adding a forbidden key to any interface flips its check to `false` and
// fails the build via the AssertTrue constraint.
type _NetworkInfoHasNoTradingAddress = AssertTrue<
  HasNoTradingAddress<NetworkInfo>
>;
type _ExecutionNetworkInfoHasNoTradingAddress = AssertTrue<
  HasNoTradingAddress<ExecutionNetworkInfo>
>;
type _SparkNetworkInfoHasNoTradingAddress = AssertTrue<
  HasNoTradingAddress<SparkNetworkInfo>
>;

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
 * On-the-wire asset variant for canonical transfer entries and
 * `/execute` request deposits.
 *
 * Tagged enum with SCREAMING_SNAKE_CASE variant names, matching the
 * Rust `Asset` serde shape (`crates/types/intent/src/lib.rs`).
 */
export type Asset =
  | { type: "NATIVE_SATS" }
  | { type: "SPARK_TOKEN"; tokenId: string };

/**
 * Canonical transfer entry in the signed intent message.
 *
 * Mirrors Rust `CanonicalTransferEntry` (camelCase, serde declaration
 * order: `transferId`, `amount`, `asset`, `depositProof`). The deposit
 * proof is part of the signed preimage — omitting it on the SDK side
 * breaks signature verification.
 *
 * `amount` is the alloy `U256` JSON shape: `0x`-prefixed lowercase hex
 * with no leading zeros (`"0x0"` for zero).
 */
export interface CanonicalTransferEntry {
  transferId: string;
  amount: string;
  asset: Asset;
  depositProof: SignedDepositProof;
}

/**
 * Canonical intent action in the signed intent message.
 *
 * Internally tagged with `"type"`, lowercase tag names — matches Rust
 * `CanonicalIntentAction` serde shape (`tag = "type"`, `rename_all =
 * "camelCase"`).
 */
export type CanonicalIntentAction =
  | { type: "deposit"; recipient: string }
  | { type: "execute"; signedTxHash: string }
  | { type: "clawback"; sparkTxid: string };

/** Outcome of a single clawback attempt. Never represents a thrown error. */
export interface ClawbackResult {
  /** The Spark transfer id this attempt targeted. */
  transferId: string;
  /** Whether the gateway accepted the clawback intent. */
  success: boolean;
  /** Gateway response when accepted. */
  response?: ExecuteResponse;
  /**
   * Failure message when rejected. A rejection commonly means the transfer
   * was already consumed by a finalized intent (so no refund is owed), not a
   * transient error to retry.
   */
  error?: string;
}

/**
 * Canonical intent message that gets signed by the client.
 *
 * Field order MUST match Rust `CanonicalIntentMessage` declaration
 * order: `chainId`, `transfers`, `action`, `expiresAt`. There is no
 * `nonce` field — replay defense is structural via `intents.intent_id`
 * uniqueness in the gateway DB (migration 0008).
 */
export interface CanonicalIntentMessage {
  chainId: number;
  transfers: CanonicalTransferEntry[];
  action: CanonicalIntentAction;
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

/**
 * Encode a `U256` as the alloy JSON form: `0x` + lowercase hex with no
 * leading zeros. `0n` is encoded as `"0x0"`.
 *
 * Negative bigints are rejected — `U256` is unsigned.
 */
export function u256Hex(value: number | bigint): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n) throw new Error(`u256Hex: negative value ${value}`);
  return `0x${n.toString(16)}`;
}

/**
 * Convert the SDK's user-facing {@link DepositAsset} (lowercase tag) to
 * the wire {@link Asset} (SCREAMING_SNAKE_CASE tag). The wire `tokenId`
 * is required to be `0x`-prefixed lowercase 32-byte hex; if the caller
 * supplies a bare-hex value we prepend `0x`.
 */
export function depositAssetToWire(asset: DepositAsset): Asset {
  if (asset.type === "btc") return { type: "NATIVE_SATS" };
  const tokenIdHex = asset.tokenId.startsWith("0x")
    ? asset.tokenId.toLowerCase()
    : `0x${asset.tokenId.toLowerCase()}`;
  return { type: "SPARK_TOKEN", tokenId: tokenIdHex };
}

/**
 * Placeholder {@link SignedDepositProof} used on the legacy/soft-mode
 * admission path. The gateway treats any proof that fails
 * `has_valid_shape()` (empty payload OR non-64-byte signature) as
 * "not configured" and falls through to the polling admission. The
 * SDK uses this when `/verifyDeposit` returns 503 or when
 * `manualProofs: true` is set without an attached proof.
 */
export const PLACEHOLDER_DEPOSIT_PROOF: SignedDepositProof = {
  payloadBytes: "0x",
  signature: "0x",
};

/**
 * Lowercase hex (no `0x`) representation of a byte array.
 */
function bytesToLowerHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Decode hex string to bytes. Accepts optional `0x` prefix. Throws on any
 * non-hex character (rather than silently coercing to 0, which would
 * produce a wrong — but valid-length — byte array and a wrong intent id).
 */
function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (s.length % 2 !== 0) throw new Error(`hex string has odd length: ${hex}`);
  if (s.length > 0 && !/^[0-9a-fA-F]+$/.test(s)) {
    throw new Error(`invalid hex string: ${hex}`);
  }
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Normalize a Spark transfer id (or any id) to bare lowercase hex: strips a
 * leading `0x`/`0X` and any dashes (dashed-UUID Bitcoin transfer ids). This
 * mirrors the gateway's `canonicalise_transfer_id_hex`, so the canonical
 * intent-id preimage hashes the same bytes the gateway parses.
 */
function normalizeIdHex(id: string): string {
  const noPrefix = id.startsWith("0x") || id.startsWith("0X") ? id.slice(2) : id;
  return noPrefix.replace(/-/g, "");
}

/**
 * Externally-tagged wire form of a clawback `sparkTxid` as it appears in the
 * signed canonical intent message.
 *
 * The gateway's `CanonicalIntentAction::Clawback.spark_txid` is a
 * `SparkTransferId` enum (`Bitcoin([u8; 16])` / `Token([u8; 32])`) with a plain
 * derived `Serialize`, so serde emits it externally tagged with a decimal byte
 * array and a PascalCase variant key: `{ "Bitcoin": [..16] }` or
 * `{ "Token": [..32] }`. The signature is verified against this JSON
 * byte-for-byte, so the SDK must reproduce the exact shape.
 *
 * This is ONLY for the signed message. The `/execute` request body and the
 * BLAKE3 intent-id preimage both use the bare-hex string form.
 */
export type ClawbackSparkTxidWire = { Bitcoin: number[] } | { Token: number[] };

/** Build the {@link ClawbackSparkTxidWire} form from a hex transfer id. */
export function clawbackSparkTxidWire(sparkTxid: string): ClawbackSparkTxidWire {
  const bytes = Array.from(hexToBytes(normalizeIdHex(sparkTxid)));
  if (bytes.length === 16) return { Bitcoin: bytes };
  if (bytes.length === 32) return { Token: bytes };
  throw new Error(
    `clawback sparkTxid must be 16 (Bitcoin) or 32 (Token) bytes, got ${bytes.length}`
  );
}

/**
 * Compute the canonical intent id for {@link VerifyDepositsRequest.intentId}
 * and the on-chain `intents.intent_id` value. BLAKE3 hash of the canonical
 * preimage described in `crates/types/intent/src/lib.rs:500-548`:
 *
 *   tag    = b"FLASHNET_INTENT_V2" (no length prefix)
 *   chain  = u64 big-endian (8 bytes)
 *   recipient_for_hash = 20 bytes
 *     - Deposit  → the recipient address (20 bytes from the 0x-prefixed hex)
 *     - Execute  → recovered ECDSA signer of the signed tx (provided by caller)
 *     - Clawback → 20 zero bytes
 *   transferCount = u32 big-endian (4 bytes)
 *   for each transfer (declaration order):
 *     transferId.canonical_bytes:
 *        0x00 + 16 raw bytes (Bitcoin 32-hex-char id), OR
 *        0x01 + 32 raw bytes (Token 64-hex-char id)
 *     amount.to_be_bytes::<32>() = U256 32-byte big-endian
 *     asset.tag_byte = 0x00 (NativeSats) | 0x01 (SparkToken)
 *     if SparkToken: 0x01 + 32 raw token-id bytes; else 0x00
 *   action discriminator + body:
 *     Deposit   → 0x00
 *     Execute   → 0x01 + blake3(signedTx-bytes) (32 bytes)
 *     Clawback  → 0x02 + sparkTxid.canonical_bytes (tag + bytes)
 *
 * Note: `expiresAt` and per-transfer `depositProof` are NOT part of the
 * BLAKE3 preimage — they live only on the JSON signed-preimage.
 *
 * `recipientForHash` must be the canonical 20-byte recipient determined
 * by the action variant — the caller is responsible for recovering the
 * ECDSA signer for Execute actions; pass `0x` + 40 zero hex for Clawback.
 */
export function canonicalIntentId(args: {
  chainId: number | bigint;
  transfers: CanonicalTransferEntry[];
  action: CanonicalIntentAction;
  /**
   * For Deposit: the 0x-prefixed recipient address.
   * For Execute: the ECDSA-recovered signer of the signed transaction (0x-prefixed 20-byte hex).
   * For Clawback: ignored; the canonical recipient is the zero address.
   */
  recipientForHash: string;
  /**
   * For Execute: the raw signed-transaction bytes (hex, with or without
   * `0x`). Hashed with BLAKE3 to form the action body. Ignored for
   * Deposit / Clawback.
   */
  signedTxHex?: string;
}): string {
  const parts: Uint8Array[] = [];
  parts.push(new TextEncoder().encode("FLASHNET_INTENT_V2"));

  const chain = BigInt(args.chainId);
  if (chain < 0n || chain > 0xffffffffffffffffn) {
    throw new Error(`chainId out of u64 range: ${args.chainId}`);
  }
  const chainBuf = new Uint8Array(8);
  new DataView(chainBuf.buffer).setBigUint64(0, chain, false);
  parts.push(chainBuf);

  // recipient_for_hash: 20 bytes
  let recipientBytes: Uint8Array;
  if (args.action.type === "clawback") {
    recipientBytes = new Uint8Array(20);
  } else {
    const rec = args.recipientForHash;
    const recHex = rec.startsWith("0x") || rec.startsWith("0X") ? rec.slice(2) : rec;
    if (recHex.length !== 40) {
      throw new Error(`recipientForHash must be 20 bytes (40 hex chars): got ${rec}`);
    }
    recipientBytes = hexToBytes(recHex);
  }
  parts.push(recipientBytes);

  // transferCount: u32 BE
  const cntBuf = new Uint8Array(4);
  new DataView(cntBuf.buffer).setUint32(0, args.transfers.length, false);
  parts.push(cntBuf);

  for (const t of args.transfers) {
    // SparkTransferId canonical_bytes: tag + raw bytes. Strip `0x` and
    // dashes (dashed-UUID Bitcoin ids) so the length check and bytes
    // match the gateway's parsed form.
    const idHex = normalizeIdHex(t.transferId);
    let idTag: number;
    let idBytes: Uint8Array;
    if (idHex.length === 32) {
      idTag = 0x00;
      idBytes = hexToBytes(idHex);
    } else if (idHex.length === 64) {
      idTag = 0x01;
      idBytes = hexToBytes(idHex);
    } else {
      throw new Error(
        `transferId must be 16 bytes (32 hex chars) or 32 bytes (64 hex chars): got ${t.transferId}`
      );
    }
    parts.push(new Uint8Array([idTag]));
    parts.push(idBytes);

    // amount: u256 32-byte BE
    const amtHex = t.amount.startsWith("0x") || t.amount.startsWith("0X")
      ? t.amount.slice(2)
      : t.amount;
    const amt = amtHex === "" ? 0n : BigInt(`0x${amtHex}`);
    if (amt < 0n) throw new Error(`amount negative: ${t.amount}`);
    const amtBuf = new Uint8Array(32);
    let n = amt;
    for (let i = 31; i >= 0; i--) {
      amtBuf[i] = Number(n & 0xffn);
      n >>= 8n;
    }
    if (n !== 0n) throw new Error(`amount exceeds 32 bytes: ${t.amount}`);
    parts.push(amtBuf);

    // asset tag + optional token id
    if (t.asset.type === "NATIVE_SATS") {
      parts.push(new Uint8Array([0x00]));
      parts.push(new Uint8Array([0x00])); // no token id present
    } else {
      parts.push(new Uint8Array([0x01]));
      parts.push(new Uint8Array([0x01]));
      const tokenIdHex = t.asset.tokenId.startsWith("0x") || t.asset.tokenId.startsWith("0X")
        ? t.asset.tokenId.slice(2)
        : t.asset.tokenId;
      if (tokenIdHex.length !== 64) {
        throw new Error(`SparkToken tokenId must be 32 bytes (64 hex chars): got ${t.asset.tokenId}`);
      }
      parts.push(hexToBytes(tokenIdHex));
    }
  }

  // action discriminator + body
  if (args.action.type === "deposit") {
    parts.push(new Uint8Array([0x00]));
  } else if (args.action.type === "execute") {
    if (!args.signedTxHex) {
      throw new Error(`canonicalIntentId: execute action requires signedTxHex`);
    }
    parts.push(new Uint8Array([0x01]));
    const txHex = args.signedTxHex.startsWith("0x") || args.signedTxHex.startsWith("0X")
      ? args.signedTxHex.slice(2)
      : args.signedTxHex;
    const txBytes = hexToBytes(txHex);
    parts.push(blake3(txBytes));
  } else {
    parts.push(new Uint8Array([0x02]));
    const idHex = normalizeIdHex(args.action.sparkTxid);
    if (idHex.length === 32) {
      parts.push(new Uint8Array([0x00]));
      parts.push(hexToBytes(idHex));
    } else if (idHex.length === 64) {
      parts.push(new Uint8Array([0x01]));
      parts.push(hexToBytes(idHex));
    } else {
      throw new Error(`clawback sparkTxid must be 16 or 32 bytes: got ${args.action.sparkTxid}`);
    }
  }

  // Concatenate and BLAKE3-hash.
  let total = 0;
  for (const p of parts) total += p.length;
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return bytesToLowerHex(blake3(buf));
}

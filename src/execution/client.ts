/**
 * Flashnet Execution Client
 *
 * Client for interacting with the Flashnet execution gateway.
 * Handles authentication, intent construction, signing, deposit, and withdrawal.
 *
 * Takes a SparkWallet — the identity key is used for both gateway
 * authentication and EVM transaction signing.
 *
 * @example
 * ```typescript
 * import { ExecutionClient } from "@flashnet/sdk";
 *
 * const client = new ExecutionClient(sparkWallet, {
 *   gatewayUrl: "http://localhost:8080",
 *   rpcUrl: "http://localhost:8545",
 *   chainId: 21022,
 * });
 *
 * await client.authenticate();
 *
 * await client.deposit({
 *   deposits: [
 *     { sparkTransferId: "aabb...", amount: 100000, asset: { type: "btc" } },
 *   ],
 * });
 *
 * await client.withdraw({ amount: 50000 });
 * ```
 */

import {
  createPublicClient,
  http,
  keccak256 as viemKeccak256,
  recoverTransactionAddress,
  type PublicClient,
} from "viem";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/curves/abstract/utils";
import type { NetworkType } from "@buildonspark/spark-sdk";
import { sparkWalletToEvmAccount, getWalletSigner, type SparkWalletInput } from "./spark-evm-account";
import type { LocalAccount } from "viem/accounts";
import { encodeWithdrawSats, encodeWithdrawToken } from "./gateway";
import { fetchNonce, fetchEip1559Fees, fetchNativeBalance } from "./evm";
import {
  PLACEHOLDER_DEPOSIT_PROOF,
  canonicalIntentId,
  clawbackSparkTxidWire,
  depositAssetToWire,
  isTerminalIntentStatus,
  normalizeIntentStatus,
  resolveExpiresAt,
  u256Hex,
} from "./types";
import type {
  CanonicalIntentAction,
  CanonicalIntentMessage,
  CanonicalTransferEntry,
  ClawbackResult,
  Deposit,
  DepositRejection,
  ExecuteResponse,
  ExecutionSigner,
  IntentStatus,
  IntentStatusResponse,
  NetworkInfo,
  SignedDepositProof,
  VerifyDepositsRequest,
  VerifyDepositsResponse,
} from "./types";

/** Conversion factor: 1 sat = 10^10 wei on Flashnet's EVM. */
const WEI_PER_SAT = 10_000_000_000n;

/** Maximum value representable as u64 on the Rust side. */
const U64_MAX = (1n << 64n) - 1n;

/** Default gas limit for withdrawal transactions. */
const DEFAULT_WITHDRAW_GAS_LIMIT = 200_000n;

/**
 * JSON-stringify a value that may contain `bigint` fields, emitting each
 * bigint as a JSON numeric literal (not a string). Rust's serde_json
 * parses unquoted numeric literals up to u64 range, so this preserves
 * full u64 precision across languages — unlike `JSON.stringify` which
 * throws on bigint, and unlike `Number(bigint)` which loses precision
 * above 2^53.
 *
 * Implemented as a proper recursive encoder rather than a sentinel-and-regex
 * trick so user-supplied strings cannot accidentally collide with the
 * marker. Output is byte-for-byte equivalent to `JSON.stringify` for any
 * bigint-free input (same key ordering, same escaping, no whitespace).
 */
export function stringifyWithBigint(value: unknown): string {
  return encodeJson(value);
}

function encodeJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") {
    // Negative bigints are valid JSON numbers; positive includes 0.
    return value.toString();
  }
  if (typeof value === "number") {
    // Match JSON.stringify's NaN/Infinity → null behavior.
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => encodeJson(v));
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (v === undefined) continue; // matches JSON.stringify behavior
      parts.push(`${JSON.stringify(key)}:${encodeJson(v)}`);
    }
    return `{${parts.join(",")}}`;
  }
  // Functions, symbols → omit (matches JSON.stringify in object context).
  return "null";
}

// The execution-chain contract address is NOT part of this config — it is
// fetched at runtime via `GET /api/v1/network/info` (see
// `ExecutionClient.getNetworkInfo`). This keeps consumers automatically
// aligned with the gateway's view of the world instead of relying on a
// stale environment variable.

/**
 * Configuration for the execution client.
 */
export interface ExecutionClientConfig {
  /** Base URL of the execution gateway (e.g. "http://localhost:8080"). */
  gatewayUrl: string;
  /** JSON-RPC URL of the sequencer (e.g. "http://localhost:8545"). */
  rpcUrl: string;
  /** Chain ID of the Flashnet EVM network. */
  chainId: number;
}

/**
 * Built-in execution-chain endpoints keyed by the SparkWallet's network
 * type. When the consumer instantiates `new ExecutionClient(wallet)`
 * without an explicit config, the constructor reads
 * `wallet.getNetworkType()` and uses the matching entry here.
 *
 * Localnet has no preset because its ports are randomized per run; pass
 * an explicit `ExecutionClientConfig` for localnet flows.
 */
export const EXECUTION_NETWORK_CONFIGS: Partial<
  Record<NetworkType, ExecutionClientConfig>
> = {
  // Staging cluster on Spark regtest. The gateway proxies both
  // `/api/v1/*` and JSON-RPC at the same host.
  REGTEST: {
    gatewayUrl: "https://execution.makebitcoingreatagain.dev",
    rpcUrl: "https://execution.makebitcoingreatagain.dev",
    chainId: 21022,
  },
  // MAINNET, TESTNET, SIGNET, LOCAL: not deployed yet. Consumers
  // targeting those networks must pass an explicit config until the
  // mapping is filled in.
};

/**
 * The wallet exposes its network via the protected `config` service.
 * Reach through a focused interface so the cast is contained.
 */
interface SparkWalletWithConfig {
  config: { getNetworkType(): NetworkType };
}

/**
 * Resolve an ExecutionClientConfig for the wallet's network. The
 * optional `override` is shallow-merged on top so consumers can swap a
 * single field (e.g. local rpcUrl) without restating the rest.
 */
function resolveExecutionConfig(
  wallet: SparkWalletInput,
  override?: Partial<ExecutionClientConfig>
): ExecutionClientConfig {
  // A complete override needs no preset, so don't probe the wallet's
  // network at all. This keeps callers that pass an explicit config from
  // depending on the private, untyped `config.getNetworkType()` accessor.
  if (override?.gatewayUrl && override.rpcUrl && override.chainId !== undefined) {
    return {
      gatewayUrl: override.gatewayUrl,
      rpcUrl: override.rpcUrl,
      chainId: override.chainId,
    };
  }
  const network = (wallet as unknown as SparkWalletWithConfig).config.getNetworkType();
  const preset = EXECUTION_NETWORK_CONFIGS[network];
  const merged = { ...preset, ...override } as Partial<ExecutionClientConfig>;
  if (!merged.gatewayUrl || !merged.rpcUrl || merged.chainId === undefined) {
    throw new Error(
      `ExecutionClient: no built-in execution endpoints for SparkWallet ` +
        `network "${network}". Pass an explicit ` +
        `{ gatewayUrl, rpcUrl, chainId } as the second argument.`
    );
  }
  return merged as ExecutionClientConfig;
}

/**
 * Optional absolute unix-millisecond timestamp past which the intent expires.
 *
 * Every intent carries this value through the signed canonical preimage; the
 * gateway rejects past or >24h-future timestamps, and the sequencer
 * admission / TTL-sweeper use it as a terminal deadline. When omitted, the
 * SDK applies `DEFAULT_INTENT_TTL_MS` (15 minutes) from the moment the
 * request is built. See `flashnet-execution/plan/deposit-oracle-admission-check.md`.
 */
export interface IntentExpiry {
  expiresAt?: number;
}

/**
 * "Bring your own proofs" opt-out. When `true`, `deposit` / `execute`
 * do not fetch any proofs themselves - the caller is responsible for
 * the entire proof flow, either by pre-attaching `depositProof` to
 * each entry of `deposits[]` (with a matching `nonce`) or by
 * deliberately submitting an unproven intent.
 *
 * Default is `false`: the SDK auto-fetches proofs for any deposit
 * that arrives without one. This is the recommended path - reach for
 * `manualProofs: true` only when you need to drive the verification
 * step yourself.
 */
export interface ProofOptOut {
  manualProofs?: boolean;
}

/** Parameters for a deposit intent. */
export interface DepositParams extends IntentExpiry, ProofOptOut {
  /**
   * Spark transfers funding this deposit. Each entry that arrives
   * without `depositProof` is automatically verified and proof-bound
   * before the intent is signed - see `ProofOptOut` to disable.
   */
  deposits: Deposit[];
  /** EVM address to credit. If omitted, credits the identity key's EVM address. */
  recipient?: string;
}

/**
 * Parameters for {@link ExecutionClient.verifyDeposit}.
 *
 * This is the modular escape hatch - most callers should let
 * `deposit` / `execute` handle proof fetching automatically.
 *
 * `intentId` is the canonical BLAKE3 hash of the intent the caller is
 * about to submit. Compute it via {@link canonicalIntentId} from the
 * exact canonical transfers + action you intend to sign — the gateway
 * binds the returned proofs to this value and a mismatch on `/execute`
 * is a hard rejection.
 */
export interface VerifyDepositParams {
  intentId: string;
  /**
   * Spark transfer ids to verify. Accepts dashed UUID, plain hex, or
   * `0x`-prefixed hex; the gateway canonicalises before lookup.
   */
  sparkTransferIds: string[];
}

/** Parameters for a BTC withdrawal. */
export interface WithdrawParams extends IntentExpiry {
  /** Amount in satoshis to withdraw. */
  amount: bigint;
}

/** Parameters for a token withdrawal. */
export interface WithdrawTokenParams extends IntentExpiry {
  /** ERC20 token contract address. */
  tokenAddress: string;
  /** Amount in token base units. */
  amount: bigint;
}

/** Options for {@link ExecutionClient.waitForIntent}. */
export interface WaitForIntentOptions {
  /**
   * Stop polling when the intent reaches this status (or any terminal
   * status, whichever comes first). Default: any terminal status
   * (`finalized | rejected | expired`).
   */
  until?: IntentStatus;
  /** Polling interval in milliseconds. Default: 1500. */
  intervalMs?: number;
  /** Maximum time to wait before throwing. Default: 5 minutes. */
  timeoutMs?: number;
  /** Cancel the wait. Throws the signal's `reason` from the returned promise. */
  signal?: AbortSignal;
  /** Fired for every polled status, including the terminal one. */
  onUpdate?: (record: IntentStatusResponse) => void;
}

/** Parameters for a raw execute intent (advanced). */
export interface ExecuteParams extends IntentExpiry, ProofOptOut {
  /**
   * Spark transfers to credit before executing. Each entry without an
   * attached `depositProof` is auto-verified before the intent is
   * signed - see `ProofOptOut` to disable.
   */
  deposits?: Deposit[];
  /** Hex-encoded signed EVM transaction (RLP-serialized, 0x-prefixed). */
  signedTx: string;
}

/**
 * Client for the Flashnet execution gateway.
 *
 * Owns the SparkWallet, gateway auth, EVM signing, and RPC configuration.
 * Exposes deposit/withdraw/execute as methods — no loose function args.
 */
/**
 * Default cache lifetime for `/network/info` responses, per the endpoint's
 * design note (issue #283). The value is deliberately short so a re-key on
 * the gateway propagates to every live client within a minute without
 * having to flush caches or restart the app.
 */
const NETWORK_INFO_CACHE_TTL_MS = 60_000;

interface NetworkInfoCacheEntry {
  value: NetworkInfo;
  fetchedAt: number;
}

export class ExecutionClient {
  private readonly config: ExecutionClientConfig;
  private readonly wallet: SparkWalletInput;
  private readonly signer: ExecutionSigner;
  private evmAccount: LocalAccount | null = null;
  private accessToken: string | null = null;
  private networkInfoCache: NetworkInfoCacheEntry | null = null;
  /**
   * Shared in-flight promise for `getNetworkInfo()` so concurrent callers
   * coalesce onto a single HTTP request instead of fanning out N fetches
   * at cold start. Cleared on resolution or failure.
   */
  private networkInfoInFlight: Promise<NetworkInfo> | null = null;

  /**
   * @param wallet - SparkWallet instance. The identity key is used for
   *   gateway auth and EVM signing. The wallet's network
   *   (`wallet.getNetworkType()`) drives the default endpoints.
   * @param config - Optional override for `{ gatewayUrl, rpcUrl, chainId }`.
   *   Omit to use the built-in preset for the wallet's network (see
   *   {@link EXECUTION_NETWORK_CONFIGS}). Pass an object to point at
   *   localnet or a custom deployment; fields you don't override are
   *   pulled from the preset.
   */
  constructor(
    wallet: SparkWalletInput,
    config?: Partial<ExecutionClientConfig>
  ) {
    const resolved = resolveExecutionConfig(wallet, config);
    this.config = {
      ...resolved,
      gatewayUrl: resolved.gatewayUrl.replace(/\/+$/, ""),
    };
    this.wallet = wallet;
    this.signer = sparkWalletToExecutionSigner(wallet);
  }

  /**
   * Fetch runtime network discovery info (Spark deposit address, execution
   * contract address, paused flag, min deposit size).
   *
   * Results are cached in-process for {@link NETWORK_INFO_CACHE_TTL_MS}.
   * Pass `{ forceRefresh: true }` to bypass the cache — useful after a
   * suspected re-key.
   */
  async getNetworkInfo(opts?: { forceRefresh?: boolean }): Promise<NetworkInfo> {
    const now = Date.now();
    if (
      !opts?.forceRefresh &&
      this.networkInfoCache &&
      now - this.networkInfoCache.fetchedAt < NETWORK_INFO_CACHE_TTL_MS
    ) {
      return this.networkInfoCache.value;
    }
    if (this.networkInfoInFlight) {
      return this.networkInfoInFlight;
    }
    const fetchPromise = (async () => {
      const resp = await fetch(`${this.config.gatewayUrl}/api/v1/network/info`);
      if (!resp.ok) {
        throw new Error(
          `gateway /network/info returned HTTP ${resp.status} ${resp.statusText}`
        );
      }
      const body = (await resp.json()) as NetworkInfo;
      this.networkInfoCache = { value: body, fetchedAt: Date.now() };
      return body;
    })();
    this.networkInfoInFlight = fetchPromise;
    try {
      return await fetchPromise;
    } finally {
      this.networkInfoInFlight = null;
    }
  }

  /**
   * The EVM address derived from the SparkWallet's identity key.
   * Available after calling `authenticate()` or `getEvmAccount()`.
   */
  async getEvmAddress(): Promise<string> {
    const account = await this.getEvmAccount();
    return account.address;
  }

  /**
   * Get or create the viem LocalAccount derived from the identity key.
   */
  async getEvmAccount(): Promise<LocalAccount> {
    if (!this.evmAccount) {
      this.evmAccount = await sparkWalletToEvmAccount(this.wallet);
    }
    return this.evmAccount;
  }

  /**
   * Authenticate with the execution gateway via challenge-response.
   * Must be called before submitting intents.
   */
  async authenticate(): Promise<string> {
    const publicKey = await this.signer.getPublicKey();

    const challengeResp = await this.post<{
      challenge: string;
      challengeString: string;
    }>("/api/v1/auth/challenge", { publicKey });

    const challengeString =
      challengeResp.challengeString || challengeResp.challenge;
    if (!challengeString) {
      throw new Error("Gateway challenge response missing challengeString");
    }

    const signature = await this.signer.signMessage(challengeString);

    const verifyResp = await this.post<{ accessToken: string }>(
      "/api/v1/auth/verify",
      { publicKey, signature }
    );

    if (!verifyResp.accessToken) {
      throw new Error("Gateway verify response missing accessToken");
    }

    this.accessToken = verifyResp.accessToken;
    return this.accessToken;
  }

  /**
   * Submit a deposit intent.
   *
   * Credits the deposited funds to the specified recipient or the
   * identity key's EVM address. Any deposit that arrives without an
   * attached `depositProof` is automatically proof-bound first by an
   * internal `/verifyDeposit` call; the resulting proofs are stitched
   * into the request the gateway receives. Pass `params.manualProofs:
   * true` to take over the proof flow (e.g., to inspect rejections,
   * cache proofs, or submit unproven), or pre-populate
   * `deposits[i].depositProof` if proofs were fetched out of band
   * against the same canonical intent.
   *
   * If the gateway has not enabled proof verification yet (returns
   * 503) the call falls back to the legacy proofless path. Any
   * per-transfer rejection from the verification step is surfaced as
   * an error before the intent is signed - the SDK never silently
   * drops or downgrades a deposit.
   */
  async deposit(params: DepositParams): Promise<ExecuteResponse> {
    this.requireAuth();
    validateDeposits(params.deposits);

    const recipient = params.recipient ?? (await this.getEvmAddress());
    const recipientLower = recipient.toLowerCase();

    const action: CanonicalIntentAction = {
      type: "deposit",
      recipient: recipientLower,
    };

    return this.submitIntent(params.deposits, action, {
      recipient: recipientLower,
      recipientForHash: recipientLower,
      expiresAt: params.expiresAt,
      manualProofs: params.manualProofs,
    });
  }

  /**
   * Verify a batch of Spark transfers and obtain signed deposit proofs
   * for the ones the gateway can confirm.
   *
   * This is the **modular escape hatch**. `deposit` and `execute`
   * already call into this method automatically for any deposit that
   * arrives without a proof, so most callers do not need to invoke it
   * directly. Reach for it only when the caller wants to inspect
   * `rejections` before deciding whether to submit, cache proofs for
   * later use, or otherwise stage the work in multiple steps.
   *
   * Per-transfer failures (transfer not found, condition checks, etc.)
   * land in `rejections[]` rather than aborting the whole request.
   */
  async verifyDeposit(
    params: VerifyDepositParams
  ): Promise<VerifyDepositsResponse> {
    this.requireAuth();
    if (!params.intentId || params.intentId.trim() === "") {
      throw new Error("intentId is required");
    }
    if (!Array.isArray(params.sparkTransferIds) || params.sparkTransferIds.length === 0) {
      throw new Error("sparkTransferIds must contain at least one entry");
    }
    const body: VerifyDepositsRequest = {
      intentId: params.intentId,
      transfers: params.sparkTransferIds.map((sparkTransferId) => ({
        sparkTransferId,
      })),
    };
    return this.post<VerifyDepositsResponse>("/api/v1/verifyDeposit", body, {
      Authorization: `Bearer ${this.accessToken}`,
    });
  }

  /**
   * Auto-attach proofs for any deposit that arrives without one.
   *
   * Returns the (possibly mutated) deposit list. Pre-attached proofs
   * are kept as-is; the caller is responsible for ensuring they were
   * minted against the same canonical intent (same `intentId`). The
   * gateway will reject mismatched bindings on `/execute`.
   *
   * On 503 from the gateway (proof verification not yet enabled), each
   * deposit without a pre-attached proof receives the placeholder
   * shape so the canonical preimage still includes a `depositProof`
   * field. The gateway's `has_valid_shape()` check treats placeholders
   * as "not configured" and falls through to the legacy polling
   * admission. Any other failure - including a non-empty `rejections[]`
   * - throws to surface the issue before the intent is signed.
   */
  private async resolveProofs(
    deposits: Deposit[],
    intentId: string,
    manualProofs: boolean | undefined
  ): Promise<Deposit[]> {
    // Validate the shape of any pre-attached proof so a malformed
    // `depositProof` (wrong-length signature, etc.) fails here with a
    // clear message rather than being rejected by the gateway after
    // the intent is signed. The gateway accepts both `0x`-prefixed
    // and bare hex - so does this check.
    for (let i = 0; i < deposits.length; i++) {
      const proof = deposits[i]!.depositProof;
      if (proof) {
        if (typeof proof.payloadBytes !== "string" || proof.payloadBytes.trim() === "") {
          throw new Error(`deposits[${i}].depositProof.payloadBytes is missing or empty`);
        }
        if (typeof proof.signature !== "string" || !SIGNATURE_HEX_RE.test(proof.signature)) {
          throw new Error(
            `deposits[${i}].depositProof.signature must be 64 hex bytes (128 chars, optional 0x prefix)`
          );
        }
      }
    }

    // Manual mode (BYO proofs): pass the caller's list through
    // verbatim. They're responsible for any verification.
    if (manualProofs || deposits.length === 0) {
      return deposits;
    }

    // All deposits already have a proof - nothing to fetch.
    if (deposits.every((d) => Boolean(d.depositProof))) {
      return deposits;
    }

    const missing = deposits
      .map((d, i) => (d.depositProof ? -1 : i))
      .filter((i) => i >= 0);

    let response: VerifyDepositsResponse;
    try {
      response = await this.verifyDeposit({
        intentId,
        sparkTransferIds: missing.map((i) => deposits[i]!.sparkTransferId),
      });
    } catch (err) {
      // Soft-mode fallback: if the gateway does not yet expose
      // /verifyDeposit it returns 503. Fall through to the legacy
      // proofless path instead of failing the caller's intent. Any
      // pre-attached proofs flow through unchanged - the legacy path
      // ignores the placeholder shape via `has_valid_shape()`.
      if (isGatewayUnavailable(err)) {
        return deposits;
      }
      throw err;
    }

    if (response.rejections.length > 0) {
      // Re-index rejections to the original deposit positions so
      // callers can pair them with their `deposits[]` array by index
      // without knowing about the internal `missing` projection.
      const remapped: DepositRejection[] = response.rejections.map((r) => ({
        ...r,
        index: missing[r.index] ?? r.index,
      }));
      throw new VerifyDepositRejectedError(remapped);
    }
    if (response.proofs.length !== missing.length) {
      throw new Error(
        `verifyDeposit returned ${response.proofs.length} proofs for ${missing.length} unproven deposits`
      );
    }

    const proofByMissingIndex = new Map<number, SignedDepositProof>();
    for (const p of response.proofs) {
      proofByMissingIndex.set(p.index, p.proof);
    }

    const out = deposits.slice();
    for (let i = 0; i < missing.length; i++) {
      const originalIndex = missing[i]!;
      const proof = proofByMissingIndex.get(i);
      if (!proof) {
        throw new Error(
          `verifyDeposit response missing proof for transfer ${out[originalIndex]!.sparkTransferId}`
        );
      }
      out[originalIndex] = { ...out[originalIndex]!, depositProof: proof };
    }
    return out;
  }

  /**
   * Withdraw native BTC (sats) from EVM back to Spark.
   * Signs a SparkGateway.withdrawSats transaction with the identity key.
   *
   * @param params.amount - Amount in satoshis.
   */
  async withdraw(params: WithdrawParams): Promise<ExecuteResponse> {
    this.requireAuth();
    const account = await this.getEvmAccount();

    // Pre-flight balance guard. A native withdraw moves
    // `amount * WEI_PER_SAT` wei; gas is zero on Flashnet. If the EVM
    // balance can't cover the value, the sequencer drops the tx for
    // "lack of funds" and the intent EXPIRES — but the gateway keeps the
    // EXPIRED row under the `intent_id` UNIQUE constraint and the EVM
    // nonce never advances (the tx was never included). The result is a
    // permanent 409 ("intent_id already submitted") on every identical
    // retry. Refuse here with a clear message so a withdraw submitted
    // before its funding deposit has FINALIZED can be retried later
    // instead of burning its intent_id. (Most common cause: withdrawing
    // before the deposit credited the recipient.)
    const value = params.amount * WEI_PER_SAT;
    const balance = await fetchNativeBalance(this.config.rpcUrl, account.address);
    if (balance < value) {
      throw new Error(
        `insufficient EVM balance for withdraw: have ${balance} wei ` +
          `(${balance / WEI_PER_SAT} sats), need ${value} wei (${params.amount} sats). ` +
          `If you just deposited, wait for the deposit intent to reach FINALIZED ` +
          `(getIntentStatus / waitForIntent) before withdrawing.`
      );
    }

    const sparkRecipient = await this.getSparkRecipientHex();
    const calldata = encodeWithdrawSats(sparkRecipient);
    const nonce = await fetchNonce(this.config.rpcUrl, account.address);
    const fees = await fetchEip1559Fees(this.config.rpcUrl);
    const network = await this.getNetworkInfo();

    const signedTx = await account.signTransaction({
      to: network.execution.contractAddress as `0x${string}`,
      data: calldata as `0x${string}`,
      value: params.amount * WEI_PER_SAT,
      chainId: this.config.chainId,
      nonce,
      gas: DEFAULT_WITHDRAW_GAS_LIMIT,
      ...fees,
      type: "eip1559" as const,
    });

    return this.submitIntent([], { type: "execute", signedTxHash: viemKeccak256(signedTx) }, {
      evmTransaction: signedTx,
      recipientForHash: account.address,
      expiresAt: params.expiresAt,
    });
  }

  /**
   * Withdraw an ERC20 token from EVM back to Spark.
   * Signs a SparkGateway.withdrawBtkn transaction with the identity key.
   */
  async withdrawToken(params: WithdrawTokenParams): Promise<ExecuteResponse> {
    this.requireAuth();
    const account = await this.getEvmAccount();
    const sparkRecipient = await this.getSparkRecipientHex();
    const calldata = encodeWithdrawToken(
      params.tokenAddress,
      params.amount,
      sparkRecipient
    );
    const nonce = await fetchNonce(this.config.rpcUrl, account.address);
    const fees = await fetchEip1559Fees(this.config.rpcUrl);
    const network = await this.getNetworkInfo();

    const signedTx = await account.signTransaction({
      to: network.execution.contractAddress as `0x${string}`,
      data: calldata as `0x${string}`,
      value: 0n,
      chainId: this.config.chainId,
      nonce,
      gas: DEFAULT_WITHDRAW_GAS_LIMIT,
      ...fees,
      type: "eip1559" as const,
    });

    return this.submitIntent([], { type: "execute", signedTxHash: viemKeccak256(signedTx) }, {
      evmTransaction: signedTx,
      recipientForHash: account.address,
      expiresAt: params.expiresAt,
    });
  }

  /**
   * Submit a raw execute intent with a pre-signed EVM transaction.
   * For advanced use - prefer `withdraw()` or TradingClient methods.
   *
   * When `params.deposits` is non-empty, the same automatic proof
   * attachment that `deposit()` does applies here. Set
   * `params.manualProofs: true` to take over the proof flow yourself.
   */
  async execute(params: ExecuteParams): Promise<ExecuteResponse> {
    this.requireAuth();
    const deposits = params.deposits ?? [];
    if (deposits.length > 0) {
      validateDeposits(deposits);
    }

    const txHex = params.signedTx.startsWith("0x")
      ? params.signedTx
      : `0x${params.signedTx}`;
    const txHash = viemKeccak256(txHex as `0x${string}`);

    // The canonical recipient for the BLAKE3 intent_id is the RECOVERED
    // signer of the signed tx — that's exactly what the gateway uses
    // (`recover_sender_from_signed_tx`). `execute()` accepts arbitrary
    // externally-signed transactions, so we must not assume the SDK's own
    // identity account signed it; recovering keeps the intent_id (and any
    // attached deposit-proof binding) in lockstep with the gateway.
    // Flashnet withdraw/execute txs are EIP-1559 (0x02-typed); the cast
    // satisfies viem's serialized-transaction union.
    const recipientForHash = await recoverTransactionAddress({
      serializedTransaction: txHex as `0x02${string}`,
    });

    // Pass the normalized txHex to the gateway, not the raw input. If the
    // server recomputes the hash from evmTransaction (it does, for
    // signature verification) the hashes must match — passing the
    // unnormalized form would cause verification to fail for any caller
    // that omits the 0x prefix.
    return this.submitIntent(
      deposits,
      { type: "execute", signedTxHash: txHash },
      {
        evmTransaction: txHex,
        recipientForHash,
        expiresAt: params.expiresAt,
        manualProofs: params.manualProofs,
      }
    );
  }

  /**
   * Request a refund of a Spark transfer whose intent never finalized on EVM.
   *
   * Submits an `IntentAction::Clawback` (no deposits): the sequencer resolves
   * the original transfer from custody, plans a `SparkGateway.refundTx`, and
   * returns the funds to the original Spark sender.
   *
   * Eligibility is enforced server-side — the transfer must exist in custody
   * and must not have been consumed by a finalized intent, and the caller's
   * identity key must match the original sender. A clawback for a transfer
   * that already finalized is rejected; treat that as "already settled", not
   * a transient error to retry.
   *
   * @param sparkTxid Hex Spark transfer id returned when the funding transfer
   *   was made.
   */
  async clawback(
    sparkTxid: string,
    opts?: { expiresAt?: number }
  ): Promise<ExecuteResponse> {
    this.requireAuth();
    return this.submitIntent(
      [],
      { type: "clawback", sparkTxid },
      {
        // Ignored for clawback by `canonicalIntentId` (it zeroes the
        // recipient), but the field is non-optional on `submitIntent`.
        recipientForHash: "0x0000000000000000000000000000000000000000",
        clawback: { sparkTxid },
        expiresAt: opts?.expiresAt,
      }
    );
  }

  /**
   * Attempt to claw back several Spark transfers, one intent each. Never
   * throws on an individual failure: returns a per-transfer result so callers
   * can report recovered vs. still-at-risk.
   */
  async clawbackMany(
    sparkTxids: string[],
    opts?: { expiresAt?: number }
  ): Promise<ClawbackResult[]> {
    const results: ClawbackResult[] = [];
    for (const sparkTxid of sparkTxids) {
      try {
        const response = await this.clawback(sparkTxid, opts);
        results.push({ transferId: sparkTxid, success: true, response });
      } catch (err) {
        results.push({
          transferId: sparkTxid,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  /**
   * Look up the lifecycle status of a previously submitted intent.
   *
   * Calls `GET /api/v1/intents/{submissionId}` on the gateway. No auth
   * required — submission IDs are non-guessable handles, and a leak only
   * exposes status text. Use {@link waitForIntent} to poll until a target
   * status is reached.
   *
   * @throws if the submission is unknown (HTTP 404) or the gateway is
   *   unreachable.
   */
  async getIntentStatus(submissionId: string): Promise<IntentStatusResponse> {
    if (!submissionId || submissionId.trim() === "") {
      throw new Error("submissionId is required");
    }
    const path = `/api/v1/intents/${encodeURIComponent(submissionId)}`;
    const resp = await fetch(`${this.config.gatewayUrl}${path}`);
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(
        `gateway ${path} returned HTTP ${resp.status}: ${text}`
      );
    }
    let parsed: IntentStatusResponse;
    try {
      parsed = JSON.parse(text) as IntentStatusResponse;
    } catch {
      throw new Error(`gateway ${path} response is not valid JSON: ${text}`);
    }
    // Canonicalize to SCREAMING_SNAKE_CASE — the gateway is internally
    // inconsistent (POST /execute emits lowercase "accepted", GET emits
    // uppercase) and consumers compare against IntentStatus.
    parsed.status = normalizeIntentStatus(parsed.status as unknown as string);
    return parsed;
  }

  /**
   * Poll {@link getIntentStatus} until the intent reaches a terminal state
   * (or, optionally, a specific target status), then return the final
   * record.
   *
   * The default target is "any terminal state" (`finalized | rejected |
   * expired`). To wait only for inclusion without finality, pass
   * `until: "included_pending_finality"`.
   *
   * `onUpdate` fires for every fetched status, including the first response
   * and the terminal one. Suitable for driving a UI stepper without writing
   * your own polling loop.
   *
   * Cancellation: pass an `AbortSignal` to cancel mid-poll. The signal is
   * checked between polls and will reject the returned promise with the
   * signal's `reason`.
   *
   * @throws if the configured `timeoutMs` elapses before a target status
   *   is reached.
   */
  async waitForIntent(
    submissionId: string,
    opts: WaitForIntentOptions = {}
  ): Promise<IntentStatusResponse> {
    const interval = opts.intervalMs ?? 1500;
    const timeout = opts.timeoutMs ?? 5 * 60_000;
    const onUpdate = opts.onUpdate;
    const signal = opts.signal;
    const target = opts.until;
    const deadline = Date.now() + timeout;

    const matches = (status: IntentStatus): boolean => {
      if (target) return status === target || isTerminalIntentStatus(status);
      return isTerminalIntentStatus(status);
    };

    // First poll happens immediately so callers see the current status
    // before any wait.
    while (true) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error("waitForIntent aborted");
      }
      const record = await this.getIntentStatus(submissionId);
      onUpdate?.(record);
      if (matches(record.status)) return record;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `waitForIntent(${submissionId}) timed out after ${timeout}ms in status "${record.status}"`
        );
      }
      await sleep(Math.min(interval, remaining), signal);
    }
  }

  /**
   * Build a viem `PublicClient` configured for the same JSON-RPC URL and
   * chain id this ExecutionClient was constructed with.
   *
   * Use this for read-only `eth_*` calls — `getBlockNumber`, `getBalance`,
   * `readContract`, etc. The Flashnet RPC is filtered to read methods only
   * (write methods are blocked); transactions must be submitted as intents
   * via {@link withdraw} / {@link withdrawToken} / {@link execute}.
   */
  getPublicClient(): PublicClient {
    return createPublicClient({
      chain: {
        id: this.config.chainId,
        name: `flashnet-${this.config.chainId}`,
        nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
        rpcUrls: { default: { http: [this.config.rpcUrl] } },
      },
      transport: http(this.config.rpcUrl),
    });
  }

  /**
   * Check if the gateway is healthy.
   */
  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.config.gatewayUrl}/api/v1/health`);
      if (!resp.ok) return false;
      const body = (await resp.json()) as { status?: string };
      return body.status === "ok";
    } catch {
      return false;
    }
  }

  /** Returns the current access token, or null if not authenticated. */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Returns the client configuration. */
  getConfig(): Readonly<ExecutionClientConfig> {
    return this.config;
  }

  /**
   * Accessor for the wrapped SparkWallet. Exposed so higher-level clients
   * (e.g. TradingClient) can issue Spark transfers to fund a bundled deposit
   * in the same execute intent without duplicating wallet ownership.
   *
   * Prefer the ExecutionClient / TradingClient methods over reaching for the
   * wallet directly — this is an escape hatch, not a recommended API.
   */
  getSparkWallet(): SparkWalletInput {
    return this.wallet;
  }

  // ── Private ────────────────────────────────────────────────

  /**
   * Get the Spark identity public key as a 0x-prefixed hex string
   * for use as the sparkRecipient in withdrawal calls.
   */
  async getSparkRecipientHex(): Promise<string> {
    const pubkey = await getWalletSigner(this.wallet).getIdentityPublicKey();
    const hex = bytesToHex(pubkey);
    return hex.startsWith("0x") ? hex : `0x${hex}`;
  }

  private async submitIntent(
    rawDeposits: Deposit[],
    action: CanonicalIntentAction,
    requestAction: {
      recipient?: string;
      evmTransaction?: string;
      /**
       * Canonical recipient used in the BLAKE3 intent-id preimage. For
       * Deposit it equals `requestAction.recipient`; for Execute it is
       * the recovered ECDSA signer of `evmTransaction` (for self-signed
       * flows that is the SDK's own EVM address). Ignored for Clawback.
       */
      recipientForHash: string;
      /**
       * Clawback target. When set, the body carries a `clawback` action and
       * `rawDeposits` MUST be empty. Mutually exclusive with `recipient` and
       * `evmTransaction`.
       */
      clawback?: { sparkTxid: string };
      expiresAt?: number;
      manualProofs?: boolean;
    }
  ): Promise<ExecuteResponse> {
    const expiresAt = resolveExpiresAt(requestAction.expiresAt);

    // Build wire-shaped transfers (no proofs yet). The intent_id BLAKE3
    // preimage does NOT cover `depositProof` or `expiresAt`, so we can
    // compute the canonical intent id from a proof-less projection and
    // attach proofs afterwards. See `canonicalIntentId` in ./types.
    const placeholderTransfers: CanonicalTransferEntry[] = rawDeposits.map((d) => {
      const amountBig =
        typeof d.amount === "bigint" ? d.amount : BigInt(d.amount);
      if (amountBig < 0n) {
        throw new Error(`deposits[${d.sparkTransferId}].amount must be non-negative`);
      }
      return {
        transferId: d.sparkTransferId,
        amount: u256Hex(amountBig),
        asset: depositAssetToWire(d.asset),
        depositProof: d.depositProof ?? PLACEHOLDER_DEPOSIT_PROOF,
      };
    });

    const intentId = canonicalIntentId({
      chainId: this.config.chainId,
      transfers: placeholderTransfers,
      action,
      recipientForHash: requestAction.recipientForHash,
      signedTxHex: requestAction.evmTransaction,
    });

    // Auto-attach proofs for any deposit that arrives without one. The
    // returned `Deposit[]` is the same caller-facing shape with
    // `depositProof` populated. Falls through silently on a 503 from
    // /verifyDeposit (soft-mode gateway), and throws on any
    // per-transfer rejection.
    const deposits = await this.resolveProofs(
      rawDeposits,
      intentId,
      requestAction.manualProofs
    );

    // Final canonical transfers with resolved proofs (or placeholders).
    const transfers: CanonicalTransferEntry[] = deposits.map((d) => {
      const amountBig =
        typeof d.amount === "bigint" ? d.amount : BigInt(d.amount);
      return {
        transferId: d.sparkTransferId,
        amount: u256Hex(amountBig),
        asset: depositAssetToWire(d.asset),
        depositProof: d.depositProof ?? PLACEHOLDER_DEPOSIT_PROOF,
      };
    });

    // IMPORTANT: Field order here MUST match the declaration order of
    // `CanonicalIntentMessage` on the Rust side. `stringifyWithBigint`
    // preserves JS object insertion order, and the validator signature
    // check hashes the resulting JSON byte-for-byte. Reordering these
    // keys (or the Rust struct) silently breaks auth — the signed
    // bytes diverge but no type-level error surfaces. A golden-vector
    // test in stringify-bigint.spec.ts locks in the current ordering.
    // The signed message must byte-match the gateway's serde output. For
    // clawback the action's `sparkTxid` is a `SparkTransferId` enum on the Rust
    // side, serialized externally tagged as `{ Bitcoin|Token: [...bytes] }` —
    // NOT the hex string carried in the request body and the BLAKE3 preimage.
    const messageAction =
      action.type === "clawback"
        ? {
            type: "clawback" as const,
            sparkTxid: clawbackSparkTxidWire(action.sparkTxid),
          }
        : action;
    const canonicalMessage = {
      chainId: this.config.chainId,
      transfers,
      action: messageAction,
      expiresAt,
    };

    const messageJson = stringifyWithBigint(canonicalMessage);
    const signature = await this.signer.signMessage(messageJson);

    // Body mirrors the Rust `ExecuteRequest` struct. `amount` is U256
    // hex on the Rust side; we emit `0x`-prefixed lowercase hex
    // matching alloy's serde shape.
    //
    // Each deposit carries a `depositProof` (either the gateway-signed
    // value from /verifyDeposit, a caller-supplied pre-attached proof,
    // or the {payloadBytes:"0x", signature:"0x"} placeholder that the
    // gateway treats as "not configured" via has_valid_shape()).
    const body: Record<string, unknown> = {
      chainId: this.config.chainId,
      deposits: transfers.map((t) => ({
        sparkTransferId: t.transferId,
        amount: t.amount,
        asset: t.asset,
        depositProof: t.depositProof,
      })),
      signature,
      expiresAt,
    };

    if (requestAction.recipient) {
      body.recipient = requestAction.recipient;
    }
    if (requestAction.evmTransaction) {
      body.evmTransaction = requestAction.evmTransaction;
    }
    if (requestAction.clawback) {
      body.clawback = { sparkTxid: requestAction.clawback.sparkTxid };
    }

    const resp = await this.post<ExecuteResponse>("/api/v1/execute", body, {
      Authorization: `Bearer ${this.accessToken}`,
    });
    // POST /execute returns the initial status as lowercase "accepted";
    // canonicalize so callers always see SCREAMING_SNAKE_CASE.
    resp.status = normalizeIntentStatus(resp.status as unknown as string);
    return resp;
  }

  private requireAuth(): void {
    if (!this.accessToken) {
      throw new Error(
        "Not authenticated. Call authenticate() before submitting intents."
      );
    }
  }

  private async post<T>(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const resp = await fetch(`${this.config.gatewayUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      // Use stringifyWithBigint so u64 amounts above 2^53 survive as JSON
      // numeric literals that the Rust gateway (serde u64) parses directly.
      body: stringifyWithBigint(body),
    });

    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(
        `Execution gateway request failed (${resp.status}): ${text}`
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Execution gateway response is not valid JSON: ${text}`);
    }
  }
}

// ── Utilities ────────────────────────────────────────────────

/**
 * Build an ExecutionSigner from a SparkWallet's identity key.
 */
function sparkWalletToExecutionSigner(wallet: SparkWalletInput): ExecutionSigner {
  const signer = getWalletSigner(wallet);

  return {
    async getPublicKey(): Promise<string> {
      const pubkey = await signer.getIdentityPublicKey();
      return bytesToHex(pubkey);
    },

    async signMessage(message: string): Promise<string> {
      const encoded = new TextEncoder().encode(message);
      const hash = sha256(encoded);
      const signature = await signer.signMessageWithIdentityKey(hash);
      return bytesToHex(signature);
    },
  };
}

/**
 * Cancellable sleep. Resolves after `ms`, or rejects with `signal.reason`
 * if the signal is aborted in the meantime.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Detect the "endpoint not (yet) available" 503 surface so callers
 * can fall back to legacy behaviour without leaking the failure.
 * Pattern-matches the error message thrown by `ExecutionClient.post`
 * so we don't have to surface response.status through the type layer.
 */
function isGatewayUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /failed \(503\)/.test(err.message);
}

/**
 * Thrown when `/verifyDeposit` returns per-transfer rejections. The
 * `rejections` field carries the structured details so callers can
 * branch programmatically on `reason` (e.g. retry on
 * `transfer_not_found`, alert on `condition_a_failed`) instead of
 * parsing the message string.
 */
export class VerifyDepositRejectedError extends Error {
  readonly rejections: DepositRejection[];
  constructor(rejections: DepositRejection[]) {
    const summary = rejections
      .map((r) => `[${r.index}] ${r.sparkTransferId}: ${r.reason} (${r.message})`)
      .join("; ");
    super(`verifyDeposit returned ${rejections.length} rejection(s): ${summary}`);
    this.name = "VerifyDepositRejectedError";
    this.rejections = rejections;
  }
}

/** Hex-with-optional-0x of exactly 64 bytes (128 hex chars). */
const SIGNATURE_HEX_RE = /^(0x|0X)?[0-9a-fA-F]{128}$/;

function validateDeposits(deposits: Deposit[]): void {
  if (deposits.length === 0) {
    throw new Error("deposits must contain at least one entry");
  }
  for (let i = 0; i < deposits.length; i++) {
    const d = deposits[i]!;
    if (!d.sparkTransferId || d.sparkTransferId.trim() === "") {
      throw new Error(`deposits[${i}].sparkTransferId is required`);
    }
    if (typeof d.amount === "number" && (Number.isNaN(d.amount) || !Number.isFinite(d.amount))) {
      throw new Error(`deposits[${i}].amount is not a valid number`);
    }
    // Reject number inputs above Number.MAX_SAFE_INTEGER (2^53 - 1).
    // u64 amounts larger than that silently round at the JS number layer
    // before BigInt() can observe the true value, and the canonical
    // signature would cover the rounded amount — not what the caller
    // intended. Require callers to pass a bigint in that range.
    if (typeof d.amount === "number" && !Number.isSafeInteger(d.amount)) {
      throw new Error(
        `deposits[${i}].amount (${d.amount}) exceeds Number.MAX_SAFE_INTEGER; pass a bigint to preserve precision`
      );
    }
    if (typeof d.amount === "bigint" ? d.amount <= 0n : d.amount <= 0) {
      throw new Error(`deposits[${i}].amount must be greater than zero`);
    }
    if (
      d.asset.type === "token" &&
      (!d.asset.tokenId || d.asset.tokenId.trim() === "")
    ) {
      throw new Error(
        `deposits[${i}].asset.tokenId is required for token deposits`
      );
    }
  }
}

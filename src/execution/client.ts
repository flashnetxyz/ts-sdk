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
 *   bridgeAddress: "0x...",
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

import { keccak256 as viemKeccak256 } from "viem";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { sparkWalletToEvmAccount, getWalletSigner, type SparkWalletInput } from "./spark-evm-account";
import type { LocalAccount } from "viem/accounts";
import { encodeWithdrawSats, encodeWithdrawToken } from "./bridge";
import { fetchNonce, fetchEip1559Fees } from "./evm";
import type {
  CanonicalIntentAction,
  CanonicalIntentMessage,
  CanonicalTransferEntry,
  Deposit,
  ExecuteResponse,
  ExecutionSigner,
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
 * The output JSON is canonical in the same sense as `JSON.stringify`:
 * object keys appear in insertion order and there is no whitespace.
 */
export function stringifyWithBigint(value: unknown): string {
  const BIGINT_SENTINEL = "__BIGINT_SENTINEL__";
  // Pass 1: replace bigints with tagged strings so JSON.stringify succeeds.
  const body = JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? `${BIGINT_SENTINEL}${v.toString()}` : v
  );
  // Pass 2: strip the quotes + sentinel so the bigint becomes a raw numeric
  // literal in the emitted JSON. Only unsigned decimal digits are allowed
  // in a sentinel-tagged value so this regex is safe.
  return body.replace(
    new RegExp(`"${BIGINT_SENTINEL}(\\d+)"`, "g"),
    "$1"
  );
}

// Named network configs were removed until real deployment addresses are
// available. Callers must pass an explicit ExecutionClientConfig. Once the
// mainnet/testnet/regtest endpoints are finalized, add them here with the
// correct bridge addresses (which WILL differ per network).

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
  /** SparkBridge contract address (0x-prefixed). */
  bridgeAddress: string;
}

/** Parameters for a deposit intent. */
export interface DepositParams {
  /** Spark transfers funding this deposit. */
  deposits: Deposit[];
  /** EVM address to credit. If omitted, credits the identity key's EVM address. */
  recipient?: string;
}

/** Parameters for a BTC withdrawal. */
export interface WithdrawParams {
  /** Amount in satoshis to withdraw. */
  amount: bigint;
}

/** Parameters for a token withdrawal. */
export interface WithdrawTokenParams {
  /** ERC20 token contract address. */
  tokenAddress: string;
  /** Amount in token base units. */
  amount: bigint;
}

/** Parameters for a raw execute intent (advanced). */
export interface ExecuteParams {
  /** Spark transfers to credit before executing. */
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
export class ExecutionClient {
  private readonly config: ExecutionClientConfig;
  private readonly wallet: SparkWalletInput;
  private readonly signer: ExecutionSigner;
  private evmAccount: LocalAccount | null = null;
  private accessToken: string | null = null;

  /**
   * @param wallet - SparkWallet instance (identity key used for auth + EVM signing).
   * @param config - Explicit endpoint configuration: gatewayUrl, rpcUrl,
   *   chainId, bridgeAddress. Named network shortcuts will be re-added
   *   once real deployments exist.
   */
  constructor(wallet: SparkWalletInput, config: ExecutionClientConfig) {
    this.config = {
      ...config,
      gatewayUrl: config.gatewayUrl.replace(/\/+$/, ""),
    };
    this.wallet = wallet;
    this.signer = sparkWalletToExecutionSigner(wallet);
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
   * Credits the deposited funds to the specified recipient or the identity key's EVM address.
   */
  async deposit(params: DepositParams): Promise<ExecuteResponse> {
    this.requireAuth();
    validateDeposits(params.deposits);

    const recipient = params.recipient ?? (await this.getEvmAddress());

    const action: CanonicalIntentAction = {
      type: "deposit",
      recipient: recipient.toLowerCase(),
    };

    return this.submitIntent(params.deposits, action, {
      recipient: recipient.toLowerCase(),
    });
  }

  /**
   * Withdraw native BTC (sats) from EVM back to Spark.
   * Signs a SparkBridge.withdrawSats transaction with the identity key.
   *
   * @param params.amount - Amount in satoshis.
   */
  async withdraw(params: WithdrawParams): Promise<ExecuteResponse> {
    this.requireAuth();
    const account = await this.getEvmAccount();
    const sparkRecipient = await this.getSparkRecipientHex();
    const calldata = encodeWithdrawSats(sparkRecipient);
    const nonce = await fetchNonce(this.config.rpcUrl, account.address);
    const fees = await fetchEip1559Fees(this.config.rpcUrl);

    const signedTx = await account.signTransaction({
      to: this.config.bridgeAddress as `0x${string}`,
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
    });
  }

  /**
   * Withdraw an ERC20 token from EVM back to Spark.
   * Signs a SparkBridge.withdrawBtkn transaction with the identity key.
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

    const signedTx = await account.signTransaction({
      to: this.config.bridgeAddress as `0x${string}`,
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
    });
  }

  /**
   * Submit a raw execute intent with a pre-signed EVM transaction.
   * For advanced use — prefer `withdraw()` or AMMClient methods.
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

    return this.submitIntent(
      deposits,
      { type: "execute", signedTxHash: txHash },
      { evmTransaction: params.signedTx }
    );
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
    deposits: Deposit[],
    action: CanonicalIntentAction,
    requestAction: { recipient?: string; evmTransaction?: string }
  ): Promise<ExecuteResponse> {
    const nonce = crypto.randomUUID();

    const transfers: CanonicalTransferEntry[] = deposits.map((d) => {
      // Preserve full u64 precision by carrying bigint all the way to the
      // canonical JSON. Number() casting would lose precision for any
      // 18-decimal token amount (1e18 > 2^53). We validate the amount fits
      // in u64 here; the custom serializer below emits bigints as JSON
      // numeric literals (which Rust's serde_json parses to u64).
      const amountBig =
        typeof d.amount === "bigint" ? d.amount : BigInt(d.amount);
      if (amountBig < 0n || amountBig > U64_MAX) {
        throw new Error(
          `deposit amount ${d.amount} out of u64 range [0, ${U64_MAX}]`
        );
      }
      const entry: CanonicalTransferEntry = {
        transferId: d.sparkTransferId,
        // Store as bigint so the custom serializer emits it as a numeric
        // literal preserving full precision.
        amountSats: amountBig,
        assetType: d.asset.type === "btc" ? "NativeSats" : "BridgedToken",
      };
      if (d.asset.type === "token") {
        entry.tokenId = d.asset.tokenId;
      }
      return entry;
    });

    const canonicalMessage: CanonicalIntentMessage = {
      chainId: this.config.chainId,
      transfers,
      action,
      nonce,
    };

    const messageJson = stringifyWithBigint(canonicalMessage);
    const signature = await this.signer.signMessage(messageJson);

    // Body mirrors the Rust `ExecuteRequest` struct. `amount` is u64 on
    // the Rust side; we emit bigints as numeric literals (not strings)
    // so serde_json parses them as u64 without any serde override.
    const body: Record<string, unknown> = {
      chainId: this.config.chainId,
      deposits: deposits.map((d) => ({
        sparkTransferId: d.sparkTransferId,
        asset: d.asset,
        amount: typeof d.amount === "bigint" ? d.amount : d.amount,
      })),
      signature,
      nonce,
    };

    if (requestAction.recipient) {
      body.recipient = requestAction.recipient;
    }
    if (requestAction.evmTransaction) {
      body.evmTransaction = requestAction.evmTransaction;
    }

    return this.post<ExecuteResponse>("/api/v1/execute", body, {
      Authorization: `Bearer ${this.accessToken}`,
    });
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

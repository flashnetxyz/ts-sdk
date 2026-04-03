/**
 * Flashnet Execution Client
 *
 * Client for interacting with the Flashnet execution gateway.
 * Handles authentication, intent construction, signing, and submission.
 *
 * This is the new execution-layer client, separate from the legacy AMM client
 * (FlashnetClient). The legacy client talks to flashnet-services/settlement;
 * this client talks to flashnet-execution's gateway.
 */

import type {
  CanonicalIntentAction,
  CanonicalIntentMessage,
  CanonicalTransferEntry,
  Deposit,
  DepositIntentParams,
  ExecuteIntentParams,
  ExecuteResponse,
  ExecutionClientConfig,
  ExecutionSigner,
} from "./types";

/**
 * Client for the Flashnet execution gateway.
 *
 * Supports multi-deposit intents (deposit-only and deposit-and-execute).
 *
 * @example
 * ```typescript
 * import { ExecutionClient } from "@flashnet/sdk/execution";
 *
 * const client = new ExecutionClient({
 *   gatewayUrl: "http://localhost:8080",
 * }, signer);
 *
 * await client.authenticate();
 *
 * const response = await client.submitDeposit({
 *   chainId: 1337,
 *   deposits: [
 *     { sparkTransferId: "aabb...", amount: 100000, asset: { type: "btc" } },
 *   ],
 *   recipient: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
 * });
 * ```
 */
export class ExecutionClient {
  private readonly gatewayUrl: string;
  private readonly signer: ExecutionSigner;
  private accessToken: string | null = null;

  constructor(config: ExecutionClientConfig, signer: ExecutionSigner) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/+$/, "");
    this.signer = signer;
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
   * Submit a deposit-only intent.
   * Credits the deposited funds to the specified recipient address.
   */
  async submitDeposit(params: DepositIntentParams): Promise<ExecuteResponse> {
    this.requireAuth();
    validateDeposits(params.deposits);

    const action: CanonicalIntentAction = {
      type: "deposit",
      recipient: params.recipient.toLowerCase(),
    };

    return this.submitIntent(params.chainId, params.deposits, action, {
      recipient: params.recipient.toLowerCase(),
    });
  }

  /**
   * Submit a deposit-and-execute intent.
   * Deposits are credited to the recovered signer of the EVM transaction,
   * and the transaction is executed atomically in the same block.
   *
   * @param params.signedTxHash - Pre-computed keccak256 hash of the signed tx
   *   (0x-prefixed hex). If not provided, the client computes it from signedTx
   *   using the built-in keccak256 implementation.
   */
  async submitExecute(
    params: ExecuteIntentParams & { signedTxHash?: string }
  ): Promise<ExecuteResponse> {
    this.requireAuth();
    if (params.deposits.length > 0) {
      validateDeposits(params.deposits);
    }

    const txHash =
      params.signedTxHash ?? keccak256Hex(hexToBytes(params.signedTx));

    const action: CanonicalIntentAction = {
      type: "execute",
      signedTxHash: txHash,
    };

    return this.submitIntent(params.chainId, params.deposits, action, {
      evmTransaction: params.signedTx,
    });
  }

  /**
   * Check if the gateway is healthy.
   */
  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.gatewayUrl}/api/v1/health`);
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

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async submitIntent(
    chainId: number,
    deposits: Deposit[],
    action: CanonicalIntentAction,
    requestAction: { recipient?: string; evmTransaction?: string }
  ): Promise<ExecuteResponse> {
    const nonce = crypto.randomUUID();

    const transfers: CanonicalTransferEntry[] = deposits.map((d) => {
      const amount =
        typeof d.amount === "bigint" ? Number(d.amount) : d.amount;
      if (!Number.isSafeInteger(amount)) {
        throw new Error(
          `deposit amount ${d.amount} exceeds safe integer range (max ${Number.MAX_SAFE_INTEGER})`
        );
      }
      const entry: CanonicalTransferEntry = {
        transferId: d.sparkTransferId,
        amountSats: amount,
        assetType: d.asset.type === "btc" ? "NativeSats" : "BridgedToken",
      };
      if (d.asset.type === "token") {
        entry.tokenId = d.asset.tokenId;
      }
      return entry;
    });

    const canonicalMessage: CanonicalIntentMessage = {
      chainId,
      transfers,
      action,
      nonce,
    };

    const messageJson = JSON.stringify(canonicalMessage);
    const signature = await this.signer.signMessage(messageJson);

    const body: Record<string, unknown> = {
      chainId,
      deposits: deposits.map((d) => ({
        sparkTransferId: d.sparkTransferId,
        asset: d.asset,
        amount:
          typeof d.amount === "bigint" ? d.amount.toString() : d.amount,
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
    const resp = await fetch(`${this.gatewayUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function validateDeposits(deposits: Deposit[]): void {
  if (deposits.length === 0) {
    throw new Error("deposits must contain at least one entry");
  }
  for (let i = 0; i < deposits.length; i++) {
    const d = deposits[i]!;
    if (!d.sparkTransferId || d.sparkTransferId.trim() === "") {
      throw new Error(`deposits[${i}].sparkTransferId is required`);
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

/** Convert a hex string (with or without 0x prefix) to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean =
    hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(
      `hexToBytes: input has odd length (${clean.length} hex chars)`
    );
  }
  if (clean.length > 0 && !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("hexToBytes: input contains invalid hex characters");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Compute keccak256 hash of bytes, returning 0x-prefixed lowercase hex. */
function keccak256Hex(data: Uint8Array): string {
  return `0x${bytesToHex(keccak256(data))}`;
}

// ---------------------------------------------------------------------------
// Minimal Keccak-256 (Ethereum hash)
// Public domain reference adapted for strict TypeScript.
// ---------------------------------------------------------------------------

const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROTC: number[] = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18,
  39, 61, 20, 44,
];
const PI: number[] = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14,
  22, 9, 6, 1,
];
const M64 = 0xffffffffffffffffn;

function keccakF(s: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    const c0 = s[0]! ^ s[5]! ^ s[10]! ^ s[15]! ^ s[20]!;
    const c1 = s[1]! ^ s[6]! ^ s[11]! ^ s[16]! ^ s[21]!;
    const c2 = s[2]! ^ s[7]! ^ s[12]! ^ s[17]! ^ s[22]!;
    const c3 = s[3]! ^ s[8]! ^ s[13]! ^ s[18]! ^ s[23]!;
    const c4 = s[4]! ^ s[9]! ^ s[14]! ^ s[19]! ^ s[24]!;
    const c = [c0, c1, c2, c3, c4];
    for (let x = 0; x < 5; x++) {
      const next = c[(x + 1) % 5]!;
      const d = c[(x + 4) % 5]! ^ (((next << 1n) | (next >> 63n)) & M64);
      for (let y = 0; y < 25; y += 5) s[y + x] = (s[y + x]! ^ d) & M64;
    }
    let last = s[1]!;
    for (let i = 0; i < 24; i++) {
      const j = PI[i]!;
      const temp = s[j]!;
      const r = BigInt(ROTC[i]!);
      s[j] = ((last << r) | (last >> (64n - r))) & M64;
      last = temp;
    }
    for (let y = 0; y < 25; y += 5) {
      const t0 = s[y]!,
        t1 = s[y + 1]!,
        t2 = s[y + 2]!,
        t3 = s[y + 3]!,
        t4 = s[y + 4]!;
      s[y] = (t0 ^ (~t1 & t2)) & M64;
      s[y + 1] = (t1 ^ (~t2 & t3)) & M64;
      s[y + 2] = (t2 ^ (~t3 & t4)) & M64;
      s[y + 3] = (t3 ^ (~t4 & t0)) & M64;
      s[y + 4] = (t4 ^ (~t0 & t1)) & M64;
    }
    s[0] = (s[0]! ^ RC[round]!) & M64;
  }
}

function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136;
  const s: bigint[] = new Array<bigint>(25).fill(0n);

  let offset = 0;
  while (offset + rate <= data.length) {
    for (let i = 0; i < rate; i += 8) {
      let lane = 0n;
      for (let b = 0; b < 8; b++)
        lane |= BigInt(data[offset + i + b]!) << BigInt(b * 8);
      s[i >> 3] = s[i >> 3]! ^ lane;
    }
    keccakF(s);
    offset += rate;
  }

  const padded = new Uint8Array(rate);
  const remaining = data.length - offset;
  for (let i = 0; i < remaining; i++) padded[i] = data[offset + i]!;
  padded[remaining] = 0x01;
  padded[rate - 1] = padded[rate - 1]! | 0x80;

  for (let i = 0; i < rate; i += 8) {
    let lane = 0n;
    for (let b = 0; b < 8; b++) lane |= BigInt(padded[i + b]!) << BigInt(b * 8);
    s[i >> 3] = s[i >> 3]! ^ lane;
  }
  keccakF(s);

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const lane = s[i]!;
    for (let b = 0; b < 8; b++)
      out[i * 8 + b] = Number((lane >> BigInt(b * 8)) & 0xffn);
  }
  return out;
}

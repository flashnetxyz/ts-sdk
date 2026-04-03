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

import { keccak256 as viemKeccak256 } from "viem";
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

    const txHex = params.signedTx.startsWith("0x")
      ? params.signedTx
      : `0x${params.signedTx}`;
    const txHash =
      params.signedTxHash ?? viemKeccak256(txHex as `0x${string}`);

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

  // Private

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

// Utilities

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

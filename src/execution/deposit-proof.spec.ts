/**
 * Tests for the deposit-proof types, helpers, and auto-attach flow.
 */
import { ExecutionClient, VerifyDepositRejectedError } from "./client";
import {
  PLACEHOLDER_DEPOSIT_PROOF,
  canonicalIntentId,
  type CanonicalIntentAction,
  type CanonicalTransferEntry,
  type DepositRejection,
  type IndexedDepositProof,
  type SignedDepositProof,
  type VerifyDepositsRequest,
  type VerifyDepositsResponse,
} from "./types";
import type { SparkWalletInput } from "./spark-evm-account";
import { secp256k1 } from "@noble/curves/secp256k1";

const TEST_KEY = new Uint8Array(32);
TEST_KEY[31] = 1;

function mockWallet(): SparkWalletInput {
  return {
    config: {
      signer: {
        getIdentityPublicKey: async () =>
          secp256k1.getPublicKey(TEST_KEY, true),
        signMessageWithIdentityKey: async () => new Uint8Array(64),
      },
    },
  } as unknown as SparkWalletInput;
}

const EXEC_CONFIG = {
  gatewayUrl: "http://localhost:8080",
  rpcUrl: "http://localhost:8545",
  chainId: 21022,
};

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, body = ""): Response {
  return new Response(body, {
    status,
    statusText: status === 503 ? "Service Unavailable" : "Error",
  });
}

// Bare-hex shape (the gateway accepts both bare and 0x-prefixed on input).
const SAMPLE_PROOF: SignedDepositProof = {
  payloadBytes: "deadbeef",
  signature: "ab".repeat(64),
};

// 0x-prefixed shape (the gateway emits this on /verifyDeposit responses
// via serde_bytes_hex, so any proof flowing through the BYO path will
// carry the prefix).
const SAMPLE_PROOF_0X: SignedDepositProof = {
  payloadBytes: "0xdeadbeef",
  signature: "0x" + "ab".repeat(64),
};

const RECIPIENT = "0x" + "01".repeat(20);

afterEach(() => {
  jest.restoreAllMocks();
});

describe("canonicalIntentId", () => {
  it("returns 64 lowercase hex chars (32-byte BLAKE3 output)", () => {
    const id = canonicalIntentId({
      chainId: 21022,
      transfers: [],
      action: { type: "deposit", recipient: RECIPIENT },
      recipientForHash: RECIPIENT,
    });
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the action recipient changes", () => {
    const a = canonicalIntentId({
      chainId: 21022,
      transfers: [],
      action: { type: "deposit", recipient: RECIPIENT },
      recipientForHash: RECIPIENT,
    });
    const otherRecipient = "0x" + "02".repeat(20);
    const b = canonicalIntentId({
      chainId: 21022,
      transfers: [],
      action: { type: "deposit", recipient: otherRecipient },
      recipientForHash: otherRecipient,
    });
    expect(a).not.toEqual(b);
  });

  it("is stable across `depositProof` field changes (proof not in preimage)", () => {
    const action: CanonicalIntentAction = {
      type: "deposit",
      recipient: RECIPIENT,
    };
    const baseTransfer: CanonicalTransferEntry = {
      transferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
      amount: "0x186a0",
      asset: { type: "NATIVE_SATS" },
      depositProof: PLACEHOLDER_DEPOSIT_PROOF,
    };
    const withProof: CanonicalTransferEntry = {
      ...baseTransfer,
      depositProof: SAMPLE_PROOF,
    };
    const a = canonicalIntentId({
      chainId: 21022,
      transfers: [baseTransfer],
      action,
      recipientForHash: RECIPIENT,
    });
    const b = canonicalIntentId({
      chainId: 21022,
      transfers: [withProof],
      action,
      recipientForHash: RECIPIENT,
    });
    expect(a).toEqual(b);
  });

  it("treats a dashed-UUID transferId the same as its bare-hex form", () => {
    const action: CanonicalIntentAction = {
      type: "deposit",
      recipient: RECIPIENT,
    };
    const mk = (transferId: string): CanonicalTransferEntry => ({
      transferId,
      amount: "0x186a0",
      asset: { type: "NATIVE_SATS" },
      depositProof: PLACEHOLDER_DEPOSIT_PROOF,
    });
    const dashed = canonicalIntentId({
      chainId: 21022,
      transfers: [mk("a1b2c3d4-e5f6-0718-a1b2-c3d4e5f60718")],
      action,
      recipientForHash: RECIPIENT,
    });
    const bare = canonicalIntentId({
      chainId: 21022,
      transfers: [mk("a1b2c3d4e5f60718a1b2c3d4e5f60718")],
      action,
      recipientForHash: RECIPIENT,
    });
    expect(dashed).toEqual(bare);
    expect(dashed).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("VerifyDeposit type round-trips", () => {
  it("a request body shaped per the OpenAPI contract type-checks", () => {
    const req: VerifyDepositsRequest = {
      intentId: "0".repeat(64),
      transfers: [
        { sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718" },
        { sparkTransferId: "0x" + "ab".repeat(32) },
      ],
    };
    expect(req.transfers).toHaveLength(2);
    expect(req.intentId).toHaveLength(64);
  });

  it("a response body with mixed proofs and rejections type-checks", () => {
    const ok: IndexedDepositProof = { index: 0, proof: SAMPLE_PROOF };
    const rej: DepositRejection = {
      index: 1,
      sparkTransferId: "00".repeat(16),
      reason: "transfer_not_found",
      message: "no rows",
    };
    const resp: VerifyDepositsResponse = {
      proofs: [ok],
      rejections: [rej],
    };
    expect(resp.proofs[0]?.proof.signature).toHaveLength(128);
    expect(resp.rejections[0]?.reason).toBe("transfer_not_found");
  });
});

describe("ExecutionClient.deposit auto-attach flow", () => {
  function authenticatedClient(fetchMock: jest.Mock): ExecutionClient {
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    // Bypass the real auth handshake.
    (client as unknown as { accessToken: string }).accessToken = "test-token";
    return client;
  }

  it("calls /verifyDeposit with the canonical intentId and attaches each proof before /execute", async () => {
    const verifyResp: VerifyDepositsResponse = {
      proofs: [{ index: 0, proof: SAMPLE_PROOF }],
      rejections: [],
    };
    const executeResp = {
      submissionId: "sub-1",
      intentId: "0xabc",
      status: "accepted",
    };

    const fetchMock = jest.fn(async (input: unknown, _init?: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/v1/verifyDeposit")) return okResponse(verifyResp);
      if (url.endsWith("/api/v1/execute")) return okResponse(executeResp);
      throw new Error(`unexpected URL: ${url}`);
    });

    const client = authenticatedClient(fetchMock);
    const result = await client.deposit({
      deposits: [
        {
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          asset: { type: "btc" },
          amount: 100_000n,
        },
      ],
      recipient: RECIPIENT,
    });

    expect(result.submissionId).toBe("sub-1");
    // POST /execute returns lowercase "accepted"; the SDK canonicalizes it.
    expect(result.status).toBe("ACCEPTED");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Inspect the /execute body to confirm the proof was forwarded.
    const executeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/v1/execute")
    );
    if (!executeCall) throw new Error("/execute was not called");
    const init = executeCall[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.deposits[0].depositProof).toEqual(SAMPLE_PROOF);
    // Wire shape: amount is U256 hex, asset uses SCREAMING_SNAKE_CASE tag.
    expect(body.deposits[0].amount).toBe("0x186a0");
    expect(body.deposits[0].asset).toEqual({ type: "NATIVE_SATS" });
    // No top-level `nonce` field — replay defense is structural via intent_id.
    expect(body.nonce).toBeUndefined();

    // /verifyDeposit body carries the canonical intentId, not a random nonce.
    const verifyCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/v1/verifyDeposit")
    );
    if (!verifyCall) throw new Error("/verifyDeposit was not called");
    const verifyBody = JSON.parse(String((verifyCall[1] as RequestInit).body));
    expect(verifyBody.nonce).toBeUndefined();
    expect(verifyBody.intentId).toMatch(/^[0-9a-f]{64}$/);

    // The intentId in the verify body matches what the SDK would compute
    // from the same canonical preimage.
    const expectedIntentId = canonicalIntentId({
      chainId: EXEC_CONFIG.chainId,
      transfers: [
        {
          transferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          amount: "0x186a0",
          asset: { type: "NATIVE_SATS" },
          depositProof: PLACEHOLDER_DEPOSIT_PROOF,
        },
      ],
      action: { type: "deposit", recipient: RECIPIENT.toLowerCase() },
      recipientForHash: RECIPIENT.toLowerCase(),
    });
    expect(verifyBody.intentId).toEqual(expectedIntentId);
  });

  it("skips /verifyDeposit when every deposit arrives with a proof", async () => {
    const executeResp = {
      submissionId: "sub-2",
      intentId: "0xdef",
      status: "accepted",
    };
    const fetchMock = jest.fn(async (input: unknown, _init?: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/v1/execute")) return okResponse(executeResp);
      throw new Error(`unexpected URL: ${url}`);
    });

    const client = authenticatedClient(fetchMock);
    await client.deposit({
      deposits: [
        {
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          asset: { type: "btc" },
          amount: 100_000n,
          depositProof: SAMPLE_PROOF,
        },
      ],
      recipient: RECIPIENT,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/v1/execute");
  });

  it("falls back to /execute with a placeholder proof when /verifyDeposit returns 503", async () => {
    const executeResp = {
      submissionId: "sub-3",
      intentId: "0xfeed",
      status: "accepted",
    };
    const fetchMock = jest.fn(async (input: unknown, _init?: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/v1/verifyDeposit")) return errorResponse(503);
      if (url.endsWith("/api/v1/execute")) return okResponse(executeResp);
      throw new Error(`unexpected URL: ${url}`);
    });

    const client = authenticatedClient(fetchMock);
    const result = await client.deposit({
      deposits: [
        {
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          asset: { type: "btc" },
          amount: 100_000n,
        },
      ],
      recipient: RECIPIENT,
    });

    expect(result.submissionId).toBe("sub-3");
    const executeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/v1/execute")
    );
    if (!executeCall) throw new Error("/execute was not called");
    const body = JSON.parse(String((executeCall[1] as RequestInit).body));
    // On 503 the placeholder shape is sent — the gateway's
    // has_valid_shape() treats it as "not configured" and falls through
    // to the legacy admission path.
    expect(body.deposits[0].depositProof).toEqual(PLACEHOLDER_DEPOSIT_PROOF);
  });

  it("rejects with a typed VerifyDepositRejectedError carrying structured rejections", async () => {
    const verifyResp: VerifyDepositsResponse = {
      proofs: [],
      rejections: [
        {
          index: 0,
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          reason: "condition_a_failed",
          message: "sender mismatch",
        },
      ],
    };
    const fetchMock = jest.fn(async (_input: unknown, _init?: unknown) =>
      okResponse(verifyResp)
    );
    const client = authenticatedClient(fetchMock);

    let caught: unknown;
    try {
      await client.deposit({
        deposits: [
          {
            sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
            asset: { type: "btc" },
            amount: 100_000n,
          },
        ],
        recipient: RECIPIENT,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(VerifyDepositRejectedError);
    const rej = (caught as VerifyDepositRejectedError).rejections;
    expect(rej).toHaveLength(1);
    expect(rej[0]?.reason).toBe("condition_a_failed");
    expect(rej[0]?.index).toBe(0);

    // /execute was never reached.
    expect(
      fetchMock.mock.calls.some((c) =>
        String(c[0]).endsWith("/api/v1/execute")
      )
    ).toBe(false);
  });

  it("accepts a 0x-prefixed pre-attached proof (server response shape)", async () => {
    // The gateway emits proofs with a leading `0x` on payloadBytes
    // and signature via serde_bytes_hex. Confirm the SDK doesn't
    // reject a proof captured directly from /verifyDeposit and
    // re-passed on /execute via the BYO path.
    const executeResp = {
      submissionId: "sub-byo",
      intentId: "0xfeed",
      status: "accepted",
    };
    const fetchMock = jest.fn(async (input: unknown, _init?: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/v1/execute")) return okResponse(executeResp);
      throw new Error(`unexpected URL: ${url}`);
    });
    const client = authenticatedClient(fetchMock);

    await client.deposit({
      deposits: [
        {
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          asset: { type: "btc" },
          amount: 100_000n,
          depositProof: SAMPLE_PROOF_0X,
        },
      ],
      recipient: RECIPIENT,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]![1] as RequestInit).body)
    );
    expect(body.deposits[0].depositProof).toEqual(SAMPLE_PROOF_0X);
  });

  it("manualProofs:true bypasses /verifyDeposit entirely", async () => {
    const executeResp = {
      submissionId: "sub-4",
      intentId: "0xbeef",
      status: "accepted",
    };
    const fetchMock = jest.fn(async (input: unknown, _init?: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/v1/execute")) return okResponse(executeResp);
      throw new Error(`unexpected URL: ${url}`);
    });
    const client = authenticatedClient(fetchMock);

    await client.deposit({
      manualProofs: true,
      deposits: [
        {
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          asset: { type: "btc" },
          amount: 100_000n,
        },
      ],
      recipient: RECIPIENT,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/v1/execute");
    // manualProofs skips /verifyDeposit, but the wire requires a
    // `depositProof` field on every Deposit. The SDK fills missing
    // proofs with the placeholder shape — has_valid_shape() returns
    // false, so the gateway falls through to legacy admission.
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]![1] as RequestInit).body)
    );
    expect(body.deposits[0].depositProof).toEqual(PLACEHOLDER_DEPOSIT_PROOF);
  });

  it("throws on a malformed pre-attached proof signature", async () => {
    const fetchMock = jest.fn(async () => okResponse({}));
    const client = authenticatedClient(fetchMock);

    await expect(
      client.deposit({
        deposits: [
          {
            sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
            asset: { type: "btc" },
            amount: 100_000n,
            depositProof: { payloadBytes: "deadbeef", signature: "tooshort" },
          },
        ],
        recipient: RECIPIENT,
      })
    ).rejects.toThrow(/signature must be 64 hex bytes/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Tests for the deposit-proof types, helpers, and auto-attach flow.
 */
import { ExecutionClient, VerifyDepositRejectedError } from "./client";
import {
  generateProofNonce,
  type SignedDepositProof,
  type VerifyDepositsRequest,
  type VerifyDepositsResponse,
  type DepositRejection,
  type IndexedDepositProof,
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

afterEach(() => {
  jest.restoreAllMocks();
});

describe("generateProofNonce", () => {
  it("returns 32 lowercase hex chars (no 0x, no dashes)", () => {
    const n = generateProofNonce();
    expect(n).toHaveLength(32);
    expect(n).toMatch(/^[0-9a-f]{32}$/);
    expect(n.includes("-")).toBe(false);
    expect(n.startsWith("0x")).toBe(false);
  });

  it("produces distinct values on successive calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      seen.add(generateProofNonce());
    }
    expect(seen.size).toBe(64);
  });
});

describe("VerifyDeposit type round-trips", () => {
  it("a request body shaped per the OpenAPI contract type-checks", () => {
    const req: VerifyDepositsRequest = {
      nonce: generateProofNonce(),
      transfers: [
        { sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718" },
        { sparkTransferId: "0x" + "ab".repeat(32) },
      ],
    };
    expect(req.transfers).toHaveLength(2);
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

  it("calls /verifyDeposit and attaches each proof before /execute", async () => {
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
      recipient: "0x" + "01".repeat(20),
    });

    expect(result.submissionId).toBe("sub-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Inspect the /execute body to confirm the proof was forwarded.
    const executeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/v1/execute")
    );
    if (!executeCall) throw new Error("/execute was not called");
    const init = executeCall[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.deposits[0].depositProof).toEqual(SAMPLE_PROOF);
    // Same nonce on both the /verifyDeposit call and the signed body.
    const verifyCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/v1/verifyDeposit")
    );
    if (!verifyCall) throw new Error("/verifyDeposit was not called");
    const verifyBody = JSON.parse(String((verifyCall[1] as RequestInit).body));
    expect(verifyBody.nonce).toBe(body.nonce);
    // And the nonce conforms to the 16-byte hex shape.
    expect(verifyBody.nonce).toMatch(/^[0-9a-f]{32}$/);
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
      nonce: "ffeeddccbbaa99887766554433221100",
      deposits: [
        {
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          asset: { type: "btc" },
          amount: 100_000n,
          depositProof: SAMPLE_PROOF,
        },
      ],
      recipient: "0x" + "01".repeat(20),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/v1/execute");
  });

  it("falls back to proofless /execute when /verifyDeposit returns 503", async () => {
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
      recipient: "0x" + "01".repeat(20),
    });

    expect(result.submissionId).toBe("sub-3");
    const executeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/v1/execute")
    );
    if (!executeCall) throw new Error("/execute was not called");
    const body = JSON.parse(String((executeCall[1] as RequestInit).body));
    expect(body.deposits[0].depositProof).toBeUndefined();
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
        recipient: "0x" + "01".repeat(20),
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
      nonce: "ffeeddccbbaa99887766554433221100",
      deposits: [
        {
          sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
          asset: { type: "btc" },
          amount: 100_000n,
          depositProof: SAMPLE_PROOF_0X,
        },
      ],
      recipient: "0x" + "01".repeat(20),
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
      recipient: "0x" + "01".repeat(20),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/v1/execute");
  });

  it("throws when pre-attached proofs are passed without a matching nonce", async () => {
    // The SDK cannot reconstruct the nonce that minted a pre-attached
    // proof, so it must come from the caller. Catch this before
    // signing rather than letting the gateway reject for a binding
    // mismatch at submit time.
    const fetchMock = jest.fn(async (_input: unknown, _init?: unknown) =>
      okResponse({})
    );
    const client = authenticatedClient(fetchMock);

    await expect(
      client.deposit({
        deposits: [
          {
            sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
            asset: { type: "btc" },
            amount: 100_000n,
            depositProof: SAMPLE_PROOF,
          },
        ],
        recipient: "0x" + "01".repeat(20),
      })
    ).rejects.toThrow(/pre-attached depositProof entries but no nonce/);

    // No HTTP call escaped the SDK.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a malformed pre-attached proof signature", async () => {
    const fetchMock = jest.fn(async () => okResponse({}));
    const client = authenticatedClient(fetchMock);

    await expect(
      client.deposit({
        nonce: "ffeeddccbbaa99887766554433221100",
        deposits: [
          {
            sparkTransferId: "a1b2c3d4e5f60718a1b2c3d4e5f60718",
            asset: { type: "btc" },
            amount: 100_000n,
            depositProof: { payloadBytes: "deadbeef", signature: "tooshort" },
          },
        ],
        recipient: "0x" + "01".repeat(20),
      })
    ).rejects.toThrow(/signature must be 64 hex bytes/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

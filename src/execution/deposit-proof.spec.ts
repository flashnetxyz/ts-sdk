/**
 * Tests for the deposit-proof types and helpers.
 */
import {
  generateProofNonce,
  type SignedDepositProof,
  type VerifyDepositsRequest,
  type VerifyDepositsResponse,
  type DepositRejection,
  type IndexedDepositProof,
} from "./types";

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
    // Collision odds on 16 random bytes over 64 draws are negligible.
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
    const proof: SignedDepositProof = {
      payloadBytes: "deadbeef",
      signature: "00".repeat(64),
    };
    const ok: IndexedDepositProof = { index: 0, proof };
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

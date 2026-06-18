/**
 * getIntentStatus must authenticate. The execution-layer gateway authorizes the
 * submission against the caller's access token (IDOR fix), so an unauthenticated
 * poll of GET /api/v1/intents/{id} now returns 404. The SDK must attach the
 * Bearer token it obtained from the gateway verify step.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { ExecutionClient } from "./client";
import type { SparkWalletInput } from "./spark-evm-account";

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

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ExecutionClient.getIntentStatus auth", () => {
  it("sends the access token as a Bearer header", async () => {
    const fetchMock = jest.fn(async () =>
      okResponse({ submissionId: "sub-1", status: "finalized" })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    (client as unknown as { accessToken: string }).accessToken = "test-token";

    await client.getIntentStatus("sub-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(url)).toContain("/api/v1/intents/sub-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token"
    );
  });

  it("throws and does not call the gateway when unauthenticated", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);

    await expect(client.getIntentStatus("sub-1")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

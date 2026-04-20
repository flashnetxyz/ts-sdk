/**
 * Tests for `ExecutionClient.getNetworkInfo()` cache + HTTP contract.
 */
import { ExecutionClient } from "./client";
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

const NETWORK_INFO_PAYLOAD = {
  spark: {
    depositAddress: "sparkrt1pgsstest",
    network: "REGTEST",
  },
  execution: {
    contractAddress: "0x1e2861ce58eaa89260226b5704416b9a20589d47",
    chainId: 21022,
  },
  paused: false,
  minDepositSats: 1000,
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

describe("ExecutionClient.getNetworkInfo", () => {
  it("hits the gateway once and caches subsequent calls", async () => {
    const fetchMock = jest.fn(async () => okResponse(NETWORK_INFO_PAYLOAD));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const first = await client.getNetworkInfo();
    const second = await client.getNetworkInfo();

    expect(first).toEqual(NETWORK_INFO_PAYLOAD);
    expect(second).toEqual(NETWORK_INFO_PAYLOAD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cache with forceRefresh", async () => {
    const fetchMock = jest.fn(async () => okResponse(NETWORK_INFO_PAYLOAD));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    await client.getNetworkInfo();
    await client.getNetworkInfo({ forceRefresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent callers onto a single request", async () => {
    // Delay the response so both awaits see the same in-flight promise.
    let resolveFetch!: (v: Response) => void;
    const fetchMock = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const p1 = client.getNetworkInfo();
    const p2 = client.getNetworkInfo();
    resolveFetch(okResponse(NETWORK_INFO_PAYLOAD));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(NETWORK_INFO_PAYLOAD);
    expect(r2).toEqual(NETWORK_INFO_PAYLOAD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on non-200 responses — no fallback", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response("boom", { status: 503, statusText: "Service Unavailable" })
    ) as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    await expect(client.getNetworkInfo()).rejects.toThrow(/503/);
  });

  it("strips a trailing slash in gatewayUrl before issuing the fetch", async () => {
    // Accept one positional argument so jest records the call URL in
    // `mock.calls[i][0]`. Typed loosely because `fetch`'s first argument
    // is a union (string | URL | Request) we don't need to model here.
    const fetchMock = jest.fn(async (_url: unknown) =>
      okResponse(NETWORK_INFO_PAYLOAD)
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), {
      ...EXEC_CONFIG,
      gatewayUrl: "http://localhost:8080/",
    });
    await client.getNetworkInfo();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("fetchMock was not called");
    }
    expect(firstCall[0]).toBe("http://localhost:8080/api/v1/network/info");
  });
});

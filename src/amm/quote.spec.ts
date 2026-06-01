import { secp256k1 } from "@noble/curves/secp256k1";
import { ExecutionClient } from "../execution/client";
import type { SparkWalletInput } from "../execution/spark-evm-account";
import { AMMClient } from "./client";

// Deterministic test key — private key = 1 (well-known test scalar).
const TEST_KEY = new Uint8Array(32);
TEST_KEY[31] = 1;

/**
 * Minimal SparkWallet for constructing ExecutionClient. `quote()` never
 * touches the wallet (it only reads `getConfig().gatewayUrl` and fetches),
 * so only the signer the constructor expects needs to be present.
 */
function mockWallet(): SparkWalletInput {
  const pubkey = secp256k1.getPublicKey(TEST_KEY, true);
  return {
    config: {
      signer: {
        async getIdentityPublicKey() {
          return pubkey;
        },
        async signMessageWithIdentityKey(msg: Uint8Array, compact?: boolean) {
          const sig = secp256k1.sign(msg, TEST_KEY);
          return compact ? sig.toCompactRawBytes() : sig.toDERRawBytes();
        },
      },
    },
  } as unknown as SparkWalletInput;
}

const EXEC_CONFIG = {
  gatewayUrl: "http://localhost:8080",
  rpcUrl: "http://localhost:8545",
  chainId: 21022,
};

const WBTC = "0x5555555555555555555555555555555555555555";
const AMM_CONFIG = {
  conductorAddress: "0x1111111111111111111111111111111111111111",
  wbtcAddress: WBTC,
};
const TOKEN_A = "0x4444444444444444444444444444444444444444";
const TOKEN_B = "0x2222222222222222222222222222222222222222";

const WEI_PER_SAT = 10_000_000_000n;

const GATEWAY_OK = {
  amountOut: "994035",
  minAmountOut: "989065",
  priceImpactBps: 12,
  sqrtPriceX96After: "79228162514264337593543950336",
  feeTier: 3000,
  slippageBps: 50,
};

interface CapturedRequest {
  url: string;
  body: Record<string, unknown> | undefined;
}

/**
 * Stub `fetch` to answer the swap-quote endpoint with `response`/`status`
 * and record every request so tests can assert the forwarded body.
 */
function stubQuoteFetch(
  response: Record<string, unknown>,
  status = 200
): CapturedRequest[] {
  const calls: CapturedRequest[] = [];
  global.fetch = jest.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : (input.url ?? "");
    calls.push({
      url,
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    if (url.endsWith("/api/v1/swap/quote")) {
      return new Response(JSON.stringify(response), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  }) as unknown as typeof fetch;
  return calls;
}

function newAmm(config: Record<string, unknown> = AMM_CONFIG): AMMClient {
  return new AMMClient(
    new ExecutionClient(mockWallet(), EXEC_CONFIG),
    config as any
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AMMClient.quote", () => {
  it("maps a token→token quote and forwards the request verbatim", async () => {
    const calls = stubQuoteFetch(GATEWAY_OK);
    const amm = newAmm();

    const q = await amm.quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000000",
      fee: 3000,
      slippageBps: 50,
    });

    expect(q.amountOut).toBe("994035");
    expect(q.minAmountOut).toBe("989065");
    expect(q.priceImpactBps).toBe(12);
    expect(q.slippageBps).toBe(50);
    expect(q.fee).toBe(3000);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:8080/api/v1/swap/quote");
    expect(calls[0]?.body).toEqual({
      tokenIn: TOKEN_A,
      tokenOut: TOKEN_B,
      fee: 3000,
      amountIn: "1000000",
      slippageBps: 50,
    });
  });

  it("omits slippageBps from the request when the caller omits it", async () => {
    const calls = stubQuoteFetch(GATEWAY_OK);
    const amm = newAmm();

    await amm.quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000000",
      fee: 3000,
    });

    expect(calls[0]?.body).not.toHaveProperty("slippageBps");
  });

  it("converts a BTC input from sats to WBTC wei and maps it to wbtcAddress", async () => {
    const calls = stubQuoteFetch(GATEWAY_OK);
    const amm = newAmm();

    await amm.quote({
      assetInAddress: "btc",
      assetOutAddress: TOKEN_B,
      amountIn: "250000",
      fee: 3000,
    });

    expect(calls[0]?.body?.tokenIn).toBe(WBTC);
    expect(calls[0]?.body?.tokenOut).toBe(TOKEN_B);
    expect(calls[0]?.body?.amountIn).toBe((250000n * WEI_PER_SAT).toString());
  });

  it("converts a BTC output from WBTC wei back to whole sats (flooring dust)", async () => {
    // 12345 sats + 7 wei of sub-sat dust; min is a clean 12000 sats.
    const weiOut = (12345n * WEI_PER_SAT + 7n).toString();
    const weiMin = (12000n * WEI_PER_SAT).toString();
    const calls = stubQuoteFetch({
      ...GATEWAY_OK,
      amountOut: weiOut,
      minAmountOut: weiMin,
    });
    const amm = newAmm();

    const q = await amm.quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      fee: 3000,
    });

    expect(calls[0]?.body?.tokenOut).toBe(WBTC);
    expect(q.amountOut).toBe("12345");
    expect(q.minAmountOut).toBe("12000");
  });

  it("requires wbtcAddress for a btc leg", async () => {
    stubQuoteFetch(GATEWAY_OK);
    const amm = newAmm({ conductorAddress: AMM_CONFIG.conductorAddress });

    await expect(
      amm.quote({
        assetInAddress: "btc",
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/wbtcAddress/);
  });

  it("rejects BTC → BTC", async () => {
    stubQuoteFetch(GATEWAY_OK);
    const amm = newAmm();

    await expect(
      amm.quote({
        assetInAddress: "btc",
        assetOutAddress: "BTC",
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/BTC → BTC/);
  });

  it("rejects non-positive amountIn", async () => {
    stubQuoteFetch(GATEWAY_OK);
    const amm = newAmm();

    await expect(
      amm.quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "0",
        fee: 3000,
      })
    ).rejects.toThrow(/greater than zero/);
  });

  it("rejects out-of-range slippageBps", async () => {
    stubQuoteFetch(GATEWAY_OK);
    const amm = newAmm();

    await expect(
      amm.quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000000",
        fee: 3000,
        slippageBps: 10_001,
      })
    ).rejects.toThrow(/slippageBps/);
  });

  it("surfaces the gateway problem+json detail on error", async () => {
    stubQuoteFetch(
      {
        detail:
          "no pool or insufficient liquidity for the given tokenIn/tokenOut/fee",
      },
      400
    );
    const amm = newAmm();

    await expect(
      amm.quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000000",
        fee: 500,
      })
    ).rejects.toThrow(/no pool or insufficient liquidity/);
  });
});

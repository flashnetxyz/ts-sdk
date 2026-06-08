import { secp256k1 } from "@noble/curves/secp256k1";
import { decodeFunctionData } from "viem";
import { TradingClient, StrandedFundingError } from "./client";
import { ExecutionClient } from "../execution/client";
import { conductorAbi } from "../execution/abis/conductor";
import { encodeSparkHumanReadableTokenIdentifier } from "../utils/tokenAddress";
import type { SparkWalletInput } from "../execution/spark-evm-account";

// Deterministic test key — private key = 1 (well-known test scalar).
const TEST_KEY = new Uint8Array(32);
TEST_KEY[31] = 1;

/**
 * Mock SparkWallet shape. The SDK reads `config.signer` via getWalletSigner;
 * for TradingClient's useAvailableBalance path it ALSO expects `.transfer` and
 * `.transferTokens` on the wallet (read through getSparkWallet()).
 */
function mockWallet(opts?: {
  transferId?: string;
  tokenTransferId?: string;
  onTransfer?: (args: unknown) => void;
  onTransferTokens?: (args: unknown) => void;
}): SparkWalletInput {
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
    async transfer(args: { amountSats: number; receiverSparkAddress: string }) {
      opts?.onTransfer?.(args);
      return { id: opts?.transferId ?? "btc-transfer-id" };
    },
    async transferTokens(args: {
      tokenIdentifier: string;
      tokenAmount: bigint;
      receiverSparkAddress: string;
    }) {
      opts?.onTransferTokens?.(args);
      return opts?.tokenTransferId ?? "token-transfer-id";
    },
  } as unknown as SparkWalletInput;
}

const EXEC_CONFIG = {
  gatewayUrl: "http://localhost:8080",
  rpcUrl: "http://localhost:8545",
  chainId: 21022,
};

const AMM_CONFIG = {
  conductorAddress: "0x1111111111111111111111111111111111111111",
};

/**
 * Deposit address the mocked `/network/info` endpoint returns. Tests that
 * care about the argument TradingClient passes to `wallet.transfer` assert
 * against this value.
 */
const TEST_DEPOSIT_ADDRESS =
  "sparkrt1pgssx3qm405syfc0hcgul58t7ce9c9xjyu5w4pnda4eu6tts9d6cqkj94epdlw";

const TEST_NETWORK_INFO = {
  spark: {
    depositAddress: TEST_DEPOSIT_ADDRESS,
    network: "REGTEST",
  },
  execution: {
    contractAddress: "0x1e2861ce58eaa89260226b5704416b9a20589d47",
    chainId: 21022,
  },
  paused: false,
  minDepositSats: 1000,
};

/**
 * Stub `fetch` so `ExecutionClient.getNetworkInfo()` resolves without a
 * running gateway. Every test that reaches the AMM swap flow needs this
 * — the swap path awaits getNetworkInfo before issuing the Spark transfer.
 */
function stubNetworkInfoFetch(): void {
  global.fetch = jest.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input.url ?? "";
    if (url.endsWith("/api/v1/network/info")) {
      return new Response(JSON.stringify(TEST_NETWORK_INFO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  }) as unknown as typeof fetch;
}

// Capture the real fetch so each test fully undoes `global.fetch = jest.fn`.
// `jest.restoreAllMocks()` only restores `jest.spyOn` mocks, not direct
// global assignments.
const originalFetch = global.fetch;
afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});

describe("TradingClient.swap — useAvailableBalance validation", () => {
  it("rejects BTC → BTC unconditionally", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const trading = new TradingClient(client, AMM_CONFIG);
    await expect(
      trading.swap({
        assetInAddress: "btc",
        assetOutAddress: "BTC",
        amountIn: "1000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/BTC → BTC/);
  });

  it("requires withdraw=true when useAvailableBalance is set", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const trading = new TradingClient(client, AMM_CONFIG);
    await expect(
      trading.swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: "1000",
        minAmountOut: "0",
        fee: 3000,
        withdraw: false,
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/withdraw=true/);
  });

  it("requires assetInSparkTokenId for ERC-20 inputs", async () => {
    stubNetworkInfoFetch();
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const trading = new TradingClient(client, AMM_CONFIG);
    await expect(
      trading.swap({
        assetInAddress: "0x4444444444444444444444444444444444444444",
        assetOutAddress: "btc",
        amountIn: "1000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
        // assetInSparkTokenId intentionally omitted
      })
    ).rejects.toThrow(/assetInSparkTokenId/);
  });

  it("rejects amountIn beyond Number.MAX_SAFE_INTEGER for BTC deposits", async () => {
    // SparkWallet.transfer caps amountSats at 2^53-1; a larger input
    // should surface as an actionable error rather than silent overflow.
    // We need getNetworkInfo() to succeed first (the swap flow awaits it
    // before the Spark transfer), so stub the fetch.
    stubNetworkInfoFetch();
    const wallet = mockWallet();
    const client = new ExecutionClient(wallet, EXEC_CONFIG);
    const trading = new TradingClient(client, AMM_CONFIG);
    const tooBig = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString();
    await expect(
      trading.swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: tooBig,
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/number precision cap/);
  });
});

describe("TradingClient.swap — BTC → token deposit wiring", () => {
  it("calls wallet.transfer with the gateway-advertised deposit address", async () => {
    // Stub /network/info so the swap flow can proceed past the runtime
    // discovery fetch. Assert that TradingClient forwards the resolved
    // depositAddress to wallet.transfer instead of a hard-coded config
    // value — this is the whole point of runtime discovery.
    stubNetworkInfoFetch();
    let observed: any = null;
    const wallet = mockWallet({
      transferId: "abc123",
      onTransfer: (args) => {
        observed = args;
      },
    });
    const client = new ExecutionClient(wallet, EXEC_CONFIG);
    const trading = new TradingClient(client, AMM_CONFIG);

    // The call throws when it reaches `fetchNonce` (no RPC running) — but by
    // then `wallet.transfer` has already committed the deposit. The failure
    // must surface as a StrandedFundingError, and the SDK auto-claws the
    // committed transfer back, reporting it recovered.
    const clawbackSpy = jest
      .spyOn(client, "clawbackMany")
      .mockResolvedValue([{ transferId: "abc123", success: true }]);

    const err = await trading
      .swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: "250000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
      .then(
        () => null,
        (e) => e
      );

    expect(err).toBeInstanceOf(StrandedFundingError);
    expect((err as StrandedFundingError).transferIds).toEqual(["abc123"]);
    expect(
      (err as StrandedFundingError).clawbackSummary.recoveredTransferIds
    ).toEqual(["abc123"]);
    expect(
      (err as StrandedFundingError).clawbackSummary.unrecoveredTransferIds
    ).toEqual([]);
    expect(clawbackSpy).toHaveBeenCalledWith(["abc123"]);

    expect(observed).not.toBeNull();
    expect(observed.amountSats).toBe(250000);
    expect(observed.receiverSparkAddress).toBe(TEST_DEPOSIT_ADDRESS);
  });

  it("surfaces unrecovered transfers when auto-clawback is rejected", async () => {
    stubNetworkInfoFetch();
    const wallet = mockWallet({ transferId: "def456" });
    const client = new ExecutionClient(wallet, EXEC_CONFIG);
    const trading = new TradingClient(client, AMM_CONFIG);

    // Funding commits, the swap fails at fetchNonce, and the clawback itself
    // is rejected (e.g. the gateway already consumed the transfer). The error
    // must report the transfer as still at risk.
    jest
      .spyOn(client, "clawbackMany")
      .mockResolvedValue([
        { transferId: "def456", success: false, error: "transfer already used" },
      ]);

    const err = await trading
      .swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: "250000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
      .then(
        () => null,
        (e) => e
      );

    expect(err).toBeInstanceOf(StrandedFundingError);
    expect(
      (err as StrandedFundingError).clawbackSummary.unrecoveredTransferIds
    ).toEqual(["def456"]);
    expect(
      (err as StrandedFundingError).clawbackSummary.recoveredTransferIds
    ).toEqual([]);
  });
});

describe("TradingClient.swap — minAmountOut unit handling", () => {
  const WBTC = "0x5555555555555555555555555555555555555555";
  const TOKEN_A = "0x4444444444444444444444444444444444444444";
  const TOKEN_B = "0x2222222222222222222222222222222222222222";
  const WEI_PER_SAT = 10_000_000_000n;

  // Mock the side-effecting internals so we can decode the calldata the swap
  // would have signed, with no RPC or signing. `getEvmAccount`'s result is
  // unused on these paths; it only needs to not throw.
  function captureSignedSwap(
    amm: TradingClient,
    client: ExecutionClient
  ): jest.SpyInstance {
    jest
      .spyOn(client, "getEvmAccount")
      .mockResolvedValue({
        address: "0x00000000000000000000000000000000000000ab",
      } as any);
    jest
      .spyOn(client, "getSparkRecipientHex")
      .mockResolvedValue(`0x02${"aa".repeat(32)}`);
    jest.spyOn(amm as any, "ensureAllowance").mockResolvedValue(undefined);
    jest.spyOn(amm as any, "submitSwapIntent").mockResolvedValue({
      submissionId: "s",
      intentId: "i",
      status: "accepted",
      evmTxHash: "0x00",
    });
    return jest
      .spyOn(amm as any, "signConductorTx")
      .mockResolvedValue("0xsigned");
  }

  function decodeSigned(sign: jest.SpyInstance) {
    const calldata = sign.mock.calls[0][0] as `0x${string}`;
    return decodeFunctionData({ abi: conductorAbi, data: calldata });
  }

  it("token→BTC converts minAmountOut from sats to WBTC wei (C1 regression)", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, {
      conductorAddress: AMM_CONFIG.conductorAddress,
      wbtcAddress: WBTC,
    });
    const sign = captureSignedSwap(amm, client);

    await amm.swap({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      minAmountOut: "49750000", // sats
      fee: 3000,
    });

    const decoded = decodeSigned(sign);
    expect(decoded.functionName).toBe("swapAndWithdrawBTC");
    // inputs: [tokenIn, fee, amountIn, minAmountOut, sparkRecipient, integrator]
    expect(decoded.args[3]).toBe(49750000n * WEI_PER_SAT);
  });

  it("token→token passes minAmountOut through unchanged", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, AMM_CONFIG);
    const sign = captureSignedSwap(amm, client);

    await amm.swap({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000000",
      minAmountOut: "995000",
      fee: 3000,
    });

    const decoded = decodeSigned(sign);
    expect(decoded.functionName).toBe("swapAndWithdraw");
    // inputs: [tokenIn, tokenOut, fee, amountIn, minAmountOut, ...]
    expect(decoded.args[4]).toBe(995000n);
  });

  it("BTC→token leaves minAmountOut in the output token's base units", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, {
      conductorAddress: AMM_CONFIG.conductorAddress,
      wbtcAddress: WBTC,
    });
    const sign = captureSignedSwap(amm, client);

    await amm.swap({
      assetInAddress: "btc",
      assetOutAddress: TOKEN_B,
      amountIn: "250000",
      minAmountOut: "995000",
      fee: 3000,
    });

    const decoded = decodeSigned(sign);
    expect(decoded.functionName).toBe("swapBTCAndWithdraw");
    // inputs: [tokenOut, fee, minAmountOut, sparkRecipient, integrator, integratorBps]
    expect(decoded.args[2]).toBe(995000n);
  });

  it("threads integratorFeeRateBps into the swap calldata", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, AMM_CONFIG);
    const sign = captureSignedSwap(amm, client);

    await amm.swap({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000000",
      minAmountOut: "995000",
      fee: 3000,
      integratorFeeRateBps: 25,
    });

    const decoded = decodeSigned(sign);
    expect(decoded.functionName).toBe("swapAndWithdraw");
    // swapAndWithdraw inputs end with integratorBps (the trailing arg).
    expect(decoded.args[decoded.args.length - 1]).toBe(25);
  });

  it("rejects integratorFeeRateBps above the 1000 bps cap", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, AMM_CONFIG);
    await expect(
      amm.swap({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000000",
        minAmountOut: "0",
        fee: 3000,
        integratorFeeRateBps: 1001,
      })
    ).rejects.toThrow(/integratorFeeRateBps/);
  });

  it("rejects an integratorAddress that is not a 20-byte EVM address", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, AMM_CONFIG);
    await expect(
      amm.swap({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000000",
        minAmountOut: "0",
        fee: 3000,
        // A 33-byte compressed pubkey is the classic mistake the old
        // `integratorPublicKey` name invited. Reject it up front with a clear
        // message instead of leaning on viem's late, cryptic "Address is
        // invalid" throw (which in the round-trip path only fires after the
        // funding transfer has already committed).
        integratorAddress:
          "0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      })
    ).rejects.toThrow(/integratorAddress/);
  });

  it("threads a valid integratorAddress into the swap calldata", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, AMM_CONFIG);
    const sign = captureSignedSwap(amm, client);
    const integrator = "0x00000000000000000000000000000000000000aa";

    await amm.swap({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000000",
      minAmountOut: "995000",
      fee: 3000,
      integratorAddress: integrator,
    });

    const decoded = decodeSigned(sign);
    expect(
      decoded.args.some(
        (a) => typeof a === "string" && a.toLowerCase() === integrator
      )
    ).toBe(true);
  });

  it("permit2 token→BTC converts minAmountOut to wei and carries integratorBps", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, {
      conductorAddress: AMM_CONFIG.conductorAddress,
      wbtcAddress: WBTC,
      permit2Address: "0x6666666666666666666666666666666666666666",
      approvalMode: "permit2",
    });
    const sign = captureSignedSwap(amm, client);
    jest.spyOn(amm as any, "buildPermit2Signature").mockResolvedValue({
      permitTransfer: {
        permitted: { token: TOKEN_A, amount: 1_000_000n },
        nonce: 1n,
        deadline: 2n,
      },
      signature: `0x${"00".repeat(65)}`,
    });

    await amm.swap({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      minAmountOut: "49750000", // sats
      fee: 3000,
      integratorFeeRateBps: 25,
    });

    const decoded = decodeSigned(sign);
    expect(decoded.functionName).toBe("swapAndWithdrawBTCWithPermit2");
    // [tokenIn, fee, amountIn, minAmountOut, sparkRecipient, integrator, integratorBps, permitTransfer, signature]
    expect(decoded.args[3]).toBe(49750000n * WEI_PER_SAT);
    expect(decoded.args[6]).toBe(25);
  });

  it("EIP-2612 (useAvailableBalance) token→BTC converts minAmountOut and carries integratorBps", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, {
      conductorAddress: AMM_CONFIG.conductorAddress,
      wbtcAddress: WBTC,
    });
    const sign = captureSignedSwap(amm, client);
    jest.spyOn(client, "getNetworkInfo").mockResolvedValue({
      spark: { depositAddress: "sparkrt1deposit", network: "REGTEST" },
    } as any);
    jest
      .spyOn(amm as any, "sparkTransferForDeposit")
      .mockResolvedValue("abc123");
    jest.spyOn(amm as any, "signEip2612Permit").mockResolvedValue({
      value: 1_000_000n,
      deadline: 2n,
      v: 27,
      r: `0x${"00".repeat(32)}`,
      s: `0x${"00".repeat(32)}`,
    });

    await amm.swap({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      minAmountOut: "49750000", // sats
      fee: 3000,
      integratorFeeRateBps: 25,
      useAvailableBalance: true,
      assetInSparkTokenId: encodeSparkHumanReadableTokenIdentifier(
        "cc".repeat(32),
        "REGTEST"
      ),
    });

    const decoded = decodeSigned(sign);
    expect(decoded.functionName).toBe("swapAndWithdrawBTCWithEIP2612");
    // [tokenIn, fee, amountIn, minAmountOut, sparkRecipient, integrator, integratorBps, tokenPermit]
    expect(decoded.args[3]).toBe(49750000n * WEI_PER_SAT);
    expect(decoded.args[6]).toBe(25);
  });

  it("end-to-end: quote()'s minAmountOut for token→BTC is consumed correctly by swap()", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new TradingClient(client, {
      conductorAddress: AMM_CONFIG.conductorAddress,
      wbtcAddress: WBTC,
    });

    // quote() computes the swap client-side in WBTC wei; stub that core (its
    // own logic is covered in quote.spec.ts) and assert the wei->sat handoff
    // from quote() into swap().
    const minWei = 49_750_000n * WEI_PER_SAT;
    jest.spyOn(amm as any, "computeSwapQuote").mockResolvedValue({
      amountOut: (50_000_000n * WEI_PER_SAT).toString(),
      minAmountOut: minWei.toString(),
      feeTier: 3000,
      slippageBps: 50,
      conductorFeeBps: 0,
      conductorFeeAmount: "0",
    });

    const q = await amm.quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      fee: 3000,
      slippageBps: 50,
    });
    // quote() reports the BTC output floor in sats.
    expect(q.minAmountOut).toBe("49750000");

    // Feeding it straight into swap() must reproduce the gateway's wei floor.
    const sign = captureSignedSwap(amm, client);
    await amm.swap({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      minAmountOut: q.minAmountOut,
      fee: 3000,
    });
    const decoded = decodeSigned(sign);
    expect(decoded.functionName).toBe("swapAndWithdrawBTC");
    expect(decoded.args[3]).toBe(minWei);
  });
});

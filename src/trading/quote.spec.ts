import { secp256k1 } from "@noble/curves/secp256k1";
import { BaseError, zeroAddress } from "viem";
import { ExecutionClient } from "../execution/client";
import type { SparkWalletInput } from "../execution/spark-evm-account";
import { TradingClient } from "./client";
import {
  applySlippage,
  conductorSkim,
  effectiveSwapInput,
  priceImpactBps,
  resolveFeeAsset,
} from "./quote-math";

// `quote()` reads the chain via `getClient(rpcUrl).readContract` (directly for
// the QuoterV2 / Conductor / pool reads, and transitively through
// `getPoolAddress`). Mock the rpc module so a single `readContract` stub drives
// every read; dispatch on `functionName`.
const mockReadContract = jest.fn();
jest.mock("../execution/rpc", () => ({
  getClient: jest.fn(() => ({ readContract: mockReadContract })),
}));

// Deterministic test key — private key = 1 (well-known test scalar).
const TEST_KEY = new Uint8Array(32);
TEST_KEY[31] = 1;

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

const CONDUCTOR = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const TOKEN_A = "0x4444444444444444444444444444444444444444";
const WBTC = "0x5555555555555555555555555555555555555555";
const FACTORY = "0x6666666666666666666666666666666666666666";
const QUOTER = "0x7777777777777777777777777777777777777777";
const USDB = "0x8888888888888888888888888888888888888888";
const POOL = "0x9999999999999999999999999999999999999999";

const WEI_PER_SAT = 10_000_000_000n;

/** Full trading config: every address quote() needs is present. */
const FULL_CONFIG = {
  conductorAddress: CONDUCTOR,
  wbtcAddress: WBTC,
  factoryAddress: FACTORY,
  quoterV2Address: QUOTER,
};

interface ReadFixture {
  pool?: string;
  hostBps?: number;
  protocolBps?: number;
  wbtc?: string;
  usdb?: string;
  grossOut?: bigint;
  sqrtAfter?: bigint;
  sqrtBefore?: bigint;
  quoterRevert?: boolean;
  slot0Throw?: boolean;
}

/** Drive `mockReadContract` from a per-test fixture, dispatching on call. */
function configureReads(f: ReadFixture = {}): void {
  mockReadContract.mockImplementation((call: { functionName: string }) => {
    switch (call.functionName) {
      case "getPool":
        return f.pool ?? POOL;
      case "hostFeeBps":
        return f.hostBps ?? 0;
      case "protocolFeeBps":
        return f.protocolBps ?? 0;
      case "wbtc":
        return f.wbtc ?? WBTC;
      case "usdb":
        return f.usdb ?? USDB;
      case "slot0":
        if (f.slot0Throw) throw new Error("slot0 read failed");
        return [f.sqrtBefore ?? f.sqrtAfter ?? 1n, 0, 0, 0, 0, 0, true];
      case "quoteExactInputSingle":
        if (f.quoterRevert) throw new BaseError("execution reverted");
        return [f.grossOut ?? 1_000_000n, f.sqrtAfter ?? 1n, 0, 0n];
      default:
        throw new Error(`unexpected read: ${call.functionName}`);
    }
  });
}

/** The `amountIn` the QuoterV2 was actually asked to quote. */
function quoterAmountIn(): bigint {
  const call = mockReadContract.mock.calls.find(
    (c) => c[0]?.functionName === "quoteExactInputSingle"
  );
  return call?.[0]?.args?.[0]?.amountIn as bigint;
}

function newAmm(config: Record<string, unknown> = FULL_CONFIG): TradingClient {
  return new TradingClient(
    new ExecutionClient(mockWallet(), EXEC_CONFIG),
    config as never
  );
}

afterEach(() => {
  mockReadContract.mockReset();
});

// ── Pure math, ported verbatim from the gateway's removed quote.rs tests ──────

describe("quote-math", () => {
  it("applySlippage applies a bps haircut (floored)", () => {
    expect(applySlippage(1_000_000n, 50)).toBe(995_000n);
    expect(applySlippage(1234n, 0)).toBe(1234n); // no-op
    expect(applySlippage(1234n, 10_000)).toBe(0n); // 100% floors to zero
  });

  it("priceImpactBps reflects the sqrt-price move", () => {
    const p = 79_228_162_514_264_337_593_543_950_336n; // 2^96
    expect(priceImpactBps(p, p)).toBe(0); // unchanged price
    // after/before = 0.995 -> price ratio 0.990025 -> ~99.75 bps -> 100.
    expect(priceImpactBps(1_000_000n, 995_000n)).toBe(100);
    expect(priceImpactBps(0n, 1n)).toBeUndefined(); // unusable pre-trade price
  });

  it("conductorSkim matches `amount * bps / (10_000 + bps)`", () => {
    expect(conductorSkim(10_030n, 30n)).toBe(30n);
    expect(conductorSkim(1_000_000n, 0n)).toBe(0n);
    expect(conductorSkim(1_030_000n, 300n)).toBe(30_000n);
  });

  it("resolveFeeAsset is WBTC > USDB > tokenOut", () => {
    expect(resolveFeeAsset(WBTC, TOKEN_A, WBTC, USDB)).toBe(WBTC);
    expect(resolveFeeAsset(TOKEN_A, WBTC, WBTC, USDB)).toBe(WBTC);
    expect(resolveFeeAsset(USDB, TOKEN_A, WBTC, USDB)).toBe(USDB);
    expect(resolveFeeAsset(TOKEN_A, USDB, WBTC, USDB)).toBe(USDB);
    expect(resolveFeeAsset(TOKEN_A, TOKEN_B, WBTC, USDB)).toBe(TOKEN_B);
  });

  it("effectiveSwapInput reduces only on the input side", () => {
    expect(effectiveSwapInput(10_030n, 30n, true)).toBe(10_000n);
    expect(effectiveSwapInput(10_030n, 30n, false)).toBe(10_030n);
    expect(effectiveSwapInput(10_030n, 0n, true)).toBe(10_030n);
  });
});

// ── quote() input validation (throws before any RPC) ─────────────────────────

describe("TradingClient.quote — validation", () => {
  it("rejects BTC -> BTC", async () => {
    await expect(
      newAmm().quote({
        assetInAddress: "btc",
        assetOutAddress: "btc",
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/BTC → BTC/);
    expect(mockReadContract).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amountIn", async () => {
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "0",
        fee: 3000,
      })
    ).rejects.toThrow(/greater than zero/);
  });

  it("rejects a non-base-10 amountIn", async () => {
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "0x10",
        fee: 3000,
      })
    ).rejects.toThrow(/base-10 integer/);
  });

  it("rejects out-of-range slippageBps", async () => {
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
        slippageBps: 10_001,
      })
    ).rejects.toThrow(/slippageBps/);
  });

  it("rejects out-of-range integratorBps", async () => {
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
        integratorBps: 1001,
      })
    ).rejects.toThrow(/integratorBps/);
  });

  it("requires wbtcAddress for a btc leg", async () => {
    const amm = newAmm({
      conductorAddress: CONDUCTOR,
      factoryAddress: FACTORY,
      quoterV2Address: QUOTER,
    });
    await expect(
      amm.quote({
        assetInAddress: "btc",
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/wbtcAddress/);
  });

  it("rejects identical tokenIn/tokenOut", async () => {
    configureReads();
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_A,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/must differ/);
  });

  it("throws when quoterV2Address is unconfigured", async () => {
    const amm = newAmm({
      conductorAddress: CONDUCTOR,
      wbtcAddress: WBTC,
      factoryAddress: FACTORY,
    });
    await expect(
      amm.quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/quoterV2Address is not configured/);
  });

  it("throws when the Conductor is set without a factory", async () => {
    const amm = newAmm({
      conductorAddress: CONDUCTOR,
      wbtcAddress: WBTC,
      quoterV2Address: QUOTER,
    });
    await expect(
      amm.quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/require factoryAddress/);
  });
});

// ── quote() computation (mocked reads) ───────────────────────────────────────

describe("TradingClient.quote — computation", () => {
  it("token -> token with no fee returns the raw QuoterV2 output", async () => {
    configureReads({ grossOut: 1_000_000n, hostBps: 0, protocolBps: 0 });
    const res = await newAmm().quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "500000",
      fee: 3000,
    });
    expect(res.amountOut).toBe("1000000");
    expect(res.minAmountOut).toBe("995000"); // default 50 bps haircut
    expect(res.conductorFeeBps).toBe(0);
    expect(res.conductorFeeAmount).toBe("0");
    expect(res.conductorFeeAsset).toBeUndefined();
    expect(res.fee).toBe(3000);
    expect(quoterAmountIn()).toBe(500_000n); // full input swapped
  });

  it("applies an output-side Conductor skim (fee asset = tokenOut)", async () => {
    // tokenOut is the fee asset, so the skim comes off the gross output.
    // total = 30 host + 0 protocol = 30 bps; skim(1_003_000, 30) = 3_000.
    configureReads({
      grossOut: 1_003_000n,
      hostBps: 30,
      protocolBps: 0,
      wbtc: WBTC,
      usdb: USDB,
    });
    const res = await newAmm().quote({
      assetInAddress: TOKEN_A, // neither leg is WBTC/USDB -> fee asset = tokenOut
      assetOutAddress: TOKEN_B,
      amountIn: "1000000",
      fee: 3000,
      slippageBps: 0,
    });
    expect(res.conductorFeeBps).toBe(30);
    expect(res.conductorFeeAmount).toBe("3000"); // output-side skim
    expect(res.conductorFeeAsset).toBe(TOKEN_B);
    expect(res.amountOut).toBe("1000000"); // 1_003_000 - 3_000
    expect(quoterAmountIn()).toBe(1_000_000n); // full input swapped
  });

  it("applies an input-side skim and quotes the reduced input (fee asset = tokenIn)", async () => {
    // tokenIn == USDB == fee asset -> input-side skim: quote the reduced input.
    // (USDB, not WBTC, so quote() leaves the fee in base units rather than
    // converting it to sats.) skim(10_030, 30) = 30 -> quoter sees 10_000.
    configureReads({
      grossOut: 2_000_000n,
      hostBps: 30,
      protocolBps: 0,
      wbtc: WBTC,
      usdb: USDB,
    });
    const res = await newAmm().quote({
      assetInAddress: USDB,
      assetOutAddress: TOKEN_B,
      amountIn: "10030",
      fee: 3000,
      slippageBps: 0,
    });
    expect(quoterAmountIn()).toBe(10_000n); // reduced input
    expect(res.conductorFeeAsset).toBe(USDB);
    expect(res.conductorFeeAmount).toBe("30"); // input-side fee
    expect(res.amountOut).toBe("2000000"); // output not skimmed again
  });

  it("folds host + protocol + integrator fees into the total skim", async () => {
    // total = 30 host + 20 protocol + 50 integrator = 100 bps (output-side,
    // fee asset = tokenOut). skim(1_010_000, 100) = 10_000.
    configureReads({
      grossOut: 1_010_000n,
      hostBps: 30,
      protocolBps: 20,
      wbtc: WBTC,
      usdb: USDB,
    });
    const res = await newAmm().quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000000",
      fee: 3000,
      integratorBps: 50,
      slippageBps: 0,
    });
    expect(res.conductorFeeBps).toBe(100); // all three components summed
    expect(res.conductorFeeAmount).toBe("10000");
    expect(res.amountOut).toBe("1000000"); // 1_010_000 - 10_000
  });

  it("reports a WBTC Conductor fee in whole sats, not wei", async () => {
    // token -> BTC, fee asset = WBTC (the output leg). The 30 bps output skim is
    // 30_000_000_000 wei; quote() must report it as 3 sats to match amountOut's
    // units. skim(10_030_000_000_000, 30) = 30_000_000_000; net = 1_000 sats.
    configureReads({
      grossOut: 10_030_000_000_000n, // 1003 sats in WBTC wei
      hostBps: 30,
      protocolBps: 0,
      wbtc: WBTC,
      usdb: USDB,
    });
    const res = await newAmm().quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      fee: 3000,
      slippageBps: 0,
    });
    expect(res.conductorFeeAsset).toBe(WBTC);
    expect(res.conductorFeeAmount).toBe("3"); // 30_000_000_000 wei -> 3 sats
    expect(res.amountOut).toBe("1000"); // 10_000_000_000_000 wei -> 1000 sats
  });

  it("rejects a Conductor fee component above the protocol cap", async () => {
    configureReads({ hostBps: 2000, protocolBps: 0 }); // > MAX_FEE_RATE_BPS
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/exceeds the protocol maximum/);
  });

  it("converts a BTC input from sats to WBTC wei before quoting", async () => {
    configureReads({ grossOut: 1_000_000n, hostBps: 0, protocolBps: 0 });
    await newAmm().quote({
      assetInAddress: "btc",
      assetOutAddress: TOKEN_B,
      amountIn: "250000", // sats
      fee: 3000,
    });
    // tokenIn resolves to WBTC; with no fee the full wei amount is quoted.
    expect(quoterAmountIn()).toBe(250_000n * WEI_PER_SAT);
  });

  it("converts a BTC output from WBTC wei back to whole sats", async () => {
    configureReads({ grossOut: 100n * WEI_PER_SAT, hostBps: 0, protocolBps: 0 });
    const res = await newAmm().quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: "btc",
      amountIn: "1000000",
      fee: 3000,
    });
    expect(res.amountOut).toBe("100"); // 100 sats
    expect(res.minAmountOut).toBe("99"); // weiToSats(99.5 sats) floors to 99
  });

  it("throws when a BTC-out minAmountOut floors below 1 sat", async () => {
    // netOut just over 1 sat; the 50 bps haircut drops the floor below 1 sat
    // (>0 wei) which would silently disable slippage protection.
    configureReads({ grossOut: WEI_PER_SAT + 5n, hostBps: 0, protocolBps: 0 });
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: "btc",
        amountIn: "1000000",
        fee: 3000,
      })
    ).rejects.toThrow(/below 1 sat/);
  });

  it("surfaces a best-effort price impact, and omits it when slot0 fails", async () => {
    configureReads({
      grossOut: 1_000_000n,
      sqrtBefore: 1_000_000n,
      sqrtAfter: 995_000n,
    });
    const withImpact = await newAmm().quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000",
      fee: 3000,
    });
    expect(withImpact.priceImpactBps).toBe(100);

    configureReads({ grossOut: 1_000_000n, slot0Throw: true });
    const noImpact = await newAmm().quote({
      assetInAddress: TOKEN_A,
      assetOutAddress: TOKEN_B,
      amountIn: "1000",
      fee: 3000,
    });
    expect(noImpact.priceImpactBps).toBeUndefined();
  });
});

// ── quote() error mapping ────────────────────────────────────────────────────

describe("TradingClient.quote — errors", () => {
  it("throws when the factory resolves no pool", async () => {
    configureReads({ pool: zeroAddress });
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/no pool/);
  });

  it("maps a QuoterV2 revert to no-pool / insufficient-liquidity", async () => {
    configureReads({ quoterRevert: true });
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/no pool or insufficient liquidity/);
  });

  it("rethrows a non-revert read failure (transport) unchanged", async () => {
    configureReads({ grossOut: 1_000_000n });
    mockReadContract.mockImplementation((call: { functionName: string }) => {
      if (call.functionName === "quoteExactInputSingle") {
        throw new BaseError("HTTP request failed");
      }
      if (call.functionName === "getPool") return POOL;
      return 0;
    });
    await expect(
      newAmm().quote({
        assetInAddress: TOKEN_A,
        assetOutAddress: TOKEN_B,
        amountIn: "1000",
        fee: 3000,
      })
    ).rejects.toThrow(/HTTP request failed/);
  });
});

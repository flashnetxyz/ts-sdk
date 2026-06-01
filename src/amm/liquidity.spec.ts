/**
 * Unit tests for AMMClient liquidity-management methods.
 *
 * Strategy: drive each method end-to-end against a stubbed JSON-RPC + gateway,
 * capture the signed EVM transaction the SDK hands to `/execute`, then decode
 * its calldata against the (selector-verified) Conductor ABI and assert the
 * function, struct fields, permit bindings, and `msg.value` are exactly what
 * the contract expects. EVM signing is local (no live node needed); only the
 * `positions`/`name`/`balanceOf` reads and the nonce lookup are stubbed.
 */
import { webcrypto } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseTransaction,
} from "viem";

// The Permit2 signing path uses the global `crypto.getRandomValues` (present
// in browsers and Node 20+). The ts-jest node environment doesn't expose it,
// so polyfill from node:crypto before any test runs.
if (!globalThis.crypto) {
  (globalThis as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import { conductorAbi } from "../execution/abis/conductor";
import { nonfungiblePositionManagerAbi } from "../execution/abis/nonfungiblePositionManager";
import { ExecutionClient } from "../execution/client";
import type { SparkWalletInput } from "../execution/spark-evm-account";
import { encodeSparkHumanReadableTokenIdentifier } from "../utils/tokenAddress";
import { AMMClient, satsToWei, weiToSats } from "./client";

const TEST_KEY = new Uint8Array(32);
TEST_KEY[31] = 1;

// Sorted ERC20 pair (token0 < token1) for non-BTC tests.
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
// WBTC sorts first against TOKEN_C so the BTC leg is token0.
const WBTC = "0x0000000000000000000000000000000000000abc";
const TOKEN_C = "0xcccccccccccccccccccccccccccccccccccccccc";

const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const CONDUCTOR = "0x9999999999999999999999999999999999999999";
const NPM = "0x8888888888888888888888888888888888888888";
// Canonical Multicall3 (configured in src/execution/rpc.ts); listPositions
// batches its NPM reads through aggregate3 on this address.
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** Minimal Multicall3 surface the stub needs to answer `client.multicall`. */
const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const AMM_CONFIG = {
  conductorAddress: CONDUCTOR,
  permit2Address: PERMIT2,
  wbtcAddress: WBTC,
  positionManagerAddress: NPM,
};

const EXEC_CONFIG = {
  gatewayUrl: "http://localhost:8080",
  rpcUrl: "http://localhost:8545",
  chainId: 21022,
};

const DEPOSIT_ADDRESS =
  "sparkrt1pgssx3qm405syfc0hcgul58t7ce9c9xjyu5w4pnda4eu6tts9d6cqkj94epdlw";

/** Mutable position the `positions(tokenId)` stub returns. */
interface StubPosition {
  nonce: bigint;
  token0: string;
  token1: string;
  fee: number;
  liquidity: bigint;
}
let stubPosition: StubPosition;
let stubBalance: bigint;
/** Permit2 allowance the `allowance()` stub returns; default effectively-infinite. */
let stubAllowance: bigint;
/** Token ids the `tokenOfOwnerByIndex(owner, i)` stub returns, by index. */
let stubTokenIds: bigint[];
/** Per-tokenId positions for the multi-position enumeration path; falls back to `stubPosition`. */
let stubPositionsById: Map<string, StubPosition>;

function mockWallet(opts?: {
  onTransfer?: (a: unknown) => void;
  onTransferTokens?: (a: unknown) => void;
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
      // BTC transfer ids are 16 bytes (32 hex chars).
      return { id: "ab".repeat(16) };
    },
    async transferTokens(args: {
      tokenIdentifier: string;
      tokenAmount: bigint;
      receiverSparkAddress: string;
    }) {
      opts?.onTransferTokens?.(args);
      // Token transfer ids are 32 bytes (64 hex chars).
      return "cd".repeat(32);
    },
  } as unknown as SparkWalletInput;
}

/**
 * Captured `/execute` wire bodies, newest last. The gateway contract names the
 * signed tx `evmTransaction` (see ExecutionClient.submitIntent), not `signedTx`.
 */
let executeBodies: Array<{ deposits: unknown[]; evmTransaction: string }>;

function positionFor(tokenId: bigint): StubPosition {
  return stubPositionsById.get(tokenId.toString()) ?? stubPosition;
}

function encodePositions(pos: StubPosition): `0x${string}` {
  return encodeFunctionResult({
    abi: nonfungiblePositionManagerAbi,
    functionName: "positions",
    result: [
      pos.nonce,
      "0x0000000000000000000000000000000000000000",
      pos.token0 as `0x${string}`,
      pos.token1 as `0x${string}`,
      pos.fee,
      -60,
      60,
      pos.liquidity,
      0n,
      0n,
      0n,
      0n,
    ],
  });
}

/** Stub global.fetch for both the gateway and JSON-RPC endpoints. */
function stubFetch(): void {
  global.fetch = jest.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/v1/auth/challenge")) {
      return jsonResponse({
        challenge: "c",
        challengeString: "challenge-string",
      });
    }
    if (url.endsWith("/api/v1/auth/verify")) {
      return jsonResponse({ accessToken: "test-token" });
    }
    if (url.endsWith("/api/v1/verifyDeposit")) {
      // 503 → SDK falls back to the legacy proofless admission path.
      return new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      });
    }
    if (url.endsWith("/api/v1/network/info")) {
      return jsonResponse({
        spark: { depositAddress: DEPOSIT_ADDRESS, network: "REGTEST" },
        execution: { contractAddress: CONDUCTOR, chainId: EXEC_CONFIG.chainId },
        paused: false,
        minDepositSats: 1000,
      });
    }
    if (url.endsWith("/api/v1/execute")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      executeBodies.push(body);
      return jsonResponse({
        submissionId: "sub-1",
        intentId: "intent-1",
        status: "accepted",
      });
    }
    // Otherwise it's a JSON-RPC call to the sequencer.
    const rpc = JSON.parse((init?.body as string) ?? "{}");
    return jsonResponse({ jsonrpc: "2.0", id: rpc.id, result: rpcResult(rpc) });
  }) as unknown as typeof fetch;
}

function rpcResult(rpc: { method: string; params: unknown[] }): unknown {
  switch (rpc.method) {
    case "eth_chainId":
      return `0x${EXEC_CONFIG.chainId.toString(16)}`;
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_blockNumber":
      return "0x1";
    case "eth_call": {
      const call = rpc.params[0] as { to: string; data: `0x${string}` };
      return ethCallReturn(call.to, call.data);
    }
    default:
      throw new Error(`unexpected rpc method ${rpc.method}`);
  }
}

/**
 * Resolve a single `eth_call`. Recurses through Multicall3 `aggregate3` so the
 * `client.multicall` batches in `listPositions` resolve to their per-call
 * results. Dispatches NPM reads by selector.
 */
function ethCallReturn(to: string, data: `0x${string}`): `0x${string}` {
  const selector = data.slice(0, 10).toLowerCase();

  if (
    to.toLowerCase() === MULTICALL3.toLowerCase() &&
    selector === "0x82ad56cb"
  ) {
    const [calls] = decodeFunctionData({ abi: multicall3Abi, data })
      .args as readonly [
      readonly {
        target: string;
        allowFailure: boolean;
        callData: `0x${string}`;
      }[],
    ];
    const results = calls.map((c) => ({
      success: true,
      returnData: ethCallReturn(c.target, c.callData),
    }));
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      result: results,
    });
  }

  if (selector === "0x99fbab88") {
    // positions(tokenId)
    const [tokenId] = decodeFunctionData({
      abi: nonfungiblePositionManagerAbi,
      data,
    }).args as readonly [bigint];
    return encodePositions(positionFor(tokenId));
  }
  if (selector === "0x06fdde03") {
    return encodeFunctionResult({
      abi: nonfungiblePositionManagerAbi,
      functionName: "name",
      result: "Uniswap V3 Positions NFT-V1",
    });
  }
  if (selector === "0x70a08231") {
    return encodeFunctionResult({
      abi: nonfungiblePositionManagerAbi,
      functionName: "balanceOf",
      result: stubBalance,
    });
  }
  if (selector === "0x2f745c59") {
    // tokenOfOwnerByIndex(owner, index)
    const args = decodeFunctionData({
      abi: nonfungiblePositionManagerAbi,
      data,
    }).args as readonly [string, bigint];
    return encodeFunctionResult({
      abi: nonfungiblePositionManagerAbi,
      functionName: "tokenOfOwnerByIndex",
      result: stubTokenIds[Number(args[1])] ?? 0n,
    });
  }
  if (selector === "0xdd62ed3e") {
    // allowance(owner, spender) → uint256 (Permit2 pre-flight check)
    return `0x${stubAllowance.toString(16).padStart(64, "0")}` as `0x${string}`;
  }
  throw new Error(`unexpected eth_call selector ${selector} to ${to}`);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Decode the captured signed tx into its Conductor call. */
function decodeLastCall(): {
  functionName: string;
  args: readonly unknown[];
  value: bigint;
  to: string;
} {
  const body = executeBodies.at(-1);
  if (!body) {
    throw new Error("no /execute call captured");
  }
  const tx = parseTransaction(body.evmTransaction as `0x${string}`);
  const decoded = decodeFunctionData({
    abi: conductorAbi,
    data: tx.data as `0x${string}`,
  });
  return {
    functionName: decoded.functionName,
    args: decoded.args as readonly unknown[],
    value: tx.value ?? 0n,
    to: (tx.to ?? "").toLowerCase(),
  };
}

async function makeClient(
  walletOpts?: Parameters<typeof mockWallet>[0]
): Promise<AMMClient> {
  const exec = new ExecutionClient(mockWallet(walletOpts), EXEC_CONFIG);
  await exec.authenticate();
  return new AMMClient(exec, AMM_CONFIG);
}

beforeEach(() => {
  executeBodies = [];
  stubBalance = 0n;
  stubAllowance = (1n << 256n) - 1n;
  stubTokenIds = [];
  stubPositionsById = new Map();
  stubPosition = {
    nonce: 7n,
    token0: TOKEN_A,
    token1: TOKEN_B,
    fee: 3000,
    liquidity: 1000n,
  };
  stubFetch();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("unit conversion helpers", () => {
  it("satsToWei multiplies by 1e10", () => {
    expect(satsToWei(1n)).toBe(10_000_000_000n);
    expect(satsToWei(250_000)).toBe(2_500_000_000_000_000n);
  });
  it("weiToSats floors to whole sats", () => {
    expect(weiToSats(10_000_000_000n)).toBe(1n);
    expect(weiToSats(10_000_000_001n)).toBe(1n);
  });
});

describe("AMMClient.addLiquidity (ERC20/ERC20)", () => {
  it("encodes addLiquidity with both Permit2 legs bound to the right tokens", async () => {
    const amm = await makeClient();
    await amm.addLiquidity({
      token0: TOKEN_A,
      token1: TOKEN_B,
      fee: 3000,
      tickLower: -60,
      tickUpper: 60,
      amount0Desired: "1000",
      amount1Desired: "2000",
      amount0Min: "900",
      amount1Min: "1800",
    });

    const { functionName, args, value, to } = decodeLastCall();
    expect(functionName).toBe("addLiquidity");
    expect(to).toBe(CONDUCTOR.toLowerCase());
    expect(value).toBe(0n);

    const struct = args[0] as Record<string, unknown>;
    expect((struct.token0 as string).toLowerCase()).toBe(TOKEN_A);
    expect((struct.token1 as string).toLowerCase()).toBe(TOKEN_B);
    expect(struct.fee).toBe(3000);
    expect(struct.amount0Desired).toBe(1000n);
    expect(struct.amount1Desired).toBe(2000n);
    expect(struct.amount0Min).toBe(900n);
    expect(struct.amount1Min).toBe(1800n);

    // permitA bound to token0/amount0, permitB to token1/amount1.
    const permitA = args[1] as { permitted: { token: string; amount: bigint } };
    const permitB = args[3] as { permitted: { token: string; amount: bigint } };
    expect(permitA.permitted.token.toLowerCase()).toBe(TOKEN_A);
    expect(permitA.permitted.amount).toBe(1000n);
    expect(permitB.permitted.token.toLowerCase()).toBe(TOKEN_B);
    expect(permitB.permitted.amount).toBe(2000n);
  });

  it("rejects an unsorted pair (token0 >= token1)", async () => {
    const amm = await makeClient();
    await expect(
      amm.addLiquidity({
        token0: TOKEN_B,
        token1: TOKEN_A,
        fee: 3000,
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: "1",
        amount1Desired: "1",
        amount0Min: "0",
        amount1Min: "0",
      })
    ).rejects.toThrow(/sort strictly before/);
  });

  it("bundles two Spark deposits and the call in one intent (useAvailableBalance)", async () => {
    let tokenTransfers = 0;
    const amm = await makeClient({ onTransferTokens: () => tokenTransfers++ });
    const res = await amm.addLiquidity({
      token0: TOKEN_A,
      token1: TOKEN_B,
      fee: 3000,
      tickLower: -60,
      tickUpper: 60,
      amount0Desired: "1000",
      amount1Desired: "2000",
      amount0Min: "0",
      amount1Min: "0",
      useAvailableBalance: true,
      token0SparkId: encodeSparkHumanReadableTokenIdentifier(
        "aa".repeat(32),
        "REGTEST"
      ),
      token1SparkId: encodeSparkHumanReadableTokenIdentifier(
        "bb".repeat(32),
        "REGTEST"
      ),
    });

    expect(tokenTransfers).toBe(2);
    const body = executeBodies.at(-1);
    expect(body?.deposits).toHaveLength(2);
    expect(res.inboundSparkTransferIds).toHaveLength(2);
    expect(decodeLastCall().functionName).toBe("addLiquidity");
  });

  it("refuses the Spark-funded ERC20 path when Permit2 is not approved, before transferring", async () => {
    stubAllowance = 0n; // no standing Permit2 allowance
    let tokenTransfers = 0;
    const amm = await makeClient({ onTransferTokens: () => tokenTransfers++ });
    await expect(
      amm.addLiquidity({
        token0: TOKEN_A,
        token1: TOKEN_B,
        fee: 3000,
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: "1000",
        amount1Desired: "2000",
        amount0Min: "0",
        amount1Min: "0",
        useAvailableBalance: true,
        token0SparkId: encodeSparkHumanReadableTokenIdentifier(
          "aa".repeat(32),
          "REGTEST"
        ),
        token1SparkId: encodeSparkHumanReadableTokenIdentifier(
          "bb".repeat(32),
          "REGTEST"
        ),
      })
    ).rejects.toThrow(/Permit2 allowance/);
    // The guard must run BEFORE any Spark transfer so funds aren't stranded.
    expect(tokenTransfers).toBe(0);
    expect(executeBodies).toHaveLength(0);
  });
});

describe("AMMClient.addLiquidity (BTC-paired)", () => {
  it("routes to addLiquidityBTC with msg.value = WBTC-leg wei", async () => {
    const amm = await makeClient();
    const wbtcWei = satsToWei(10_000); // 10k sats on the WBTC (token0) leg
    await amm.addLiquidity({
      token0: WBTC, // sorts before TOKEN_C → token0 is the BTC leg
      token1: TOKEN_C,
      fee: 3000,
      tickLower: -60,
      tickUpper: 60,
      amount0Desired: wbtcWei.toString(),
      amount1Desired: "5000",
      amount0Min: "0",
      amount1Min: "0",
    });

    const { functionName, args, value } = decodeLastCall();
    expect(functionName).toBe("addLiquidityBTC");
    expect(value).toBe(wbtcWei);
    // The single ERC20 permit must bind the non-WBTC leg (TOKEN_C).
    const permit = args[1] as { permitted: { token: string; amount: bigint } };
    expect(permit.permitted.token.toLowerCase()).toBe(TOKEN_C);
    expect(permit.permitted.amount).toBe(5000n);
  });

  it("refuses a funded BTC pair when the ERC20 leg lacks a Spark token id, before any transfer", async () => {
    // The pre-flight must fire before the BTC leg's (irreversible) transfer, or
    // the BTC funds land at custody with no submittable intent.
    let btcTransfers = 0;
    let tokenTransfers = 0;
    const amm = await makeClient({
      onTransfer: () => btcTransfers++,
      onTransferTokens: () => tokenTransfers++,
    });
    await expect(
      amm.addLiquidity({
        token0: WBTC, // BTC leg (sorts first)
        token1: TOKEN_C, // ERC20 leg, token1SparkId omitted on purpose
        fee: 3000,
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: satsToWei(10_000).toString(),
        amount1Desired: "5000",
        amount0Min: "0",
        amount1Min: "0",
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/Spark token id/);
    expect(btcTransfers).toBe(0);
    expect(tokenTransfers).toBe(0);
    expect(executeBodies).toHaveLength(0);
  });
});

describe("AMMClient.increaseLiquidity", () => {
  it("reads the position tokens and encodes increaseLiquidity", async () => {
    const amm = await makeClient();
    await amm.increaseLiquidity({
      tokenId: 42n,
      amount0Desired: "100",
      amount1Desired: "200",
      amount0Min: "0",
      amount1Min: "0",
    });

    const { functionName, args, value } = decodeLastCall();
    expect(functionName).toBe("increaseLiquidity");
    expect(value).toBe(0n);
    const struct = args[0] as Record<string, unknown>;
    expect(struct.tokenId).toBe(42n);
    expect(struct.amount0Desired).toBe(100n);
    const permitA = args[1] as { permitted: { token: string } };
    expect(permitA.permitted.token.toLowerCase()).toBe(TOKEN_A);
  });
});

describe("AMMClient.decreaseLiquidity", () => {
  it("encodes decreaseLiquidityAndWithdraw with a signed NFT permit", async () => {
    const amm = await makeClient();
    await amm.decreaseLiquidity({
      tokenId: 42n,
      liquidity: "500",
      amount0Min: "10",
      amount1Min: "20",
    });

    const { functionName, args, value } = decodeLastCall();
    expect(functionName).toBe("decreaseLiquidityAndWithdraw");
    expect(value).toBe(0n);
    expect(args[0]).toBe(42n); // tokenId
    expect(args[1]).toBe(500n); // liquidity
    expect(args[2]).toBe(10n); // amount0Min
    expect(args[3]).toBe(20n); // amount1Min
    const nftPermit = args[5] as { v: number; r: string; s: string };
    expect([27, 28]).toContain(nftPermit.v);
    expect(nftPermit.r).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects zero liquidity", async () => {
    const amm = await makeClient();
    await expect(
      amm.decreaseLiquidity({
        tokenId: 1n,
        liquidity: "0",
        amount0Min: "0",
        amount1Min: "0",
      })
    ).rejects.toThrow(/greater than zero/);
  });
});

describe("AMMClient.collectFees", () => {
  it("encodes collectFeesAndWithdraw with a signed NFT permit", async () => {
    const amm = await makeClient();
    await amm.collectFees({ tokenId: 9n });

    const { functionName, args } = decodeLastCall();
    expect(functionName).toBe("collectFeesAndWithdraw");
    expect(args[0]).toBe(9n);
    const nftPermit = args[1] as { v: number };
    expect([27, 28]).toContain(nftPermit.v);
  });
});

describe("AMMClient.modifyPosition", () => {
  it("encodes modifyPosition with both permits bound to the position tokens", async () => {
    const amm = await makeClient();
    await amm.modifyPosition({
      tokenId: 42n,
      newTickLower: -120,
      newTickUpper: 120,
      amount0Min: "0",
      amount1Min: "0",
      additionalAmount0Desired: "300",
      additionalAmount1Desired: "0",
      newAmount0Min: "0",
      newAmount1Min: "0",
    });

    const { functionName, args, value } = decodeLastCall();
    expect(functionName).toBe("modifyPosition");
    expect(value).toBe(0n);
    const struct = args[0] as Record<string, unknown>;
    expect(struct.tokenId).toBe(42n);
    expect(struct.newTickLower).toBe(-120);
    expect(struct.additionalAmount0Desired).toBe(300n);
    const permitA = args[2] as { permitted: { token: string; amount: bigint } };
    const permitB = args[4] as { permitted: { token: string; amount: bigint } };
    expect(permitA.permitted.token.toLowerCase()).toBe(TOKEN_A);
    expect(permitA.permitted.amount).toBe(300n);
    // Zero-additional leg still binds token1 (Conductor checks it).
    expect(permitB.permitted.token.toLowerCase()).toBe(TOKEN_B);
    expect(permitB.permitted.amount).toBe(0n);
  });
});

describe("AMMClient position reads", () => {
  it("getPosition maps the NPM tuple into PositionInfo", async () => {
    stubPosition = {
      nonce: 3n,
      token0: TOKEN_A,
      token1: TOKEN_B,
      fee: 500,
      liquidity: 123456n,
    };
    const amm = await makeClient();
    const pos = await amm.getPosition(42n);
    expect(pos.tokenId).toBe(42n);
    expect(pos.nonce).toBe(3n);
    expect(pos.token0.toLowerCase()).toBe(TOKEN_A);
    expect(pos.token1.toLowerCase()).toBe(TOKEN_B);
    expect(pos.fee).toBe(500);
    expect(pos.tickLower).toBe(-60);
    expect(pos.tickUpper).toBe(60);
    expect(pos.liquidity).toBe(123456n);
  });

  it("listPositions returns [] when the owner holds none", async () => {
    stubBalance = 0n;
    const amm = await makeClient();
    expect(await amm.listPositions()).toEqual([]);
  });

  it("listPositions enumerates and maps every owned position", async () => {
    // balanceOf → tokenOfOwnerByIndex (multicall) → positions (multicall) → map.
    stubBalance = 2n;
    stubTokenIds = [101n, 202n];
    stubPositionsById = new Map([
      [
        "101",
        {
          nonce: 1n,
          token0: TOKEN_A,
          token1: TOKEN_B,
          fee: 500,
          liquidity: 111n,
        },
      ],
      [
        "202",
        {
          nonce: 2n,
          token0: TOKEN_A,
          token1: TOKEN_C,
          fee: 3000,
          liquidity: 222n,
        },
      ],
    ]);
    const amm = await makeClient();
    const positions = await amm.listPositions();

    expect(positions).toHaveLength(2);
    // Each tokenId must map to its own position (not a shared fixture).
    expect(positions[0]?.tokenId).toBe(101n);
    expect(positions[0]?.fee).toBe(500);
    expect(positions[0]?.liquidity).toBe(111n);
    expect(positions[0]?.token1.toLowerCase()).toBe(TOKEN_B);
    expect(positions[1]?.tokenId).toBe(202n);
    expect(positions[1]?.fee).toBe(3000);
    expect(positions[1]?.liquidity).toBe(222n);
    expect(positions[1]?.token1.toLowerCase()).toBe(TOKEN_C);
  });
});

describe("AMMClient liquidity config guards", () => {
  it("throws when positionManagerAddress is missing", async () => {
    const exec = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new AMMClient(exec, { conductorAddress: CONDUCTOR });
    await expect(amm.getPosition(1n)).rejects.toThrow(
      /positionManagerAddress is required/
    );
  });
});

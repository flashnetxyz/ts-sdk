/**
 * Guardrail tests: trading-stack addresses stay off `/network/info`.
 *
 * Compile-time enforcement lives in `types.ts`; these runtime tests are the
 * executable counterpart, pinning the expected wire shape and asserting no
 * trading-stack key (Conductor / WBTC / factory / NPM / Permit2) appears at
 * any level.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { ExecutionClient } from "./client";
import type { SparkWalletInput } from "./spark-evm-account";
import type {
  ExecutionNetworkInfo,
  NetworkInfo,
  SparkNetworkInfo,
} from "./types";

/** Every trading-stack address field that must never appear on NetworkInfo. */
const FORBIDDEN_TRADING_ADDRESS_KEYS = [
  "conductorAddress",
  "wbtcAddress",
  "factoryAddress",
  "positionManagerAddress",
  "permit2Address",
  "uniswapFactoryAddress",
] as const;

/**
 * Canonical `/api/v1/network/info` payload. Mirrors the fixture in
 * `network-info.spec.ts` and the Rust gateway response shape. Typed as
 * {@link NetworkInfo} so a forbidden excess key here is *also* a compile
 * error, not just a runtime assertion failure.
 */
const NETWORK_INFO: NetworkInfo = {
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

function keysOf(obj: object): string[] {
  return Object.keys(obj);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("NetworkInfo trading-address guardrail", () => {
  it("exposes only execution-discovery concerns at the top level", () => {
    expect(keysOf(NETWORK_INFO).sort()).toEqual(
      ["execution", "minDepositSats", "paused", "spark"].sort()
    );
  });

  it("SparkNetworkInfo carries only depositAddress + network", () => {
    const spark: SparkNetworkInfo = NETWORK_INFO.spark;
    expect(keysOf(spark).sort()).toEqual(["depositAddress", "network"].sort());
  });

  it("ExecutionNetworkInfo carries only contractAddress + chainId", () => {
    const execution: ExecutionNetworkInfo = NETWORK_INFO.execution;
    expect(keysOf(execution).sort()).toEqual(
      ["chainId", "contractAddress"].sort()
    );
  });

  it("carries no trading-stack address field at any level", () => {
    const allKeys = [
      ...keysOf(NETWORK_INFO),
      ...keysOf(NETWORK_INFO.spark),
      ...keysOf(NETWORK_INFO.execution),
    ];
    for (const forbidden of FORBIDDEN_TRADING_ADDRESS_KEYS) {
      expect(allKeys).not.toContain(forbidden);
    }
  });

  it("returns the gateway response verbatim — trading addresses stay off the typed surface (compile-time enforced)", async () => {
    // `getNetworkInfo()` returns the parsed JSON verbatim — it does not strip
    // unknown fields, so a polluted `conductorAddress` survives at runtime.
    // The real guarantee is the typed surface (enforced at compile time in
    // types.ts): reading a trading address requires an `as`-cast. Here we just
    // pin that the documented fields survive an extra-field response unchanged.
    const polluted = {
      ...NETWORK_INFO,
      execution: {
        ...NETWORK_INFO.execution,
        conductorAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
    };
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify(polluted), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as unknown as typeof fetch;

    const client = new ExecutionClient(mockWallet(), {
      gatewayUrl: "http://localhost:8080",
      rpcUrl: "http://localhost:8545",
      chainId: 21022,
    });
    const info = await client.getNetworkInfo();

    // The typed accessor exposes only the documented execution fields. Reading
    // a trading address would require an `as any` escape hatch — exactly what
    // the guardrail forbids. Assert the documented fields are intact.
    expect(info.execution.contractAddress).toBe(
      NETWORK_INFO.execution.contractAddress
    );
    expect(info.execution.chainId).toBe(NETWORK_INFO.execution.chainId);
    expect(info.spark.depositAddress).toBe(NETWORK_INFO.spark.depositAddress);
  });
});

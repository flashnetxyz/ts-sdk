/**
 * Flashnet SDK Testing Framework
 *
 * A unified testing framework for the Flashnet SDK that provides:
 * - Consistent test structure (suites, categories, tests)
 * - Common utilities (wallet, funding, tokens, pools)
 * - Assertions with detailed error messages
 * - Rich console reporting
 * - Environment configuration
 *
 * Usage:
 *   import { TestRunner, createTestContext } from './framework';
 *   const runner = new TestRunner('My Test Suite');
 *   const ctx = await createTestContext();
 *   runner.test('my test', async () => { ... });
 *   await runner.run();
 */

import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import { randomBytes } from "crypto";

import {
  BTC_ASSET_PUBKEY,
  encodeSparkAddressNew,
  FlashnetClient,
  humanPriceToPoolPrice,
  type SparkNetworkType,
  tickRangeFromPrices,
} from "../../index";

// Configuration

export interface TestConfig {
  ammUrl: string;
  mempoolUrl: string;
  sparkscanUrl: string;
  faucetUrl: string;
  sparkNetwork: SparkNetworkType;
}

export function loadConfig(): TestConfig {
  const ammUrl = process.env.AMM_URL;
  const mempoolUrl = process.env.MEMPOOL_URL;
  const sparkscanUrl = process.env.SPARKSCAN_URL;
  const faucetUrl = process.env.FAUCET_URL;
  const sparkNetwork = (process.env.SPARK_NETWORK || "REGTEST") as SparkNetworkType;

  const missing: string[] = [];
  if (!ammUrl) missing.push("AMM_URL");
  if (!mempoolUrl) missing.push("MEMPOOL_URL");
  if (!sparkscanUrl) missing.push("SPARKSCAN_URL");
  if (!faucetUrl) missing.push("FAUCET_URL");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    ammUrl: ammUrl!,
    mempoolUrl: mempoolUrl!,
    sparkscanUrl: sparkscanUrl!,
    faucetUrl: faucetUrl!,
    sparkNetwork,
  };
}

// Test Result Types

export type TestStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface TestResult {
  name: string;
  category: string;
  status: TestStatus;
  duration: number;
  error?: string;
  errorStack?: string;
}

export interface CategoryResult {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface SuiteResult {
  name: string;
  categories: CategoryResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  startTime: Date;
  endTime: Date;
}

// Assertions

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

interface Assert {
  true(condition: boolean, message: string): void;
  false(condition: boolean, message: string): void;
  equals<T>(actual: T, expected: T, message?: string): void;
  notEquals<T>(actual: T, expected: T, message?: string): void;
  deepEquals<T>(actual: T, expected: T, message?: string): void;
  greater(a: bigint | number, b: bigint | number, message?: string): void;
  greaterOrEqual(a: bigint | number, b: bigint | number, message?: string): void;
  less(a: bigint | number, b: bigint | number, message?: string): void;
  lessOrEqual(a: bigint | number, b: bigint | number, message?: string): void;
  defined<T>(value: T | null | undefined, message?: string): asserts value is T;
  undefined(value: unknown, message?: string): void;
  null(value: unknown, message?: string): void;
  includes(str: string, substring: string, message?: string): void;
  matches(str: string, pattern: RegExp, message?: string): void;
  throws(fn: () => unknown, message?: string): void;
  rejects(fn: () => Promise<unknown>, message?: string): Promise<void>;
  rejectsWithMessage(
    fn: () => Promise<unknown>,
    expectedMessage: string | RegExp,
    message?: string
  ): Promise<void>;
}

export const assert: Assert = {
  true(condition: boolean, message: string): void {
    if (!condition) {
      throw new AssertionError(`Expected true: ${message}`);
    }
  },

  false(condition: boolean, message: string): void {
    if (condition) {
      throw new AssertionError(`Expected false: ${message}`);
    }
  },

  equals<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new AssertionError(
        `${message || "Values not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  },

  notEquals<T>(actual: T, expected: T, message?: string): void {
    if (actual === expected) {
      throw new AssertionError(
        `${message || "Values are equal"}: ${JSON.stringify(actual)}`
      );
    }
  },

  deepEquals<T>(actual: T, expected: T, message?: string): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      throw new AssertionError(
        `${message || "Objects not deep equal"}: expected ${expectedJson}, got ${actualJson}`
      );
    }
  },

  greater(a: bigint | number, b: bigint | number, message?: string): void {
    if (BigInt(a) <= BigInt(b)) {
      throw new AssertionError(`${message || "Not greater"}: ${a} <= ${b}`);
    }
  },

  greaterOrEqual(a: bigint | number, b: bigint | number, message?: string): void {
    if (BigInt(a) < BigInt(b)) {
      throw new AssertionError(`${message || "Not greater or equal"}: ${a} < ${b}`);
    }
  },

  less(a: bigint | number, b: bigint | number, message?: string): void {
    if (BigInt(a) >= BigInt(b)) {
      throw new AssertionError(`${message || "Not less"}: ${a} >= ${b}`);
    }
  },

  lessOrEqual(a: bigint | number, b: bigint | number, message?: string): void {
    if (BigInt(a) > BigInt(b)) {
      throw new AssertionError(`${message || "Not less or equal"}: ${a} > ${b}`);
    }
  },

  defined<T>(value: T | null | undefined, message?: string): asserts value is T {
    if (value === null || value === undefined) {
      throw new AssertionError(`${message || "Value is null or undefined"}`);
    }
  },

  undefined(value: unknown, message?: string): void {
    if (value !== undefined) {
      throw new AssertionError(`${message || "Value is defined"}: ${JSON.stringify(value)}`);
    }
  },

  null(value: unknown, message?: string): void {
    if (value !== null) {
      throw new AssertionError(`${message || "Value is not null"}: ${JSON.stringify(value)}`);
    }
  },

  includes(str: string, substring: string, message?: string): void {
    if (!str.includes(substring)) {
      throw new AssertionError(
        `${message || "String does not include"}: "${substring}" not in "${str.slice(0, 100)}..."`
      );
    }
  },

  matches(str: string, pattern: RegExp, message?: string): void {
    if (!pattern.test(str)) {
      throw new AssertionError(`${message || "String does not match pattern"}: ${pattern}`);
    }
  },

  throws(fn: () => unknown, message?: string): void {
    try {
      fn();
      throw new AssertionError(`${message || "Expected function to throw"}`);
    } catch (e) {
      if (e instanceof AssertionError) throw e;
      // Expected - function threw
    }
  },

  async rejects(fn: () => Promise<unknown>, message?: string): Promise<void> {
    try {
      await fn();
      throw new AssertionError(`${message || "Expected promise to reject"}`);
    } catch (e) {
      if (e instanceof AssertionError) throw e;
      // Expected - promise rejected
    }
  },

  async rejectsWithMessage(
    fn: () => Promise<unknown>,
    expectedMessage: string | RegExp,
    message?: string
  ): Promise<void> {
    try {
      await fn();
      throw new AssertionError(`${message || "Expected promise to reject"}`);
    } catch (e) {
      if (e instanceof AssertionError) throw e;
      const errMsg = e instanceof Error ? e.message : String(e);
      if (typeof expectedMessage === "string") {
        if (!errMsg.includes(expectedMessage)) {
          throw new AssertionError(
            `${message || "Error message mismatch"}: expected "${expectedMessage}", got "${errMsg}"`
          );
        }
      } else if (!expectedMessage.test(errMsg)) {
        throw new AssertionError(
          `${message || "Error message mismatch"}: ${expectedMessage} did not match "${errMsg}"`
        );
      }
    }
  },
};

// Test Context - Shared State

export interface Actor {
  wallet: IssuerSparkWallet;
  client: FlashnetClient;
  publicKey: string;
  sparkAddress: string;
}

export interface TestContext {
  config: TestConfig;
  actors: Map<string, Actor>;
  tokens: Map<string, { address: string; identifierHex: string; decimals: number }>;
  pools: Map<string, string>;
  data: Map<string, unknown>;
}

/**
 * Load config, but return null if env vars missing (for unit tests)
 */
export function loadConfigOptional(): TestConfig | null {
  const ammUrl = process.env.AMM_URL;
  const mempoolUrl = process.env.MEMPOOL_URL;
  const sparkscanUrl = process.env.SPARKSCAN_URL;
  const faucetUrl = process.env.FAUCET_URL;
  const sparkNetwork = (process.env.SPARK_NETWORK || "REGTEST") as SparkNetworkType;

  if (!ammUrl || !mempoolUrl || !sparkscanUrl || !faucetUrl) {
    return null;
  }

  return {
    ammUrl,
    mempoolUrl,
    sparkscanUrl,
    faucetUrl,
    sparkNetwork,
  };
}

export interface CreateTestContextOptions {
  /** If true, skip config validation (for unit tests) */
  skipConfig?: boolean;
}

export async function createTestContext(
  configOrOptions?: TestConfig | CreateTestContextOptions
): Promise<TestContext> {
  let config: TestConfig | undefined;

  if (configOrOptions && 'skipConfig' in configOrOptions && configOrOptions.skipConfig) {
    config = loadConfigOptional() || {
      ammUrl: "",
      mempoolUrl: "",
      sparkscanUrl: "",
      faucetUrl: "",
      sparkNetwork: "REGTEST" as SparkNetworkType,
    };
  } else if (configOrOptions && 'ammUrl' in configOrOptions) {
    config = configOrOptions as TestConfig;
  } else {
    config = loadConfig();
  }

  return {
    config,
    actors: new Map(),
    tokens: new Map(),
    pools: new Map(),
    data: new Map(),
  };
}

// Utilities

export async function createActor(
  ctx: TestContext,
  name: string
): Promise<Actor> {
  const seed = randomBytes(32);
  const { wallet } = await IssuerSparkWallet.initialize({
    mnemonicOrSeed: seed,
    options: { network: ctx.config.sparkNetwork },
  });

  const client = new FlashnetClient(wallet, {
    sparkNetworkType: ctx.config.sparkNetwork,
    clientNetworkConfig: {
      ammGatewayUrl: ctx.config.ammUrl,
      mempoolApiUrl: ctx.config.mempoolUrl,
      explorerUrl: ctx.config.mempoolUrl,
      sparkScanUrl: ctx.config.sparkscanUrl,
    },
    autoAuthenticate: true,
  });

  await client.initialize();

  const actor: Actor = {
    wallet,
    client,
    publicKey: await wallet.getIdentityPublicKey(),
    sparkAddress: await wallet.getSparkAddress(),
  };

  ctx.actors.set(name, actor);
  return actor;
}

export async function fundActor(
  ctx: TestContext,
  actorName: string,
  amountSats: number,
  timeoutMs: number = 60000
): Promise<void> {
  const actor = ctx.actors.get(actorName);
  if (!actor) throw new Error(`Actor not found: ${actorName}`);

  // Get initial balance
  const initialBalance = await actor.wallet.getBalance();
  const initialSats = initialBalance.balance ?? 0n;

  // Check faucet health
  const resp = await fetch(`${ctx.config.faucetUrl}/balance`);
  if (!resp.ok) throw new Error("Faucet health check failed");

  // Request funding
  const fundResp = await fetch(`${ctx.config.faucetUrl}/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      funding_requests: [{ amount_sats: amountSats, recipient: actor.sparkAddress }],
    }),
  });

  if (!fundResp.ok) throw new Error(`Faucet error: ${await fundResp.text()}`);

  const data = await fundResp.json();
  if (data.results?.[0]?.error) throw new Error(data.results[0].error);

  // Poll for balance arrival
  const deadline = Date.now() + timeoutMs;
  let currentSats = initialSats;

  while (Date.now() < deadline) {
    await sleep(2000);
    try {
      const balance = await actor.wallet.getBalance();
      currentSats = balance.balance ?? 0n;
      if (currentSats > initialSats) {
        // Funds arrived
        return;
      }
    } catch {
      // Ignore and retry
    }
  }

  throw new Error(
    `Funds not received within ${timeoutMs}ms. Initial: ${initialSats}, Current: ${currentSats}`
  );
}

export async function createToken(
  ctx: TestContext,
  actorName: string,
  tokenName: string,
  options: {
    ticker?: string;
    decimals?: number;
    supply?: bigint;
  } = {}
): Promise<{ address: string; identifierHex: string }> {
  const actor = ctx.actors.get(actorName);
  if (!actor) throw new Error(`Actor not found: ${actorName}`);

  const ticker = options.ticker || `T${Math.floor(Math.random() * 100).toString().padStart(2, "0")}`;
  const decimals = options.decimals ?? 6;
  const supply = options.supply ?? BigInt(10_000_000_000_000);

  await actor.wallet.createToken({
    tokenName: `${tokenName} Token`,
    tokenTicker: ticker,
    decimals,
    isFreezable: false,
    maxSupply: supply,
  });
  await actor.wallet.mintTokens(supply);

  const balance = await actor.wallet.getBalance();
  const entry = balance.tokenBalances?.entries().next().value;
  if (!entry) throw new Error("Token not found after creation");

  const token = {
    address: entry[0],
    identifierHex: Buffer.from(entry[1].tokenMetadata.rawTokenIdentifier).toString("hex"),
    decimals,
  };

  ctx.tokens.set(tokenName, token);
  return token;
}

export async function registerHost(
  ctx: TestContext,
  actorName: string,
  minFeeBps: number = 10
): Promise<string> {
  const actor = ctx.actors.get(actorName);
  if (!actor) throw new Error(`Actor not found: ${actorName}`);

  const namespace = `host${Math.random().toString(36).slice(2, 7)}`;
  await actor.client.registerHost({ namespace, minFeeBps });
  return namespace;
}

export async function createV3Pool(
  ctx: TestContext,
  actorName: string,
  poolName: string,
  options: {
    tokenName: string;
    hostNamespace: string;
    tickSpacing?: number;
    lpFeeBps?: number;
    hostFeeBps?: number;
    btcPriceUsd?: number;
  }
): Promise<string> {
  const actor = ctx.actors.get(actorName);
  if (!actor) throw new Error(`Actor not found: ${actorName}`);

  const token = ctx.tokens.get(options.tokenName);
  if (!token) throw new Error(`Token not found: ${options.tokenName}`);

  const tickSpacing = options.tickSpacing ?? 10;
  const btcPriceUsd = options.btcPriceUsd ?? 90000;

  const initialPrice = humanPriceToPoolPrice(btcPriceUsd, 8, token.decimals, false);

  const result = await actor.client.createConcentratedPool({
    assetAAddress: token.identifierHex,
    assetBAddress: BTC_ASSET_PUBKEY,
    tickSpacing,
    initialPrice,
    lpFeeRateBps: options.lpFeeBps ?? 10,
    hostFeeRateBps: options.hostFeeBps ?? 10,
    hostNamespace: options.hostNamespace,
  });

  if (!result.poolId) throw new Error("Failed to create pool");

  ctx.pools.set(poolName, result.poolId);
  return result.poolId;
}

export async function addLiquidityToPool(
  ctx: TestContext,
  actorName: string,
  poolName: string,
  options: {
    amountA: string;
    amountB: string;
    tickLower: number;
    tickUpper: number;
  }
): Promise<void> {
  const actor = ctx.actors.get(actorName);
  if (!actor) throw new Error(`Actor not found: ${actorName}`);

  const poolId = ctx.pools.get(poolName);
  if (!poolId) throw new Error(`Pool not found: ${poolName}`);

  const result = await actor.client.increaseLiquidity({
    poolId,
    tickLower: options.tickLower,
    tickUpper: options.tickUpper,
    amountADesired: options.amountA,
    amountBDesired: options.amountB,
    amountAMin: "0",
    amountBMin: "0",
  });

  if (!result.accepted) throw new Error(`Add liquidity failed: ${result.error}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test Runner

type TestFn = (ctx: TestContext) => Promise<void>;
type HookFn = (ctx: TestContext) => Promise<void>;

interface TestDefinition {
  name: string;
  fn: TestFn;
  skip?: boolean;
  only?: boolean;
}

interface CategoryDefinition {
  name: string;
  tests: TestDefinition[];
  beforeAll?: HookFn;
  afterAll?: HookFn;
  beforeEach?: HookFn;
  afterEach?: HookFn;
}

export class TestRunner {
  private suiteName: string;
  private categories: CategoryDefinition[] = [];
  private currentCategory: CategoryDefinition | null = null;
  private ctx: TestContext | null = null;
  private beforeAllHooks: HookFn[] = [];
  private afterAllHooks: HookFn[] = [];

  constructor(suiteName: string) {
    this.suiteName = suiteName;
  }

  beforeAll(fn: HookFn): void {
    this.beforeAllHooks.push(fn);
  }

  afterAll(fn: HookFn): void {
    this.afterAllHooks.push(fn);
  }

  category(name: string): this {
    this.currentCategory = { name, tests: [] };
    this.categories.push(this.currentCategory);
    return this;
  }

  beforeEach(fn: HookFn): this {
    if (!this.currentCategory) throw new Error("No category defined");
    this.currentCategory.beforeEach = fn;
    return this;
  }

  afterEach(fn: HookFn): this {
    if (!this.currentCategory) throw new Error("No category defined");
    this.currentCategory.afterEach = fn;
    return this;
  }

  test(name: string, fn: TestFn): this {
    if (!this.currentCategory) {
      this.category("Default");
    }
    this.currentCategory!.tests.push({ name, fn });
    return this;
  }

  skip(name: string, fn: TestFn): this {
    if (!this.currentCategory) {
      this.category("Default");
    }
    this.currentCategory!.tests.push({ name, fn, skip: true });
    return this;
  }

  only(name: string, fn: TestFn): this {
    if (!this.currentCategory) {
      this.category("Default");
    }
    this.currentCategory!.tests.push({ name, fn, only: true });
    return this;
  }

  async run(ctx?: TestContext): Promise<SuiteResult> {
    this.ctx = ctx || await createTestContext();
    const startTime = new Date();
    const categoryResults: CategoryResult[] = [];

    this.printHeader();

    // Check for .only tests
    const hasOnly = this.categories.some((cat) =>
      cat.tests.some((t) => t.only)
    );

    // Run beforeAll hooks
    for (const hook of this.beforeAllHooks) {
      try {
        await hook(this.ctx);
      } catch (e) {
        console.error("beforeAll hook failed:", e);
        throw e;
      }
    }

    // Run categories
    for (const category of this.categories) {
      const catResult = await this.runCategory(category, hasOnly);
      categoryResults.push(catResult);
    }

    // Run afterAll hooks
    for (const hook of this.afterAllHooks) {
      try {
        await hook(this.ctx);
      } catch (e) {
        console.error("afterAll hook failed:", e);
      }
    }

    const endTime = new Date();
    const result: SuiteResult = {
      name: this.suiteName,
      categories: categoryResults,
      totalTests: categoryResults.reduce((sum, cat) => sum + cat.tests.length, 0),
      passed: categoryResults.reduce((sum, cat) => sum + cat.passed, 0),
      failed: categoryResults.reduce((sum, cat) => sum + cat.failed, 0),
      skipped: categoryResults.reduce((sum, cat) => sum + cat.skipped, 0),
      duration: endTime.getTime() - startTime.getTime(),
      startTime,
      endTime,
    };

    this.printSummary(result);
    return result;
  }

  private async runCategory(
    category: CategoryDefinition,
    hasOnly: boolean
  ): Promise<CategoryResult> {
    const startTime = Date.now();
    const testResults: TestResult[] = [];

    console.log(`\n[${category.name}]`);

    for (const test of category.tests) {
      // Skip logic
      const shouldSkip =
        test.skip || (hasOnly && !test.only);

      if (shouldSkip) {
        testResults.push({
          name: test.name,
          category: category.name,
          status: "skipped",
          duration: 0,
        });
        console.log(`  ○ ${test.name} (skipped)`);
        continue;
      }

      // Run beforeEach
      if (category.beforeEach) {
        try {
          await category.beforeEach(this.ctx!);
        } catch (e) {
          console.error("beforeEach hook failed:", e);
        }
      }

      // Run test
      const result = await this.runTest(test, category.name);
      testResults.push(result);

      // Run afterEach
      if (category.afterEach) {
        try {
          await category.afterEach(this.ctx!);
        } catch (e) {
          console.error("afterEach hook failed:", e);
        }
      }
    }

    return {
      name: category.name,
      tests: testResults,
      passed: testResults.filter((t) => t.status === "passed").length,
      failed: testResults.filter((t) => t.status === "failed").length,
      skipped: testResults.filter((t) => t.status === "skipped").length,
      duration: Date.now() - startTime,
    };
  }

  private async runTest(test: TestDefinition, categoryName: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      await test.fn(this.ctx!);
      const duration = Date.now() - startTime;
      console.log(`  ✓ ${test.name} (${duration}ms)`);
      return {
        name: test.name,
        category: categoryName,
        status: "passed",
        duration,
      };
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e.message : String(e);
      const errorStack = e instanceof Error ? e.stack : undefined;
      console.log(`  ✗ ${test.name} (${duration}ms)`);
      console.log(`    Error: ${error.slice(0, 100)}${error.length > 100 ? "..." : ""}`);
      return {
        name: test.name,
        category: categoryName,
        status: "failed",
        duration,
        error,
        errorStack,
      };
    }
  }

  private printHeader(): void {
    console.log(`\n[${this.suiteName}]`);
    console.log(`  Network: ${this.ctx!.config.sparkNetwork}`);
    console.log(`  Started: ${new Date().toISOString()}`);
  }

  private printSummary(result: SuiteResult): void {
    console.log(`\n[Summary]`);
    console.log(`  Total: ${result.totalTests} | Passed: ${result.passed} | Failed: ${result.failed} | Skipped: ${result.skipped}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);

    if (result.failed > 0) {
      console.log(`\n  ✗ Some tests failed`);
    } else {
      console.log(`\n  ✓ All tests passed!`);
    }
  }
}

// Exports

export { BTC_ASSET_PUBKEY };

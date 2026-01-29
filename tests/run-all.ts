#!/usr/bin/env bun
/**
 * Test Runner - Runs all test suites
 *
 * Usage:
 *   bun run tests/run-all.ts [--unit] [--imports] [--e2e]
 *
 * Options:
 *   --unit     Run unit tests only
 *   --imports  Run import tests only
 *   --e2e      Run E2E tests only (requires env vars)
 *
 * Environment variables for E2E tests:
 *   AMM_URL, MEMPOOL_URL, SPARKSCAN_URL, FAUCET_URL
 */

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestSuite {
  name: string;
  file: string;
  requiresEnv: boolean;
}

const SUITES: TestSuite[] = [
  { name: "Unit Tests", file: "suites/unit.test.ts", requiresEnv: false },
  { name: "Import Tests", file: "suites/imports.test.ts", requiresEnv: false },
  { name: "E2E Single-Sided", file: "suites/e2e-single-sided.test.ts", requiresEnv: true },
  { name: "E2E Concentrated Liquidity", file: "suites/e2e-concentrated-liquidity.test.ts", requiresEnv: true },
  { name: "E2E Free Balance", file: "suites/free-balance.test.ts", requiresEnv: true },
  { name: "Lightning Quote", file: "suites/lightning-quote.test.ts", requiresEnv: false },
];

const args = process.argv.slice(2);
const runUnit = args.includes("--unit");
const runImports = args.includes("--imports");
const runE2E = args.includes("--e2e");
const runAll = !runUnit && !runImports && !runE2E;

const hasEnvVars =
  process.env.AMM_URL &&
  process.env.MEMPOOL_URL &&
  process.env.SPARKSCAN_URL &&
  process.env.FAUCET_URL;

async function runSuite(suite: TestSuite): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["run", suite.file], {
      cwd: __dirname,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    });

    let output = "";

    proc.stdout?.on("data", (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on("data", (data) => {
      output += data.toString();
      process.stderr.write(data);
    });

    proc.on("close", (code) => {
      resolve({ passed: code === 0, output });
    });
  });
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  FLASHNET SDK TEST RUNNER");
  console.log("=".repeat(70));
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Environment: ${hasEnvVars ? "E2E ready" : "Unit tests only"}`);
  console.log("");

  const results: { name: string; passed: boolean }[] = [];
  let suitesToRun = SUITES;

  // Filter based on args
  if (runUnit) {
    suitesToRun = SUITES.filter((s) => s.name === "Unit Tests");
  } else if (runImports) {
    suitesToRun = SUITES.filter((s) => s.name === "Import Tests");
  } else if (runE2E) {
    suitesToRun = SUITES.filter((s) => s.requiresEnv);
  }

  for (const suite of suitesToRun) {
    // Skip E2E tests if no env vars
    if (suite.requiresEnv && !hasEnvVars) {
      console.log(`\n[SKIP] ${suite.name} - Missing environment variables`);
      results.push({ name: suite.name, passed: true }); // Mark as passed (skipped)
      continue;
    }

    console.log(`\n${"─".repeat(70)}`);
    console.log(`  Running: ${suite.name}`);
    console.log("─".repeat(70));

    const result = await runSuite(suite);
    results.push({ name: suite.name, passed: result.passed });
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`  ${icon} ${r.name}`);
  }

  console.log("");
  console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=".repeat(70));

  if (failed > 0) {
    console.log("\n  ✗ Some test suites failed\n");
    process.exit(1);
  } else {
    console.log("\n  ✓ All test suites passed!\n");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});

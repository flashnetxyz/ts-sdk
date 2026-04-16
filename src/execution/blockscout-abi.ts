/**
 * Pull the ABI of a verified contract from a Blockscout deployment and
 * index its `error` entries by 4-byte selector, so
 * {@link decodeRevertReason} can name custom errors we don't have
 * hard-coded tables for.
 *
 * Works against any Blockscout-compatible API (the localnet deploys one
 * at `:4001/api/v2`, mainnet Blockscout instances expose the same
 * shape). Returns an empty table on any failure — a best-effort lookup,
 * never a hard dependency.
 */

import { keccak256, toHex, type Hex } from "viem";

interface AbiErrorEntry {
  type: "error";
  name: string;
  inputs?: Array<{ type: string; name?: string }>;
}

interface AbiEntry {
  type: string;
  name?: string;
  inputs?: Array<{ type: string; name?: string }>;
}

interface BlockscoutContractResponse {
  abi?: AbiEntry[] | null;
}

/**
 * Return a `selector → error-signature` map for all custom errors
 * declared in the ABI of `contractAddress`.
 *
 * @param blockscoutApiUrl - e.g. `http://127.0.0.1:4001/api/v2` (localnet)
 *                           or `https://eth.blockscout.com/api/v2` (public).
 * @param contractAddress  - EVM address of the contract whose errors to index.
 * @param options          - `timeoutMs` defaults to 10 000.
 */
export async function fetchAbiErrorsFromBlockscout(
  blockscoutApiUrl: string,
  contractAddress: string,
  options: { timeoutMs?: number } = {}
): Promise<Record<string, string>> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${blockscoutApiUrl.replace(/\/+$/, "")}/smart-contracts/${contractAddress}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return {};
    const body = (await res.json()) as BlockscoutContractResponse;
    const abi = body.abi;
    if (!Array.isArray(abi)) return {};

    const out: Record<string, string> = {};
    for (const entry of abi) {
      if (entry.type !== "error" || !entry.name) continue;
      const err = entry as AbiErrorEntry;
      const types = (err.inputs ?? []).map((i) => i.type).join(",");
      const signature = `${err.name}(${types})`;
      const selector = errorSelector(signature);
      out[selector] = signature;
    }
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compute the 4-byte selector (`0x`-prefixed, lowercase) for a Solidity
 * error or function signature.
 */
export function errorSelector(signature: string): string {
  const hash: Hex = keccak256(toHex(signature));
  return hash.slice(0, 10).toLowerCase();
}

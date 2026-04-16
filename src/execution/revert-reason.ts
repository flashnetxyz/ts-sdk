/**
 * Helpers for decoding EVM revert reasons out of an execution gateway
 * status message.
 *
 * When an intent's signed tx reverts, the sequencer's payload builder
 * surfaces the revert output bytes on the rejection. The gateway bakes
 * them into `statusMessage` roughly like:
 *
 *   payload_flagged:stage=Execute outcome=Reverted intent_index=0 \
 *     tx_hash=0x... reason=reverted:gas_used=... output=0x<data>
 *
 * `output` is the ABI-encoded revert data — a 4-byte error selector
 * followed by any arguments. We map selectors for the contracts we own
 * (SparkBridge + Conductor) back to their Solidity error names, and
 * ABI-decode the standard `Error(string)` / `Panic(uint256)` payloads
 * so the user sees something readable instead of `0x1f2a2005`.
 */

/**
 * Selectors for custom errors defined in SparkBridge (`contracts/evm/src/SparkBridge.sol`).
 * Kept co-located with the contract source — any new custom error in
 * SparkBridge.sol must be mirrored here.
 */
export const SPARK_BRIDGE_REVERT_ERRORS: Readonly<Record<string, string>> = {
  "0x1f2a2005": "ZeroAmount()",
  "0xaac3845a": "TransferAlreadyUsed()",
  "0x15a108b9": "InvalidRecipientLength()",
  "0xf0471c88": "UnregisteredToken()",
  "0x1eb00b06": "InvalidTokenAddress()",
  "0x2c54a94e": "SubSatWithdrawal()",
  "0x4fd61b0e": "SubSatDeposit()",
  "0xce8c1048": "OnlyDepositor()",
  "0x5fc483c5": "OnlyOwner()",
  "0x65c23aa0": "EmptyDepositors()",
};

/**
 * Selectors for custom errors defined in Conductor (`flashnet-conductor/contracts/src/Conductor.sol`).
 */
export const CONDUCTOR_REVERT_ERRORS: Readonly<Record<string, string>> = {
  "0x6e8f1947": "TokensNotSorted()",
  "0x03119322": "PoolAlreadyExists()",
  "0xd92e233d": "ZeroAddress()",
  "0xd4446472": "InsufficientBTCValue()",
  "0x91005e4d": "WBTCNotInPair()",
  "0xf60ca03b": "SwapRouterNotSet()",
  "0x9b561384": "SparkBridgeNotSet()",
  "0x8d7584ad": "BTCDustRefundFailed()",
  "0x9c8787c0": "PoolDoesNotExist()",
  "0x990965c1": "ZeroAmountIn()",
};

/**
 * Solidity built-in error selectors.
 * - `Error(string)` — classic `require(cond, "msg")` reverts
 * - `Panic(uint256)` — assertion / overflow / invalid opcode reverts
 */
export const SOLIDITY_BUILTIN_REVERT_ERRORS: Readonly<Record<string, string>> = {
  "0x08c379a0": "Error(string)",
  "0x4e487b71": "Panic(uint256)",
};

/**
 * Default lookup table: everything the SDK knows about. Consumers can
 * pass `extraErrors` to `decodeRevertReason` to layer app-specific
 * selectors on top without mutating this constant.
 */
export const DEFAULT_REVERT_ERRORS: Readonly<Record<string, string>> = {
  ...SPARK_BRIDGE_REVERT_ERRORS,
  ...CONDUCTOR_REVERT_ERRORS,
  ...SOLIDITY_BUILTIN_REVERT_ERRORS,
};

export interface DecodedRevertReason {
  /** 4-byte selector, 0x-prefixed, lowercase (e.g. "0x1f2a2005"). */
  selector: string;
  /**
   * Human-readable name. For known selectors this is the Solidity
   * error signature (e.g. `ZeroAmount()`); for `Error(string)` it's
   * the decoded reason (e.g. `Error("insufficient balance")`); for
   * unknown selectors it's `unknown (0x...)`.
   */
  name: string;
  /** The full ABI-encoded output, preserved for callers that want to decode further. */
  raw: string;
}

/**
 * Options for {@link decodeRevertReason}.
 */
export interface DecodeRevertReasonOptions {
  /**
   * Additional selector → name pairs layered on top of
   * {@link DEFAULT_REVERT_ERRORS}. Useful for one-off app errors.
   */
  extraErrors?: Readonly<Record<string, string>>;
  /**
   * Per-contract error tables keyed by EVM address (lowercased).
   * When `revertAddress` is supplied, the lookup tries the matching
   * address table first, then falls back to {@link DEFAULT_REVERT_ERRORS}
   * + `extraErrors`. This eliminates selector collisions across
   * contracts once you know which contract produced the revert (from
   * {@link traceInnermostRevert} or similar).
   */
  contractTables?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Address of the contract that produced the revert. Used to pick the
   * right per-contract table from `contractTables`. Normally this comes
   * from `traceInnermostRevert`.
   */
  revertAddress?: string;
}

/**
 * Parse the `output=0x...` field out of an execution gateway
 * `statusMessage`, then decode the 4-byte selector and any standard
 * Solidity payload.
 *
 * Returns `null` if the status message doesn't carry a revert output
 * (e.g. the intent was rejected for a non-revert reason like a signer
 * mismatch or a timing failure).
 *
 * @param statusMessage - The `statusMessage` field from a gateway intent response.
 * @param options       - Optional per-address + extra selector tables. When a
 *                        `revertAddress` is supplied, the matching entry in
 *                        `contractTables` is preferred over the merged default.
 *                        Back-compat: a plain `Record<string, string>` is still
 *                        accepted here and treated as `extraErrors`.
 */
export function decodeRevertReason(
  statusMessage: string | undefined | null,
  options: DecodeRevertReasonOptions | Readonly<Record<string, string>> = {}
): DecodedRevertReason | null {
  if (!statusMessage) return null;
  const m = statusMessage.match(/output=(0x[0-9a-fA-F]+)/);
  if (!m || !m[1]) return null;
  const data = m[1].toLowerCase();
  // Need at least the 4-byte selector plus `0x` prefix.
  if (data.length < 10) return null;
  const selector = data.slice(0, 10);

  // Distinguish the two overloads: a flat selector→name record vs. the
  // DecodeRevertReasonOptions object. If every value in the map is a
  // string whose key starts with "0x" and has a selector-ish shape, it's
  // the legacy shape. The explicit fields are the modern shape.
  const opts: DecodeRevertReasonOptions =
    "extraErrors" in options ||
    "contractTables" in options ||
    "revertAddress" in options
      ? (options as DecodeRevertReasonOptions)
      : { extraErrors: options as Readonly<Record<string, string>> };

  const addressTable =
    opts.revertAddress && opts.contractTables
      ? opts.contractTables[opts.revertAddress.toLowerCase()]
      : undefined;
  const table: Readonly<Record<string, string>> = {
    ...DEFAULT_REVERT_ERRORS,
    ...(opts.extraErrors ?? {}),
    ...(addressTable ?? {}),
  };
  const match = table[selector];

  // Solidity `Error(string)` — ABI-decode the reason so users see the
  // actual message rather than the raw tuple. Layout after the
  // selector:  32 bytes offset | 32 bytes length | UTF-8 bytes.
  if (match === "Error(string)") {
    const body = data.slice(10);
    if (body.length >= 128) {
      try {
        const lenHex = body.slice(64, 128);
        const len = parseInt(lenHex, 16);
        const strHex = body.slice(128, 128 + len * 2);
        // Decode without Node's Buffer so this helper works in the browser.
        let str = "";
        for (let i = 0; i < strHex.length; i += 2) {
          const code = parseInt(strHex.slice(i, i + 2), 16);
          if (Number.isFinite(code) && code > 0) str += String.fromCharCode(code);
        }
        return {
          selector,
          name: `Error(${JSON.stringify(str)})`,
          raw: data,
        };
      } catch {
        /* fall through to generic `Error(string)` label */
      }
    }
  }

  return {
    selector,
    name: match ?? `unknown (${selector})`,
    raw: data,
  };
}

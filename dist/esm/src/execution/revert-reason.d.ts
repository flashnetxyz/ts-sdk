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
export declare const SPARK_BRIDGE_REVERT_ERRORS: Readonly<Record<string, string>>;
/**
 * Selectors for custom errors defined in Conductor (`flashnet-conductor/contracts/src/Conductor.sol`).
 */
export declare const CONDUCTOR_REVERT_ERRORS: Readonly<Record<string, string>>;
/**
 * Solidity built-in error selectors.
 * - `Error(string)` — classic `require(cond, "msg")` reverts
 * - `Panic(uint256)` — assertion / overflow / invalid opcode reverts
 */
export declare const SOLIDITY_BUILTIN_REVERT_ERRORS: Readonly<Record<string, string>>;
/**
 * Default lookup table: everything the SDK knows about. Consumers can
 * pass `extraErrors` to `decodeRevertReason` to layer app-specific
 * selectors on top without mutating this constant.
 */
export declare const DEFAULT_REVERT_ERRORS: Readonly<Record<string, string>>;
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
export declare function decodeRevertReason(statusMessage: string | undefined | null, options?: DecodeRevertReasonOptions | Readonly<Record<string, string>>): DecodedRevertReason | null;
//# sourceMappingURL=revert-reason.d.ts.map
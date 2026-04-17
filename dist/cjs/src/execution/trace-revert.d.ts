/**
 * Locate the innermost call frame that produced the revert bytes the EVM
 * bubbled up for a transaction.
 *
 * Strategy (purely lazy — no server-side instrumentation, no hot-path cost):
 *
 *   1. Call `debug_traceTransaction` with the `callTracer` tracer.
 *   2. Walk the call tree.
 *   3. Pick the deepest frame whose `output` bytes equal the tx-level
 *      output. That's the frame that originated the revert that wasn't
 *      caught by any ancestor.
 *
 * This handles Solidity `try/catch` correctly: when an outer frame
 * catches an inner revert and re-reverts with different bytes, only the
 * outer frame's output matches the tx-level output, so the walk returns
 * the outer frame — which IS the uncaught reverter. When nothing is
 * caught (the common case), every frame in the chain has the same
 * output bytes and the deepest one wins.
 *
 * Tx reverts that never landed on-chain (e.g. dropped by the sequencer
 * before inclusion) can't be traced this way — the status message
 * carries its own reason string and this helper returns `null` for the
 * missing tx.
 */
export interface TraceFrame {
    /** "CALL" | "DELEGATECALL" | "STATICCALL" | "CREATE" | "CREATE2" | etc */
    type?: string;
    from?: string;
    to?: string;
    value?: string;
    gas?: string;
    gasUsed?: string;
    input?: string;
    /** Return data (success) or revert data (revert). Lower-case hex, 0x-prefixed. */
    output?: string;
    /** Present on failed frames (revert, OOG, invalid opcode, ...). */
    error?: string;
    /** Already-decoded `Error(string)` reason, when tracer can extract it. */
    revertReason?: string;
    calls?: TraceFrame[];
}
export interface InnermostRevertFrame {
    /** Address that originated the revert (the `to` of the deepest matching call frame). */
    address: string;
    /** ABI-encoded revert output bytes (0x-prefixed hex). */
    output: string;
    /** Depth in the call tree where this frame sits; 0 = tx-level. */
    depth: number;
    /** `callTracer`'s own `error` field, when present (e.g. "execution reverted"). */
    error?: string;
    /** `callTracer`'s decoded `Error(string)` message, when present. */
    revertReason?: string;
}
/**
 * Trace a reverted transaction and return the innermost frame whose
 * output bytes equal the tx-level output. Returns `null` when:
 *
 * - The tx didn't revert (no top-level output / no `error` on the root).
 * - The tx hash is unknown to the node.
 * - The node doesn't support `debug_traceTransaction`.
 * - No frame in the tree matches the tx output (unusual; falls back to the root).
 */
export declare function traceInnermostRevert(rpcUrl: string, txHash: string, options?: {
    timeoutMs?: number;
}): Promise<InnermostRevertFrame | null>;
/**
 * Extract the execution tx hash from an execution gateway `statusMessage`.
 * The sequencer's `payload_flagged` reason string contains `tx_hash=0x...`;
 * downstream consumers can pass that hash directly to
 * {@link traceInnermostRevert} to locate the uncaught reverter.
 */
export declare function extractTxHashFromStatusMessage(statusMessage: string | undefined | null): string | null;
//# sourceMappingURL=trace-revert.d.ts.map
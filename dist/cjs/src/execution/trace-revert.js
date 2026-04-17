'use strict';

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
/**
 * Trace a reverted transaction and return the innermost frame whose
 * output bytes equal the tx-level output. Returns `null` when:
 *
 * - The tx didn't revert (no top-level output / no `error` on the root).
 * - The tx hash is unknown to the node.
 * - The node doesn't support `debug_traceTransaction`.
 * - No frame in the tree matches the tx output (unusual; falls back to the root).
 */
async function traceInnermostRevert(rpcUrl, txHash, options = {}) {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let root;
    try {
        const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "debug_traceTransaction",
                params: [txHash, { tracer: "callTracer" }],
            }),
            signal: controller.signal,
        });
        const body = (await res.json());
        if (body.error)
            return null;
        if (!body.result)
            return null;
        root = body.result;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
    // If the root frame didn't error, there's no revert to locate.
    // A successful `eth_call` can carry return data in `output`, so we
    // gate only on `error` — matching on non-empty output here would
    // incorrectly classify view-style return data as a revert.
    if (!root.error)
        return null;
    // Normalize a missing output to the EVM's canonical empty-bytes
    // representation ("0x") so the byte-equality check below doesn't
    // mis-fire on `undefined` vs. the tracer emitting a literal "0x" for
    // child frames that halted before producing output.
    const txOutput = (root.output ?? "0x").toLowerCase();
    // Walk depth-first, tracking the deepest frame whose output equals the
    // root's output. Empty outputs (e.g. halts from OOG) fall back to the
    // deepest errored frame.
    let best = null;
    const stack = [
        { frame: root, depth: 0 },
    ];
    while (stack.length > 0) {
        const { frame, depth } = stack.pop();
        // Normalize missing output to "0x" to match the tx-level normalization
        // above — prevents `undefined` vs literal "0x" from sabotaging the
        // byte-equality check.
        const frameOutput = (frame.output ?? "0x").toLowerCase();
        const isMatchingReverter = (!!frame.error || depth === 0) && // root always counts as a candidate
            frameOutput === txOutput;
        // For Halt-class failures (empty output, present error) fall back to
        // "deepest errored frame" since we can't byte-match on empty output.
        const isHaltCandidate = !!frame.error && txOutput === "0x" && frameOutput === "0x";
        if (isMatchingReverter || isHaltCandidate) {
            if (!best || depth > best.depth) {
                best = {
                    address: (frame.to ?? "").toLowerCase(),
                    output: frame.output ?? "0x",
                    depth,
                    error: frame.error,
                    revertReason: frame.revertReason,
                };
            }
        }
        if (frame.calls) {
            for (const child of frame.calls) {
                stack.push({ frame: child, depth: depth + 1 });
            }
        }
    }
    return best;
}
/**
 * Extract the execution tx hash from an execution gateway `statusMessage`.
 * The sequencer's `payload_flagged` reason string contains `tx_hash=0x...`;
 * downstream consumers can pass that hash directly to
 * {@link traceInnermostRevert} to locate the uncaught reverter.
 */
function extractTxHashFromStatusMessage(statusMessage) {
    if (!statusMessage)
        return null;
    const m = statusMessage.match(/tx_hash=(0x[0-9a-fA-F]+)/);
    return m ? m[1].toLowerCase() : null;
}

exports.extractTxHashFromStatusMessage = extractTxHashFromStatusMessage;
exports.traceInnermostRevert = traceInnermostRevert;
//# sourceMappingURL=trace-revert.js.map

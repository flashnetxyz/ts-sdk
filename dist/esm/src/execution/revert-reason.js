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
const SPARK_BRIDGE_REVERT_ERRORS = {
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
const CONDUCTOR_REVERT_ERRORS = {
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
const SOLIDITY_BUILTIN_REVERT_ERRORS = {
    "0x08c379a0": "Error(string)",
    "0x4e487b71": "Panic(uint256)",
};
/**
 * Default lookup table: everything the SDK knows about. Consumers can
 * pass `extraErrors` to `decodeRevertReason` to layer app-specific
 * selectors on top without mutating this constant.
 */
const DEFAULT_REVERT_ERRORS = {
    ...SPARK_BRIDGE_REVERT_ERRORS,
    ...CONDUCTOR_REVERT_ERRORS,
    ...SOLIDITY_BUILTIN_REVERT_ERRORS,
};
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
function decodeRevertReason(statusMessage, options = {}) {
    if (!statusMessage)
        return null;
    const m = statusMessage.match(/output=(0x[0-9a-fA-F]+)/);
    if (!m || !m[1])
        return null;
    const data = m[1].toLowerCase();
    // Need at least the 4-byte selector plus `0x` prefix.
    if (data.length < 10)
        return null;
    const selector = data.slice(0, 10);
    // Distinguish the two overloads: a flat selector→name record vs. the
    // DecodeRevertReasonOptions object. If every value in the map is a
    // string whose key starts with "0x" and has a selector-ish shape, it's
    // the legacy shape. The explicit fields are the modern shape.
    const opts = "extraErrors" in options ||
        "contractTables" in options ||
        "revertAddress" in options
        ? options
        : { extraErrors: options };
    const addressTable = opts.revertAddress && opts.contractTables
        ? opts.contractTables[opts.revertAddress.toLowerCase()]
        : undefined;
    const table = {
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
                    if (Number.isFinite(code) && code > 0)
                        str += String.fromCharCode(code);
                }
                return {
                    selector,
                    name: `Error(${JSON.stringify(str)})`,
                    raw: data,
                };
            }
            catch {
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

export { CONDUCTOR_REVERT_ERRORS, DEFAULT_REVERT_ERRORS, SOLIDITY_BUILTIN_REVERT_ERRORS, SPARK_BRIDGE_REVERT_ERRORS, decodeRevertReason };
//# sourceMappingURL=revert-reason.js.map

/**
 * Flashnet Execution Layer Types
 *
 * Types for interacting with the Flashnet execution gateway.
 * These map directly to the Rust gateway API types in flashnet-execution.
 */
/**
 * Default client-side TTL applied when `expiresAt` is not explicitly provided.
 * 15 minutes is long enough for normal Spark transfer propagation to appear in
 * the operator DB even under load, and well inside the gateway's 24h max.
 */
const DEFAULT_INTENT_TTL_MS = 15 * 60 * 1000;
/**
 * Resolve an `expiresAt` value, defaulting to `DEFAULT_INTENT_TTL_MS` from
 * `Date.now()` when the caller did not provide one.
 */
function resolveExpiresAt(expiresAt) {
    return typeof expiresAt === "number" && Number.isFinite(expiresAt)
        ? expiresAt
        : Date.now() + DEFAULT_INTENT_TTL_MS;
}

export { DEFAULT_INTENT_TTL_MS, resolveExpiresAt };
//# sourceMappingURL=types.js.map

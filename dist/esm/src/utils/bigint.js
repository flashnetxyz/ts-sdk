/**
 * Safely convert a value to BigInt, returning a default (0n) when the value
 * is undefined, null, empty-string, or otherwise un-parseable.
 * Use this instead of raw `BigInt(x)` on data from API responses or optional fields.
 */
function safeBigInt(value, fallback = 0n) {
    if (value == null || value === "") {
        return fallback;
    }
    if (typeof value === "bigint") {
        return value;
    }
    try {
        return BigInt(value);
    }
    catch {
        return fallback;
    }
}

export { safeBigInt };
//# sourceMappingURL=bigint.js.map

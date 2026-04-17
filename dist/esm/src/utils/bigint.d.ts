/**
 * Safely convert a value to BigInt, returning a default (0n) when the value
 * is undefined, null, empty-string, or otherwise un-parseable.
 * Use this instead of raw `BigInt(x)` on data from API responses or optional fields.
 */
export declare function safeBigInt(value: bigint | number | string | null | undefined, fallback?: bigint): bigint;
//# sourceMappingURL=bigint.d.ts.map
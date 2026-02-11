/**
 * Safely convert a value to BigInt, returning a default (0n) when the value
 * is undefined, null, empty-string, or otherwise un-parseable.
 * Use this instead of raw `BigInt(x)` on data from API responses or optional fields.
 */
export function safeBigInt(
  value: bigint | number | string | null | undefined,
  fallback: bigint = 0n
): bigint {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "bigint") {
    return value;
  }
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

/**
 * Validation helpers for API requests
 */

/**
 * Validates that a public key is in the correct format
 */
export function validatePublicKey(publicKey: string): boolean {
  // Check if it's a valid hex string of the correct length
  // Bitcoin/Spark public keys are typically 33 bytes (66 hex chars) for compressed
  // or 65 bytes (130 hex chars) for uncompressed
  const hexRegex = /^[0-9a-fA-F]+$/;
  return (
    hexRegex.test(publicKey) &&
    (publicKey.length === 66 || publicKey.length === 130)
  );
}

/**
 * Validates that a signature is in the correct format
 */
export function validateSignature(signature: string): boolean {
  // Check if it's a valid hex string
  // Signatures are typically 64-72 bytes (128-144 hex chars)
  const hexRegex = /^[0-9a-fA-F]+$/;
  return (
    hexRegex.test(signature) &&
    signature.length >= 128 &&
    signature.length <= 144
  );
}

/**
 * Validates that an amount is positive
 */
export function validatePositiveAmount(amount: number | string): boolean {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return !isNaN(numAmount) && numAmount > 0;
}

/**
 * Validates that a BPS value is in the valid range
 */
export function validateBps(
  bps: number,
  min: number = 0,
  max: number = 10000
): boolean {
  return Number.isInteger(bps) && bps >= min && bps <= max;
}

/**
 * Validates a namespace string
 */
export function validateNamespace(namespace: string): boolean {
  // Namespace must be between 3-32 characters
  return (
    namespace.length >= 3 &&
    namespace.length <= 32 &&
    /^[a-zA-Z0-9-_]+$/.test(namespace)
  );
}

/**
 * Common validation errors
 */
export class ValidationError extends Error {
  constructor(public field: string, public reason: string) {
    super(`Validation failed for ${field}: ${reason}`);
    this.name = "ValidationError";
  }
}

/**
 * Validates a request object against a set of rules
 */
export function validateRequest<T extends Record<string, any>>(
  request: T,
  rules: ValidationRules<T>
): void {
  for (const [field, rule] of Object.entries(rules) as [
    keyof T,
    ValidationRule
  ][]) {
    const value = request[field];

    // Check required fields
    if (
      rule.required &&
      (value === undefined || value === null || value === "")
    ) {
      throw new ValidationError(String(field), "field is required");
    }

    // Skip validation for optional fields that are not provided
    if (!rule.required && (value === undefined || value === null)) {
      continue;
    }

    // Run custom validator if provided
    if (rule.validator && !rule.validator(value)) {
      throw new ValidationError(
        String(field),
        rule.message || "validation failed"
      );
    }
  }
}

export interface ValidationRule {
  required?: boolean;
  validator?: (value: any) => boolean;
  message?: string;
}

export type ValidationRules<T> = {
  [K in keyof T]?: ValidationRule;
};

/**
 * Pre-defined validation rules for common request types
 */
export const commonValidationRules = {
  publicKey: {
    required: true,
    validator: validatePublicKey,
    message: "invalid public key format",
  },
  signature: {
    required: true,
    validator: validateSignature,
    message: "invalid signature format",
  },
  nonce: {
    required: true,
    validator: (v: any) => typeof v === "string" && v.length > 0,
    message: "nonce must be a non-empty string",
  },
  amount: {
    required: true,
    validator: validatePositiveAmount,
    message: "amount must be positive",
  },
  bps: {
    required: true,
    validator: (v: any) => validateBps(v),
    message: "BPS must be between 0 and 10000",
  },
};

/**
 * Validation rules for CreateConstantProductPoolRequest
 */
export const constantProductPoolValidationRules = {
  poolOwnerPublicKey: commonValidationRules.publicKey,
  assetATokenPublicKey: commonValidationRules.publicKey,
  assetBTokenPublicKey: commonValidationRules.publicKey,
  lpFeeRateBps: commonValidationRules.bps,
  integratorNamespace: {
    required: true,
    validator: validateNamespace,
    message: "invalid namespace format",
  },
  nonce: commonValidationRules.nonce,
  signature: commonValidationRules.signature,
};

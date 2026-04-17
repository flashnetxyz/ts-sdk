/**
 * Validation helpers for API requests
 */
/**
 * Validates that a public key is in the correct format
 */
function validatePublicKey(publicKey) {
    // Check if it's a valid hex string of the correct length
    // Bitcoin/Spark public keys are typically 33 bytes (66 hex chars) for compressed
    // or 65 bytes (130 hex chars) for uncompressed
    const hexRegex = /^[0-9a-fA-F]+$/;
    return (hexRegex.test(publicKey) &&
        (publicKey.length === 66 || publicKey.length === 130));
}
/**
 * Validates that a signature is in the correct format
 */
function validateSignature(signature) {
    // Check if it's a valid hex string
    // Signatures are typically 64-72 bytes (128-144 hex chars)
    const hexRegex = /^[0-9a-fA-F]+$/;
    return (hexRegex.test(signature) &&
        signature.length >= 128 &&
        signature.length <= 144);
}
/**
 * Validates that an amount is positive
 */
function validatePositiveAmount(amount) {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    return !Number.isNaN(numAmount) && numAmount > 0;
}
/**
 * Validates that a BPS value is in the valid range
 */
function validateBps(bps, min = 0, max = 10000) {
    return Number.isInteger(bps) && bps >= min && bps <= max;
}
/**
 * Validates a namespace string
 */
function validateNamespace(namespace) {
    // Namespace must be between 3-32 characters
    return (namespace.length >= 3 &&
        namespace.length <= 32 &&
        /^[a-zA-Z0-9-_]+$/.test(namespace));
}
/**
 * Common validation errors
 */
class ValidationError extends Error {
    field;
    reason;
    constructor(field, reason) {
        super(`Validation failed for ${field}: ${reason}`);
        this.field = field;
        this.reason = reason;
        this.name = "ValidationError";
    }
}
/**
 * Validates a request object against a set of rules
 */
function validateRequest(request, rules) {
    for (const [field, rule] of Object.entries(rules)) {
        const value = request[field];
        // Check required fields
        if (rule.required &&
            (value === undefined || value === null || value === "")) {
            throw new ValidationError(String(field), "field is required");
        }
        // Skip validation for optional fields that are not provided
        if (!rule.required && (value === undefined || value === null)) {
            continue;
        }
        // Run custom validator if provided
        if (rule.validator && !rule.validator(value)) {
            throw new ValidationError(String(field), rule.message || "validation failed");
        }
    }
}
/**
 * Pre-defined validation rules for common request types
 */
const commonValidationRules = {
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
        validator: (v) => typeof v === "string" && v.length > 0,
        message: "nonce must be a non-empty string",
    },
    amount: {
        required: true,
        validator: validatePositiveAmount,
        message: "amount must be positive",
    },
    bps: {
        required: true,
        validator: (v) => typeof v === "number" && validateBps(v),
        message: "BPS must be between 0 and 10000",
    },
};
/**
 * Validation rules for CreateConstantProductPoolRequest
 */
const constantProductPoolValidationRules = {
    poolOwnerPublicKey: commonValidationRules.publicKey,
    assetAAddress: commonValidationRules.publicKey,
    assetBAddress: commonValidationRules.publicKey,
    lpFeeRateBps: commonValidationRules.bps,
    hostNamespace: {
        required: true,
        validator: validateNamespace,
        message: "invalid namespace format",
    },
    nonce: commonValidationRules.nonce,
    signature: commonValidationRules.signature,
};
/**
 * Validation rules for CreateSingleSidedPoolRequest
 */
const singleSidedPoolValidationRules = {
    poolOwnerPublicKey: commonValidationRules.publicKey,
    assetAAddress: commonValidationRules.publicKey,
    assetBAddress: commonValidationRules.publicKey,
    assetAInitialReserve: commonValidationRules.amount,
    virtualReserveA: commonValidationRules.amount,
    virtualReserveB: commonValidationRules.amount,
    threshold: commonValidationRules.amount,
    lpFeeRateBps: commonValidationRules.bps,
    totalHostFeeRateBps: commonValidationRules.bps,
    hostNamespace: {
        required: false,
        validator: validateNamespace,
        message: "invalid namespace format",
    },
    nonce: commonValidationRules.nonce,
    signature: commonValidationRules.signature,
};

export { ValidationError, commonValidationRules, constantProductPoolValidationRules, singleSidedPoolValidationRules, validateBps, validateNamespace, validatePositiveAmount, validatePublicKey, validateRequest, validateSignature };
//# sourceMappingURL=validation.js.map

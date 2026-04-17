/**
 * Validation helpers for API requests
 */
/**
 * Validates that a public key is in the correct format
 */
export declare function validatePublicKey(publicKey: string): boolean;
/**
 * Validates that a signature is in the correct format
 */
export declare function validateSignature(signature: string): boolean;
/**
 * Validates that an amount is positive
 */
export declare function validatePositiveAmount(amount: number | string): boolean;
/**
 * Validates that a BPS value is in the valid range
 */
export declare function validateBps(bps: number, min?: number, max?: number): boolean;
/**
 * Validates a namespace string
 */
export declare function validateNamespace(namespace: string): boolean;
/**
 * Common validation errors
 */
export declare class ValidationError extends Error {
    field: string;
    reason: string;
    constructor(field: string, reason: string);
}
/**
 * Validates a request object against a set of rules
 */
export declare function validateRequest<T extends Record<string, unknown>>(request: T, rules: ValidationRules<T>): void;
export interface ValidationRule {
    required?: boolean;
    validator?: (value: unknown) => boolean;
    message?: string;
}
export type ValidationRules<T> = {
    [K in keyof T]?: ValidationRule;
};
/**
 * Pre-defined validation rules for common request types
 */
export declare const commonValidationRules: {
    publicKey: {
        required: boolean;
        validator: typeof validatePublicKey;
        message: string;
    };
    signature: {
        required: boolean;
        validator: typeof validateSignature;
        message: string;
    };
    nonce: {
        required: boolean;
        validator: (v: unknown) => boolean;
        message: string;
    };
    amount: {
        required: boolean;
        validator: typeof validatePositiveAmount;
        message: string;
    };
    bps: {
        required: boolean;
        validator: (v: unknown) => boolean;
        message: string;
    };
};
/**
 * Validation rules for CreateConstantProductPoolRequest
 */
export declare const constantProductPoolValidationRules: {
    poolOwnerPublicKey: {
        required: boolean;
        validator: typeof validatePublicKey;
        message: string;
    };
    assetAAddress: {
        required: boolean;
        validator: typeof validatePublicKey;
        message: string;
    };
    assetBAddress: {
        required: boolean;
        validator: typeof validatePublicKey;
        message: string;
    };
    lpFeeRateBps: {
        required: boolean;
        validator: (v: unknown) => boolean;
        message: string;
    };
    hostNamespace: {
        required: boolean;
        validator: typeof validateNamespace;
        message: string;
    };
    nonce: {
        required: boolean;
        validator: (v: unknown) => boolean;
        message: string;
    };
    signature: {
        required: boolean;
        validator: typeof validateSignature;
        message: string;
    };
};
/**
 * Validation rules for CreateSingleSidedPoolRequest
 */
export declare const singleSidedPoolValidationRules: {
    poolOwnerPublicKey: {
        required: boolean;
        validator: typeof validatePublicKey;
        message: string;
    };
    assetAAddress: {
        required: boolean;
        validator: typeof validatePublicKey;
        message: string;
    };
    assetBAddress: {
        required: boolean;
        validator: typeof validatePublicKey;
        message: string;
    };
    assetAInitialReserve: {
        required: boolean;
        validator: typeof validatePositiveAmount;
        message: string;
    };
    virtualReserveA: {
        required: boolean;
        validator: typeof validatePositiveAmount;
        message: string;
    };
    virtualReserveB: {
        required: boolean;
        validator: typeof validatePositiveAmount;
        message: string;
    };
    threshold: {
        required: boolean;
        validator: typeof validatePositiveAmount;
        message: string;
    };
    lpFeeRateBps: {
        required: boolean;
        validator: (v: unknown) => boolean;
        message: string;
    };
    totalHostFeeRateBps: {
        required: boolean;
        validator: (v: unknown) => boolean;
        message: string;
    };
    hostNamespace: {
        required: boolean;
        validator: typeof validateNamespace;
        message: string;
    };
    nonce: {
        required: boolean;
        validator: (v: unknown) => boolean;
        message: string;
    };
    signature: {
        required: boolean;
        validator: typeof validateSignature;
        message: string;
    };
};
//# sourceMappingURL=validation.d.ts.map
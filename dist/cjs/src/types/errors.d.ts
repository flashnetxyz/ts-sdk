/**
 * Flashnet AMM Gateway Error System
 *
 * Error code format: FSAG-XXXX
 * Categories by range:
 *   - 1000–1999: Validation
 *   - 2000–2999: Security/Auth
 *   - 3000–3999: Infrastructure/External
 *   - 4000–4999: Business/AMM Logic
 *   - 5000–5999: System/Service
 */
/**
 * Result of an automatic clawback attempt for a single transfer
 */
export interface ClawbackAttemptResult {
    /** The transfer ID that was clawed back */
    transferId: string;
    /** Whether the clawback was successful */
    success: boolean;
    /** The clawback response if successful (requestId, sparkStatusTrackingId, etc.) */
    response?: {
        requestId: string;
        accepted: boolean;
        internalRequestId: string;
        sparkStatusTrackingId: string;
        error?: string;
    };
    /** Error message if clawback failed */
    error?: string;
}
/**
 * Summary of auto-clawback results after an operation failure
 */
export interface AutoClawbackSummary {
    /** Whether any clawback was attempted */
    attempted: boolean;
    /** Total number of transfers that needed clawback */
    totalTransfers: number;
    /** Number of successfully clawed back transfers */
    successCount: number;
    /** Number of failed clawback attempts */
    failureCount: number;
    /** Detailed results for each transfer */
    results: ClawbackAttemptResult[];
    /** Transfer IDs that were successfully recovered */
    recoveredTransferIds: string[];
    /** Transfer IDs that failed to recover (still at risk) */
    unrecoveredTransferIds: string[];
}
/**
 * All Flashnet AMM Gateway error codes
 */
export type FlashnetErrorCode = "FSAG-1000" | "FSAG-1001" | "FSAG-1002" | "FSAG-1003" | "FSAG-1004" | "FSAG-2001" | "FSAG-2002" | "FSAG-2003" | "FSAG-2004" | "FSAG-2005" | "FSAG-2101" | "FSAG-3001" | "FSAG-3002" | "FSAG-3101" | "FSAG-3201" | "FSAG-3201T1" | "FSAG-3201T2" | "FSAG-3202" | "FSAG-3301" | "FSAG-3302" | "FSAG-3401" | "FSAG-3402" | "FSAG-4001" | "FSAG-4002" | "FSAG-4101" | "FSAG-4102" | "FSAG-4201" | "FSAG-4202" | "FSAG-4203" | "FSAG-4204" | "FSAG-4301" | "FSAG-4401" | "FSAG-5001" | "FSAG-5002" | "FSAG-5003" | "FSAG-5004" | "FSAG-5100";
/**
 * Error category determined by code range
 */
export type FlashnetErrorCategory = "Validation" | "Security" | "Infrastructure" | "Business" | "System";
/**
 * Recovery strategy for each error type
 */
export type ErrorRecoveryStrategy = 
/** Must clawback any transfer IDs sent - validation/security/system errors */
"clawback_required"
/** Should attempt clawback - infrastructure errors where state is uncertain */
 | "clawback_recommended"
/** Funds return automatically via refund - business logic errors */
 | "auto_refund"
/** No funds at risk - typically read operations or auth errors before transfers */
 | "none";
export interface ErrorCodeMetadata {
    httpStatus: number;
    category: FlashnetErrorCategory;
    recovery: ErrorRecoveryStrategy;
    summary: string;
    userMessage: string;
    actionHint: string;
    isRetryable: boolean;
}
/**
 * Comprehensive metadata for all FSAG error codes
 */
export declare const ERROR_CODE_METADATA: Record<FlashnetErrorCode, ErrorCodeMetadata>;
/**
 * Check if a string is a valid FlashnetErrorCode
 */
export declare function isFlashnetErrorCode(code: string): code is FlashnetErrorCode;
/**
 * Get error category from error code
 */
export declare function getErrorCategory(code: FlashnetErrorCode): FlashnetErrorCategory;
/**
 * Get recovery strategy from error code
 */
export declare function getErrorRecovery(code: FlashnetErrorCode): ErrorRecoveryStrategy;
/**
 * Get metadata for an error code
 */
export declare function getErrorMetadata(code: FlashnetErrorCode): ErrorCodeMetadata;
/**
 * Determine category from error code prefix (for unknown codes)
 */
export declare function getCategoryFromCodeRange(code: string): FlashnetErrorCategory | null;
/**
 * Raw error response from the AMM Gateway API
 */
export interface FlashnetErrorResponseBody {
    errorCode: string;
    errorCategory: string;
    message: string;
    details?: unknown;
    requestId: string;
    timestamp: string;
    service: string;
    severity: string;
    remediation?: string;
}
/**
 * Options for creating a FlashnetError
 */
export interface FlashnetErrorOptions {
    /** The raw error response from the API */
    response?: FlashnetErrorResponseBody;
    /** HTTP status code */
    httpStatus?: number;
    /** Transfer IDs that may need to be clawed back */
    transferIds?: string[];
    /** LP identity public key for clawback */
    lpIdentityPublicKey?: string;
    /** Results from automatic clawback attempts */
    clawbackSummary?: AutoClawbackSummary;
    /** Original cause of this error */
    cause?: Error;
}
/**
 * Error class for Flashnet AMM Gateway errors
 *
 * Provides:
 * - Typed error codes with full metadata
 * - Recovery strategy information
 * - Human-readable messages
 * - Transfer tracking for clawback operations
 */
export declare class FlashnetError extends Error {
    /** The FSAG error code (e.g., "FSAG-4202") */
    readonly errorCode: FlashnetErrorCode | string;
    /** Error category */
    readonly category: FlashnetErrorCategory;
    /** Recovery strategy for this error */
    readonly recovery: ErrorRecoveryStrategy;
    /** HTTP status code */
    readonly httpStatus: number;
    /** Unique request ID for debugging */
    readonly requestId: string;
    /** ISO timestamp when error occurred */
    readonly timestamp: string;
    /** Service that generated the error */
    readonly service: string;
    /** Error severity */
    readonly severity: string;
    /** Additional error details */
    readonly details?: unknown;
    /** Server-provided remediation hint */
    readonly remediation?: string;
    /** Transfer IDs that may need clawback (unrecovered transfers) */
    readonly transferIds: string[];
    /** LP identity public key for clawback operations */
    readonly lpIdentityPublicKey?: string;
    /** Summary of automatic clawback attempts (if any were made) */
    readonly clawbackSummary?: AutoClawbackSummary;
    /** Whether this error type is generally retryable */
    readonly isRetryable: boolean;
    /** Human-readable summary */
    readonly summary: string;
    /** User-friendly message explaining the error */
    readonly userMessage: string;
    /** Suggested action for the user */
    readonly actionHint: string;
    constructor(message: string, options?: FlashnetErrorOptions);
    /**
     * Returns true if funds were sent and clawback is required
     */
    isClawbackRequired(): boolean;
    /**
     * Returns true if clawback is recommended (infrastructure errors)
     */
    isClawbackRecommended(): boolean;
    /**
     * Returns true if clawback should be attempted (required or recommended)
     */
    shouldClawback(): boolean;
    /**
     * Returns true if funds will be automatically refunded
     */
    willAutoRefund(): boolean;
    /**
     * Returns true if this error has associated transfers that may need recovery
     */
    hasTransfersAtRisk(): boolean;
    isValidationError(): boolean;
    isSecurityError(): boolean;
    isInfrastructureError(): boolean;
    isBusinessError(): boolean;
    isSystemError(): boolean;
    isSlippageError(): boolean;
    isInsufficientLiquidityError(): boolean;
    isAuthError(): boolean;
    isPoolNotFoundError(): boolean;
    isTransferAlreadyUsedError(): boolean;
    /**
     * Returns true if automatic clawback was attempted
     */
    wasClawbackAttempted(): boolean;
    /**
     * Returns true if all transfers were successfully recovered via clawback
     */
    wereAllTransfersRecovered(): boolean;
    /**
     * Returns true if some (but not all) transfers were recovered
     */
    werePartialTransfersRecovered(): boolean;
    /**
     * Get the number of transfers that were successfully recovered
     */
    getRecoveredTransferCount(): number;
    /**
     * Get the transfer IDs that were successfully recovered
     */
    getRecoveredTransferIds(): string[];
    /**
     * Get the transfer IDs that failed to recover (still at risk)
     */
    getUnrecoveredTransferIds(): string[];
    /**
     * Get a formatted string for logging
     */
    toLogString(): string;
    /**
     * Get a user-friendly error description
     */
    getUserFriendlyMessage(): string;
    /**
     * Convert to a plain object for serialization
     */
    toJSON(): Record<string, unknown>;
    /**
     * Create a FlashnetError from an API error response
     */
    static fromResponse(response: FlashnetErrorResponseBody, httpStatus: number, options?: {
        transferIds?: string[];
        lpIdentityPublicKey?: string;
    }): FlashnetError;
    /**
     * Create a FlashnetError from an unknown error
     */
    static fromUnknown(error: unknown, options?: {
        transferIds?: string[];
        lpIdentityPublicKey?: string;
    }): FlashnetError;
}
/**
 * Type guard to check if an error is a FlashnetError
 */
export declare function isFlashnetError(error: unknown): error is FlashnetError;
//# sourceMappingURL=errors.d.ts.map
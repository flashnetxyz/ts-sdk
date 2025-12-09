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

// ===== Clawback Result Types =====

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

// ===== Error Codes =====

/**
 * All Flashnet AMM Gateway error codes
 */
export type FlashnetErrorCode =
  // Validation (1000-1999)
  | "FSAG-1000" // Validation failed
  | "FSAG-1001" // Required field missing
  | "FSAG-1002" // Invalid field format
  | "FSAG-1003" // Value out of range
  | "FSAG-1004" // Duplicate value for unique entity
  // Security/Auth (2000-2999)
  | "FSAG-2001" // Signature verification failed
  | "FSAG-2002" // Token identity mismatch
  | "FSAG-2003" // Authorization token missing
  | "FSAG-2004" // Authorization token invalid or expired
  | "FSAG-2005" // Nonce verification failed
  | "FSAG-2101" // Public key invalid
  // Infrastructure/External (3000-3999)
  | "FSAG-3001" // Internal server error
  | "FSAG-3002" // Internal server error
  | "FSAG-3101" // Internal server error
  | "FSAG-3201" // Internal server error
  | "FSAG-3201T1" // Internal server error
  | "FSAG-3201T2" // Internal server error
  | "FSAG-3202" // Internal server error
  | "FSAG-3301" // Internal server error
  | "FSAG-3302" // Internal server error
  | "FSAG-3401" // Internal server error
  | "FSAG-3402" // Internal server error
  // Business/AMM Logic (4000-4999)
  | "FSAG-4001" // Pool not found
  | "FSAG-4002" // Host not found
  | "FSAG-4101" // Auth session not found
  | "FSAG-4102" // Incorrect authentication flow
  | "FSAG-4201" // AMM has insufficient liquidity/reserves
  | "FSAG-4202" // AMM slippage exceeded limit
  | "FSAG-4203" // AMM operation not allowed in current phase
  | "FSAG-4204" // Insufficient LP token balance
  | "FSAG-4301" // Invalid fee configuration
  | "FSAG-4401" // Spark transfer ID already used
  // System/Service (5000-5999)
  | "FSAG-5001" // Failed to generate unique ID
  | "FSAG-5002" // Feature not implemented
  | "FSAG-5003" // Internal state inconsistent
  | "FSAG-5004" // Invalid configuration parameter
  | "FSAG-5100"; // Unexpected panic

/**
 * Error category determined by code range
 */
export type FlashnetErrorCategory =
  | "Validation"
  | "Security"
  | "Infrastructure"
  | "Business"
  | "System";

/**
 * Recovery strategy for each error type
 */
export type ErrorRecoveryStrategy =
  /** Must clawback any transfer IDs sent - validation/security/system errors */
  | "clawback_required"
  /** Should attempt clawback - infrastructure errors where state is uncertain */
  | "clawback_recommended"
  /** Funds return automatically via refund - business logic errors */
  | "auto_refund"
  /** No funds at risk - typically read operations or auth errors before transfers */
  | "none";

// ===== Error Metadata =====

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
export const ERROR_CODE_METADATA: Record<FlashnetErrorCode, ErrorCodeMetadata> =
  {
    // ===== Validation Errors (1000-1999) - Clawback Required =====
    "FSAG-1000": {
      httpStatus: 400,
      category: "Validation",
      recovery: "clawback_required",
      summary: "Validation failed",
      userMessage: "The request failed validation checks.",
      actionHint:
        "Check your input parameters and try again. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-1001": {
      httpStatus: 400,
      category: "Validation",
      recovery: "clawback_required",
      summary: "Required field missing",
      userMessage: "A required field is missing from your request.",
      actionHint:
        "Ensure all required fields are provided. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-1002": {
      httpStatus: 400,
      category: "Validation",
      recovery: "clawback_required",
      summary: "Invalid field format",
      userMessage: "One or more fields have an invalid format.",
      actionHint:
        "Check the format of your inputs (addresses, amounts, etc.). If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-1003": {
      httpStatus: 400,
      category: "Validation",
      recovery: "clawback_required",
      summary: "Value out of range",
      userMessage: "A value is outside the acceptable range.",
      actionHint:
        "Adjust the value to be within valid bounds. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-1004": {
      httpStatus: 409,
      category: "Validation",
      recovery: "clawback_required",
      summary: "Duplicate value",
      userMessage: "This value already exists and must be unique.",
      actionHint:
        "Use a different value or check if the operation was already completed.",
      isRetryable: false,
    },

    // ===== Security/Auth Errors (2000-2999) - Clawback Required =====
    "FSAG-2001": {
      httpStatus: 403,
      category: "Security",
      recovery: "clawback_required",
      summary: "Signature verification failed",
      userMessage: "Your request signature could not be verified.",
      actionHint:
        "Ensure you're signing with the correct key. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-2002": {
      httpStatus: 403,
      category: "Security",
      recovery: "clawback_required",
      summary: "Token identity mismatch",
      userMessage: "The token identity doesn't match the expected public key.",
      actionHint:
        "Ensure you're using the correct wallet/identity. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-2003": {
      httpStatus: 401,
      category: "Security",
      recovery: "none",
      summary: "Authorization token missing",
      userMessage: "Authentication is required for this operation.",
      actionHint: "Authenticate first by calling the auth flow.",
      isRetryable: true,
    },
    "FSAG-2004": {
      httpStatus: 401,
      category: "Security",
      recovery: "none",
      summary: "Authorization token invalid or expired",
      userMessage: "Your session has expired or the token is invalid.",
      actionHint: "Re-authenticate to get a new access token.",
      isRetryable: true,
    },
    "FSAG-2005": {
      httpStatus: 403,
      category: "Security",
      recovery: "clawback_required",
      summary: "Nonce verification failed",
      userMessage: "The request nonce is invalid or has already been used.",
      actionHint:
        "Generate a new nonce and retry. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-2101": {
      httpStatus: 400,
      category: "Security",
      recovery: "clawback_required",
      summary: "Public key invalid",
      userMessage: "The provided public key is invalid.",
      actionHint:
        "Check that the public key is correctly formatted. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },

    // ===== Infrastructure/External Errors (3000-3999) - Clawback Recommended =====
    "FSAG-3001": {
      httpStatus: 503,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "A temporary service issue occurred. Please try again.",
      actionHint:
        "Wait a moment and retry. If you sent funds, consider initiating a clawback.",
      isRetryable: true,
    },
    "FSAG-3002": {
      httpStatus: 500,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "A temporary service issue occurred. Please try again.",
      actionHint:
        "Wait a moment and retry. If you sent funds, consider initiating a clawback.",
      isRetryable: true,
    },
    "FSAG-3101": {
      httpStatus: 500,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "A database error occurred. Please try again.",
      actionHint:
        "Wait a moment and retry. If you sent funds, consider initiating a clawback.",
      isRetryable: true,
    },
    "FSAG-3201": {
      httpStatus: 503,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "The settlement service is temporarily unavailable.",
      actionHint:
        "Wait and retry. If you sent funds and they haven't been processed, consider initiating a clawback.",
      isRetryable: true,
    },
    "FSAG-3201T1": {
      httpStatus: 503,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "The settlement service is temporarily unavailable.",
      actionHint:
        "Wait and retry. If you sent funds and they haven't been processed, consider initiating a clawback.",
      isRetryable: true,
    },
    "FSAG-3201T2": {
      httpStatus: 503,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "The settlement request timed out.",
      actionHint:
        "Check if your transaction was processed. If not, you may retry or initiate a clawback.",
      isRetryable: true,
    },
    "FSAG-3202": {
      httpStatus: 503,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "A dependent service is temporarily unavailable.",
      actionHint: "Wait a moment and retry.",
      isRetryable: true,
    },
    "FSAG-3301": {
      httpStatus: 500,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "The AMM processor couldn't receive your request.",
      actionHint:
        "Wait and retry. If you sent funds, consider initiating a clawback.",
      isRetryable: true,
    },
    "FSAG-3302": {
      httpStatus: 503,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "The AMM processor timed out while processing your request.",
      actionHint:
        "Check if your transaction was processed. If not, you may retry or initiate a clawback.",
      isRetryable: true,
    },
    "FSAG-3401": {
      httpStatus: 500,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "An internal processing error occurred.",
      actionHint:
        "This is likely a temporary issue. Wait and retry. If you sent funds, consider initiating a clawback.",
      isRetryable: true,
    },
    "FSAG-3402": {
      httpStatus: 500,
      category: "Infrastructure",
      recovery: "clawback_recommended",
      summary: "Internal server error",
      userMessage: "An internal processing error occurred.",
      actionHint:
        "This is likely a temporary issue. Wait and retry. If you sent funds, consider initiating a clawback.",
      isRetryable: true,
    },

    // ===== Business/AMM Logic Errors (4000-4999) - Auto Refund =====
    "FSAG-4001": {
      httpStatus: 404,
      category: "Business",
      recovery: "auto_refund",
      summary: "Pool not found",
      userMessage: "The specified pool does not exist.",
      actionHint:
        "Verify the pool ID is correct. Your funds will be automatically refunded.",
      isRetryable: false,
    },
    "FSAG-4002": {
      httpStatus: 404,
      category: "Business",
      recovery: "none",
      summary: "Host not found",
      userMessage: "The specified host namespace does not exist.",
      actionHint: "Verify the host namespace is correct.",
      isRetryable: false,
    },
    "FSAG-4101": {
      httpStatus: 404,
      category: "Business",
      recovery: "none",
      summary: "Auth session not found",
      userMessage: "Your authentication session was not found or has expired.",
      actionHint: "Start a new authentication flow.",
      isRetryable: true,
    },
    "FSAG-4102": {
      httpStatus: 400,
      category: "Business",
      recovery: "none",
      summary: "Incorrect authentication flow",
      userMessage: "The authentication flow was not followed correctly.",
      actionHint: "Complete the authentication steps in the correct order.",
      isRetryable: true,
    },
    "FSAG-4201": {
      httpStatus: 400,
      category: "Business",
      recovery: "auto_refund",
      summary: "Insufficient liquidity",
      userMessage:
        "The pool doesn't have enough liquidity to complete this swap.",
      actionHint:
        "Try a smaller amount or wait for more liquidity. Your funds will be automatically refunded.",
      isRetryable: true,
    },
    "FSAG-4202": {
      httpStatus: 400,
      category: "Business",
      recovery: "auto_refund",
      summary: "Slippage exceeded",
      userMessage: "The price moved more than your allowed slippage tolerance.",
      actionHint:
        "Try increasing slippage tolerance, reducing trade size, or waiting for less volatile conditions. Your funds will be automatically refunded.",
      isRetryable: true,
    },
    "FSAG-4203": {
      httpStatus: 409,
      category: "Business",
      recovery: "auto_refund",
      summary: "Operation not allowed in current phase",
      userMessage:
        "This operation cannot be performed while the pool is in its current phase.",
      actionHint:
        "Wait for the pool to transition to the appropriate phase. Your funds will be automatically refunded.",
      isRetryable: true,
    },
    "FSAG-4204": {
      httpStatus: 400,
      category: "Business",
      recovery: "none",
      summary: "Insufficient LP tokens",
      userMessage:
        "You don't have enough LP tokens to complete this withdrawal.",
      actionHint:
        "Check your LP token balance and reduce the withdrawal amount.",
      isRetryable: false,
    },
    "FSAG-4301": {
      httpStatus: 400,
      category: "Business",
      recovery: "none",
      summary: "Invalid fee configuration",
      userMessage: "The fee configuration is invalid.",
      actionHint: "Check that fee rates are within acceptable bounds.",
      isRetryable: false,
    },
    "FSAG-4401": {
      httpStatus: 409,
      category: "Business",
      recovery: "none",
      summary: "Transfer ID already used",
      userMessage: "This Spark transfer has already been used in an operation.",
      actionHint:
        "Each transfer can only be used once. Use a new transfer for this operation.",
      isRetryable: false,
    },

    // ===== System/Service Errors (5000-5999) - Clawback Required =====
    "FSAG-5001": {
      httpStatus: 500,
      category: "System",
      recovery: "clawback_required",
      summary: "Failed to generate unique ID",
      userMessage: "An internal error occurred while processing your request.",
      actionHint: "Please try again. If you sent funds, initiate a clawback.",
      isRetryable: true,
    },
    "FSAG-5002": {
      httpStatus: 501,
      category: "System",
      recovery: "none",
      summary: "Feature not implemented",
      userMessage: "This feature is not yet available.",
      actionHint: "This operation is not currently supported.",
      isRetryable: false,
    },
    "FSAG-5003": {
      httpStatus: 500,
      category: "System",
      recovery: "clawback_required",
      summary: "Internal state inconsistent",
      userMessage:
        "An internal error occurred. Please contact support if this persists.",
      actionHint: "If you sent funds, initiate a clawback and contact support.",
      isRetryable: false,
    },
    "FSAG-5004": {
      httpStatus: 500,
      category: "System",
      recovery: "clawback_required",
      summary: "Invalid configuration parameter",
      userMessage: "A system configuration error occurred.",
      actionHint:
        "This is a server-side issue. If you sent funds, initiate a clawback.",
      isRetryable: false,
    },
    "FSAG-5100": {
      httpStatus: 500,
      category: "System",
      recovery: "clawback_required",
      summary: "Unexpected panic",
      userMessage: "An unexpected error occurred on the server.",
      actionHint:
        "Please try again later. If you sent funds, initiate a clawback immediately.",
      isRetryable: false,
    },
  };

// ===== Helper Functions =====

/**
 * Check if a string is a valid FlashnetErrorCode
 */
export function isFlashnetErrorCode(code: string): code is FlashnetErrorCode {
  return code in ERROR_CODE_METADATA;
}

/**
 * Get error category from error code
 */
export function getErrorCategory(
  code: FlashnetErrorCode
): FlashnetErrorCategory {
  return ERROR_CODE_METADATA[code].category;
}

/**
 * Get recovery strategy from error code
 */
export function getErrorRecovery(
  code: FlashnetErrorCode
): ErrorRecoveryStrategy {
  return ERROR_CODE_METADATA[code].recovery;
}

/**
 * Get metadata for an error code
 */
export function getErrorMetadata(code: FlashnetErrorCode): ErrorCodeMetadata {
  return ERROR_CODE_METADATA[code];
}

/**
 * Determine category from error code prefix (for unknown codes)
 */
export function getCategoryFromCodeRange(
  code: string
): FlashnetErrorCategory | null {
  const match = code.match(/^FSAG-(\d)/);
  if (!match) {
    return null;
  }

  const prefix = match[1];
  switch (prefix) {
    case "1":
      return "Validation";
    case "2":
      return "Security";
    case "3":
      return "Infrastructure";
    case "4":
      return "Business";
    case "5":
      return "System";
    default:
      return null;
  }
}

// ===== FlashnetError Class =====

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
export class FlashnetError extends Error {
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

  constructor(message: string, options: FlashnetErrorOptions = {}) {
    super(message);
    this.name = "FlashnetError";

    const response = options.response;
    const rawCode = response?.errorCode ?? "UNKNOWN";

    // Determine if we have a known error code
    if (isFlashnetErrorCode(rawCode)) {
      this.errorCode = rawCode;
      const metadata = ERROR_CODE_METADATA[rawCode];
      this.category = metadata.category;
      this.recovery = metadata.recovery;
      this.httpStatus = options.httpStatus ?? metadata.httpStatus;
      this.isRetryable = metadata.isRetryable;
      this.summary = metadata.summary;
      this.userMessage = metadata.userMessage;
      this.actionHint = metadata.actionHint;
    } else {
      // Unknown error code - try to determine category from range
      this.errorCode = rawCode;
      this.category = getCategoryFromCodeRange(rawCode) ?? "System";
      this.httpStatus = options.httpStatus ?? 500;

      // Default recovery based on category
      switch (this.category) {
        case "Validation":
        case "Security":
        case "System":
          this.recovery = "clawback_required";
          break;
        case "Infrastructure":
          this.recovery = "clawback_recommended";
          break;
        case "Business":
          this.recovery = "auto_refund";
          break;
        default:
          this.recovery = "clawback_required";
      }

      this.isRetryable = this.category === "Infrastructure";
      this.summary = response?.message ?? "Unknown error";
      this.userMessage = response?.message ?? "An unexpected error occurred.";
      this.actionHint =
        response?.remediation ?? "Please try again or contact support.";
    }

    this.requestId = response?.requestId ?? "";
    this.timestamp = response?.timestamp ?? new Date().toISOString();
    this.service = response?.service ?? "unknown";
    this.severity = response?.severity ?? "Error";
    this.details = response?.details;
    this.remediation = response?.remediation;
    this.transferIds = options.transferIds ?? [];
    this.lpIdentityPublicKey = options.lpIdentityPublicKey;
    this.clawbackSummary = options.clawbackSummary;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, FlashnetError.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FlashnetError);
    }
  }

  // ===== Recovery Status Methods =====

  /**
   * Returns true if funds were sent and clawback is required
   */
  isClawbackRequired(): boolean {
    return this.recovery === "clawback_required" && this.transferIds.length > 0;
  }

  /**
   * Returns true if clawback is recommended (infrastructure errors)
   */
  isClawbackRecommended(): boolean {
    return (
      this.recovery === "clawback_recommended" && this.transferIds.length > 0
    );
  }

  /**
   * Returns true if clawback should be attempted (required or recommended)
   */
  shouldClawback(): boolean {
    return this.isClawbackRequired() || this.isClawbackRecommended();
  }

  /**
   * Returns true if funds will be automatically refunded
   */
  willAutoRefund(): boolean {
    return this.recovery === "auto_refund";
  }

  /**
   * Returns true if this error has associated transfers that may need recovery
   */
  hasTransfersAtRisk(): boolean {
    return this.transferIds.length > 0 && this.recovery !== "auto_refund";
  }

  // ===== Category Check Methods =====

  isValidationError(): boolean {
    return this.category === "Validation";
  }

  isSecurityError(): boolean {
    return this.category === "Security";
  }

  isInfrastructureError(): boolean {
    return this.category === "Infrastructure";
  }

  isBusinessError(): boolean {
    return this.category === "Business";
  }

  isSystemError(): boolean {
    return this.category === "System";
  }

  // ===== Specific Error Checks =====

  isSlippageError(): boolean {
    return this.errorCode === "FSAG-4202";
  }

  isInsufficientLiquidityError(): boolean {
    return this.errorCode === "FSAG-4201";
  }

  isAuthError(): boolean {
    return this.errorCode === "FSAG-2003" || this.errorCode === "FSAG-2004";
  }

  isPoolNotFoundError(): boolean {
    return this.errorCode === "FSAG-4001";
  }

  isTransferAlreadyUsedError(): boolean {
    return this.errorCode === "FSAG-4401";
  }

  // ===== Clawback Status Methods =====

  /**
   * Returns true if automatic clawback was attempted
   */
  wasClawbackAttempted(): boolean {
    return this.clawbackSummary?.attempted ?? false;
  }

  /**
   * Returns true if all transfers were successfully recovered via clawback
   */
  wereAllTransfersRecovered(): boolean {
    if (!this.clawbackSummary?.attempted) {
      return false;
    }
    return this.clawbackSummary.failureCount === 0;
  }

  /**
   * Returns true if some (but not all) transfers were recovered
   */
  werePartialTransfersRecovered(): boolean {
    if (!this.clawbackSummary?.attempted) {
      return false;
    }
    return (
      this.clawbackSummary.successCount > 0 &&
      this.clawbackSummary.failureCount > 0
    );
  }

  /**
   * Get the number of transfers that were successfully recovered
   */
  getRecoveredTransferCount(): number {
    return this.clawbackSummary?.successCount ?? 0;
  }

  /**
   * Get the transfer IDs that were successfully recovered
   */
  getRecoveredTransferIds(): string[] {
    return this.clawbackSummary?.recoveredTransferIds ?? [];
  }

  /**
   * Get the transfer IDs that failed to recover (still at risk)
   */
  getUnrecoveredTransferIds(): string[] {
    return this.clawbackSummary?.unrecoveredTransferIds ?? this.transferIds;
  }

  // ===== Formatting Methods =====

  /**
   * Get a formatted string for logging
   */
  toLogString(): string {
    const parts = [
      `[${this.errorCode}]`,
      this.message,
      `(requestId: ${this.requestId})`,
    ];
    if (this.transferIds.length > 0) {
      parts.push(`transferIds: [${this.transferIds.join(", ")}]`);
    }
    return parts.join(" ");
  }

  /**
   * Get a user-friendly error description
   */
  getUserFriendlyMessage(): string {
    const parts = [this.userMessage];
    if (this.shouldClawback()) {
      parts.push("Your funds may need to be recovered via clawback.");
    } else if (this.willAutoRefund()) {
      parts.push("Your funds will be automatically refunded.");
    }
    return parts.join(" ");
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      category: this.category,
      recovery: this.recovery,
      httpStatus: this.httpStatus,
      requestId: this.requestId,
      timestamp: this.timestamp,
      service: this.service,
      severity: this.severity,
      details: this.details,
      remediation: this.remediation,
      transferIds: this.transferIds,
      lpIdentityPublicKey: this.lpIdentityPublicKey,
      clawbackSummary: this.clawbackSummary,
      isRetryable: this.isRetryable,
      summary: this.summary,
      userMessage: this.userMessage,
      actionHint: this.actionHint,
    };
  }

  /**
   * Create a FlashnetError from an API error response
   */
  static fromResponse(
    response: FlashnetErrorResponseBody,
    httpStatus: number,
    options?: { transferIds?: string[]; lpIdentityPublicKey?: string }
  ): FlashnetError {
    return new FlashnetError(response.message, {
      response,
      httpStatus,
      transferIds: options?.transferIds,
      lpIdentityPublicKey: options?.lpIdentityPublicKey,
    });
  }

  /**
   * Create a FlashnetError from an unknown error
   */
  static fromUnknown(
    error: unknown,
    options?: { transferIds?: string[]; lpIdentityPublicKey?: string }
  ): FlashnetError {
    if (error instanceof FlashnetError) {
      // If already a FlashnetError, add transfer info if provided
      if (options?.transferIds?.length || options?.lpIdentityPublicKey) {
        return new FlashnetError(error.message, {
          response: {
            errorCode: error.errorCode,
            errorCategory: error.category,
            message: error.message,
            details: error.details,
            requestId: error.requestId,
            timestamp: error.timestamp,
            service: error.service,
            severity: error.severity,
            remediation: error.remediation,
          },
          httpStatus: error.httpStatus,
          transferIds: options.transferIds ?? error.transferIds,
          lpIdentityPublicKey:
            options.lpIdentityPublicKey ?? error.lpIdentityPublicKey,
          cause: error,
        });
      }
      return error;
    }

    if (error instanceof Error) {
      // Check if it's an API error with response data
      const apiError = error as Error & {
        status?: number;
        response?: { status: number; data: unknown };
      };

      if (
        apiError.response?.data &&
        typeof apiError.response.data === "object"
      ) {
        const data = apiError.response.data as Record<string, unknown>;
        if (
          data.errorCode &&
          typeof data.errorCode === "string" &&
          typeof data.message === "string" &&
          typeof data.requestId === "string"
        ) {
          return FlashnetError.fromResponse(
            data as unknown as FlashnetErrorResponseBody,
            apiError.response.status ?? apiError.status ?? 500,
            options
          );
        }
      }

      // Generic error
      return new FlashnetError(error.message, {
        httpStatus: apiError.status ?? 500,
        transferIds: options?.transferIds,
        lpIdentityPublicKey: options?.lpIdentityPublicKey,
        cause: error,
      });
    }

    // Unknown error type
    return new FlashnetError(String(error), {
      httpStatus: 500,
      transferIds: options?.transferIds,
      lpIdentityPublicKey: options?.lpIdentityPublicKey,
    });
  }
}

/**
 * Type guard to check if an error is a FlashnetError
 */
export function isFlashnetError(error: unknown): error is FlashnetError {
  return error instanceof FlashnetError;
}

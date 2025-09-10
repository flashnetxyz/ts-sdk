// Export all types

export type { RequestOptions } from "./src/api/client";
// Export API client and typed endpoints
export { ApiClient } from "./src/api/client";
export {
  isApiError,
  isFlashnetError,
  TypedAmmApi,
} from "./src/api/typed-endpoints";
export {
  commonValidationRules,
  constantProductPoolValidationRules,
  singleSidedPoolValidationRules,
  ValidationError,
  type ValidationRule,
  type ValidationRules,
  validateBps,
  validateNamespace,
  validatePositiveAmount,
  validatePublicKey,
  validateRequest,
  validateSignature,
} from "./src/api/validation";
// Export client
export {
  FlashnetClient,
  type FlashnetClientOptions,
  type TokenBalance,
  type WalletBalance,
} from "./src/client/FlashnetClient";

// Export configuration (new and legacy)
export * from "./src/config";
export type * from "./src/types";
export {
  calculateThresholdPercentage,
  validateSingleSidedPoolThreshold,
  type ValidationResult,
} from "./src/types";
export { fromSmallestUnit, generateNonce, toSmallestUnit } from "./src/utils";
export { AuthManager } from "./src/utils/auth";
export {
  generateAddLiquidityIntentMessage,
  generateCreateEscrowIntentMessage,
  generateClaimEscrowIntentMessage,
  generateClawbackIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
  generateFundEscrowIntentMessage,
  generatePoolConfirmInitialDepositIntentMessage,
  generatePoolInitializationIntentMessage,
  generatePoolSwapIntentMessage,
  generateRegisterHostIntentMessage,
  generateRemoveLiquidityIntentMessage,
  generateRouteSwapIntentMessage,
  generateWithdrawHostFeesIntentMessage,
  generateWithdrawIntegratorFeesIntentMessage,
} from "./src/utils/intents";
export { createWalletSigner } from "./src/utils/signer";

// Export Spark address utilities (new and legacy)
export {
  // Legacy functions (deprecated)
  convertSparkAddressToNetwork,
  // New Spark network functions
  convertSparkAddressToSparkNetwork,
  decodeSparkAddress,
  decodeSparkAddressNew,
  encodeSparkAddress,
  encodeSparkAddressNew,
  getNetworkFromAddress,
  getSparkNetworkFromAddress,
  // Common utilities
  isValidPublicKey,
  isValidSparkAddress,
  isValidSparkAddressNew,
  looksLikePublicKey,
  type SparkAddressFormat,
} from "./src/utils/spark-address";

// Export token address utilities (new and legacy)
export {
  decodeHumanReadableTokenIdentifier,
  decodeSparkHumanReadableTokenIdentifier,
  // Legacy functions (deprecated)
  encodeHumanReadableTokenIdentifier,
  // New Spark network functions
  encodeSparkHumanReadableTokenIdentifier,
  getHumanReadableTokenIdentifier,
  getTokenIdentifier,
  getTokenIdentifierHashes,
  getTokenIdentifierWithHashes,
  type HumanReadableTokenIdentifier,
  SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
  type SparkHumanReadableTokenIdentifier,
} from "./src/utils/tokenAddress";

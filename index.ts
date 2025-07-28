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
export { fromSmallestUnit, generateNonce, toSmallestUnit } from "./src/utils";
export { AuthManager } from "./src/utils/auth";
export {
  generateAddLiquidityIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
  generatePoolConfirmInitialDepositIntentMessage,
  generatePoolInitializationIntentMessage,
  generatePoolSwapIntentMessage,
  generateRegisterHostIntentMessage,
  generateRemoveLiquidityIntentMessage,
  generateWithdrawHostFeesIntentMessage,
} from "./src/utils/intents";
export { createWalletSigner } from "./src/utils/signer";

// Export Spark address utilities (new and legacy)
export {
  // New Spark network functions
  convertSparkAddressToSparkNetwork,
  decodeSparkAddressNew,
  encodeSparkAddressNew,
  getSparkNetworkFromAddress,
  isValidSparkAddressNew,
  // Legacy functions (deprecated)
  convertSparkAddressToNetwork,
  decodeSparkAddress,
  encodeSparkAddress,
  getNetworkFromAddress,
  isValidSparkAddress,
  // Common utilities
  isValidPublicKey,
  looksLikePublicKey,
  type SparkAddressFormat,
} from "./src/utils/spark-address";

// Export token address utilities (new and legacy)
export {
  // New Spark network functions
  encodeSparkHumanReadableTokenIdentifier,
  decodeSparkHumanReadableTokenIdentifier,
  type SparkHumanReadableTokenIdentifier,
  // Legacy functions (deprecated)
  encodeHumanReadableTokenIdentifier,
  decodeHumanReadableTokenIdentifier,
  type HumanReadableTokenIdentifier,
} from "./src/utils/tokenAddress";

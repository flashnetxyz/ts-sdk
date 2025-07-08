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

// Export configuration
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
// Export utilities
export {
  convertSparkAddressToNetwork,
  decodeSparkAddress,
  encodeSparkAddress,
  getNetworkFromAddress,
  isValidPublicKey,
  isValidSparkAddress,
  looksLikePublicKey,
  type SparkAddressFormat,
} from "./src/utils/spark-address";

// Export all types
export type * from "./src/types";
export type { RequestOptions } from "./src/api/client";

// Export API client and typed endpoints
export { ApiClient } from "./src/api/client";
export {
  TypedAmmApi,
  isFlashnetError,
  isApiError,
} from "./src/api/typed-endpoints";
export {
  validatePublicKey,
  validateSignature,
  validatePositiveAmount,
  validateBps,
  validateNamespace,
  validateRequest,
  ValidationError,
  commonValidationRules,
  constantProductPoolValidationRules,
  type ValidationRule,
  type ValidationRules,
} from "./src/api/validation";

// Export configuration
export * from "./src/config";
export { fromSmallestUnit, generateNonce, toSmallestUnit } from "./src/utils";

export { AuthManager } from "./src/utils/auth";
export { createWalletSigner } from "./src/utils/signer";
export {
  generateAddLiquidityIntentMessage,
  generatePoolConfirmInitialDepositIntentMessage,
  generatePoolInitializationIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
  generatePoolSwapIntentMessage,
  generateRemoveLiquidityIntentMessage,
  generateRegisterHostIntentMessage,
  generateWithdrawHostFeesIntentMessage,
} from "./src/utils/intents";

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

// Export client
export {
  FlashnetClient,
  type FlashnetClientOptions,
  type TokenBalance,
  type WalletBalance,
} from "./src/client/FlashnetClient";

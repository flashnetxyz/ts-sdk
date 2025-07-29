import type {
  AmmAddLiquiditySettlementRequest,
  AmmRemoveLiquiditySettlementRequest,
  RouteHopValidation,
  ValidateAmmConfirmInitialDepositData,
  ValidateAmmInitializeConstantProductPoolData,
  ValidateAmmInitializeSingleSidedPoolData,
  ValidateAmmSwapData,
  ValidateAmmWithdrawIntegratorFeesData,
  ValidateRouteSwapData,
} from "../types";

/**
 * Generates a pool initialization intent message
 * @param params Parameters for pool initialization
 * @returns The serialized intent message as ValidateAmmInitializeSingleSidedPoolData
 */
export function generatePoolInitializationIntentMessage(params: {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  assetAInitialReserve: string;
  graduationThresholdPct: string;
  targetBRaisedAtGraduation: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmInitializeSingleSidedPoolData = {
    poolOwnerPublicKey: params.poolOwnerPublicKey,
    assetATokenPublicKey: params.assetAAddress,
    assetBTokenPublicKey: params.assetBAddress,
    assetAInitialReserve: params.assetAInitialReserve,
    graduationThresholdPct: params.graduationThresholdPct,
    targetBRaisedAtGraduation: params.targetBRaisedAtGraduation,
    totalHostFeeRateBps: params.totalHostFeeRateBps,
    lpFeeRateBps: params.lpFeeRateBps,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generates a constant product pool initialization intent message
 * @param params Parameters for constant product pool initialization
 * @returns The serialized intent message as ValidateAmmInitializeConstantProductPoolData
 */
export function generateConstantProductPoolInitializationIntentMessage(params: {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmInitializeConstantProductPoolData = {
    poolOwnerPublicKey: params.poolOwnerPublicKey,
    assetATokenPublicKey: params.assetAAddress,
    assetBTokenPublicKey: params.assetBAddress,
    totalHostFeeRateBps: params.totalHostFeeRateBps,
    lpFeeRateBps: params.lpFeeRateBps,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generates a pool confirm initial deposit intent message
 * @param params Parameters for confirming initial deposit
 * @returns The serialized intent message
 */
export function generatePoolConfirmInitialDepositIntentMessage(params: {
  poolOwnerPublicKey: string;
  lpIdentityPublicKey: string;
  assetASparkTransferId: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmConfirmInitialDepositData = {
    poolOwnerPublicKey: params.poolOwnerPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetASparkTransferId: params.assetASparkTransferId,
    nonce: params.nonce,
  };
  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generates a pool swap intent message
 * @param params Parameters for swap
 * @returns The serialized intent message
 */
export function generatePoolSwapIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  assetInSparkTransferId: string;
  assetInTokenPublicKey: string;
  assetOutTokenPublicKey: string;
  amountIn: string;
  maxSlippageBps: string;
  minAmountOut: string;
  totalIntegratorFeeRateBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmSwapData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetInSparkTransferId: params.assetInSparkTransferId,
    assetInTokenPublicKey: params.assetInTokenPublicKey,
    assetOutTokenPublicKey: params.assetOutTokenPublicKey,
    amountIn: params.amountIn,
    minAmountOut: params.minAmountOut,
    maxSlippageBps: params.maxSlippageBps,
    nonce: params.nonce,
    totalIntegratorFeeRateBps: params.totalIntegratorFeeRateBps,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for adding liquidity
 */
export function generateAddLiquidityIntentMessage(
  params: AmmAddLiquiditySettlementRequest
): Uint8Array {
  // Create the signing payload with sorted keys
  const signingPayload = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetASparkTransferId: params.assetASparkTransferId,
    assetBSparkTransferId: params.assetBSparkTransferId,
    assetAAmount: BigInt(params.assetAAmount).toString(),
    assetBAmount: BigInt(params.assetBAmount).toString(),
    nonce: params.nonce,
  };

  // Return as Uint8Array for consistent handling
  return new TextEncoder().encode(JSON.stringify(signingPayload));
}

/**
 * Generate the intent message for removing liquidity
 */
export function generateRemoveLiquidityIntentMessage(
  params: AmmRemoveLiquiditySettlementRequest
): Uint8Array {
  // Create the signing payload with sorted keys
  const signingPayload = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    lpTokensToRemove: params.lpTokensToRemove,
    nonce: params.nonce,
  };

  // Return as Uint8Array for consistent handling
  return new TextEncoder().encode(JSON.stringify(signingPayload));
}

/**
 * Generate the intent message for registering a host
 */
export function generateRegisterHostIntentMessage(params: {
  namespace: string;
  minFeeBps: number;
  feeRecipientPublicKey: string;
  nonce: string;
}): Uint8Array {
  // Create the signing payload following the camelCase pattern
  const signingPayload = {
    namespace: params.namespace,
    minFeeBps: params.minFeeBps,
    feeRecipientPublicKey: params.feeRecipientPublicKey,
    nonce: params.nonce,
    signature: "",
  };

  // Return as Uint8Array for consistent handling
  return new TextEncoder().encode(JSON.stringify(signingPayload));
}

/**
 * Generate the intent message for withdrawing host fees
 */
export function generateWithdrawHostFeesIntentMessage(params: {
  hostPublicKey: string;
  lpIdentityPublicKey: string;
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
}): Uint8Array {
  // Create the signing payload with camelCase fields matching ValidateAmmWithdrawHostFeesData
  const signingPayload = {
    hostPublicKey: params.hostPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetAAmount: params.assetAAmount,
    assetBAmount: params.assetBAmount,
    nonce: params.nonce,
  };

  // Return as Uint8Array for consistent handling
  return new TextEncoder().encode(JSON.stringify(signingPayload));
}

/**
 * Generate the intent message for withdrawing integrator fees
 */
export function generateWithdrawIntegratorFeesIntentMessage(params: {
  integratorPublicKey: string;
  lpIdentityPublicKey: string;
  assetAAmount?: string;
  assetBAmount?: string;
  nonce: string;
}): Uint8Array {
  const signingPayload: ValidateAmmWithdrawIntegratorFeesData = {
    integratorPublicKey: params.integratorPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetAAmount: params.assetAAmount,
    assetBAmount: params.assetBAmount,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(signingPayload));
}

/**
 * Generate the intent message for route swap
 */
export function generateRouteSwapIntentMessage(params: {
  userPublicKey: string;
  hops: RouteHopValidation[];
  initialSparkTransferId: string;
  inputAmount: string;
  maxRouteSlippageBps: string;
  minAmountOut: string;
  nonce: string;
  defaultIntegratorFeeRateBps?: string;
}): Uint8Array {
  const signingPayload: ValidateRouteSwapData = {
    userPublicKey: params.userPublicKey,
    hops: params.hops,
    initialSparkTransferId: params.initialSparkTransferId,
    inputAmount: params.inputAmount,
    minFinalOutputAmount: params.minAmountOut,
    maxRouteSlippageBps: params.maxRouteSlippageBps,
    nonce: params.nonce,
    defaultIntegratorFeeRateBps: params.defaultIntegratorFeeRateBps ?? "0",
  };

  return new TextEncoder().encode(JSON.stringify(signingPayload));
}

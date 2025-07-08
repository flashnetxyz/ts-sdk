import type {
  AmmAddLiquiditySettlementRequest,
  AmmRemoveLiquiditySettlementRequest,
  ValidateAmmConfirmInitialDepositData,
  ValidateAmmInitializeConstantProductPoolData,
  ValidateAmmInitializeSingleSidedPoolData,
  ValidateAmmSwapData,
} from "../types";

/**
 * Generates a pool initialization intent message
 * @param params Parameters for pool initialization
 * @returns The serialized intent message as ValidateAmmInitializeSingleSidedPoolData
 */
export function generatePoolInitializationIntentMessage(params: {
  poolOwnerPublicKey: string;
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  assetAInitialReserve: string;
  assetAInitialVirtualReserve: string;
  assetBInitialVirtualReserve: string;
  threshold: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmInitializeSingleSidedPoolData = {
    poolOwnerPublicKey: params.poolOwnerPublicKey,
    assetATokenPublicKey: params.assetATokenPublicKey,
    assetBTokenPublicKey: params.assetBTokenPublicKey,
    assetAInitialReserve: params.assetAInitialReserve,
    assetAInitialVirtualReserve: params.assetAInitialVirtualReserve,
    assetBInitialVirtualReserve: params.assetBInitialVirtualReserve,
    threshold: params.threshold,
    hostFeeShares: [],
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
  assetATokenPublicKey: string;
  assetBTokenPublicKey: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmInitializeConstantProductPoolData = {
    poolOwnerPublicKey: params.poolOwnerPublicKey,
    assetATokenPublicKey: params.assetATokenPublicKey,
    assetBTokenPublicKey: params.assetBTokenPublicKey,
    hostFeeShares: [],
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
  assetASparkTransferId: string;
  assetInTokenPublicKey: string;
  assetOutTokenPublicKey: string;
  amountIn: string;
  minAmountOut: string;
  maxSlippageBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmSwapData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetASparkTransferId: params.assetASparkTransferId,
    assetInTokenPublicKey: params.assetInTokenPublicKey,
    assetOutTokenPublicKey: params.assetOutTokenPublicKey,
    amountIn: params.amountIn,
    minAmountOut: params.minAmountOut,
    maxSlippageBps: params.maxSlippageBps,
    nonce: params.nonce,
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

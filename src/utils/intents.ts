import type {
  AmmAddLiquiditySettlementRequest,
  AmmRemoveLiquiditySettlementRequest,
  EscrowCondition,
  EscrowRecipient,
  RouteHopValidation,
  ValidateAmmConfirmInitialDepositData,
  ValidateAmmInitializeConstantProductPoolData,
  ValidateAmmInitializeSingleSidedPoolData,
  ValidateAmmSwapData,
  ValidateAmmWithdrawIntegratorFeesData,
  ValidateEscrowClaimData,
  ValidateEscrowCreateData,
  ValidateEscrowFundData,
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
  virtualReserveA: string;
  virtualReserveB: string;
  threshold: string;
  lpFeeRateBps: string;
  totalHostFeeRateBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateAmmInitializeSingleSidedPoolData = {
    poolOwnerPublicKey: params.poolOwnerPublicKey.toString(),
    assetATokenPublicKey: params.assetAAddress.toString(),
    assetBTokenPublicKey: params.assetBAddress.toString(),
    assetAInitialReserve: params.assetAInitialReserve.toString(),
    virtualReserveA: params.virtualReserveA.toString(),
    virtualReserveB: params.virtualReserveB.toString(),
    threshold: params.threshold.toString(),
    totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
    lpFeeRateBps: params.lpFeeRateBps.toString(),
    nonce: params.nonce.toString(),
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
    assetAMinAmountIn: BigInt(params.assetAMinAmountIn).toString(),
    assetBMinAmountIn: BigInt(params.assetBMinAmountIn).toString(),
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
  assetBAmount?: string;
  nonce: string;
}): Uint8Array {
  // Create the signing payload with camelCase fields matching ValidateAmmWithdrawHostFeesData
  const signingPayload = {
    hostPublicKey: params.hostPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
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
  assetBAmount?: string;
  nonce: string;
}): Uint8Array {
  const signingPayload: ValidateAmmWithdrawIntegratorFeesData = {
    integratorPublicKey: params.integratorPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
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

/**
 * Generates an escrow creation intent message.
 * @param params Parameters for creating an escrow.
 * @returns The serialized intent message.
 */
export function generateCreateEscrowIntentMessage(params: {
  creatorPublicKey: string;
  assetId: string;
  assetAmount: string;
  recipients: EscrowRecipient[];
  claimConditions: EscrowCondition[];
  abandonHost?: string;
  abandonConditions?: EscrowCondition[];
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateEscrowCreateData = {
    creatorPublicKey: params.creatorPublicKey,
    assetId: params.assetId,
    assetAmount: params.assetAmount,
    recipients: params.recipients,
    claimConditions: params.claimConditions,
    abandonHost: params.abandonHost,
    abandonConditions: params.abandonConditions,
    nonce: params.nonce,
  };
  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generates an escrow funding intent message.
 * @param params Parameters for funding an escrow.
 * @returns The serialized intent message.
 */
export function generateFundEscrowIntentMessage(params: {
  escrowId: string;
  creatorPublicKey: string;
  sparkTransferId: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateEscrowFundData = {
    escrowId: params.escrowId,
    creatorPublicKey: params.creatorPublicKey,
    sparkTransferId: params.sparkTransferId,
    nonce: params.nonce,
  };
  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generates an escrow claim intent message.
 * @param params Parameters for claiming from an escrow.
 * @returns The serialized intent message.
 */
export function generateClaimEscrowIntentMessage(params: {
  escrowId: string;
  recipientPublicKey: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateEscrowClaimData = {
    escrowId: params.escrowId,
    recipientPublicKey: params.recipientPublicKey,
    nonce: params.nonce,
  };
  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

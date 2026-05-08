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
  ValidateClawbackData,
  ValidateCollectFeesData,
  ValidateConcentratedPoolData,
  ValidateDecreaseLiquidityData,
  ValidateDepositBalanceData,
  ValidateEscrowClaimData,
  ValidateEscrowCreateData,
  ValidateEscrowFundData,
  ValidateIncreaseLiquidityData,
  ValidateRebalancePositionData,
  ValidateRouteSwapData,
  ValidateWithdrawBalanceData,
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
    assetAAddress: params.assetAAddress.toString(),
    assetBAddress: params.assetBAddress.toString(),
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
    assetAAddress: params.assetAAddress,
    assetBAddress: params.assetBAddress,
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
 * @param params.useFreeBalance When true, uses free balance from V3 pool instead of a Spark transfer.
 *   The assetInSparkTransferId is set to empty string in the intent (backend derives useFreeBalance from this).
 *   Note: Only works for V3 concentrated liquidity pools. Does NOT work for route swaps.
 * @returns The serialized intent message
 */
export function generatePoolSwapIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  assetInSparkTransferId?: string;
  assetInAddress: string;
  assetOutAddress: string;
  amountIn: string;
  maxSlippageBps: string;
  minAmountOut: string;
  totalIntegratorFeeRateBps: string;
  nonce: string;
  /** Whether to use free balance instead of a Spark transfer (V3 pools only) */
  useFreeBalance?: boolean;
}): Uint8Array {
  // When using free balance, transfer ID is empty in the signed message
  // Backend determines useFreeBalance from whether transfer ID is empty
  const isUsingFreeBalance =
    params.useFreeBalance === true || !params.assetInSparkTransferId;
  const transferId = isUsingFreeBalance ? "" : params.assetInSparkTransferId;

  // Note: useFreeBalance is NOT in the signed message - backend derives it from empty transferId
  const intentMessage: ValidateAmmSwapData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetInSparkTransferId: transferId,
    assetInAddress: params.assetInAddress,
    assetOutAddress: params.assetOutAddress,
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

/**
 * Generate the intent message for clawback
 */
export function generateClawbackIntentMessage(params: {
  senderPublicKey: string;
  sparkTransferId: string;
  lpIdentityPublicKey: string;
  nonce: string;
}): Uint8Array {
  const signingPayload: ValidateClawbackData = {
    senderPublicKey: params.senderPublicKey,
    sparkTransferId: params.sparkTransferId,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(signingPayload));
}

// V3 CONCENTRATED LIQUIDITY INTENT GENERATORS

/**
 * Generate the intent message for creating a concentrated liquidity pool (V3)
 * @param params Parameters for pool creation
 * @returns The serialized intent message as Uint8Array
 */
export function generateCreateConcentratedPoolIntentMessage(params: {
  poolOwnerPublicKey: string;
  assetAAddress: string;
  assetBAddress: string;
  tickSpacing: number;
  initialPrice: string;
  lpFeeRateBps: string;
  hostFeeRateBps: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateConcentratedPoolData = {
    poolOwnerPublicKey: params.poolOwnerPublicKey,
    assetAAddress: params.assetAAddress,
    assetBAddress: params.assetBAddress,
    tickSpacing: params.tickSpacing,
    initialPrice: params.initialPrice,
    lpFeeRateBps: params.lpFeeRateBps,
    hostFeeRateBps: params.hostFeeRateBps,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for increasing liquidity in a V3 position
 * @param params Parameters for increasing liquidity
 * @returns The serialized intent message as Uint8Array
 */
export function generateIncreaseLiquidityIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  tickLower: number;
  tickUpper: number;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  amountADesired: string;
  amountBDesired: string;
  amountAMin: string;
  amountBMin: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateIncreaseLiquidityData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    assetASparkTransferId: params.assetASparkTransferId,
    assetBSparkTransferId: params.assetBSparkTransferId,
    amountADesired: params.amountADesired,
    amountBDesired: params.amountBDesired,
    amountAMin: params.amountAMin,
    amountBMin: params.amountBMin,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for decreasing liquidity in a V3 position
 * @param params Parameters for decreasing liquidity
 * @returns The serialized intent message as Uint8Array
 */
export function generateDecreaseLiquidityIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  tickLower: number;
  tickUpper: number;
  liquidityToRemove: string;
  amountAMin: string;
  amountBMin: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateDecreaseLiquidityData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    liquidityToRemove: params.liquidityToRemove,
    amountAMin: params.amountAMin,
    amountBMin: params.amountBMin,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for collecting fees from a V3 position
 * @param params Parameters for collecting fees
 * @returns The serialized intent message as Uint8Array
 */
export function generateCollectFeesIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  tickLower: number;
  tickUpper: number;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateCollectFeesData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for rebalancing a V3 position to a new tick range
 * @param params Parameters for rebalancing position
 * @returns The serialized intent message as Uint8Array
 */
export function generateRebalancePositionIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  oldTickLower: number;
  oldTickUpper: number;
  newTickLower: number;
  newTickUpper: number;
  liquidityToMove: string;
  assetASparkTransferId?: string;
  assetBSparkTransferId?: string;
  additionalAmountA?: string;
  additionalAmountB?: string;
  nonce: string;
}): Uint8Array {
  // Note: Optional fields must be explicitly serialized as null to match TEE's proto serde behavior
  const intentMessage: ValidateRebalancePositionData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    oldTickLower: params.oldTickLower,
    oldTickUpper: params.oldTickUpper,
    newTickLower: params.newTickLower,
    newTickUpper: params.newTickUpper,
    liquidityToMove: params.liquidityToMove,
    assetASparkTransferId: params.assetASparkTransferId ?? null,
    assetBSparkTransferId: params.assetBSparkTransferId ?? null,
    additionalAmountA: params.additionalAmountA ?? null,
    additionalAmountB: params.additionalAmountB ?? null,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for withdrawing free balance from a V3 pool
 * @param params Parameters for withdrawing balance
 * @returns The serialized intent message as Uint8Array
 */
export function generateWithdrawBalanceIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  amountA: string;
  amountB: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateWithdrawBalanceData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    amountA: params.amountA,
    amountB: params.amountB,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for depositing to free balance in a V3 pool
 * @param params Parameters for depositing balance
 * @returns The serialized intent message as Uint8Array
 */
export function generateDepositBalanceIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  assetASparkTransferId: string;
  assetBSparkTransferId: string;
  amountA: string;
  amountB: string;
  nonce: string;
}): Uint8Array {
  const intentMessage: ValidateDepositBalanceData = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    assetASparkTransferId: params.assetASparkTransferId,
    assetBSparkTransferId: params.assetBSparkTransferId,
    amountA: params.amountA,
    amountB: params.amountB,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for locking an LP position
 * @param params Parameters for locking a position
 * @returns The serialized intent message as Uint8Array
 */
export function generateLockPositionIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  lockUntilTimestamp: string;
  tickLower?: number;
  tickUpper?: number;
  nonce: string;
}): Uint8Array {
  // Fail fast on non-integer input. parseInt("abc") / parseInt("") both
  // return NaN, which JSON.stringify serializes as `null`. Signing a
  // payload with a null timestamp produces a signature the server
  // cannot verify (or worse, that it coerces to a surprise value).
  const ts = Number(params.lockUntilTimestamp);
  if (
    !Number.isInteger(ts) ||
    ts < 0 ||
    String(params.lockUntilTimestamp).trim() !== String(ts)
  ) {
    throw new Error(
      `Invalid lockUntilTimestamp: "${params.lockUntilTimestamp}" is not a non-negative integer`
    );
  }

  const intentMessage = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    lockUntilTimestamp: ts,
    tickLower: params.tickLower ?? null,
    tickUpper: params.tickUpper ?? null,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

/**
 * Generate the intent message for transferring an LP position to a new owner.
 * Single-step: signing this hands off ownership on server acceptance. Verify
 * the recipient before signing.
 *
 * @param params Parameters for transferring a position
 * @returns The serialized intent message as Uint8Array
 */
export function generateTransferPositionIntentMessage(params: {
  userPublicKey: string;
  lpIdentityPublicKey: string;
  newOwnerPublicKey: string;
  tickLower?: number;
  tickUpper?: number;
  lpTokensToTransfer?: string;
  nonce: string;
}): Uint8Array {
  // Compare on lowercase so a different-case encoding of the same
  // compressed pubkey can't smuggle a self-transfer past this guard. The
  // server-side comparison is on the parsed PublicKey curve point (case-
  // insensitive by construction); mirror that here so the signature is
  // never produced for what the server will reject.
  if (
    params.newOwnerPublicKey.toLowerCase() ===
    params.userPublicKey.toLowerCase()
  ) {
    throw new Error(
      "Self-transfer not allowed: newOwnerPublicKey must differ from userPublicKey"
    );
  }

  // V3 shape: both ticks present and integer. V2 shape: both absent +
  // lpTokensToTransfer present. Mixed shape (one tick set, the other not)
  // is rejected up front so a malformed signature is never produced.
  //
  // Number.isInteger guards against NaN, Infinity, and non-integer values
  // — JSON.stringify would serialize a NaN tick to `null`, producing a
  // signed intent whose hash won't match what the server reconstructs.
  // Failing fast here gives the caller a clear local error.
  const tlSet = params.tickLower !== undefined && params.tickLower !== null;
  const tuSet = params.tickUpper !== undefined && params.tickUpper !== null;
  if (tlSet !== tuSet) {
    throw new Error(
      "tickLower and tickUpper must both be provided for V3, or both omitted for V2"
    );
  }
  // V2 shape requires lpTokensToTransfer; V3 shape requires the tick pair.
  // Refusing the all-empty case here mirrors the gateway's "Provide either
  // V3 tickLower+tickUpper or V2 lpTokensToTransfer" reject.
  const lpAmountSet =
    params.lpTokensToTransfer !== undefined &&
    params.lpTokensToTransfer !== null &&
    params.lpTokensToTransfer.length > 0;
  if (!tlSet && !tuSet && !lpAmountSet) {
    throw new Error(
      "Provide either V3 tickLower+tickUpper or V2 lpTokensToTransfer; neither was supplied"
    );
  }
  if (tlSet && tuSet && lpAmountSet) {
    throw new Error(
      "lpTokensToTransfer (V2) cannot be combined with tickLower/tickUpper (V3); use one or the other"
    );
  }
  if (tlSet && tuSet) {
    const tl = params.tickLower as number;
    const tu = params.tickUpper as number;
    if (!Number.isInteger(tl) || !Number.isInteger(tu)) {
      throw new Error(
        `Invalid tick value: tickLower=${tl}, tickUpper=${tu}; both must be integers`
      );
    }
    if (tl >= tu) {
      throw new Error("tickLower must be less than tickUpper");
    }
  }

  // V2 amount must be a non-empty positive-integer string. Mirrors the
  // gateway and TEE guards so all three layers agree on what a "valid
  // V2 transfer amount" is. Reject sign, decimal point, scientific
  // notation, leading zeros, whitespace, or any non-digit character.
  if (lpAmountSet) {
    const raw = params.lpTokensToTransfer as string;
    const valid =
      raw.length > 0 &&
      /^[1-9][0-9]*$/.test(raw); // strict positive integer, no leading zeros, no "0"
    if (!valid) {
      throw new Error(
        `Invalid lpTokensToTransfer: ${raw}; must be a positive integer string (digits only, no sign, no decimals, no leading zeros)`
      );
    }
  }

  const intentMessage = {
    userPublicKey: params.userPublicKey,
    lpIdentityPublicKey: params.lpIdentityPublicKey,
    newOwnerPublicKey: params.newOwnerPublicKey,
    tickLower: params.tickLower ?? null,
    tickUpper: params.tickUpper ?? null,
    lpTokensToTransfer: params.lpTokensToTransfer ?? null,
    nonce: params.nonce,
  };

  return new TextEncoder().encode(JSON.stringify(intentMessage));
}

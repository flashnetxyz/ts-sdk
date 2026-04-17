'use strict';

/**
 * Generates a pool initialization intent message
 * @param params Parameters for pool initialization
 * @returns The serialized intent message as ValidateAmmInitializeSingleSidedPoolData
 */
function generatePoolInitializationIntentMessage(params) {
    const intentMessage = {
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
function generateConstantProductPoolInitializationIntentMessage(params) {
    const intentMessage = {
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
function generatePoolConfirmInitialDepositIntentMessage(params) {
    const intentMessage = {
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
function generatePoolSwapIntentMessage(params) {
    // When using free balance, transfer ID is empty in the signed message
    // Backend determines useFreeBalance from whether transfer ID is empty
    const isUsingFreeBalance = params.useFreeBalance === true || !params.assetInSparkTransferId;
    const transferId = isUsingFreeBalance ? "" : params.assetInSparkTransferId;
    // Note: useFreeBalance is NOT in the signed message - backend derives it from empty transferId
    const intentMessage = {
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
function generateAddLiquidityIntentMessage(params) {
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
function generateRemoveLiquidityIntentMessage(params) {
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
function generateRegisterHostIntentMessage(params) {
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
function generateWithdrawHostFeesIntentMessage(params) {
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
function generateWithdrawIntegratorFeesIntentMessage(params) {
    const signingPayload = {
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
function generateRouteSwapIntentMessage(params) {
    const signingPayload = {
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
function generateCreateEscrowIntentMessage(params) {
    const intentMessage = {
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
function generateFundEscrowIntentMessage(params) {
    const intentMessage = {
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
function generateClaimEscrowIntentMessage(params) {
    const intentMessage = {
        escrowId: params.escrowId,
        recipientPublicKey: params.recipientPublicKey,
        nonce: params.nonce,
    };
    return new TextEncoder().encode(JSON.stringify(intentMessage));
}
/**
 * Generate the intent message for clawback
 */
function generateClawbackIntentMessage(params) {
    const signingPayload = {
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
function generateCreateConcentratedPoolIntentMessage(params) {
    const intentMessage = {
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
function generateIncreaseLiquidityIntentMessage(params) {
    const intentMessage = {
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
function generateDecreaseLiquidityIntentMessage(params) {
    const intentMessage = {
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
function generateCollectFeesIntentMessage(params) {
    const intentMessage = {
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
function generateRebalancePositionIntentMessage(params) {
    // Note: Optional fields must be explicitly serialized as null to match TEE's proto serde behavior
    const intentMessage = {
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
function generateWithdrawBalanceIntentMessage(params) {
    const intentMessage = {
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
function generateDepositBalanceIntentMessage(params) {
    const intentMessage = {
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

exports.generateAddLiquidityIntentMessage = generateAddLiquidityIntentMessage;
exports.generateClaimEscrowIntentMessage = generateClaimEscrowIntentMessage;
exports.generateClawbackIntentMessage = generateClawbackIntentMessage;
exports.generateCollectFeesIntentMessage = generateCollectFeesIntentMessage;
exports.generateConstantProductPoolInitializationIntentMessage = generateConstantProductPoolInitializationIntentMessage;
exports.generateCreateConcentratedPoolIntentMessage = generateCreateConcentratedPoolIntentMessage;
exports.generateCreateEscrowIntentMessage = generateCreateEscrowIntentMessage;
exports.generateDecreaseLiquidityIntentMessage = generateDecreaseLiquidityIntentMessage;
exports.generateDepositBalanceIntentMessage = generateDepositBalanceIntentMessage;
exports.generateFundEscrowIntentMessage = generateFundEscrowIntentMessage;
exports.generateIncreaseLiquidityIntentMessage = generateIncreaseLiquidityIntentMessage;
exports.generatePoolConfirmInitialDepositIntentMessage = generatePoolConfirmInitialDepositIntentMessage;
exports.generatePoolInitializationIntentMessage = generatePoolInitializationIntentMessage;
exports.generatePoolSwapIntentMessage = generatePoolSwapIntentMessage;
exports.generateRebalancePositionIntentMessage = generateRebalancePositionIntentMessage;
exports.generateRegisterHostIntentMessage = generateRegisterHostIntentMessage;
exports.generateRemoveLiquidityIntentMessage = generateRemoveLiquidityIntentMessage;
exports.generateRouteSwapIntentMessage = generateRouteSwapIntentMessage;
exports.generateWithdrawBalanceIntentMessage = generateWithdrawBalanceIntentMessage;
exports.generateWithdrawHostFeesIntentMessage = generateWithdrawHostFeesIntentMessage;
exports.generateWithdrawIntegratorFeesIntentMessage = generateWithdrawIntegratorFeesIntentMessage;
//# sourceMappingURL=intents.js.map

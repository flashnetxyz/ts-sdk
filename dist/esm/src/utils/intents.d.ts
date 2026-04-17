import type { AmmAddLiquiditySettlementRequest, AmmRemoveLiquiditySettlementRequest, EscrowCondition, EscrowRecipient, RouteHopValidation } from "../types";
/**
 * Generates a pool initialization intent message
 * @param params Parameters for pool initialization
 * @returns The serialized intent message as ValidateAmmInitializeSingleSidedPoolData
 */
export declare function generatePoolInitializationIntentMessage(params: {
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
}): Uint8Array;
/**
 * Generates a constant product pool initialization intent message
 * @param params Parameters for constant product pool initialization
 * @returns The serialized intent message as ValidateAmmInitializeConstantProductPoolData
 */
export declare function generateConstantProductPoolInitializationIntentMessage(params: {
    poolOwnerPublicKey: string;
    assetAAddress: string;
    assetBAddress: string;
    lpFeeRateBps: string;
    totalHostFeeRateBps: string;
    nonce: string;
}): Uint8Array;
/**
 * Generates a pool confirm initial deposit intent message
 * @param params Parameters for confirming initial deposit
 * @returns The serialized intent message
 */
export declare function generatePoolConfirmInitialDepositIntentMessage(params: {
    poolOwnerPublicKey: string;
    lpIdentityPublicKey: string;
    assetASparkTransferId: string;
    nonce: string;
}): Uint8Array;
/**
 * Generates a pool swap intent message
 * @param params Parameters for swap
 * @param params.useFreeBalance When true, uses free balance from V3 pool instead of a Spark transfer.
 *   The assetInSparkTransferId is set to empty string in the intent (backend derives useFreeBalance from this).
 *   Note: Only works for V3 concentrated liquidity pools. Does NOT work for route swaps.
 * @returns The serialized intent message
 */
export declare function generatePoolSwapIntentMessage(params: {
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
}): Uint8Array;
/**
 * Generate the intent message for adding liquidity
 */
export declare function generateAddLiquidityIntentMessage(params: AmmAddLiquiditySettlementRequest): Uint8Array;
/**
 * Generate the intent message for removing liquidity
 */
export declare function generateRemoveLiquidityIntentMessage(params: AmmRemoveLiquiditySettlementRequest): Uint8Array;
/**
 * Generate the intent message for registering a host
 */
export declare function generateRegisterHostIntentMessage(params: {
    namespace: string;
    minFeeBps: number;
    feeRecipientPublicKey: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for withdrawing host fees
 */
export declare function generateWithdrawHostFeesIntentMessage(params: {
    hostPublicKey: string;
    lpIdentityPublicKey: string;
    assetBAmount?: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for withdrawing integrator fees
 */
export declare function generateWithdrawIntegratorFeesIntentMessage(params: {
    integratorPublicKey: string;
    lpIdentityPublicKey: string;
    assetBAmount?: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for route swap
 */
export declare function generateRouteSwapIntentMessage(params: {
    userPublicKey: string;
    hops: RouteHopValidation[];
    initialSparkTransferId: string;
    inputAmount: string;
    maxRouteSlippageBps: string;
    minAmountOut: string;
    nonce: string;
    defaultIntegratorFeeRateBps?: string;
}): Uint8Array;
/**
 * Generates an escrow creation intent message.
 * @param params Parameters for creating an escrow.
 * @returns The serialized intent message.
 */
export declare function generateCreateEscrowIntentMessage(params: {
    creatorPublicKey: string;
    assetId: string;
    assetAmount: string;
    recipients: EscrowRecipient[];
    claimConditions: EscrowCondition[];
    abandonHost?: string;
    abandonConditions?: EscrowCondition[];
    nonce: string;
}): Uint8Array;
/**
 * Generates an escrow funding intent message.
 * @param params Parameters for funding an escrow.
 * @returns The serialized intent message.
 */
export declare function generateFundEscrowIntentMessage(params: {
    escrowId: string;
    creatorPublicKey: string;
    sparkTransferId: string;
    nonce: string;
}): Uint8Array;
/**
 * Generates an escrow claim intent message.
 * @param params Parameters for claiming from an escrow.
 * @returns The serialized intent message.
 */
export declare function generateClaimEscrowIntentMessage(params: {
    escrowId: string;
    recipientPublicKey: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for clawback
 */
export declare function generateClawbackIntentMessage(params: {
    senderPublicKey: string;
    sparkTransferId: string;
    lpIdentityPublicKey: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for creating a concentrated liquidity pool (V3)
 * @param params Parameters for pool creation
 * @returns The serialized intent message as Uint8Array
 */
export declare function generateCreateConcentratedPoolIntentMessage(params: {
    poolOwnerPublicKey: string;
    assetAAddress: string;
    assetBAddress: string;
    tickSpacing: number;
    initialPrice: string;
    lpFeeRateBps: string;
    hostFeeRateBps: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for increasing liquidity in a V3 position
 * @param params Parameters for increasing liquidity
 * @returns The serialized intent message as Uint8Array
 */
export declare function generateIncreaseLiquidityIntentMessage(params: {
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
}): Uint8Array;
/**
 * Generate the intent message for decreasing liquidity in a V3 position
 * @param params Parameters for decreasing liquidity
 * @returns The serialized intent message as Uint8Array
 */
export declare function generateDecreaseLiquidityIntentMessage(params: {
    userPublicKey: string;
    lpIdentityPublicKey: string;
    tickLower: number;
    tickUpper: number;
    liquidityToRemove: string;
    amountAMin: string;
    amountBMin: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for collecting fees from a V3 position
 * @param params Parameters for collecting fees
 * @returns The serialized intent message as Uint8Array
 */
export declare function generateCollectFeesIntentMessage(params: {
    userPublicKey: string;
    lpIdentityPublicKey: string;
    tickLower: number;
    tickUpper: number;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for rebalancing a V3 position to a new tick range
 * @param params Parameters for rebalancing position
 * @returns The serialized intent message as Uint8Array
 */
export declare function generateRebalancePositionIntentMessage(params: {
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
}): Uint8Array;
/**
 * Generate the intent message for withdrawing free balance from a V3 pool
 * @param params Parameters for withdrawing balance
 * @returns The serialized intent message as Uint8Array
 */
export declare function generateWithdrawBalanceIntentMessage(params: {
    userPublicKey: string;
    lpIdentityPublicKey: string;
    amountA: string;
    amountB: string;
    nonce: string;
}): Uint8Array;
/**
 * Generate the intent message for depositing to free balance in a V3 pool
 * @param params Parameters for depositing balance
 * @returns The serialized intent message as Uint8Array
 */
export declare function generateDepositBalanceIntentMessage(params: {
    userPublicKey: string;
    lpIdentityPublicKey: string;
    assetASparkTransferId: string;
    assetBSparkTransferId: string;
    amountA: string;
    amountB: string;
    nonce: string;
}): Uint8Array;
//# sourceMappingURL=intents.d.ts.map
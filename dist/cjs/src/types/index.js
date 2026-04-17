'use strict';

// TYPE CONVERSION UTILITIES
/**
 * Maps legacy NetworkType to SparkNetworkType
 * @deprecated For migration purposes only
 */
function getSparkNetworkFromLegacy(networkType) {
    // LOCAL maps to REGTEST for Spark operations
    return networkType === "LOCAL"
        ? "REGTEST"
        : networkType;
}
/**
 * Maps legacy NetworkType to ClientEnvironment
 * @deprecated For migration purposes only
 */
function getClientEnvironmentFromLegacy(networkType) {
    return networkType.toLowerCase();
}
// Define Network enum locally to avoid spark-sdk dependency
exports.Network = void 0;
(function (Network) {
    Network[Network["MAINNET"] = 0] = "MAINNET";
    Network[Network["REGTEST"] = 1] = "REGTEST";
})(exports.Network || (exports.Network = {}));
/**
 * Time comparison types for time-based conditions.
 */
exports.TimeComparison = void 0;
(function (TimeComparison) {
    TimeComparison[TimeComparison["TIME_COMPARISON_UNSPECIFIED"] = 0] = "TIME_COMPARISON_UNSPECIFIED";
    TimeComparison[TimeComparison["TIME_COMPARISON_AFTER"] = 1] = "TIME_COMPARISON_AFTER";
    TimeComparison[TimeComparison["TIME_COMPARISON_BEFORE"] = 2] = "TIME_COMPARISON_BEFORE";
    TimeComparison[TimeComparison["TIME_COMPARISON_BETWEEN"] = 3] = "TIME_COMPARISON_BETWEEN";
})(exports.TimeComparison || (exports.TimeComparison = {}));
/**
 * AMM phase values for AMM state conditions.
 */
exports.AmmPhase = void 0;
(function (AmmPhase) {
    AmmPhase[AmmPhase["AMM_PHASE_UNSPECIFIED"] = 0] = "AMM_PHASE_UNSPECIFIED";
    AmmPhase[AmmPhase["AMM_PHASE_SINGLE_SIDED"] = 1] = "AMM_PHASE_SINGLE_SIDED";
    AmmPhase[AmmPhase["AMM_PHASE_DOUBLE_SIDED"] = 2] = "AMM_PHASE_DOUBLE_SIDED";
    AmmPhase[AmmPhase["AMM_PHASE_GRADUATED"] = 3] = "AMM_PHASE_GRADUATED";
})(exports.AmmPhase || (exports.AmmPhase = {}));
/**
 * AMM state check types for intent validation.
 */
exports.AmmStateCheckType = void 0;
(function (AmmStateCheckType) {
    AmmStateCheckType[AmmStateCheckType["PHASE"] = 0] = "PHASE";
    AmmStateCheckType[AmmStateCheckType["MINIMUM_RESERVE"] = 1] = "MINIMUM_RESERVE";
    AmmStateCheckType[AmmStateCheckType["EXISTS"] = 2] = "EXISTS";
})(exports.AmmStateCheckType || (exports.AmmStateCheckType = {}));
/**
 * Types of conditions for escrow for intent validation.
 */
exports.ConditionType = void 0;
(function (ConditionType) {
    ConditionType[ConditionType["TIME"] = 0] = "TIME";
    ConditionType[ConditionType["AMM_STATE"] = 1] = "AMM_STATE";
    ConditionType[ConditionType["LOGICAL"] = 2] = "LOGICAL";
})(exports.ConditionType || (exports.ConditionType = {}));
/**
 * Validates that a single-sided pool threshold is within acceptable range (20%-90% of initial reserve)
 * @param threshold - Amount of asset A that must be sold to graduate to constant product
 * @param assetAInitialReserve - Initial reserve amount for asset A
 * @returns Validation result with error message if invalid
 */
function validateSingleSidedPoolThreshold(threshold, assetAInitialReserve) {
    try {
        const thresholdNum = BigInt(threshold);
        const initialReserveNum = BigInt(assetAInitialReserve);
        if (thresholdNum <= 0n || initialReserveNum <= 0n) {
            return {
                isValid: false,
                error: "Threshold and initial reserve must be positive values",
            };
        }
        // Calculate 20% and 90% thresholds
        const minThreshold = (initialReserveNum * BigInt(20)) / BigInt(100); // 20%
        const maxThreshold = (initialReserveNum * BigInt(90)) / BigInt(100); // 90%
        if (thresholdNum < minThreshold) {
            return {
                isValid: false,
                error: `Threshold must be at least 20% of initial reserve (minimum: ${minThreshold.toString()})`,
            };
        }
        if (thresholdNum > maxThreshold) {
            return {
                isValid: false,
                error: `Threshold must not exceed 90% of initial reserve (maximum: ${maxThreshold.toString()})`,
            };
        }
        return { isValid: true };
    }
    catch (_error) {
        return {
            isValid: false,
            error: "Invalid number format for threshold or initial reserve",
        };
    }
}
/**
 * Calculates the percentage that a threshold represents of the initial reserve
 * @param threshold - Amount of asset A that must be sold
 * @param assetAInitialReserve - Initial reserve amount for asset A
 * @returns Percentage as a number (e.g., 25.5 for 25.5%)
 */
function calculateThresholdPercentage(threshold, assetAInitialReserve) {
    try {
        const thresholdNum = BigInt(threshold);
        const initialReserveNum = BigInt(assetAInitialReserve);
        if (initialReserveNum === 0n) {
            return 0;
        }
        // Calculate percentage with precision
        const percentage = (thresholdNum * BigInt(10000)) / initialReserveNum;
        return Number(percentage) / 100; // Convert back to percentage
    }
    catch (_error) {
        return 0;
    }
}

exports.calculateThresholdPercentage = calculateThresholdPercentage;
exports.getClientEnvironmentFromLegacy = getClientEnvironmentFromLegacy;
exports.getSparkNetworkFromLegacy = getSparkNetworkFromLegacy;
exports.validateSingleSidedPoolThreshold = validateSingleSidedPoolThreshold;
//# sourceMappingURL=index.js.map

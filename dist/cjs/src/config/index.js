'use strict';

/**
 * Client network configurations mapped by environment
 * Each environment can be combined with any Spark network type
 */
const CLIENT_NETWORK_CONFIGS = {
    mainnet: {
        ammGatewayUrl: "https://api.flashnet.xyz",
        mempoolApiUrl: "https://mempool.space",
        explorerUrl: "https://mempool.space",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    regtest: {
        ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    testnet: {
        ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    signet: {
        ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    local: {
        ammGatewayUrl: "http://localhost:8090",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
};
/**
 * Get client network configuration by environment
 * @param environment The client environment
 * @returns Client network configuration
 */
function getClientNetworkConfig(environment) {
    const config = CLIENT_NETWORK_CONFIGS[environment];
    if (!config) {
        throw new Error(`Unknown client environment: ${environment}`);
    }
    return config;
}
/**
 * Maps client environment to default Spark network type
 * This is used for backward compatibility and sensible defaults
 * @param environment The client environment
 * @returns Default Spark network type for the environment
 */
function getDefaultSparkNetworkForEnvironment(environment) {
    switch (environment) {
        case "mainnet":
            return "MAINNET";
        case "regtest":
        case "local":
            return "REGTEST";
        case "testnet":
            return "TESTNET";
        case "signet":
            return "SIGNET";
        default:
            throw new Error(`Unknown client environment: ${environment}`);
    }
}
/**
 * Validates a custom client network configuration
 * @param config Custom client network configuration
 * @returns Validation result with error details if invalid
 */
function validateClientNetworkConfig(config) {
    const errors = [];
    if (!config.ammGatewayUrl || typeof config.ammGatewayUrl !== "string") {
        errors.push("ammGatewayUrl is required and must be a string");
    }
    if (!config.mempoolApiUrl || typeof config.mempoolApiUrl !== "string") {
        errors.push("mempoolApiUrl is required and must be a string");
    }
    if (!config.explorerUrl || typeof config.explorerUrl !== "string") {
        errors.push("explorerUrl is required and must be a string");
    }
    // sparkScanUrl is optional
    if (config.sparkScanUrl && typeof config.sparkScanUrl !== "string") {
        errors.push("sparkScanUrl must be a string if provided");
    }
    // Validate URL formats
    const urlFields = [
        { name: "ammGatewayUrl", value: config.ammGatewayUrl },
        { name: "mempoolApiUrl", value: config.mempoolApiUrl },
        { name: "explorerUrl", value: config.explorerUrl },
    ];
    if (config.sparkScanUrl) {
        urlFields.push({ name: "sparkScanUrl", value: config.sparkScanUrl });
    }
    for (const field of urlFields) {
        if (field.value) {
            try {
                new URL(field.value);
            }
            catch {
                errors.push(`${field.name} must be a valid URL`);
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
/**
 * Resolves client configuration from either environment name or custom config
 * @param clientConfig Either a ClientEnvironment string or ClientNetworkConfig object
 * @returns Resolved ClientNetworkConfig
 */
function resolveClientNetworkConfig(clientConfig) {
    // Check if it's a string (environment name)
    if (typeof clientConfig === "string") {
        return getClientNetworkConfig(clientConfig);
    }
    // It's a custom configuration object - validate it
    const validation = validateClientNetworkConfig(clientConfig);
    if (!validation.valid) {
        throw new Error(`Invalid client network configuration: ${validation.errors.join(", ")}`);
    }
    return clientConfig;
}
/**
 * Determines the client environment from a configuration
 * @param clientConfig Either a ClientEnvironment string or ClientNetworkConfig object
 * @returns ClientEnvironment name or 'custom' for custom configs
 */
function getClientEnvironmentName(clientConfig) {
    if (typeof clientConfig === "string") {
        return clientConfig;
    }
    // Try to match against known environments
    for (const [envName, envConfig] of Object.entries(CLIENT_NETWORK_CONFIGS)) {
        if (envConfig.ammGatewayUrl === clientConfig.ammGatewayUrl &&
            envConfig.mempoolApiUrl === clientConfig.mempoolApiUrl &&
            envConfig.explorerUrl === clientConfig.explorerUrl &&
            envConfig.sparkScanUrl === clientConfig.sparkScanUrl) {
            return envName;
        }
    }
    return "custom";
}
// BACKWARD COMPATIBILITY LAYER
/**
 * @deprecated Use CLIENT_NETWORK_CONFIGS with getClientNetworkConfig() instead
 * This will be removed in v3.0.0
 */
const NETWORK_CONFIGS = {
    MAINNET: {
        ammGatewayUrl: "https://api.flashnet.xyz",
        mempoolApiUrl: "https://mempool.space",
        explorerUrl: "https://mempool.space",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    REGTEST: {
        ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    TESTNET: {
        ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    SIGNET: {
        ammGatewayUrl: "https://api.amm.makebitcoingreatagain.dev",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
    LOCAL: {
        ammGatewayUrl: "http://localhost:8090",
        mempoolApiUrl: "https://mempool.regtest.flashnet.xyz",
        explorerUrl: "https://mempool.regtest.flashnet.xyz",
        sparkScanUrl: "https://api.sparkscan.io",
    },
};
/**
 * @deprecated Use getClientNetworkConfig() instead
 * This will be removed in v3.0.0
 */
function getNetworkConfig(network) {
    return NETWORK_CONFIGS[network];
}
const BTC_ASSET_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202";
const BTC_DECIMALS = 8;
const DEFAULT_SLIPPAGE_BPS = 500; // 5%
const DEFAULT_HOST_NAMESPACE = "flashnet_pools";

exports.BTC_ASSET_PUBKEY = BTC_ASSET_PUBKEY;
exports.BTC_DECIMALS = BTC_DECIMALS;
exports.CLIENT_NETWORK_CONFIGS = CLIENT_NETWORK_CONFIGS;
exports.DEFAULT_HOST_NAMESPACE = DEFAULT_HOST_NAMESPACE;
exports.DEFAULT_SLIPPAGE_BPS = DEFAULT_SLIPPAGE_BPS;
exports.NETWORK_CONFIGS = NETWORK_CONFIGS;
exports.getClientEnvironmentName = getClientEnvironmentName;
exports.getClientNetworkConfig = getClientNetworkConfig;
exports.getDefaultSparkNetworkForEnvironment = getDefaultSparkNetworkForEnvironment;
exports.getNetworkConfig = getNetworkConfig;
exports.resolveClientNetworkConfig = resolveClientNetworkConfig;
exports.validateClientNetworkConfig = validateClientNetworkConfig;
//# sourceMappingURL=index.js.map

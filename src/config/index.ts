import type { 
  NetworkType, 
  SparkNetworkType, 
  ClientEnvironment, 
  ClientNetworkConfig 
} from "../types";

export interface NetworkConfig {
  ammGatewayUrl: string;
  mempoolApiUrl: string;
  explorerUrl: string;
  sparkScanUrl?: string;
}

/**
 * Client network configurations mapped by environment
 * Each environment can be combined with any Spark network type
 */
export const CLIENT_NETWORK_CONFIGS: Record<ClientEnvironment, ClientNetworkConfig> = {
  mainnet: {
    ammGatewayUrl: "https://api.amm.flashnet.xyz",
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
export function getClientNetworkConfig(environment: ClientEnvironment): ClientNetworkConfig {
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
export function getDefaultSparkNetworkForEnvironment(environment: ClientEnvironment): SparkNetworkType {
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
 * Validates that a Spark network and client environment combination is valid
 * Currently all combinations are allowed, but this function exists for future restrictions
 * @param sparkNetwork The Spark network type
 * @param clientEnvironment The client environment
 * @returns Validation result with error message if invalid
 */
export function validateNetworkCombination(
  sparkNetwork: SparkNetworkType,
  clientEnvironment: ClientEnvironment
): { valid: boolean; error?: string } {
  // For now, all combinations are valid
  // This function exists for future restrictions if needed
  return { valid: true };
}

/**
 * Validates a custom client network configuration
 * @param config Custom client network configuration
 * @returns Validation result with error details if invalid
 */
export function validateClientNetworkConfig(config: ClientNetworkConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.ammGatewayUrl || typeof config.ammGatewayUrl !== 'string') {
    errors.push('ammGatewayUrl is required and must be a string');
  }
  
  if (!config.mempoolApiUrl || typeof config.mempoolApiUrl !== 'string') {
    errors.push('mempoolApiUrl is required and must be a string');
  }
  
  if (!config.explorerUrl || typeof config.explorerUrl !== 'string') {
    errors.push('explorerUrl is required and must be a string');
  }
  
  // sparkScanUrl is optional
  if (config.sparkScanUrl && typeof config.sparkScanUrl !== 'string') {
    errors.push('sparkScanUrl must be a string if provided');
  }
  
  // Validate URL formats
  const urlFields = [
    { name: 'ammGatewayUrl', value: config.ammGatewayUrl },
    { name: 'mempoolApiUrl', value: config.mempoolApiUrl },
    { name: 'explorerUrl', value: config.explorerUrl },
  ];
  
  if (config.sparkScanUrl) {
    urlFields.push({ name: 'sparkScanUrl', value: config.sparkScanUrl });
  }
  
  for (const field of urlFields) {
    if (field.value) {
      try {
        new URL(field.value);
      } catch {
        errors.push(`${field.name} must be a valid URL`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Resolves client configuration from either environment name or custom config
 * @param clientConfig Either a ClientEnvironment string or ClientNetworkConfig object
 * @returns Resolved ClientNetworkConfig
 */
export function resolveClientNetworkConfig(
  clientConfig: ClientEnvironment | ClientNetworkConfig
): ClientNetworkConfig {
  // Check if it's a string (environment name)
  if (typeof clientConfig === 'string') {
    return getClientNetworkConfig(clientConfig);
  }
  
  // It's a custom configuration object - validate it
  const validation = validateClientNetworkConfig(clientConfig);
  if (!validation.valid) {
    throw new Error(`Invalid client network configuration: ${validation.errors.join(', ')}`);
  }
  
  return clientConfig;
}

/**
 * Determines the client environment from a configuration
 * @param clientConfig Either a ClientEnvironment string or ClientNetworkConfig object
 * @returns ClientEnvironment name or 'custom' for custom configs
 */
export function getClientEnvironmentName(
  clientConfig: ClientEnvironment | ClientNetworkConfig
): ClientEnvironment | 'custom' {
  if (typeof clientConfig === 'string') {
    return clientConfig;
  }
  
  // Try to match against known environments
  for (const [envName, envConfig] of Object.entries(CLIENT_NETWORK_CONFIGS)) {
    if (
      envConfig.ammGatewayUrl === clientConfig.ammGatewayUrl &&
      envConfig.mempoolApiUrl === clientConfig.mempoolApiUrl &&
      envConfig.explorerUrl === clientConfig.explorerUrl &&
      envConfig.sparkScanUrl === clientConfig.sparkScanUrl
    ) {
      return envName as ClientEnvironment;
    }
  }
  
  return 'custom';
}

// ===== BACKWARD COMPATIBILITY LAYER =====

/**
 * @deprecated Use CLIENT_NETWORK_CONFIGS with getClientNetworkConfig() instead
 * This will be removed in v3.0.0
 */
export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  MAINNET: {
    ammGatewayUrl: "https://api.amm.flashnet.xyz",
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
export function getNetworkConfig(network: NetworkType): NetworkConfig {
  return NETWORK_CONFIGS[network];
}

export const BTC_ASSET_PUBKEY =
  "020202020202020202020202020202020202020202020202020202020202020202";
export const BTC_DECIMALS = 8;
export const DEFAULT_SLIPPAGE_BPS = 500; // 5%
export const DEFAULT_HOST_NAMESPACE = "flashnet_pools";

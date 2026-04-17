import type { ClientEnvironment, ClientNetworkConfig, NetworkType, SparkNetworkType } from "../types";
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
export declare const CLIENT_NETWORK_CONFIGS: Record<ClientEnvironment, ClientNetworkConfig>;
/**
 * Get client network configuration by environment
 * @param environment The client environment
 * @returns Client network configuration
 */
export declare function getClientNetworkConfig(environment: ClientEnvironment): ClientNetworkConfig;
/**
 * Maps client environment to default Spark network type
 * This is used for backward compatibility and sensible defaults
 * @param environment The client environment
 * @returns Default Spark network type for the environment
 */
export declare function getDefaultSparkNetworkForEnvironment(environment: ClientEnvironment): SparkNetworkType;
/**
 * Validates a custom client network configuration
 * @param config Custom client network configuration
 * @returns Validation result with error details if invalid
 */
export declare function validateClientNetworkConfig(config: ClientNetworkConfig): {
    valid: boolean;
    errors: string[];
};
/**
 * Resolves client configuration from either environment name or custom config
 * @param clientConfig Either a ClientEnvironment string or ClientNetworkConfig object
 * @returns Resolved ClientNetworkConfig
 */
export declare function resolveClientNetworkConfig(clientConfig: ClientEnvironment | ClientNetworkConfig): ClientNetworkConfig;
/**
 * Determines the client environment from a configuration
 * @param clientConfig Either a ClientEnvironment string or ClientNetworkConfig object
 * @returns ClientEnvironment name or 'custom' for custom configs
 */
export declare function getClientEnvironmentName(clientConfig: ClientEnvironment | ClientNetworkConfig): ClientEnvironment | "custom";
/**
 * @deprecated Use CLIENT_NETWORK_CONFIGS with getClientNetworkConfig() instead
 * This will be removed in v3.0.0
 */
export declare const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig>;
/**
 * @deprecated Use getClientNetworkConfig() instead
 * This will be removed in v3.0.0
 */
export declare function getNetworkConfig(network: NetworkType): NetworkConfig;
export declare const BTC_ASSET_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202";
export declare const BTC_DECIMALS = 8;
export declare const DEFAULT_SLIPPAGE_BPS = 500;
export declare const DEFAULT_HOST_NAMESPACE = "flashnet_pools";
//# sourceMappingURL=index.d.ts.map
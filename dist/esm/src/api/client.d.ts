import type { NetworkConfig } from "../config";
import type { ClientNetworkConfig } from "../types";
export interface RequestOptions {
    headers?: Record<string, string>;
    body?: any;
    params?: Record<string, string | number>;
}
export declare class ApiClient {
    private config;
    private authToken?;
    /**
     * Create an ApiClient with new ClientNetworkConfig
     * @param config Client network configuration
     */
    constructor(config: ClientNetworkConfig);
    /**
     * @deprecated Use ClientNetworkConfig instead of NetworkConfig
     * Create an ApiClient with legacy NetworkConfig for backward compatibility
     * @param config Legacy network configuration
     */
    constructor(config: NetworkConfig);
    setAuthToken(token: string): void;
    private makeRequest;
    ammPost<T>(path: string, body: any, options?: RequestOptions): Promise<T>;
    ammGet<T>(path: string, options?: RequestOptions): Promise<T>;
    mempoolGet<T>(path: string, options?: RequestOptions): Promise<T>;
    sparkScanGet<T>(path: string, options?: RequestOptions): Promise<T>;
}
//# sourceMappingURL=client.d.ts.map
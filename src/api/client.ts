import type { NetworkConfig } from "../config";
import type { ClientNetworkConfig } from "../types";
import { FlashnetError, type FlashnetErrorResponseBody } from "../types/errors";

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number>;
}

export class ApiClient {
  private config: ClientNetworkConfig;
  private authToken?: string;

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

  constructor(config: ClientNetworkConfig | NetworkConfig) {
    this.config = config as ClientNetworkConfig;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  private async makeRequest<T>(
    url: string,
    method: string,
    options?: RequestOptions
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options?.headers,
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    const requestOptions: RequestInit = {
      method,
      headers,
    };

    if (options?.body && method !== "GET") {
      requestOptions.body = JSON.stringify(options.body);
    }

    // Add query parameters if provided
    let finalUrl = url;
    if (options?.params) {
      const params = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        params.append(key, value.toString());
      });
      finalUrl = `${url}?${params.toString()}`;
    }

    const response = await fetch(finalUrl, requestOptions);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as
        | FlashnetErrorResponseBody
        | {
            message?: string;
            msg?: string;
            error?: unknown;
            details?: unknown;
            code?: number;
          }
        | null;

      // Check if it's a structured FlashnetError response
      if (
        errorData &&
        "errorCode" in errorData &&
        typeof errorData.errorCode === "string"
      ) {
        throw FlashnetError.fromResponse(
          errorData as FlashnetErrorResponseBody,
          response.status
        );
      }

      // Legacy/fallback error handling for non-structured errors
      const legacyError = errorData as {
        message?: string;
        msg?: string;
      } | null;
      const message =
        legacyError?.message ??
        legacyError?.msg ??
        `HTTP error! status: ${response.status}`;

      // Create error with additional properties for backwards compatibility
      const error: Error & {
        status?: number;
        response?: { status: number; data: unknown };
        request?: { url: string; method: string; body?: unknown };
      } = new Error(message);
      error.status = response.status;
      error.response = { status: response.status, data: errorData };
      error.request = { url: finalUrl, method, body: options?.body };

      throw error;
    }

    return response.json() as Promise<T>;
  }

  // AMM Gateway endpoints
  async ammPost<T>(
    path: string,
    body: any,
    options?: RequestOptions
  ): Promise<T> {
    return this.makeRequest<T>(`${this.config.ammGatewayUrl}${path}`, "POST", {
      ...options,
      body,
    });
  }

  async ammGet<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(
      `${this.config.ammGatewayUrl}${path}`,
      "GET",
      options
    );
  }

  // Mempool API endpoints
  async mempoolGet<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>(
      `${this.config.mempoolApiUrl}${path}`,
      "GET",
      options
    );
  }

  // SparkScan API endpoints (if available)
  async sparkScanGet<T>(path: string, options?: RequestOptions): Promise<T> {
    if (!this.config.sparkScanUrl) {
      throw new Error("SparkScan URL not configured for this network");
    }
    return this.makeRequest<T>(
      `${this.config.sparkScanUrl}${path}`,
      "GET",
      options
    );
  }
}

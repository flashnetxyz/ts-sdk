import type { NetworkConfig } from "../config";
import type { FlashnetErrorResponse, ApiErrorResponse } from "../types";

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number>;
}

export class ApiClient {
  private config: NetworkConfig;
  private authToken?: string;

  constructor(config: NetworkConfig) {
    this.config = config;
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
      const errorData = (await response.json().catch(() => null)) as {
        message?: string;
        msg?: string;
        error?: any;
        details?: any;
        code?: number;
      } | null;

      // Log detailed error info for debugging
      if (response.status === 400 || response.status === 422) {
        console.error(`\n❌ API Error (${response.status}):`);
        console.error("URL:", finalUrl);
        console.error("Method:", method);
        if (options?.body) {
          console.error("Request body:", JSON.stringify(options.body, null, 2));
        }
        if (errorData) {
          console.error("Error response:", JSON.stringify(errorData, null, 2));
        }
      }

      // Create error with additional properties
      const error: any = new Error(
        errorData?.message ||
          errorData?.msg ||
          `HTTP error! status: ${response.status}`
      );
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

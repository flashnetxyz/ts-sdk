'use strict';

var errors = require('../types/errors.js');

class ApiClient {
    config;
    authToken;
    constructor(config) {
        this.config = config;
    }
    setAuthToken(token) {
        this.authToken = token;
    }
    async makeRequest(url, method, options) {
        const headers = {
            "Content-Type": "application/json",
            ...options?.headers,
        };
        if (this.authToken) {
            headers.Authorization = `Bearer ${this.authToken}`;
        }
        const requestOptions = {
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
            const errorData = (await response.json().catch(() => null));
            // Check if it's a structured FlashnetError response
            if (errorData &&
                "errorCode" in errorData &&
                typeof errorData.errorCode === "string") {
                throw errors.FlashnetError.fromResponse(errorData, response.status);
            }
            // Legacy/fallback error handling for non-structured errors
            const legacyError = errorData;
            const message = legacyError?.message ??
                legacyError?.msg ??
                `HTTP error! status: ${response.status}`;
            // Create error with additional properties for backwards compatibility
            const error = new Error(message);
            error.status = response.status;
            error.response = { status: response.status, data: errorData };
            error.request = { url: finalUrl, method, body: options?.body };
            throw error;
        }
        return response.json();
    }
    // AMM Gateway endpoints
    async ammPost(path, body, options) {
        return this.makeRequest(`${this.config.ammGatewayUrl}${path}`, "POST", {
            ...options,
            body,
        });
    }
    async ammGet(path, options) {
        return this.makeRequest(`${this.config.ammGatewayUrl}${path}`, "GET", options);
    }
    // Mempool API endpoints
    async mempoolGet(path, options) {
        return this.makeRequest(`${this.config.mempoolApiUrl}${path}`, "GET", options);
    }
    // SparkScan API endpoints (if available)
    async sparkScanGet(path, options) {
        if (!this.config.sparkScanUrl) {
            throw new Error("SparkScan URL not configured for this network");
        }
        return this.makeRequest(`${this.config.sparkScanUrl}${path}`, "GET", options);
    }
}

exports.ApiClient = ApiClient;
//# sourceMappingURL=client.js.map

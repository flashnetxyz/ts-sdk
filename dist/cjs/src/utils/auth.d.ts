import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import type { ApiClient } from "../api/client";
import type { Signer } from "../types";
export declare class AuthManager {
    private apiClient;
    private wallet?;
    private signer?;
    private pubkey;
    /**
     * Create an AuthManager with either a wallet or a custom signer
     * @param apiClient - The API client instance
     * @param pubkey - The public key associated with the signer
     * @param signerOrWallet - Either a Spark wallet or a custom signer
     */
    constructor(apiClient: ApiClient, pubkey: string, signerOrWallet: IssuerSparkWallet | SparkWallet | Signer);
    /**
     * Sign a message with either the wallet's identity key or the custom signer
     */
    private signMessage;
    /**
     * Authenticate with the AMM API and get an access token
     */
    authenticate(): Promise<string>;
}
//# sourceMappingURL=auth.d.ts.map
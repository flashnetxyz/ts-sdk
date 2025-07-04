import type { IssuerSparkWallet } from "@buildonspark/issuer-sdk";
import type { ApiClient } from "../api/client";
import type {
  ChallengeRequestData,
  ChallengeResponseData,
  VerifyRequestData,
  VerifyResponseData,
  Signer,
} from "../types";
import type { SparkWallet } from "@buildonspark/spark-sdk";

export class AuthManager {
  private apiClient: ApiClient;
  private wallet?: IssuerSparkWallet | SparkWallet;
  private signer?: Signer;
  private pubkey: string;

  /**
   * Create an AuthManager with either a wallet or a custom signer
   * @param apiClient - The API client instance
   * @param pubkey - The public key associated with the signer
   * @param signerOrWallet - Either a Spark wallet or a custom signer
   */
  constructor(
    apiClient: ApiClient,
    pubkey: string,
    signerOrWallet: IssuerSparkWallet | SparkWallet | Signer
  ) {
    this.apiClient = apiClient;
    this.pubkey = pubkey;

    // Check if it's a wallet (has getIdentityPublicKey method) or a signer
    if ("getIdentityPublicKey" in signerOrWallet) {
      this.wallet = signerOrWallet;
    } else {
      this.signer = signerOrWallet;
    }
  }

  /**
   * Sign a message with either the wallet's identity key or the custom signer
   */
  private async signMessage(message: string): Promise<string> {
    try {
      const messageBytes = message.startsWith("0x")
        ? Buffer.from(message.slice(2), "hex")
        : Buffer.from(message, "hex");

      const messageHash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", messageBytes)
      );

      let signature: Uint8Array;

      if (this.wallet) {
        // Use wallet signing
        signature =
          // @ts-expect-error
          await this.wallet.config.signer.signMessageWithIdentityKey(
            messageHash,
            true
          );
      } else if (this.signer) {
        // Use custom signer
        signature = await this.signer.signMessage(messageHash);
      } else {
        throw new Error("No wallet or signer available");
      }

      return Buffer.from(signature).toString("hex");
    } catch (error) {
      throw new Error(
        `Failed to sign message: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Authenticate with the AMM API and get an access token
   */
  async authenticate(): Promise<string> {
    try {
      // Step 1: Get challenge
      const challengeRequest: ChallengeRequestData = {
        publicKey: this.pubkey,
      };

      const challengeResponse =
        await this.apiClient.ammPost<ChallengeResponseData>(
          "/v1/auth/challenge",
          challengeRequest
        );

      if (!challengeResponse.challenge) {
        throw new Error("No challenge received from server");
      }

      // Step 2: Sign the challenge
      const signature = await this.signMessage(challengeResponse.challenge);

      // Step 3: Verify signature and get access token
      const verifyRequest: VerifyRequestData = {
        publicKey: this.pubkey,
        signature,
      };

      const verifyResponse = await this.apiClient.ammPost<VerifyResponseData>(
        "/v1/auth/verify",
        verifyRequest
      );

      if (!verifyResponse.accessToken) {
        throw new Error("No access token received from server");
      }

      // Set the token in the API client
      this.apiClient.setAuthToken(verifyResponse.accessToken);

      return verifyResponse.accessToken;
    } catch (error) {
      throw new Error(
        `Authentication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

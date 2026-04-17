import sha256 from 'fast-sha256';
import { getUint8ArrayFromHex, getHexFromUint8Array } from './hex.js';

class AuthManager {
    apiClient;
    wallet;
    signer;
    pubkey;
    /**
     * Create an AuthManager with either a wallet or a custom signer
     * @param apiClient - The API client instance
     * @param pubkey - The public key associated with the signer
     * @param signerOrWallet - Either a Spark wallet or a custom signer
     */
    constructor(apiClient, pubkey, signerOrWallet) {
        this.apiClient = apiClient;
        this.pubkey = pubkey;
        // Check if it's a wallet (has signMessageWithIdentityKey method) or a custom signer
        if ("signMessageWithIdentityKey" in signerOrWallet) {
            this.wallet = signerOrWallet;
        }
        else {
            this.signer = signerOrWallet;
        }
    }
    /**
     * Sign a message with either the wallet's identity key or the custom signer
     */
    async signMessage(message) {
        try {
            if (this.wallet) {
                // Use wallet's public signMessageWithIdentityKey method
                // It expects a UTF-8 string, hashes it internally, and returns hex
                return await this.wallet.signMessageWithIdentityKey(message, true);
            }
            else if (this.signer) {
                // Use custom signer - signs raw bytes
                const messageBytes = message.startsWith("0x")
                    ? getUint8ArrayFromHex(message.slice(2))
                    : getUint8ArrayFromHex(message);
                const messageHash = sha256(messageBytes);
                const signature = await this.signer.signMessage(messageHash);
                return getHexFromUint8Array(signature);
            }
            else {
                throw new Error("No wallet or signer available");
            }
        }
        catch (error) {
            throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    /**
     * Authenticate with the AMM API and get an access token
     */
    async authenticate() {
        try {
            // Step 1: Get challenge
            const challengeRequest = {
                publicKey: this.pubkey,
            };
            const challengeResponse = await this.apiClient.ammPost("/v1/auth/challenge", challengeRequest);
            if (!challengeResponse.challenge) {
                throw new Error("No challenge received from server");
            }
            // Step 2: Sign the challenge
            // Use challengeString if available (UTF-8 friendly for wallets)
            // Otherwise use challenge (hex string - backend accepts both)
            const messageToSign = challengeResponse.challengeString;
            const signature = await this.signMessage(messageToSign);
            // Step 3: Verify signature and get access token
            const verifyRequest = {
                publicKey: this.pubkey,
                signature,
            };
            const verifyResponse = await this.apiClient.ammPost("/v1/auth/verify", verifyRequest);
            if (!verifyResponse.accessToken) {
                throw new Error("No access token received from server");
            }
            // Set the token in the API client
            this.apiClient.setAuthToken(verifyResponse.accessToken);
            return verifyResponse.accessToken;
        }
        catch (error) {
            throw new Error(`Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}

export { AuthManager };
//# sourceMappingURL=auth.js.map

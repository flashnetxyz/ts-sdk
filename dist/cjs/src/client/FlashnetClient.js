'use strict';

var sha256 = require('fast-sha256');
var lightBolt11Decoder = require('light-bolt11-decoder');
var client = require('../api/client.js');
var typedEndpoints = require('../api/typed-endpoints.js');
var index$1 = require('../config/index.js');
var index = require('../types/index.js');
var index$2 = require('../utils/index.js');
var auth = require('../utils/auth.js');
var hex = require('../utils/hex.js');
var intents = require('../utils/intents.js');
var sparkAddress = require('../utils/spark-address.js');
var tokenAddress = require('../utils/tokenAddress.js');
var bigint = require('../utils/bigint.js');
var errors = require('../types/errors.js');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var sha256__default = /*#__PURE__*/_interopDefault(sha256);

/**
 * FlashnetClient - A comprehensive client for interacting with Flashnet AMM
 *
 * This client wraps a SparkWallet and provides:
 * - Automatic network detection from the wallet
 * - Automatic authentication
 * - Balance checking before operations
 * - All AMM operations (pools, swaps, liquidity, hosts)
 * - Direct wallet access via client.wallet
 */
class FlashnetClient {
    _wallet;
    apiClient;
    typedApi;
    authManager;
    sparkNetwork;
    clientEnvironment;
    publicKey = "";
    sparkAddress = "";
    isAuthenticated = false;
    // Ephemeral caches for config endpoints and ping
    featureStatusCache;
    minAmountsCache;
    allowedAssetsCache;
    pingCache;
    // TTLs (milliseconds)
    static FEATURE_STATUS_TTL_MS = 5000; // 5s
    static MIN_AMOUNTS_TTL_MS = 5000; // 5s
    static ALLOWED_ASSETS_TTL_MS = 60000; // 60s
    static PING_TTL_MS = 2000; // 2s
    /**
     * Get the underlying wallet instance for direct wallet operations
     */
    get wallet() {
        return this._wallet;
    }
    /**
     * Get the Spark network type (for blockchain operations)
     */
    get sparkNetworkType() {
        return this.sparkNetwork;
    }
    /**
     * Get the client environment (for API configuration)
     */
    get clientEnvironmentType() {
        return this.clientEnvironment;
    }
    /**
     * @deprecated Use sparkNetworkType instead
     * Get the network type
     */
    get networkType() {
        // Map Spark network back to legacy network type
        // This is for backward compatibility
        return this.sparkNetwork === "REGTEST" && this.clientEnvironment === "local"
            ? "LOCAL"
            : this.sparkNetwork;
    }
    /**
     * Get the wallet's public key
     */
    get pubkey() {
        return this.publicKey;
    }
    /**
     * Get the wallet's Spark address
     */
    get address() {
        return this.sparkAddress;
    }
    constructor(wallet, configOrOptions) {
        this._wallet = wallet;
        // Determine configuration type and extract values
        const isLegacyConfig = !configOrOptions ||
            "network" in configOrOptions ||
            !("sparkNetworkType" in configOrOptions);
        if (isLegacyConfig) {
            // Legacy configuration system - derive from wallet or options
            const legacyConfig = configOrOptions;
            if (legacyConfig?.network) {
                // Use provided legacy network
                this.sparkNetwork = index.getSparkNetworkFromLegacy(legacyConfig.network);
                this.clientEnvironment = index.getClientEnvironmentFromLegacy(legacyConfig.network);
            }
            else {
                // Auto-detect from wallet (existing behavior)
                // @ts-expect-error - wallet.config is protected
                const networkEnum = wallet.config.getNetwork();
                const networkName = index.Network[networkEnum];
                const detectedNetwork = networkName === "MAINNET" ? "MAINNET" : "REGTEST";
                this.sparkNetwork = index.getSparkNetworkFromLegacy(detectedNetwork);
                this.clientEnvironment =
                    index.getClientEnvironmentFromLegacy(detectedNetwork);
            }
        }
        else {
            // New configuration system
            const config = configOrOptions;
            this.sparkNetwork = config.sparkNetworkType;
            // Determine client configuration based on the specific config type
            let clientConfig;
            if ("clientConfig" in config) {
                // FlashnetClientConfig - can be either environment or custom config
                clientConfig = config.clientConfig;
            }
            else if ("clientNetworkConfig" in config) {
                // FlashnetClientCustomConfig - custom configuration
                clientConfig = config.clientNetworkConfig;
            }
            else if ("clientEnvironment" in config) {
                // FlashnetClientEnvironmentConfig - predefined environment
                clientConfig = config.clientEnvironment;
            }
            else {
                throw new Error("Invalid configuration: must specify clientConfig, clientNetworkConfig, or clientEnvironment");
            }
            // Resolve the client environment name for internal tracking
            const environmentName = index$1.getClientEnvironmentName(clientConfig);
            this.clientEnvironment =
                environmentName === "custom"
                    ? "local"
                    : environmentName;
        }
        // Initialize API client with resolved client configuration
        let resolvedClientConfig;
        if (!isLegacyConfig) {
            const config = configOrOptions;
            let clientConfigParam;
            if ("clientConfig" in config) {
                clientConfigParam = config.clientConfig;
            }
            else if ("clientNetworkConfig" in config) {
                clientConfigParam = config.clientNetworkConfig;
            }
            else if ("clientEnvironment" in config) {
                clientConfigParam = config.clientEnvironment;
            }
            else {
                throw new Error("Invalid configuration");
            }
            resolvedClientConfig = index$1.resolveClientNetworkConfig(clientConfigParam);
        }
        else {
            // Use legacy resolution
            resolvedClientConfig = index$1.getClientNetworkConfig(this.clientEnvironment);
        }
        this.apiClient = new client.ApiClient(resolvedClientConfig);
        this.typedApi = new typedEndpoints.TypedAmmApi(this.apiClient);
        this.authManager = new auth.AuthManager(this.apiClient, "", wallet);
    }
    /**
     * Initialize the client by deducing network and authenticating
     * This is called automatically on first use if not called manually
     */
    async initialize() {
        if (this.isAuthenticated) {
            return;
        }
        // Get wallet details
        this.publicKey = await this._wallet.getIdentityPublicKey();
        this.sparkAddress = await this._wallet.getSparkAddress();
        // Deduce Spark network from spark address and validate consistency
        const detectedSparkNetwork = sparkAddress.getSparkNetworkFromAddress(this.sparkAddress);
        if (!detectedSparkNetwork) {
            throw new Error(`Unable to determine Spark network from spark address: ${this.sparkAddress}`);
        }
        // Warn if configured Spark network doesn't match detected network
        if (this.sparkNetwork !== detectedSparkNetwork) {
            console.warn(`Warning: Configured Spark network (${this.sparkNetwork}) doesn't match detected network from address (${detectedSparkNetwork}). Using detected network.`);
            this.sparkNetwork = detectedSparkNetwork;
        }
        // Re-initialize auth manager with correct public key
        this.authManager = new auth.AuthManager(this.apiClient, this.publicKey, this._wallet);
        // Authenticate
        const token = await this.authManager.authenticate();
        this.apiClient.setAuthToken(token);
        this.isAuthenticated = true;
    }
    /**
     * Ensure the client is initialized
     */
    async ensureInitialized() {
        if (!this.isAuthenticated) {
            await this.initialize();
        }
    }
    /**
     * Ensure a token identifier is in human-readable (Bech32m) form expected by the Spark SDK.
     * If the identifier is already human-readable or it is the BTC constant, it is returned unchanged.
     * Otherwise, it is encoded from the raw hex form using the client's Spark network.
     */
    toHumanReadableTokenIdentifier(tokenIdentifier) {
        if (tokenIdentifier === index$1.BTC_ASSET_PUBKEY) {
            return tokenIdentifier;
        }
        if (tokenIdentifier.startsWith("btkn")) {
            return tokenIdentifier;
        }
        return tokenAddress.encodeSparkHumanReadableTokenIdentifier(tokenIdentifier, this.sparkNetwork);
    }
    /**
     * Convert a token identifier into the raw hex string form expected by the Flashnet backend.
     * Handles BTC constant, hex strings, and Bech32m human-readable format.
     */
    toHexTokenIdentifier(tokenIdentifier) {
        if (tokenIdentifier === index$1.BTC_ASSET_PUBKEY) {
            return tokenIdentifier;
        }
        if (tokenIdentifier.startsWith("btkn")) {
            return tokenAddress.decodeSparkHumanReadableTokenIdentifier(tokenIdentifier, this.sparkNetwork).tokenIdentifier;
        }
        return tokenIdentifier;
    }
    /**
     * Get wallet balance including BTC and token balances
     */
    async getBalance() {
        const balance = await this._wallet.getBalance();
        // Convert the wallet's balance format to our format
        const tokenBalances = new Map();
        if (balance.tokenBalances) {
            for (const [tokenPubkey, tokenData] of balance.tokenBalances.entries()) {
                const info = tokenData.tokenMetadata;
                // Convert raw token identifier to hex and human-readable forms
                const tokenIdentifierHex = hex.getHexFromUint8Array(info.rawTokenIdentifier);
                const tokenAddress$1 = tokenAddress.encodeSparkHumanReadableTokenIdentifier(info.rawTokenIdentifier, this.sparkNetwork);
                tokenBalances.set(tokenPubkey, {
                    balance: bigint.safeBigInt(tokenData.ownedBalance ?? tokenData.balance),
                    availableToSendBalance: bigint.safeBigInt(tokenData.availableToSendBalance ??
                        tokenData.ownedBalance ??
                        tokenData.balance),
                    tokenInfo: {
                        tokenIdentifier: tokenIdentifierHex,
                        tokenAddress: tokenAddress$1,
                        tokenName: info.tokenName,
                        tokenSymbol: info.tokenTicker,
                        tokenDecimals: info.decimals,
                        maxSupply: info.maxSupply,
                    },
                });
            }
        }
        return {
            balance: bigint.safeBigInt(balance.balance),
            tokenBalances,
        };
    }
    /**
     * Check if wallet has sufficient balance for an operation
     */
    async checkBalance(params) {
        const balance = params.walletBalance ?? (await this.getBalance());
        // Check balance
        const requirements = {
            tokens: new Map(),
        };
        for (const balance of params.balancesToCheck) {
            if (balance.assetAddress === index$1.BTC_ASSET_PUBKEY) {
                requirements.btc = BigInt(balance.amount);
            }
            else {
                requirements.tokens?.set(balance.assetAddress, BigInt(balance.amount));
            }
        }
        // Check BTC balance
        if (requirements.btc && balance.balance < requirements.btc) {
            throw new Error([
                params.errorPrefix ?? "",
                `Insufficient BTC balance. `,
                `Required: ${requirements.btc} sats, Available: ${balance.balance} sats`,
            ].join(""));
        }
        // Check token balances
        if (requirements.tokens) {
            for (const [tokenPubkey, requiredAmount,] of requirements.tokens.entries()) {
                // Support both hex and Bech32m token identifiers by trying all representations
                const hrKey = this.toHumanReadableTokenIdentifier(tokenPubkey);
                const hexKey = this.toHexTokenIdentifier(tokenPubkey);
                const effectiveTokenBalance = balance.tokenBalances.get(tokenPubkey) ??
                    balance.tokenBalances.get(hrKey) ??
                    balance.tokenBalances.get(hexKey);
                const available = params.useAvailableBalance
                    ? (effectiveTokenBalance?.availableToSendBalance ?? 0n)
                    : (effectiveTokenBalance?.balance ?? 0n);
                if (available < requiredAmount) {
                    throw new Error([
                        params.errorPrefix ?? "",
                        `Insufficient token balance for ${tokenPubkey}. `,
                        `Required: ${requiredAmount}, Available: ${available}`,
                    ].join(""));
                }
            }
        }
    }
    // Pool Operations
    /**
     * List pools with optional filters
     */
    async listPools(query) {
        await this.ensureInitialized();
        return this.typedApi.listPools(query);
    }
    /**
     * Get detailed information about a specific pool
     */
    async getPool(poolId) {
        await this.ensureInitialized();
        return this.typedApi.getPool(poolId);
    }
    /**
     * Get LP position details for a provider in a pool
     */
    async getLpPosition(poolId, providerPublicKey) {
        await this.ensureInitialized();
        const provider = providerPublicKey || this.publicKey;
        return this.typedApi.getLpPosition(poolId, provider);
    }
    /**
     * Get LP position details for a provider in a pool
     */
    async getAllLpPositions() {
        await this.ensureInitialized();
        return this.typedApi.getAllLpPositions();
    }
    /**
     * Create a constant product pool
     */
    async createConstantProductPool(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_pool_creation");
        await this.assertAllowedAssetBForPoolCreation(this.toHexTokenIdentifier(params.assetBAddress));
        // Check if we need to add initial liquidity
        if (params.initialLiquidity) {
            await this.checkBalance({
                balancesToCheck: [
                    {
                        assetAddress: params.assetAAddress,
                        amount: params.initialLiquidity.assetAAmount,
                    },
                    {
                        assetAddress: params.assetBAddress,
                        amount: params.initialLiquidity.assetBAmount,
                    },
                ],
                errorPrefix: "Insufficient balance for initial liquidity: ",
                useAvailableBalance: params.useAvailableBalance,
            });
        }
        const poolOwnerPublicKey = params.poolOwnerPublicKey ?? this.publicKey;
        // Generate intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateConstantProductPoolInitializationIntentMessage({
            poolOwnerPublicKey,
            assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
            assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
            lpFeeRateBps: params.lpFeeRateBps.toString(),
            totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        // Create pool
        const request = {
            poolOwnerPublicKey,
            assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
            assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
            lpFeeRateBps: params.lpFeeRateBps.toString(),
            totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
            hostNamespace: params.hostNamespace || "",
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.createConstantProductPool(request);
        // Add initial liquidity if specified
        if (params.initialLiquidity && response.poolId) {
            await this.addInitialLiquidity(response.poolId, params.assetAAddress, params.assetBAddress, params.initialLiquidity.assetAAmount.toString(), params.initialLiquidity.assetBAmount.toString(), params.initialLiquidity.assetAMinAmountIn.toString(), params.initialLiquidity.assetBMinAmountIn.toString());
        }
        return response;
    }
    // Validate and normalize inputs to bigint
    static parsePositiveIntegerToBigInt(value, name) {
        if (typeof value === "bigint") {
            if (value <= 0n) {
                throw new Error(`${name} must be positive integer`);
            }
            return value;
        }
        if (typeof value === "number") {
            if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
                throw new Error(`${name} must be positive integer`);
            }
            return BigInt(value);
        }
        try {
            const v = BigInt(value);
            if (v <= 0n) {
                throw new Error(`${name} must be positive integer`);
            }
            return v;
        }
        catch {
            throw new Error(`${name} must be positive integer`);
        }
    }
    /**
     * Calculates virtual reserves for a bonding curve AMM.
     *
     * This helper function calculates the initial virtual reserves (`v_A^0`, `v_B^0`)
     * based on the bonding curve parameters. These virtual reserves ensure smooth
     * pricing and price continuity during graduation to the double-sided phase.
     *
     * @param params - The parameters for the calculation.
     * @param params.initialTokenSupply - The initial supply of Asset A (tokens to be sold).
     * @param params.graduationThresholdPct - The percentage of tokens that need to be sold for graduation (20-95%).
     * @param params.targetRaise - The target amount of Asset B to raise at graduation.
     * @returns An object containing `virtualReserveA`, `virtualReserveB`, and `threshold`.
     */
    static calculateVirtualReserves(params) {
        if (!Number.isFinite(params.graduationThresholdPct) ||
            !Number.isInteger(params.graduationThresholdPct)) {
            throw new Error("Graduation threshold percentage must be an integer number of percent");
        }
        const supply = FlashnetClient.parsePositiveIntegerToBigInt(params.initialTokenSupply, "Initial token supply");
        const targetB = FlashnetClient.parsePositiveIntegerToBigInt(params.targetRaise, "Target raise");
        const graduationThresholdPct = BigInt(params.graduationThresholdPct);
        // Align bounds with Rust AMM (20%..95%), then check feasibility for g=1 (requires >50%).
        const MIN_PCT = 20n;
        const MAX_PCT = 95n;
        if (graduationThresholdPct < MIN_PCT || graduationThresholdPct > MAX_PCT) {
            throw new Error(`Graduation threshold percentage must be between ${MIN_PCT} and ${MAX_PCT}`);
        }
        // Feasibility: denom = f - g*(1-f) > 0 with g=1 -> 2f - 1 > 0 -> pct > 50
        const denomNormalized = 2n * graduationThresholdPct - 100n; // equals 100*(f - (1-f))
        if (denomNormalized <= 0n) {
            throw new Error("Invalid configuration: threshold must be greater than 50% when LP fraction is 1.0");
        }
        // v_A = S * f^2 / (f - (1-f)) ; using integer math with pct where
        // v_A = S * p^2 / (100 * (2p - 100))
        const vANumerator = supply * graduationThresholdPct * graduationThresholdPct;
        const vADenominator = 100n * denomNormalized;
        const virtualA = vANumerator / vADenominator; // floor
        // v_B = T * (1 - f) / (f - (1-f)) ; with pct => T * (100 - p) / (2p - 100)
        const vBNumerator = targetB * (100n - graduationThresholdPct);
        const vBDenominator = denomNormalized;
        const virtualB = vBNumerator / vBDenominator; // floor
        // Threshold amount in A
        const threshold = (supply * graduationThresholdPct) / 100n;
        return { virtualReserveA: virtualA, virtualReserveB: virtualB, threshold };
    }
    /**
     * Create a single-sided pool with automatic initial deposit
     *
     * This method creates a single-sided pool and by default automatically handles the initial deposit.
     * The initial reserve amount will be transferred to the pool and confirmed.
     */
    async createSingleSidedPool(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_pool_creation");
        await this.assertAllowedAssetBForPoolCreation(this.toHexTokenIdentifier(params.assetBAddress));
        if (!params.hostNamespace && params.totalHostFeeRateBps < 10) {
            throw new Error(`Host fee must be greater than 10 bps when no host namespace is provided`);
        }
        // Validate reserves are valid positive integers before any operations
        const assetAInitialReserve = FlashnetClient.parsePositiveIntegerToBigInt(params.assetAInitialReserve, "Asset A Initial Reserve").toString();
        const virtualReserveA = FlashnetClient.parsePositiveIntegerToBigInt(params.virtualReserveA, "Virtual Reserve A").toString();
        const virtualReserveB = FlashnetClient.parsePositiveIntegerToBigInt(params.virtualReserveB, "Virtual Reserve B").toString();
        await this.checkBalance({
            balancesToCheck: [
                {
                    assetAddress: params.assetAAddress,
                    amount: assetAInitialReserve,
                },
            ],
            errorPrefix: "Insufficient balance for pool creation: ",
            useAvailableBalance: params.useAvailableBalance,
        });
        const poolOwnerPublicKey = params.poolOwnerPublicKey ?? this.publicKey;
        // Generate intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generatePoolInitializationIntentMessage({
            poolOwnerPublicKey,
            assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
            assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
            assetAInitialReserve,
            virtualReserveA,
            virtualReserveB,
            threshold: params.threshold.toString(),
            lpFeeRateBps: params.lpFeeRateBps.toString(),
            totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
            nonce,
        });
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        // Create pool
        const request = {
            poolOwnerPublicKey,
            assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
            assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
            assetAInitialReserve,
            virtualReserveA,
            virtualReserveB,
            threshold: params.threshold.toString(),
            lpFeeRateBps: params.lpFeeRateBps.toString(),
            totalHostFeeRateBps: params.totalHostFeeRateBps.toString(),
            hostNamespace: params.hostNamespace,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const createResponse = await this.typedApi.createSingleSidedPool(request);
        if (params.disableInitialDeposit) {
            return createResponse;
        }
        // Transfer initial reserve to the pool using new address encoding
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: createResponse.poolId,
            network: this.sparkNetwork,
        });
        const assetATransferId = await this.transferAsset({
            receiverSparkAddress: lpSparkAddress,
            assetAddress: params.assetAAddress,
            amount: assetAInitialReserve,
        });
        // Execute confirm with auto-clawback on failure
        await this.executeWithAutoClawback(async () => {
            const confirmResponse = await this.confirmInitialDeposit(createResponse.poolId, assetATransferId, poolOwnerPublicKey);
            if (!confirmResponse.confirmed) {
                throw new Error(`Failed to confirm initial deposit: ${confirmResponse.message}`);
            }
            return confirmResponse;
        }, [assetATransferId], createResponse.poolId);
        return createResponse;
    }
    /**
     * Confirm initial deposit for single-sided pool
     *
     * Note: This is typically handled automatically by createSingleSidedPool().
     * Use this method only if you need to manually confirm a deposit (e.g., after a failed attempt).
     */
    async confirmInitialDeposit(poolId, assetASparkTransferId, poolOwnerPublicKey) {
        await this.ensureInitialized();
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generatePoolConfirmInitialDepositIntentMessage({
            poolOwnerPublicKey: poolOwnerPublicKey ?? this.publicKey,
            lpIdentityPublicKey: poolId,
            assetASparkTransferId,
            nonce,
        });
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            poolId,
            assetASparkTransferId,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
            poolOwnerPublicKey: poolOwnerPublicKey ?? this.publicKey,
        };
        return this.typedApi.confirmInitialDeposit(request);
    }
    // Swap Operations
    /**
     * Simulate a swap without executing it
     */
    async simulateSwap(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        // Ensure integratorBps is an integer (floor if it has decimals)
        const processedParams = {
            ...params,
            ...(params.integratorBps !== undefined && {
                integratorBps: Math.floor(params.integratorBps),
            }),
        };
        return this.typedApi.simulateSwap(processedParams);
    }
    /**
     * Execute a swap
     *
     * If the swap fails with a clawbackable error, the SDK will automatically
     * attempt to recover the transferred funds via clawback.
     *
     * @param params.useFreeBalance When true, uses free balance from V3 pool instead of making a Spark transfer.
     *   Note: Only works for V3 concentrated liquidity pools. Does NOT work for route swaps.
     */
    async executeSwap(params) {
        await this.ensureInitialized();
        // Gate by feature flags and ping, and enforce min-amount policy before transfers
        await this.ensureAmmOperationAllowed("allow_swaps");
        await this.assertSwapMeetsMinAmounts({
            assetInAddress: params.assetInAddress,
            assetOutAddress: params.assetOutAddress,
            amountIn: params.amountIn,
            minAmountOut: params.minAmountOut,
        });
        // If using free balance (V3 pools only), skip the Spark transfer
        if (params.useFreeBalance) {
            const swapResponse = await this.executeSwapIntent({
                ...params,
                // No transferId - triggers free balance mode
            });
            return {
                ...swapResponse,
                inboundSparkTransferId: swapResponse.requestId,
            };
        }
        // Transfer assets to pool using new address encoding
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: params.poolId,
            network: this.sparkNetwork,
        });
        const transferId = await this.transferAsset({
            receiverSparkAddress: lpSparkAddress,
            assetAddress: params.assetInAddress,
            amount: params.amountIn,
        }, "Insufficient balance for swap: ", params.useAvailableBalance);
        // Execute with auto-clawback on failure
        const swapResponse = await this.executeWithAutoClawback(() => this.executeSwapIntent({
            ...params,
            transferId,
        }), [transferId], params.poolId);
        return { ...swapResponse, inboundSparkTransferId: transferId };
    }
    /**
     * Execute a swap with a pre-created transfer or using free balance.
     *
     * When transferId is provided, uses that Spark transfer. If transferId is a null UUID, treats it as a transfer reference.
     * When transferId is omitted/undefined, uses free balance (V3 pools only).
     */
    async executeSwapIntent(params) {
        await this.ensureInitialized();
        // Also enforce gating and min amounts for direct intent usage
        await this.ensureAmmOperationAllowed("allow_swaps");
        await this.assertSwapMeetsMinAmounts({
            assetInAddress: params.assetInAddress,
            assetOutAddress: params.assetOutAddress,
            amountIn: params.amountIn,
            minAmountOut: params.minAmountOut,
        });
        // Determine if using free balance based on whether transferId is provided
        const isUsingFreeBalance = !params.transferId;
        // Generate swap intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generatePoolSwapIntentMessage({
            userPublicKey: this.publicKey,
            lpIdentityPublicKey: params.poolId,
            assetInSparkTransferId: params.transferId,
            assetInAddress: this.toHexTokenIdentifier(params.assetInAddress),
            assetOutAddress: this.toHexTokenIdentifier(params.assetOutAddress),
            amountIn: params.amountIn.toString(),
            maxSlippageBps: params.maxSlippageBps.toString(),
            minAmountOut: params.minAmountOut,
            totalIntegratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            userPublicKey: this.publicKey,
            poolId: params.poolId,
            assetInAddress: this.toHexTokenIdentifier(params.assetInAddress),
            assetOutAddress: this.toHexTokenIdentifier(params.assetOutAddress),
            amountIn: params.amountIn.toString(),
            maxSlippageBps: params.maxSlippageBps?.toString(),
            minAmountOut: params.minAmountOut,
            assetInSparkTransferId: params.transferId ?? "",
            totalIntegratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
            integratorPublicKey: params.integratorPublicKey || "",
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.executeSwap(request);
        // Check if the swap was accepted
        if (!response.accepted) {
            const errorMessage = response.error || "Swap rejected by the AMM";
            const hasRefund = !!response.refundedAmount;
            const refundInfo = hasRefund
                ? ` Refunded ${response.refundedAmount} of ${response.refundedAssetAddress} via transfer ${response.refundTransferId}`
                : "";
            // If refund was provided, funds are safe - use auto_refund recovery
            // If no refund and not using free balance, funds may need clawback
            throw new errors.FlashnetError(`${errorMessage}.${refundInfo}`, {
                response: {
                    errorCode: hasRefund ? "FSAG-4202" : "UNKNOWN", // Slippage if refunded
                    errorCategory: hasRefund ? "Business" : "System",
                    message: `${errorMessage}.${refundInfo}`,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "amm-gateway",
                    severity: "Error",
                },
                httpStatus: 400,
                // Don't include transferIds if refunded or using free balance - no clawback needed
                transferIds: hasRefund || isUsingFreeBalance ? [] : [params.transferId ?? ""],
                lpIdentityPublicKey: params.poolId,
            });
        }
        return response;
    }
    /**
     * Simulate a route swap (multi-hop swap)
     */
    async simulateRouteSwap(params) {
        if (params.hops.length > 4) {
            throw new Error("Route swap cannot have more than 4 hops");
        }
        await this.ensureInitialized();
        await this.ensurePingOk();
        return this.typedApi.simulateRouteSwap(params);
    }
    /**
     * Execute a route swap (multi-hop swap)
     *
     * If the route swap fails with a clawbackable error, the SDK will automatically
     * attempt to recover the transferred funds via clawback.
     */
    async executeRouteSwap(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_route_swaps");
        // Validate min-amount policy for route: check initial input and final output asset
        const finalOutputAsset = params.hops[params.hops.length - 1]?.assetOutAddress;
        if (!finalOutputAsset) {
            throw new Error("Route swap requires at least one hop with output asset");
        }
        await this.assertSwapMeetsMinAmounts({
            assetInAddress: params.initialAssetAddress,
            assetOutAddress: finalOutputAsset,
            amountIn: params.inputAmount,
            minAmountOut: params.minAmountOut,
        });
        // Validate hops array
        if (params.hops.length > 4) {
            throw new Error("Route swap cannot have more than 4 hops");
        }
        if (!params.hops.length) {
            throw new Error("Route swap requires at least one hop");
        }
        // Transfer initial asset to first pool using new address encoding
        const firstPoolId = params.hops[0]?.poolId;
        if (!firstPoolId) {
            throw new Error("First pool ID is required");
        }
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: firstPoolId,
            network: this.sparkNetwork,
        });
        const initialTransferId = await this.transferAsset({
            receiverSparkAddress: lpSparkAddress,
            assetAddress: params.initialAssetAddress,
            amount: params.inputAmount,
        }, "Insufficient balance for route swap: ", params.useAvailableBalance);
        // Execute with auto-clawback on failure
        return this.executeWithAutoClawback(async () => {
            // Prepare hops for validation
            const hops = params.hops.map((hop) => ({
                lpIdentityPublicKey: hop.poolId,
                inputAssetAddress: this.toHexTokenIdentifier(hop.assetInAddress),
                outputAssetAddress: this.toHexTokenIdentifier(hop.assetOutAddress),
                hopIntegratorFeeRateBps: hop.hopIntegratorFeeRateBps !== undefined &&
                    hop.hopIntegratorFeeRateBps !== null
                    ? hop.hopIntegratorFeeRateBps.toString()
                    : "0",
            }));
            // Convert hops and ensure integrator fee is always present
            const requestHops = params.hops.map((hop) => ({
                poolId: hop.poolId,
                assetInAddress: this.toHexTokenIdentifier(hop.assetInAddress),
                assetOutAddress: this.toHexTokenIdentifier(hop.assetOutAddress),
                hopIntegratorFeeRateBps: hop.hopIntegratorFeeRateBps !== undefined &&
                    hop.hopIntegratorFeeRateBps !== null
                    ? hop.hopIntegratorFeeRateBps.toString()
                    : "0",
            }));
            // Generate route swap intent
            const nonce = index$2.generateNonce();
            const intentMessage = intents.generateRouteSwapIntentMessage({
                userPublicKey: this.publicKey,
                hops: hops.map((hop) => ({
                    lpIdentityPublicKey: hop.lpIdentityPublicKey,
                    inputAssetAddress: hop.inputAssetAddress,
                    outputAssetAddress: hop.outputAssetAddress,
                    hopIntegratorFeeRateBps: hop.hopIntegratorFeeRateBps,
                })),
                initialSparkTransferId: initialTransferId,
                inputAmount: params.inputAmount.toString(),
                maxRouteSlippageBps: params.maxRouteSlippageBps.toString(),
                minAmountOut: params.minAmountOut,
                nonce,
                defaultIntegratorFeeRateBps: params.integratorFeeRateBps?.toString(),
            });
            // Sign intent
            const messageHash = sha256__default.default(intentMessage);
            const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
            const request = {
                userPublicKey: this.publicKey,
                hops: requestHops,
                initialSparkTransferId: initialTransferId,
                inputAmount: params.inputAmount.toString(),
                maxRouteSlippageBps: params.maxRouteSlippageBps.toString(),
                minAmountOut: params.minAmountOut,
                nonce,
                signature: hex.getHexFromUint8Array(signature),
                integratorFeeRateBps: params.integratorFeeRateBps?.toString() || "0",
                integratorPublicKey: params.integratorPublicKey || "",
            };
            const response = await this.typedApi.executeRouteSwap(request);
            // Check if the route swap was accepted
            if (!response.accepted) {
                const errorMessage = response.error || "Route swap rejected by the AMM";
                const hasRefund = !!response.refundedAmount;
                const refundInfo = hasRefund
                    ? ` Refunded ${response.refundedAmount} of ${response.refundedAssetPublicKey} via transfer ${response.refundTransferId}`
                    : "";
                throw new errors.FlashnetError(`${errorMessage}.${refundInfo}`, {
                    response: {
                        errorCode: hasRefund ? "FSAG-4202" : "UNKNOWN",
                        errorCategory: hasRefund ? "Business" : "System",
                        message: `${errorMessage}.${refundInfo}`,
                        requestId: "",
                        timestamp: new Date().toISOString(),
                        service: "amm-gateway",
                        severity: "Error",
                    },
                    httpStatus: 400,
                    transferIds: hasRefund ? [] : [initialTransferId],
                    lpIdentityPublicKey: firstPoolId,
                });
            }
            return response;
        }, [initialTransferId], firstPoolId);
    }
    // Liquidity Operations
    /**
     * Simulate adding liquidity
     */
    async simulateAddLiquidity(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        return this.typedApi.simulateAddLiquidity(params);
    }
    /**
     * Add liquidity to a pool
     *
     * If adding liquidity fails with a clawbackable error, the SDK will automatically
     * attempt to recover the transferred funds via clawback.
     */
    async addLiquidity(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_add_liquidity");
        // Get pool details to know which assets we're dealing with
        const pool = await this.getPool(params.poolId);
        // Enforce min-amount policy for inputs based on pool assets
        await this.assertAddLiquidityMeetsMinAmounts({
            poolId: params.poolId,
            assetAAmount: params.assetAAmount,
            assetBAmount: params.assetBAmount,
        });
        // Transfer assets to pool using new address encoding
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: params.poolId,
            network: this.sparkNetwork,
        });
        const [assetATransferId, assetBTransferId] = await this.transferAssets([
            {
                receiverSparkAddress: lpSparkAddress,
                assetAddress: pool.assetAAddress,
                amount: params.assetAAmount,
            },
            {
                receiverSparkAddress: lpSparkAddress,
                assetAddress: pool.assetBAddress,
                amount: params.assetBAmount,
            },
        ], "Insufficient balance for adding liquidity: ", params.useAvailableBalance);
        // Execute with auto-clawback on failure
        return this.executeWithAutoClawback(async () => {
            // Generate add liquidity intent
            const nonce = index$2.generateNonce();
            const intentMessage = intents.generateAddLiquidityIntentMessage({
                userPublicKey: this.publicKey,
                lpIdentityPublicKey: params.poolId,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                assetAAmount: params.assetAAmount.toString(),
                assetBAmount: params.assetBAmount.toString(),
                assetAMinAmountIn: params.assetAMinAmountIn.toString(),
                assetBMinAmountIn: params.assetBMinAmountIn.toString(),
                nonce,
            });
            // Sign intent
            const messageHash = sha256__default.default(intentMessage);
            const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
            const request = {
                userPublicKey: this.publicKey,
                poolId: params.poolId,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                assetAAmountToAdd: params.assetAAmount.toString(),
                assetBAmountToAdd: params.assetBAmount.toString(),
                assetAMinAmountIn: params.assetAMinAmountIn.toString(),
                assetBMinAmountIn: params.assetBMinAmountIn.toString(),
                nonce,
                signature: hex.getHexFromUint8Array(signature),
            };
            const response = await this.typedApi.addLiquidity(request);
            // Check if the liquidity addition was accepted
            if (!response.accepted) {
                const errorMessage = response.error || "Add liquidity rejected by the AMM";
                const hasRefund = !!(response.refund?.assetAAmount || response.refund?.assetBAmount);
                const refundInfo = response.refund
                    ? ` Refunds: Asset A: ${response.refund.assetAAmount || 0}, Asset B: ${response.refund.assetBAmount || 0}`
                    : "";
                throw new errors.FlashnetError(`${errorMessage}.${refundInfo}`, {
                    response: {
                        errorCode: hasRefund ? "FSAG-4203" : "UNKNOWN", // Phase error if refunded
                        errorCategory: hasRefund ? "Business" : "System",
                        message: `${errorMessage}.${refundInfo}`,
                        requestId: "",
                        timestamp: new Date().toISOString(),
                        service: "amm-gateway",
                        severity: "Error",
                    },
                    httpStatus: 400,
                    transferIds: hasRefund ? [] : [assetATransferId, assetBTransferId],
                    lpIdentityPublicKey: params.poolId,
                });
            }
            return response;
        }, [assetATransferId, assetBTransferId], params.poolId);
    }
    /**
     * Simulate removing liquidity
     */
    async simulateRemoveLiquidity(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        return this.typedApi.simulateRemoveLiquidity(params);
    }
    /**
     * Remove liquidity from a pool
     */
    async removeLiquidity(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_withdraw_liquidity");
        // Check LP token balance
        const position = await this.getLpPosition(params.poolId);
        const lpTokensOwned = position.lpTokensOwned;
        const tokensToRemove = params.lpTokensToRemove;
        if (index$2.compareDecimalStrings(lpTokensOwned, tokensToRemove) < 0) {
            throw new Error(`Insufficient LP tokens. Owned: ${lpTokensOwned}, Requested: ${tokensToRemove}`);
        }
        // Pre-simulate and enforce min-amount policy for outputs
        await this.assertRemoveLiquidityMeetsMinAmounts({
            poolId: params.poolId,
            lpTokensToRemove: params.lpTokensToRemove,
        });
        // Generate remove liquidity intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateRemoveLiquidityIntentMessage({
            userPublicKey: this.publicKey,
            lpIdentityPublicKey: params.poolId,
            lpTokensToRemove: params.lpTokensToRemove,
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            userPublicKey: this.publicKey,
            poolId: params.poolId,
            lpTokensToRemove: params.lpTokensToRemove,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.removeLiquidity(request);
        // Check if the liquidity removal was accepted
        if (!response.accepted) {
            const errorMessage = response.error || "Remove liquidity rejected by the AMM";
            throw new Error(errorMessage);
        }
        return response;
    }
    // Host Operations
    /**
     * Register as a host
     */
    async registerHost(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        const feeRecipient = params.feeRecipientPublicKey || this.publicKey;
        const nonce = index$2.generateNonce();
        // Generate intent
        const intentMessage = intents.generateRegisterHostIntentMessage({
            namespace: params.namespace,
            minFeeBps: params.minFeeBps,
            feeRecipientPublicKey: feeRecipient,
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            namespace: params.namespace,
            minFeeBps: params.minFeeBps,
            feeRecipientPublicKey: feeRecipient,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        return this.typedApi.registerHost(request);
    }
    /**
     * Get host information
     */
    async getHost(namespace) {
        await this.ensureInitialized();
        return this.typedApi.getHost(namespace);
    }
    /**
     * Get pool host fees
     */
    async getPoolHostFees(hostNamespace, poolId) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        return this.typedApi.getPoolHostFees({ hostNamespace, poolId });
    }
    /**
     * Get host fee withdrawal history
     */
    async getHostFeeWithdrawalHistory(query) {
        await this.ensureInitialized();
        return this.typedApi.getHostFeeWithdrawalHistory(query);
    }
    /**
     * Withdraw host fees
     */
    async withdrawHostFees(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_withdraw_fees");
        const nonce = index$2.generateNonce();
        const assetBAmount = params.assetBAmount ?? "0";
        const intentMessage = intents.generateWithdrawHostFeesIntentMessage({
            hostPublicKey: this.publicKey,
            lpIdentityPublicKey: params.lpIdentityPublicKey,
            assetBAmount,
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            lpIdentityPublicKey: params.lpIdentityPublicKey,
            assetBAmount,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.withdrawHostFees(request);
        // Check if the withdrawal was accepted
        if (!response.accepted) {
            const errorMessage = response.error || "Withdraw host fees rejected by the AMM";
            throw new Error(errorMessage);
        }
        return response;
    }
    /**
     * Get host fees across all pools
     */
    async getHostFees(hostNamespace) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        const request = {
            hostNamespace,
        };
        return this.typedApi.getHostFees(request);
    }
    /**
     * Get integrator fee withdrawal history
     */
    async getIntegratorFeeWithdrawalHistory(query) {
        await this.ensureInitialized();
        return this.typedApi.getIntegratorFeeWithdrawalHistory(query);
    }
    /**
     * Get fees for a specific pool for an integrator
     */
    async getPoolIntegratorFees(poolId) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        return this.typedApi.getPoolIntegratorFees({ poolId });
    }
    /**
     * Withdraw integrator fees
     */
    async withdrawIntegratorFees(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_withdraw_fees");
        const nonce = index$2.generateNonce();
        const assetBAmount = params.assetBAmount ?? "0";
        const intentMessage = intents.generateWithdrawIntegratorFeesIntentMessage({
            integratorPublicKey: this.publicKey,
            lpIdentityPublicKey: params.lpIdentityPublicKey,
            assetBAmount,
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            integratorPublicKey: this.publicKey,
            lpIdentityPublicKey: params.lpIdentityPublicKey,
            assetBAmount,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.withdrawIntegratorFees(request);
        // Check if the withdrawal was accepted
        if (!response.accepted) {
            const errorMessage = response.error || "Withdraw integrator fees rejected by the AMM";
            throw new Error(errorMessage);
        }
        return response;
    }
    /**
     * Get integrator fees across all pools
     */
    async getIntegratorFees() {
        await this.ensureInitialized();
        return this.typedApi.getIntegratorFees();
    }
    // Escrow Operations
    /**
     * Creates a new escrow contract.
     * This is the first step in a two-step process: create, then fund.
     * @param params Parameters to create the escrow.
     * @returns The escrow creation response, including the ID and deposit address.
     */
    async createEscrow(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        const nonce = index$2.generateNonce();
        // The intent message requires a different structure for recipients and conditions
        const intentRecipients = params.recipients.map((r) => ({
            recipientId: r.id,
            amount: r.amount,
            hasClaimed: false, // Default value for creation
        }));
        const intentMessage = intents.generateCreateEscrowIntentMessage({
            creatorPublicKey: this.publicKey,
            assetId: params.assetId,
            assetAmount: params.assetAmount,
            recipients: intentRecipients,
            claimConditions: params.claimConditions, // Assuming API `Condition` is compatible
            abandonHost: params.abandonHost,
            abandonConditions: params.abandonConditions || undefined,
            nonce,
        });
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            creatorPublicKey: this.publicKey,
            assetId: params.assetId,
            assetAmount: params.assetAmount,
            recipients: params.recipients,
            claimConditions: params.claimConditions,
            abandonHost: params.abandonHost,
            abandonConditions: params.abandonConditions,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const createResponse = await this.typedApi.createEscrow(request);
        const autoFund = params.autoFund !== false;
        if (!autoFund) {
            return createResponse;
        }
        // Auto-fund the escrow
        return this.fundEscrow({
            escrowId: createResponse.escrowId,
            depositAddress: createResponse.depositAddress,
            assetId: params.assetId,
            assetAmount: params.assetAmount,
            useAvailableBalance: params.useAvailableBalance,
        });
    }
    /**
     * Funds an escrow contract to activate it.
     * This handles the asset transfer and confirmation in one step.
     * @param params Parameters to fund the escrow, including asset details and deposit address.
     * @returns The funding confirmation response.
     */
    async fundEscrow(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        // 1. Balance check
        await this.checkBalance({
            balancesToCheck: [
                { assetAddress: params.assetId, amount: params.assetAmount },
            ],
            errorPrefix: "Insufficient balance to fund escrow: ",
            useAvailableBalance: params.useAvailableBalance,
        });
        // 2. Perform transfer
        const escrowSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: params.depositAddress,
            network: this.sparkNetwork,
        });
        const sparkTransferId = await this.transferAsset({
            receiverSparkAddress: escrowSparkAddress,
            assetAddress: params.assetId,
            amount: params.assetAmount,
        });
        // 3. Execute signed intent
        return await this.executeFundEscrowIntent({
            escrowId: params.escrowId,
            sparkTransferId,
        });
    }
    async executeFundEscrowIntent(params) {
        await this.ensurePingOk();
        // Generate intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateFundEscrowIntentMessage({
            ...params,
            creatorPublicKey: this.publicKey,
            nonce,
        });
        // Sign
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        // Call API
        const request = {
            ...params,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        return this.typedApi.fundEscrow(request);
    }
    /**
     * Claims funds from an active escrow contract.
     * The caller must be a valid recipient and all claim conditions must be met.
     * @param params Parameters for the claim.
     * @returns The claim processing response.
     */
    async claimEscrow(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateClaimEscrowIntentMessage({
            escrowId: params.escrowId,
            recipientPublicKey: this.publicKey,
            nonce,
        });
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            escrowId: params.escrowId,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        return this.typedApi.claimEscrow(request);
    }
    /**
     * Retrieves the current state of an escrow contract.
     * This is a read-only operation and does not require authentication.
     * @param escrowId The unique identifier of the escrow.
     * @returns The full state of the escrow.
     */
    async getEscrow(escrowId) {
        await this.ensureInitialized();
        return this.typedApi.getEscrow(escrowId);
    }
    // Swap History
    /**
     * Get swaps for a specific pool
     */
    async getPoolSwaps(lpPubkey, query) {
        await this.ensureInitialized();
        return this.typedApi.getPoolSwaps(lpPubkey, query);
    }
    /**
     * Get global swaps across all pools
     */
    async getGlobalSwaps(query) {
        await this.ensureInitialized();
        return this.typedApi.getGlobalSwaps(query);
    }
    /**
     * Get swaps for a specific user
     */
    async getUserSwaps(userPublicKey, query) {
        await this.ensureInitialized();
        const user = userPublicKey || this.publicKey;
        return this.typedApi.getUserSwaps(user, query);
    }
    // Clawback
    /**
     * Request clawback of a stuck inbound transfer to an LP wallet
     */
    async clawback(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateClawbackIntentMessage({
            senderPublicKey: this.publicKey,
            sparkTransferId: params.sparkTransferId,
            lpIdentityPublicKey: params.lpIdentityPublicKey,
            nonce,
        });
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            senderPublicKey: this.publicKey,
            sparkTransferId: params.sparkTransferId,
            lpIdentityPublicKey: params.lpIdentityPublicKey,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.clawback(request);
        if (!response.accepted) {
            const errorMessage = response.error || "Clawback request was rejected";
            throw new Error(errorMessage);
        }
        return response;
    }
    /**
     * Check if a transfer is eligible for clawback
     *
     * This is a read-only check that verifies:
     * - The transfer exists and is valid
     * - The authenticated user is the original sender
     * - The transfer is not already reserved or spent
     * - The transfer has not been claimed/settled
     * - The transfer is less than 23 hours old
     *
     * Note: This does NOT initiate a clawback, only checks eligibility.
     *
     * @param sparkTransferId - The Spark transfer ID to check
     * @returns Response indicating if the transfer is eligible and any error message
     */
    async checkClawbackEligibility(params) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        const request = {
            sparkTransferId: params.sparkTransferId,
        };
        return this.typedApi.checkClawbackEligibility(request);
    }
    /**
     * List transfers eligible for clawback
     *
     * Returns a paginated list of transfers that the authenticated user
     * can potentially clawback. Filters based on:
     * - Transfers sent by the authenticated user
     * - Transfers to pools the user has interacted with
     * - Not already spent or reserved
     * - Less than 10 days old
     *
     * @param query - Optional pagination parameters (limit, offset)
     * @returns List of eligible transfers with IDs and timestamps
     */
    async listClawbackableTransfers(query) {
        await this.ensureInitialized();
        await this.ensurePingOk();
        return this.typedApi.listClawbackableTransfers(query);
    }
    /**
     * Attempt to clawback multiple transfers
     *
     * @param transferIds - Array of transfer IDs to clawback
     * @param lpIdentityPublicKey - The LP wallet public key
     * @returns Array of results for each clawback attempt
     */
    async clawbackMultiple(transferIds, lpIdentityPublicKey) {
        const results = [];
        for (const transferId of transferIds) {
            try {
                const response = await this.clawback({
                    sparkTransferId: transferId,
                    lpIdentityPublicKey,
                });
                results.push({
                    transferId,
                    success: true,
                    response,
                });
            }
            catch (err) {
                results.push({
                    transferId,
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return results;
    }
    /**
     * Internal helper to execute an operation with automatic clawback on failure
     *
     * @param operation - The async operation to execute
     * @param transferIds - Transfer IDs that were sent and may need clawback
     * @param lpIdentityPublicKey - The LP wallet public key for clawback
     * @returns The result of the operation
     * @throws FlashnetError with typed clawbackSummary attached
     */
    async executeWithAutoClawback(operation, transferIds, lpIdentityPublicKey) {
        try {
            return await operation();
        }
        catch (error) {
            // Convert to FlashnetError if not already
            const flashnetError = errors.FlashnetError.fromUnknown(error, {
                transferIds,
                lpIdentityPublicKey,
            });
            // Check if we should attempt clawback
            if (flashnetError.shouldClawback() && transferIds.length > 0) {
                // Attempt to clawback all transfers
                const clawbackResults = await this.clawbackMultiple(transferIds, lpIdentityPublicKey);
                // Separate successful and failed clawbacks
                const successfulClawbacks = clawbackResults.filter((r) => r.success);
                const failedClawbacks = clawbackResults.filter((r) => !r.success);
                // Build typed clawback summary
                const clawbackSummary = {
                    attempted: true,
                    totalTransfers: transferIds.length,
                    successCount: successfulClawbacks.length,
                    failureCount: failedClawbacks.length,
                    results: clawbackResults,
                    recoveredTransferIds: successfulClawbacks.map((r) => r.transferId),
                    unrecoveredTransferIds: failedClawbacks.map((r) => r.transferId),
                };
                // Create enhanced error message
                let enhancedMessage = flashnetError.message;
                if (successfulClawbacks.length > 0) {
                    enhancedMessage += ` [Auto-clawback: ${successfulClawbacks.length}/${transferIds.length} transfers recovered]`;
                }
                if (failedClawbacks.length > 0) {
                    const failedIds = failedClawbacks.map((r) => r.transferId).join(", ");
                    enhancedMessage += ` [Clawback failed for: ${failedIds}]`;
                }
                // Determine remediation based on clawback results
                let remediation;
                if (clawbackSummary.failureCount === 0) {
                    remediation =
                        "Your funds have been automatically recovered. No action needed.";
                }
                else if (clawbackSummary.successCount > 0) {
                    remediation = `${clawbackSummary.successCount} transfer(s) recovered. Manual clawback needed for remaining transfers.`;
                }
                else {
                    remediation =
                        flashnetError.remediation ??
                            "Automatic recovery failed. Please initiate a manual clawback.";
                }
                // Throw new error with typed clawback summary
                const errorWithClawback = new errors.FlashnetError(enhancedMessage, {
                    response: {
                        errorCode: flashnetError.errorCode,
                        errorCategory: flashnetError.category,
                        message: enhancedMessage,
                        details: flashnetError.details,
                        requestId: flashnetError.requestId,
                        timestamp: flashnetError.timestamp,
                        service: flashnetError.service,
                        severity: flashnetError.severity,
                        remediation,
                    },
                    httpStatus: flashnetError.httpStatus,
                    transferIds: clawbackSummary.unrecoveredTransferIds,
                    lpIdentityPublicKey,
                    clawbackSummary,
                });
                throw errorWithClawback;
            }
            // Not a clawbackable error, just re-throw
            throw flashnetError;
        }
    }
    // Clawback Monitor
    /**
     * Start a background job that periodically polls for clawbackable transfers
     * and automatically claws them back.
     *
     * @param options - Monitor configuration options
     * @returns ClawbackMonitorHandle to control the monitor
     *
     * @example
     * ```typescript
     * const monitor = client.startClawbackMonitor({
     *   intervalMs: 60000, // Poll every 60 seconds
     *   onClawbackSuccess: (result) => console.log('Recovered:', result.transferId),
     *   onClawbackError: (transferId, error) => console.error('Failed:', transferId, error),
     * });
     *
     * // Later, to stop:
     * monitor.stop();
     * ```
     */
    startClawbackMonitor(options = {}) {
        const { intervalMs = 60000, // Default: 1 minute
        batchSize = 2, // Default: 2 clawbacks per batch (rate limit safe)
        batchDelayMs = 500, // Default: 500ms between batches
        maxTransfersPerPoll = 100, // Default: max 100 transfers per poll
        onClawbackSuccess, onClawbackError, onPollComplete, onPollError, } = options;
        let isRunning = true;
        let timeoutId = null;
        let currentPollPromise = null;
        const poll = async () => {
            const result = {
                transfersFound: 0,
                clawbacksAttempted: 0,
                clawbacksSucceeded: 0,
                clawbacksFailed: 0,
                results: [],
            };
            try {
                // Fetch clawbackable transfers
                const response = await this.listClawbackableTransfers({
                    limit: maxTransfersPerPoll,
                });
                result.transfersFound = response.transfers.length;
                if (response.transfers.length === 0) {
                    return result;
                }
                // Process in batches to respect rate limits
                for (let i = 0; i < response.transfers.length; i += batchSize) {
                    if (!isRunning) {
                        break;
                    }
                    const batch = response.transfers.slice(i, i + batchSize);
                    // Process batch concurrently
                    const batchResults = await Promise.all(batch.map(async (transfer) => {
                        result.clawbacksAttempted++;
                        try {
                            const clawbackResponse = await this.clawback({
                                sparkTransferId: transfer.id,
                                lpIdentityPublicKey: transfer.lpIdentityPublicKey,
                            });
                            const attemptResult = {
                                transferId: transfer.id,
                                success: true,
                                response: clawbackResponse,
                            };
                            result.clawbacksSucceeded++;
                            onClawbackSuccess?.(attemptResult);
                            return attemptResult;
                        }
                        catch (err) {
                            const attemptResult = {
                                transferId: transfer.id,
                                success: false,
                                error: err instanceof Error ? err.message : String(err),
                            };
                            result.clawbacksFailed++;
                            onClawbackError?.(transfer.id, err);
                            return attemptResult;
                        }
                    }));
                    result.results.push(...batchResults);
                    // Wait between batches if there are more to process
                    if (i + batchSize < response.transfers.length && isRunning) {
                        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
                    }
                }
            }
            catch (err) {
                onPollError?.(err);
            }
            return result;
        };
        const scheduleNextPoll = () => {
            if (!isRunning) {
                return;
            }
            timeoutId = setTimeout(async () => {
                if (!isRunning) {
                    return;
                }
                currentPollPromise = (async () => {
                    const result = await poll();
                    onPollComplete?.(result);
                    scheduleNextPoll();
                })();
            }, intervalMs);
        };
        // Start first poll immediately
        currentPollPromise = (async () => {
            const result = await poll();
            onPollComplete?.(result);
            scheduleNextPoll();
        })();
        return {
            isRunning: () => isRunning,
            stop: async () => {
                isRunning = false;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                // Wait for current poll to complete
                if (currentPollPromise) {
                    await currentPollPromise.catch(() => { });
                }
            },
            pollNow: async () => {
                if (!isRunning) {
                    throw new Error("Monitor is stopped");
                }
                return poll();
            },
        };
    }
    // Token Address Operations
    /**
     * Encode a token identifier into a human-readable token address using the client's Spark network
     * @param tokenIdentifier - Token identifier as hex string or Uint8Array
     * @returns Human-readable token address
     */
    encodeTokenAddress(tokenIdentifier) {
        return tokenAddress.encodeSparkHumanReadableTokenIdentifier(tokenIdentifier, this.sparkNetwork);
    }
    /**
     * Decode a human-readable token address back to its identifier
     * @param address - Human-readable token address
     * @returns Object containing the token identifier (as hex string) and Spark network
     */
    decodeTokenAddress(address) {
        return tokenAddress.decodeSparkHumanReadableTokenIdentifier(address, this.sparkNetwork);
    }
    /**
     * @deprecated Use encodeTokenAddress instead - this method uses legacy types
     * Encode a token identifier into a human-readable token address using legacy types
     * @param tokenIdentifier - Token identifier as hex string or Uint8Array
     * @returns Human-readable token address
     */
    encodeLegacyTokenAddress(tokenIdentifier) {
        return tokenAddress.encodeSparkHumanReadableTokenIdentifier(tokenIdentifier, this.sparkNetwork);
    }
    /**
     * @deprecated Use decodeTokenAddress instead - this method uses legacy types
     * Decode a human-readable token address back to its identifier using legacy types
     * @param address - Human-readable token address
     * @returns Object containing the token identifier (as hex string) and network
     */
    decodeLegacyTokenAddress(address) {
        return tokenAddress.decodeSparkHumanReadableTokenIdentifier(address, this.sparkNetwork);
    }
    // Status
    // Config Inspection
    /**
     * Get raw feature status list (cached briefly)
     */
    async getFeatureStatus() {
        await this.ensureInitialized();
        const now = Date.now();
        if (this.featureStatusCache && this.featureStatusCache.expiryMs > now) {
            return this.featureStatusCache.data;
        }
        const data = await this.typedApi.getFeatureStatus();
        this.featureStatusCache = {
            data,
            expiryMs: now + FlashnetClient.FEATURE_STATUS_TTL_MS,
        };
        return data;
    }
    /**
     * Get feature flags as a map of feature name to boolean (cached briefly)
     */
    async getFeatureFlags() {
        await this.ensureInitialized();
        return this.getFeatureStatusMap();
    }
    /**
     * Get raw min-amounts configuration list from the backend
     */
    async getMinAmounts() {
        await this.ensureInitialized();
        return this.typedApi.getMinAmounts();
    }
    /**
     * Get enabled min-amounts as a map keyed by hex asset identifier
     */
    async getMinAmountsMap() {
        await this.ensureInitialized();
        return this.getEnabledMinAmountsMap();
    }
    /**
     * Get allowed Asset B list for pool creation (cached for 60s)
     */
    async getAllowedAssets() {
        await this.ensureInitialized();
        const now = Date.now();
        if (this.allowedAssetsCache && this.allowedAssetsCache.expiryMs > now) {
            return this.allowedAssetsCache.data;
        }
        const allowed = await this.typedApi.getAllowedAssets();
        this.allowedAssetsCache = {
            data: allowed,
            expiryMs: now + FlashnetClient.ALLOWED_ASSETS_TTL_MS,
        };
        return allowed;
    }
    /**
     * Ping the settlement service
     */
    async ping() {
        await this.ensureInitialized();
        return this.typedApi.ping();
    }
    // Helper Methods
    /**
     * Performs asset transfer using generalized asset address for both BTC and tokens.
     */
    async transferAsset(recipient, checkBalanceErrorPrefix, useAvailableBalance) {
        const transferIds = await this.transferAssets([recipient], checkBalanceErrorPrefix, useAvailableBalance);
        return transferIds[0];
    }
    /**
     * Performs asset transfers using generalized asset addresses for both BTC and tokens.
     * Supports optional generic to hardcode recipients length so output list can be typed with same length.
     */
    async transferAssets(recipients, checkBalanceErrorPrefix, useAvailableBalance) {
        if (checkBalanceErrorPrefix) {
            await this.checkBalance({
                balancesToCheck: recipients,
                errorPrefix: checkBalanceErrorPrefix,
                useAvailableBalance,
            });
        }
        const transferIds = [];
        for (const recipient of recipients) {
            if (recipient.assetAddress === index$1.BTC_ASSET_PUBKEY) {
                const transfer = await this._wallet.transfer({
                    amountSats: Number(recipient.amount),
                    receiverSparkAddress: recipient.receiverSparkAddress,
                });
                transferIds.push(transfer.id);
            }
            else {
                const transferId = await this._wallet.transferTokens({
                    tokenIdentifier: this.toHumanReadableTokenIdentifier(recipient.assetAddress),
                    tokenAmount: BigInt(recipient.amount),
                    receiverSparkAddress: recipient.receiverSparkAddress,
                });
                transferIds.push(transferId);
            }
        }
        return transferIds;
    }
    /**
     * Helper method to add initial liquidity after pool creation
     */
    async addInitialLiquidity(poolId, assetAAddress, assetBAddress, assetAAmount, assetBAmount, assetAMinAmountIn, assetBMinAmountIn) {
        // Enforce gating and min-amount policy for initial liquidity
        await this.ensureAmmOperationAllowed("allow_add_liquidity");
        await this.assertAddLiquidityMeetsMinAmounts({
            poolId,
            assetAAmount,
            assetBAmount,
        });
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: poolId,
            network: this.sparkNetwork,
        });
        const [assetATransferId, assetBTransferId] = await this.transferAssets([
            {
                receiverSparkAddress: lpSparkAddress,
                assetAddress: assetAAddress,
                amount: assetAAmount,
            },
            {
                receiverSparkAddress: lpSparkAddress,
                assetAddress: assetBAddress,
                amount: assetBAmount,
            },
        ]);
        // Add liquidity
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateAddLiquidityIntentMessage({
            userPublicKey: this.publicKey,
            lpIdentityPublicKey: poolId,
            assetASparkTransferId: assetATransferId,
            assetBSparkTransferId: assetBTransferId,
            assetAAmount: assetAAmount.toString(),
            assetBAmount: assetBAmount.toString(),
            assetAMinAmountIn: assetAMinAmountIn.toString(),
            assetBMinAmountIn: assetBMinAmountIn.toString(),
            nonce,
        });
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            userPublicKey: this.publicKey,
            poolId: poolId,
            assetASparkTransferId: assetATransferId,
            assetBSparkTransferId: assetBTransferId,
            assetAAmountToAdd: assetAAmount.toString(),
            assetBAmountToAdd: assetBAmount.toString(),
            assetAMinAmountIn: assetAMinAmountIn.toString(),
            assetBMinAmountIn: assetBMinAmountIn.toString(),
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.addLiquidity(request);
        // Check if the initial liquidity addition was accepted
        if (!response.accepted) {
            const errorMessage = response.error || "Initial liquidity addition rejected by the AMM";
            throw new Error(errorMessage);
        }
    }
    // Lightning Payment with Token
    /**
     * Get a quote for paying a Lightning invoice with a token.
     * This calculates the optimal pool and token amount needed.
     *
     * @param invoice - BOLT11-encoded Lightning invoice
     * @param tokenAddress - Token identifier to use for payment
     * @param options - Optional configuration (slippage, integrator fees, etc.)
     * @returns Quote with pricing details
     * @throws Error if invoice amount or token amount is below Flashnet minimums
     */
    async getPayLightningWithTokenQuote(invoice, tokenAddress, options) {
        await this.ensureInitialized();
        // Decode the invoice to get the amount
        const invoiceAmountSats = await this.decodeInvoiceAmount(invoice);
        // Zero-amount invoice: forward-direction quoting using caller-specified tokenAmount
        if (!invoiceAmountSats || invoiceAmountSats <= 0) {
            const tokenAmount = options?.tokenAmount;
            if (!tokenAmount || BigInt(tokenAmount) <= 0n) {
                throw new errors.FlashnetError("Zero-amount invoice requires tokenAmount in options.", {
                    response: {
                        errorCode: "FSAG-1002",
                        errorCategory: "Validation",
                        message: "Zero-amount invoice requires tokenAmount in options.",
                        requestId: "",
                        timestamp: new Date().toISOString(),
                        service: "sdk",
                        severity: "Error",
                        remediation: "Provide tokenAmount when using a zero-amount invoice.",
                    },
                });
            }
            return this.getZeroAmountInvoiceQuote(invoice, tokenAddress, tokenAmount, options);
        }
        // Get Lightning fee estimate
        const lightningFeeEstimate = await this.getLightningFeeEstimate(invoice);
        // Total BTC needed = invoice amount + lightning fee (unmasked).
        // Bitmasking for V2 pools is handled inside findBestPoolForTokenToBtc.
        const baseBtcNeeded = BigInt(invoiceAmountSats) + BigInt(lightningFeeEstimate);
        // Check Flashnet minimum amounts early to provide clear error messages
        const minAmounts = await this.getEnabledMinAmountsMap();
        // Check BTC minimum (output from swap)
        const btcMinAmount = minAmounts.get(index$1.BTC_ASSET_PUBKEY.toLowerCase());
        if (btcMinAmount && baseBtcNeeded < btcMinAmount) {
            const msg = `Invoice amount too small. Minimum BTC output is ${btcMinAmount} sats, but invoice + lightning fee totals only ${baseBtcNeeded} sats.`;
            throw new errors.FlashnetError(msg, {
                response: {
                    errorCode: "FSAG-1003",
                    errorCategory: "Validation",
                    message: msg,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                    remediation: `Use an invoice of at least ${btcMinAmount} sats.`,
                },
            });
        }
        // Find the best pool to swap token -> BTC.
        // Bitmasking is applied per-pool inside this function (V2 pools get masked, V3 pools don't).
        const poolQuote = await this.findBestPoolForTokenToBtc(tokenAddress, baseBtcNeeded.toString(), options?.integratorFeeRateBps);
        // Check token minimum (input to swap)
        const tokenHex = this.toHexTokenIdentifier(tokenAddress).toLowerCase();
        const tokenMinAmount = minAmounts.get(tokenHex);
        if (tokenMinAmount &&
            bigint.safeBigInt(poolQuote.tokenAmountRequired) < tokenMinAmount) {
            const msg = `Token amount too small. Minimum input is ${tokenMinAmount} units, but calculated amount is only ${poolQuote.tokenAmountRequired} units.`;
            throw new errors.FlashnetError(msg, {
                response: {
                    errorCode: "FSAG-1003",
                    errorCategory: "Validation",
                    message: msg,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                    remediation: "Use a larger invoice amount.",
                },
            });
        }
        // BTC variable fee adjustment: difference between what the pool targets and unmasked base.
        // For V3 pools this is 0 (no masking). For V2 it's the rounding overhead.
        const btcVariableFeeAdjustment = Number(bigint.safeBigInt(poolQuote.btcAmountUsed) - baseBtcNeeded);
        return {
            poolId: poolQuote.poolId,
            tokenAddress: this.toHexTokenIdentifier(tokenAddress),
            tokenAmountRequired: poolQuote.tokenAmountRequired,
            btcAmountRequired: poolQuote.btcAmountUsed,
            invoiceAmountSats: invoiceAmountSats,
            estimatedAmmFee: poolQuote.estimatedAmmFee,
            estimatedLightningFee: lightningFeeEstimate,
            btcVariableFeeAdjustment,
            executionPrice: poolQuote.executionPrice,
            priceImpactPct: poolQuote.priceImpactPct,
            tokenIsAssetA: poolQuote.tokenIsAssetA,
            poolReserves: poolQuote.poolReserves,
            warningMessage: poolQuote.warningMessage,
            curveType: poolQuote.curveType,
            isZeroAmountInvoice: false,
        };
    }
    /**
     * Generate a quote for a zero-amount invoice.
     * Forward-direction: simulate swapping tokenAmount and pick the pool with the best BTC output.
     * @private
     */
    async getZeroAmountInvoiceQuote(invoice, tokenAddress, tokenAmount, options) {
        const tokenHex = this.toHexTokenIdentifier(tokenAddress);
        const btcHex = index$1.BTC_ASSET_PUBKEY;
        // Discover all token/BTC pools
        const [poolsWithTokenAsA, poolsWithTokenAsB] = await Promise.all([
            this.listPools({ assetAAddress: tokenHex, assetBAddress: btcHex }),
            this.listPools({ assetAAddress: btcHex, assetBAddress: tokenHex }),
        ]);
        const poolMap = new Map();
        for (const p of [...poolsWithTokenAsA.pools, ...poolsWithTokenAsB.pools]) {
            if (!poolMap.has(p.lpPublicKey)) {
                const tokenIsAssetA = p.assetAAddress?.toLowerCase() === tokenHex.toLowerCase();
                poolMap.set(p.lpPublicKey, { pool: p, tokenIsAssetA });
            }
        }
        const allPools = Array.from(poolMap.values());
        if (allPools.length === 0) {
            throw new errors.FlashnetError(`No liquidity pool found for token ${tokenAddress} paired with BTC`, {
                response: {
                    errorCode: "FSAG-4001",
                    errorCategory: "Business",
                    message: `No liquidity pool found for token ${tokenAddress} paired with BTC`,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                },
            });
        }
        // Simulate each pool with tokenAmount as input, pick highest BTC output
        let bestResult = null;
        let bestBtcOut = 0n;
        for (const { pool, tokenIsAssetA } of allPools) {
            try {
                const poolDetails = await this.getPool(pool.lpPublicKey);
                const assetInAddress = tokenIsAssetA
                    ? poolDetails.assetAAddress
                    : poolDetails.assetBAddress;
                const assetOutAddress = tokenIsAssetA
                    ? poolDetails.assetBAddress
                    : poolDetails.assetAAddress;
                const simulation = await this.simulateSwap({
                    poolId: pool.lpPublicKey,
                    assetInAddress,
                    assetOutAddress,
                    amountIn: tokenAmount,
                    integratorBps: options?.integratorFeeRateBps,
                });
                const btcOut = bigint.safeBigInt(simulation.amountOut);
                if (btcOut > bestBtcOut) {
                    bestBtcOut = btcOut;
                    bestResult = {
                        poolId: pool.lpPublicKey,
                        tokenIsAssetA,
                        simulation,
                        curveType: poolDetails.curveType,
                        poolReserves: {
                            assetAReserve: poolDetails.assetAReserve,
                            assetBReserve: poolDetails.assetBReserve,
                        },
                    };
                }
            }
            catch {
                // Skip pools that fail simulation
            }
        }
        if (!bestResult || bestBtcOut <= 0n) {
            throw new errors.FlashnetError("No pool can produce BTC output for the given token amount", {
                response: {
                    errorCode: "FSAG-4201",
                    errorCategory: "Business",
                    message: "No pool can produce BTC output for the given token amount",
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                    remediation: "Try a larger token amount.",
                },
            });
        }
        // Estimate lightning fee from the BTC output
        let lightningFeeEstimate;
        try {
            lightningFeeEstimate = await this.getLightningFeeEstimate(invoice);
        }
        catch {
            lightningFeeEstimate = Math.max(5, Math.ceil(Number(bestBtcOut) * 0.0017));
        }
        // Check minimum amounts
        const minAmounts = await this.getEnabledMinAmountsMap();
        const btcMinAmount = minAmounts.get(index$1.BTC_ASSET_PUBKEY.toLowerCase());
        if (btcMinAmount && bestBtcOut < btcMinAmount) {
            const msg = `BTC output too small. Minimum is ${btcMinAmount} sats, but swap would produce only ${bestBtcOut} sats.`;
            throw new errors.FlashnetError(msg, {
                response: {
                    errorCode: "FSAG-1003",
                    errorCategory: "Validation",
                    message: msg,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                    remediation: "Use a larger token amount.",
                },
            });
        }
        return {
            poolId: bestResult.poolId,
            tokenAddress: tokenHex,
            tokenAmountRequired: tokenAmount,
            btcAmountRequired: bestBtcOut.toString(),
            invoiceAmountSats: 0,
            estimatedAmmFee: bestResult.simulation.feePaidAssetIn || "0",
            estimatedLightningFee: lightningFeeEstimate,
            btcVariableFeeAdjustment: 0,
            executionPrice: bestResult.simulation.executionPrice || "0",
            priceImpactPct: bestResult.simulation.priceImpactPct || "0",
            tokenIsAssetA: bestResult.tokenIsAssetA,
            poolReserves: bestResult.poolReserves,
            warningMessage: bestResult.simulation.warningMessage,
            curveType: bestResult.curveType,
            isZeroAmountInvoice: true,
        };
    }
    /**
     * Pay a Lightning invoice using a token.
     * This swaps the token to BTC on Flashnet and uses the BTC to pay the invoice.
     *
     * @param options - Payment options including invoice and token address
     * @returns Payment result with transaction details
     */
    async payLightningWithToken(options) {
        await this.ensureInitialized();
        const { invoice, tokenAddress, tokenAmount, maxSlippageBps = 500, // 5% default
        maxLightningFeeSats, preferSpark = true, integratorFeeRateBps, integratorPublicKey, transferTimeoutMs = 30000, // 30s default
        rollbackOnFailure = false, useExistingBtcBalance = false, useAvailableBalance = false, } = options;
        try {
            // Step 1: Get a quote for the payment
            const quote = await this.getPayLightningWithTokenQuote(invoice, tokenAddress, {
                maxSlippageBps,
                integratorFeeRateBps,
                tokenAmount,
            });
            // Step 2: Check token balance (always required)
            await this.checkBalance({
                balancesToCheck: [
                    {
                        assetAddress: tokenAddress,
                        amount: quote.tokenAmountRequired,
                    },
                ],
                errorPrefix: "Insufficient token balance for Lightning payment: ",
                useAvailableBalance,
            });
            // Step 3: Get pool details
            const pool = await this.getPool(quote.poolId);
            // Step 4: Determine swap direction and execute
            const assetInAddress = quote.tokenIsAssetA
                ? pool.assetAAddress
                : pool.assetBAddress;
            const assetOutAddress = quote.tokenIsAssetA
                ? pool.assetBAddress
                : pool.assetAAddress;
            const effectiveMaxLightningFee = maxLightningFeeSats ?? quote.estimatedLightningFee;
            // Floor minAmountOut at invoiceAmount + fee so the swap never returns
            // less BTC than the lightning payment requires.
            const slippageMin = this.calculateMinAmountOut(quote.btcAmountRequired, maxSlippageBps);
            const baseBtcNeeded = !quote.isZeroAmountInvoice
                ? BigInt(quote.invoiceAmountSats) + BigInt(effectiveMaxLightningFee)
                : 0n;
            const minBtcOut = BigInt(slippageMin) >= baseBtcNeeded
                ? slippageMin
                : baseBtcNeeded.toString();
            // Execute the swap
            const swapResponse = await this.executeSwap({
                poolId: quote.poolId,
                assetInAddress,
                assetOutAddress,
                amountIn: quote.tokenAmountRequired,
                maxSlippageBps,
                minAmountOut: minBtcOut,
                integratorFeeRateBps,
                integratorPublicKey,
                useAvailableBalance,
            });
            if (!swapResponse.accepted || !swapResponse.outboundTransferId) {
                return {
                    success: false,
                    poolId: quote.poolId,
                    tokenAmountSpent: quote.tokenAmountRequired,
                    btcAmountReceived: "0",
                    swapTransferId: swapResponse.outboundTransferId || "",
                    ammFeePaid: quote.estimatedAmmFee,
                    sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                    error: swapResponse.error || "Swap was not accepted",
                };
            }
            // Step 5: Claim the swap output and refresh wallet state.
            // Suppress leaf optimization for the entire claim-to-pay window so
            // the SSP cannot swap away the leaves we need for lightning payment.
            const restoreOptimization = this.suppressOptimization();
            try {
                let canPayImmediately = false;
                if (!quote.isZeroAmountInvoice && useExistingBtcBalance) {
                    const invoiceAmountSats = await this.decodeInvoiceAmount(invoice);
                    const btcNeededForPayment = invoiceAmountSats + effectiveMaxLightningFee;
                    const balance = await this.getBalance();
                    canPayImmediately =
                        balance.balance >= bigint.safeBigInt(btcNeededForPayment);
                }
                if (!canPayImmediately) {
                    const claimed = await this.instaClaimTransfer(swapResponse.outboundTransferId, transferTimeoutMs);
                    if (!claimed) {
                        return {
                            success: false,
                            poolId: quote.poolId,
                            tokenAmountSpent: quote.tokenAmountRequired,
                            btcAmountReceived: swapResponse.amountOut || "0",
                            swapTransferId: swapResponse.outboundTransferId,
                            ammFeePaid: quote.estimatedAmmFee,
                            sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                            error: "Transfer did not complete within timeout",
                        };
                    }
                }
                // Step 6: Calculate payment amount
                const requestedMaxLightningFee = effectiveMaxLightningFee;
                const btcReceived = swapResponse.amountOut || quote.btcAmountRequired;
                // Cap the lightning fee budget to what the wallet can actually cover.
                // The swap output may be slightly less than quoted due to rounding or
                // price movement between quote and execution. The Spark SDK requires
                // invoiceAmount + maxFeeSats <= balance, so we adjust maxFeeSats down
                // when the actual BTC received is less than expected.
                let cappedMaxLightningFee = requestedMaxLightningFee;
                if (!quote.isZeroAmountInvoice) {
                    const actualBtc = bigint.safeBigInt(btcReceived);
                    const invoiceAmount = bigint.safeBigInt(quote.invoiceAmountSats);
                    const available = actualBtc - invoiceAmount;
                    if (available > 0n && available < bigint.safeBigInt(cappedMaxLightningFee)) {
                        cappedMaxLightningFee = Number(available);
                    }
                }
                // Step 7: Pay the Lightning invoice
                try {
                    let lightningPayment;
                    let invoiceAmountPaid;
                    if (quote.isZeroAmountInvoice) {
                        const actualBtc = bigint.safeBigInt(btcReceived);
                        const lnFee = bigint.safeBigInt(cappedMaxLightningFee);
                        const amountToPay = actualBtc - lnFee;
                        if (amountToPay <= 0n) {
                            return {
                                success: false,
                                poolId: quote.poolId,
                                tokenAmountSpent: quote.tokenAmountRequired,
                                btcAmountReceived: btcReceived,
                                swapTransferId: swapResponse.outboundTransferId,
                                ammFeePaid: quote.estimatedAmmFee,
                                sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                                error: `BTC received (${btcReceived} sats) is not enough to cover lightning fee (${cappedMaxLightningFee} sats).`,
                            };
                        }
                        invoiceAmountPaid = Number(amountToPay);
                        lightningPayment = await this._wallet.payLightningInvoice({
                            invoice,
                            amountSats: invoiceAmountPaid,
                            maxFeeSats: cappedMaxLightningFee,
                            preferSpark,
                        });
                    }
                    else {
                        lightningPayment = await this._wallet.payLightningInvoice({
                            invoice,
                            maxFeeSats: cappedMaxLightningFee,
                            preferSpark,
                        });
                    }
                    // Extract the Spark transfer ID from the lightning payment result.
                    // payLightningInvoice returns LightningSendRequest | WalletTransfer:
                    //   - LightningSendRequest has .transfer?.sparkId (the Sparkscan-visible transfer ID)
                    //   - WalletTransfer (Spark-to-Spark) has .id directly as the transfer ID
                    // Note: lightningPayment.id (the SSP request ID) is already returned as lightningPaymentId
                    const sparkLightningTransferId = lightningPayment.transfer?.sparkId;
                    return {
                        success: true,
                        poolId: quote.poolId,
                        tokenAmountSpent: quote.tokenAmountRequired,
                        btcAmountReceived: btcReceived,
                        swapTransferId: swapResponse.outboundTransferId,
                        lightningPaymentId: lightningPayment.id,
                        ammFeePaid: quote.estimatedAmmFee,
                        lightningFeePaid: cappedMaxLightningFee,
                        invoiceAmountPaid,
                        sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                        sparkLightningTransferId,
                    };
                }
                catch (lightningError) {
                    // Lightning payment failed after swap succeeded
                    const lightningErrorMessage = lightningError instanceof Error
                        ? lightningError.message
                        : String(lightningError);
                    // Attempt rollback if requested
                    if (rollbackOnFailure) {
                        try {
                            const rollbackResult = await this.rollbackSwap(quote.poolId, btcReceived, tokenAddress, maxSlippageBps);
                            if (rollbackResult.success) {
                                return {
                                    success: false,
                                    poolId: quote.poolId,
                                    tokenAmountSpent: "0", // Rolled back
                                    btcAmountReceived: "0",
                                    swapTransferId: swapResponse.outboundTransferId,
                                    ammFeePaid: quote.estimatedAmmFee,
                                    sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                                    error: `Lightning payment failed: ${lightningErrorMessage}. Funds rolled back to ${rollbackResult.tokenAmount} tokens.`,
                                };
                            }
                        }
                        catch (rollbackError) {
                            const rollbackErrorMessage = rollbackError instanceof Error
                                ? rollbackError.message
                                : String(rollbackError);
                            return {
                                success: false,
                                poolId: quote.poolId,
                                tokenAmountSpent: quote.tokenAmountRequired,
                                btcAmountReceived: btcReceived,
                                swapTransferId: swapResponse.outboundTransferId,
                                ammFeePaid: quote.estimatedAmmFee,
                                sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                                error: `Lightning payment failed: ${lightningErrorMessage}. Rollback also failed: ${rollbackErrorMessage}. BTC remains in wallet.`,
                            };
                        }
                    }
                    return {
                        success: false,
                        poolId: quote.poolId,
                        tokenAmountSpent: quote.tokenAmountRequired,
                        btcAmountReceived: btcReceived,
                        swapTransferId: swapResponse.outboundTransferId,
                        ammFeePaid: quote.estimatedAmmFee,
                        sparkTokenTransferId: swapResponse.inboundSparkTransferId,
                        error: `Lightning payment failed: ${lightningErrorMessage}. BTC (${btcReceived} sats) remains in wallet.`,
                    };
                }
            }
            finally {
                restoreOptimization();
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                poolId: "",
                tokenAmountSpent: "0",
                btcAmountReceived: "0",
                swapTransferId: "",
                ammFeePaid: "0",
                error: errorMessage,
            };
        }
    }
    /**
     * Attempt to rollback a swap by swapping BTC back to the original token
     * @private
     */
    async rollbackSwap(poolId, btcAmount, tokenAddress, maxSlippageBps) {
        const pool = await this.getPool(poolId);
        const tokenHex = this.toHexTokenIdentifier(tokenAddress);
        // Determine swap direction (BTC -> Token)
        const tokenIsAssetA = pool.assetAAddress === tokenHex;
        const assetInAddress = tokenIsAssetA
            ? pool.assetBAddress
            : pool.assetAAddress; // BTC
        const assetOutAddress = tokenIsAssetA
            ? pool.assetAAddress
            : pool.assetBAddress; // Token
        // Calculate expected token output and min amount with slippage
        // For rollback, we accept more slippage since we're recovering from failure
        const minAmountOut = "0"; // Accept any amount to ensure rollback succeeds
        // Execute reverse swap
        const swapResponse = await this.executeSwap({
            poolId,
            assetInAddress,
            assetOutAddress,
            amountIn: btcAmount,
            maxSlippageBps: maxSlippageBps * 2, // Double slippage for rollback
            minAmountOut,
        });
        if (!swapResponse.accepted) {
            throw new Error(swapResponse.error || "Rollback swap not accepted");
        }
        // Wait for the rollback transfer
        if (swapResponse.outboundTransferId) {
            await this.waitForTransferCompletion(swapResponse.outboundTransferId, 30000);
        }
        return {
            success: true,
            tokenAmount: swapResponse.amountOut,
        };
    }
    /**
     * Find the best pool for swapping a token to BTC
     * @private
     */
    async findBestPoolForTokenToBtc(tokenAddress, baseBtcNeeded, integratorFeeRateBps) {
        const tokenHex = this.toHexTokenIdentifier(tokenAddress);
        const btcHex = index$1.BTC_ASSET_PUBKEY;
        // Find all pools that have this token paired with BTC
        // Note: The API may return the same pool for both filter combinations,
        // so we need to deduplicate and determine tokenIsAssetA from actual pool data
        const poolsWithTokenAsA = await this.listPools({
            assetAAddress: tokenHex,
            assetBAddress: btcHex,
        });
        const poolsWithTokenAsB = await this.listPools({
            assetAAddress: btcHex,
            assetBAddress: tokenHex,
        });
        // Deduplicate pools by poolId and determine tokenIsAssetA from actual pool addresses
        const poolMap = new Map();
        for (const p of [...poolsWithTokenAsA.pools, ...poolsWithTokenAsB.pools]) {
            if (!poolMap.has(p.lpPublicKey)) {
                // Determine tokenIsAssetA from actual pool asset addresses, not from which query returned it
                const tokenIsAssetA = p.assetAAddress?.toLowerCase() === tokenHex.toLowerCase();
                poolMap.set(p.lpPublicKey, { pool: p, tokenIsAssetA });
            }
        }
        const allPools = Array.from(poolMap.values()).map(({ pool, tokenIsAssetA }) => ({
            ...pool,
            tokenIsAssetA,
        }));
        if (allPools.length === 0) {
            throw new errors.FlashnetError(`No liquidity pool found for token ${tokenAddress} paired with BTC`, {
                response: {
                    errorCode: "FSAG-4001",
                    errorCategory: "Business",
                    message: `No liquidity pool found for token ${tokenAddress} paired with BTC`,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                },
            });
        }
        // Pre-check: Get minimum amounts to provide clear error if invoice is too small
        const minAmounts = await this.getMinAmountsMap();
        const btcMinAmount = minAmounts.get(index$1.BTC_ASSET_PUBKEY.toLowerCase());
        // Check if the BTC amount needed is below the minimum
        if (btcMinAmount && BigInt(baseBtcNeeded) < btcMinAmount) {
            const msg = `Invoice amount too small. Minimum ${btcMinAmount} sats required, but invoice only requires ${baseBtcNeeded} sats.`;
            throw new errors.FlashnetError(msg, {
                response: {
                    errorCode: "FSAG-1003",
                    errorCategory: "Validation",
                    message: msg,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                    remediation: `Use an invoice with at least ${btcMinAmount} sats.`,
                },
            });
        }
        // Compute V2 masked BTC amount (round up to next multiple of 64 for bit masking)
        const baseBtc = BigInt(baseBtcNeeded);
        const BTC_VARIABLE_FEE_BITS = 6n;
        const BTC_VARIABLE_FEE_MASK = 1n << BTC_VARIABLE_FEE_BITS; // 64
        const maskedBtc = ((baseBtc + BTC_VARIABLE_FEE_MASK - 1n) / BTC_VARIABLE_FEE_MASK) *
            BTC_VARIABLE_FEE_MASK;
        // Find the best pool (lowest token cost for the required BTC)
        let bestPool = null;
        let bestTokenAmount = BigInt(Number.MAX_SAFE_INTEGER);
        let bestBtcTarget = 0n;
        let bestCurveType = "";
        let bestSimulation = null;
        // Track errors for each pool to provide better diagnostics
        const poolErrors = [];
        for (const pool of allPools) {
            try {
                // Get pool details for reserves and curve type
                const poolDetails = await this.getPool(pool.lpPublicKey);
                const isV3 = poolDetails.curveType === "V3_CONCENTRATED";
                // V3 pools use exact BTC amount, V2 pools use masked amount
                const btcTarget = isV3 ? baseBtc : maskedBtc;
                const assetInAddress = pool.tokenIsAssetA
                    ? poolDetails.assetAAddress
                    : poolDetails.assetBAddress;
                const assetOutAddress = pool.tokenIsAssetA
                    ? poolDetails.assetBAddress
                    : poolDetails.assetAAddress;
                let tokenAmount;
                let fee;
                let executionPrice;
                let priceImpactPct;
                let warningMessage;
                if (isV3) {
                    // V3: binary search with simulateSwap
                    const v3Result = await this.findV3TokenAmountForBtcOutput({
                        poolId: pool.lpPublicKey,
                        assetInAddress,
                        assetOutAddress,
                        desiredBtcOut: btcTarget,
                        currentPriceAInB: poolDetails.currentPriceAInB,
                        tokenIsAssetA: pool.tokenIsAssetA,
                        integratorBps: integratorFeeRateBps,
                    });
                    tokenAmount = bigint.safeBigInt(v3Result.amountIn);
                    fee = v3Result.totalFee;
                    executionPrice = v3Result.simulation.executionPrice || "0";
                    priceImpactPct = v3Result.simulation.priceImpactPct || "0";
                    warningMessage = v3Result.simulation.warningMessage;
                }
                else {
                    // V2: constant product math + simulation verification
                    const calculation = this.calculateTokenAmountForBtcOutput(btcTarget.toString(), poolDetails.assetAReserve, poolDetails.assetBReserve, poolDetails.lpFeeBps, poolDetails.hostFeeBps, pool.tokenIsAssetA, integratorFeeRateBps);
                    tokenAmount = bigint.safeBigInt(calculation.amountIn);
                    // Verify with simulation
                    const simulation = await this.simulateSwap({
                        poolId: pool.lpPublicKey,
                        assetInAddress,
                        assetOutAddress,
                        amountIn: calculation.amountIn,
                        integratorBps: integratorFeeRateBps,
                    });
                    if (bigint.safeBigInt(simulation.amountOut) < btcTarget) {
                        const btcReserve = pool.tokenIsAssetA
                            ? poolDetails.assetBReserve
                            : poolDetails.assetAReserve;
                        poolErrors.push({
                            poolId: pool.lpPublicKey,
                            error: `Simulation output (${simulation.amountOut} sats) < required (${btcTarget} sats)`,
                            btcReserve,
                        });
                        continue;
                    }
                    fee = calculation.totalFee;
                    executionPrice = simulation.executionPrice || "0";
                    priceImpactPct = simulation.priceImpactPct || "0";
                    warningMessage = simulation.warningMessage;
                }
                // Check if this pool offers a better rate
                if (tokenAmount < bestTokenAmount) {
                    bestPool = pool;
                    bestTokenAmount = tokenAmount;
                    bestBtcTarget = btcTarget;
                    bestCurveType = poolDetails.curveType;
                    bestSimulation = {
                        amountIn: tokenAmount.toString(),
                        fee,
                        executionPrice,
                        priceImpactPct,
                        warningMessage,
                    };
                }
            }
            catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                poolErrors.push({
                    poolId: pool.lpPublicKey,
                    error: errorMessage,
                });
            }
        }
        if (!bestPool || !bestSimulation) {
            let errorMessage = `No pool has sufficient liquidity for ${baseBtcNeeded} sats`;
            if (poolErrors.length > 0) {
                const details = poolErrors
                    .map((pe) => {
                    const reserveInfo = pe.btcReserve
                        ? ` (BTC reserve: ${pe.btcReserve})`
                        : "";
                    return `  - Pool ${pe.poolId.slice(0, 12)}...${reserveInfo}: ${pe.error}`;
                })
                    .join("\n");
                errorMessage += `\n\nPool evaluation details:\n${details}`;
            }
            throw new errors.FlashnetError(errorMessage, {
                response: {
                    errorCode: "FSAG-4201",
                    errorCategory: "Business",
                    message: errorMessage,
                    requestId: "",
                    timestamp: new Date().toISOString(),
                    service: "sdk",
                    severity: "Error",
                    remediation: "Try a smaller amount or wait for more liquidity.",
                },
            });
        }
        const poolDetails = await this.getPool(bestPool.lpPublicKey);
        return {
            poolId: bestPool.lpPublicKey,
            tokenAmountRequired: bestSimulation.amountIn,
            estimatedAmmFee: bestSimulation.fee,
            executionPrice: bestSimulation.executionPrice,
            priceImpactPct: bestSimulation.priceImpactPct,
            tokenIsAssetA: bestPool.tokenIsAssetA,
            poolReserves: {
                assetAReserve: poolDetails.assetAReserve,
                assetBReserve: poolDetails.assetBReserve,
            },
            warningMessage: bestSimulation.warningMessage,
            btcAmountUsed: bestBtcTarget.toString(),
            curveType: bestCurveType,
        };
    }
    /**
     * Calculate the token amount needed to get a specific BTC output.
     * Implements the AMM fee-inclusive model.
     * @private
     */
    calculateTokenAmountForBtcOutput(btcAmountOut, reserveA, reserveB, lpFeeBps, hostFeeBps, tokenIsAssetA, integratorFeeBps) {
        const amountOut = bigint.safeBigInt(btcAmountOut);
        const resA = bigint.safeBigInt(reserveA);
        const resB = bigint.safeBigInt(reserveB);
        const totalFeeBps = lpFeeBps + hostFeeBps + (integratorFeeBps || 0);
        const feeRate = Number(totalFeeBps) / 10000; // Convert bps to decimal
        // Token is the input asset
        // BTC is the output asset
        if (tokenIsAssetA) {
            // Token is asset A, BTC is asset B
            // A → B swap: we want BTC out (asset B)
            // reserve_in = reserveA (token), reserve_out = reserveB (BTC)
            // Constant product formula for amount_in given amount_out:
            // amount_in_effective = (reserve_in * amount_out) / (reserve_out - amount_out)
            const reserveIn = resA;
            const reserveOut = resB;
            if (amountOut >= reserveOut) {
                throw new Error("Insufficient liquidity: requested BTC amount exceeds reserve");
            }
            // Calculate effective amount in (before fees)
            const amountInEffective = (reserveIn * amountOut) / (reserveOut - amountOut) + 1n; // +1 for rounding up
            // A→B swap: LP fee deducted from input A, integrator fee from output B
            // amount_in = amount_in_effective * (1 + lp_fee_rate)
            // Then integrator fee is deducted from output, so we need slightly more input
            const lpFeeRate = Number(lpFeeBps) / 10000;
            const integratorFeeRate = Number(integratorFeeBps || 0) / 10000;
            // Account for LP fee on input
            const amountInWithLpFee = BigInt(Math.ceil(Number(amountInEffective) * (1 + lpFeeRate)));
            // Account for integrator fee on output (need more input to get same output after fee)
            const amountIn = integratorFeeRate > 0
                ? BigInt(Math.ceil(Number(amountInWithLpFee) * (1 + integratorFeeRate)))
                : amountInWithLpFee;
            const totalFee = amountIn - amountInEffective;
            return {
                amountIn: amountIn.toString(),
                totalFee: totalFee.toString(),
            };
        }
        else {
            // Token is asset B, BTC is asset A
            // B → A swap: we want BTC out (asset A)
            // reserve_in = reserveB (token), reserve_out = reserveA (BTC)
            const reserveIn = resB;
            const reserveOut = resA;
            if (amountOut >= reserveOut) {
                throw new Error("Insufficient liquidity: requested BTC amount exceeds reserve");
            }
            // Calculate effective amount in (before fees)
            const amountInEffective = (reserveIn * amountOut) / (reserveOut - amountOut) + 1n; // +1 for rounding up
            // B→A swap: ALL fees (LP + integrator) deducted from input B
            // amount_in = amount_in_effective * (1 + total_fee_rate)
            const amountIn = BigInt(Math.ceil(Number(amountInEffective) * (1 + feeRate)));
            // Fee calculation: fee = amount_in * fee_rate / (1 + fee_rate)
            const totalFee = BigInt(Math.ceil((Number(amountIn) * feeRate) / (1 + feeRate)));
            return {
                amountIn: amountIn.toString(),
                totalFee: totalFee.toString(),
            };
        }
    }
    /**
     * Find the token amount needed to get a specific BTC output from a V3 concentrated liquidity pool.
     * Uses binary search with simulateSwap since V3 tick-based math can't be inverted locally.
     * @private
     */
    async findV3TokenAmountForBtcOutput(params) {
        const { poolId, assetInAddress, assetOutAddress, desiredBtcOut, currentPriceAInB, tokenIsAssetA, integratorBps, } = params;
        // Step 1: Compute initial estimate from pool price
        let estimate;
        if (currentPriceAInB && currentPriceAInB !== "0") {
            const price = Number(currentPriceAInB);
            if (tokenIsAssetA) {
                // priceAInB = how much B (BTC) per 1 A (token), so tokenNeeded = btcOut / price
                estimate = BigInt(Math.ceil(Number(desiredBtcOut) / price));
            }
            else {
                // priceAInB = how much B (token) per 1 A (BTC), so tokenNeeded = btcOut * price
                estimate = BigInt(Math.ceil(Number(desiredBtcOut) * price));
            }
            // Ensure non-zero
            if (estimate <= 0n) {
                estimate = desiredBtcOut * 2n;
            }
        }
        else {
            estimate = desiredBtcOut * 2n;
        }
        // Step 2: Find upper bound by simulating with estimate + 10% buffer
        let upperBound = (estimate * 110n) / 100n;
        if (upperBound <= 0n) {
            upperBound = 1n;
        }
        let upperSim = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const sim = await this.simulateSwap({
                poolId,
                assetInAddress,
                assetOutAddress,
                amountIn: upperBound.toString(),
                integratorBps,
            });
            if (bigint.safeBigInt(sim.amountOut) >= desiredBtcOut) {
                upperSim = sim;
                break;
            }
            // Double the upper bound
            upperBound = upperBound * 2n;
        }
        if (!upperSim) {
            throw new Error(`V3 pool ${poolId} has insufficient liquidity for ${desiredBtcOut} sats`);
        }
        // Step 3: Refine estimate via linear interpolation
        const upperOut = bigint.safeBigInt(upperSim.amountOut);
        // Scale proportionally: if upperBound produced upperOut, we need roughly
        // (upperBound * desiredBtcOut / upperOut). Add +1 to avoid undershoot from truncation.
        let refined = (upperBound * desiredBtcOut) / upperOut + 1n;
        if (refined <= 0n) {
            refined = 1n;
        }
        let bestAmountIn = upperBound;
        let bestSim = upperSim;
        // Check if the refined estimate is tighter
        if (refined < upperBound) {
            const refinedSim = await this.simulateSwap({
                poolId,
                assetInAddress,
                assetOutAddress,
                amountIn: refined.toString(),
                integratorBps,
            });
            if (bigint.safeBigInt(refinedSim.amountOut) >= desiredBtcOut) {
                bestAmountIn = refined;
                bestSim = refinedSim;
            }
            else {
                // Refined estimate was slightly too low. Keep upperBound as best,
                // and let binary search narrow between refined (too low) and upperBound (sufficient).
                bestAmountIn = upperBound;
                bestSim = upperSim;
            }
        }
        // Step 4: Binary search to converge on minimum amountIn
        // Use a tight range: the interpolation is close, so search between 99.5% and 100% of best
        let lo = bestAmountIn === upperBound
            ? refined < upperBound
                ? refined
                : (bestAmountIn * 99n) / 100n
            : (bestAmountIn * 999n) / 1000n;
        if (lo <= 0n) {
            lo = 1n;
        }
        let hi = bestAmountIn;
        for (let i = 0; i < 6; i++) {
            if (hi - lo <= 1n) {
                break;
            }
            const mid = (lo + hi) / 2n;
            const midSim = await this.simulateSwap({
                poolId,
                assetInAddress,
                assetOutAddress,
                amountIn: mid.toString(),
                integratorBps,
            });
            if (bigint.safeBigInt(midSim.amountOut) >= desiredBtcOut) {
                hi = mid;
                bestAmountIn = mid;
                bestSim = midSim;
            }
            else {
                lo = mid;
            }
        }
        // Compute fee from the best simulation
        const totalFee = bestSim.feePaidAssetIn || "0";
        return {
            amountIn: bestAmountIn.toString(),
            totalFee,
            simulation: bestSim,
        };
    }
    /**
     * Calculate minimum amount out with slippage protection
     * @private
     */
    calculateMinAmountOut(expectedAmount, slippageBps) {
        const amount = BigInt(expectedAmount);
        const slippageFactor = BigInt(10000 - slippageBps);
        const minAmount = (amount * slippageFactor) / 10000n;
        return minAmount.toString();
    }
    /**
     * Wait for a transfer to be claimed using wallet events.
     * This is more efficient than polling as it uses the wallet's event stream.
     * @private
     */
    async waitForTransferCompletion(transferId, timeoutMs) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                // Remove listener on timeout
                try {
                    this._wallet.removeListener?.("transfer:claimed", handler);
                }
                catch {
                    // Ignore if removeListener doesn't exist
                }
                resolve(false);
            }, timeoutMs);
            const handler = (claimedTransferId, _balance) => {
                if (claimedTransferId === transferId) {
                    clearTimeout(timeout);
                    try {
                        this._wallet.removeListener?.("transfer:claimed", handler);
                    }
                    catch {
                        // Ignore if removeListener doesn't exist
                    }
                    resolve(true);
                }
            };
            // Subscribe to transfer claimed events
            // The wallet's RPC stream will automatically claim incoming transfers
            try {
                this._wallet.on?.("transfer:claimed", handler);
            }
            catch {
                // If event subscription fails, fall back to polling
                clearTimeout(timeout);
                this.pollForTransferCompletion(transferId, timeoutMs).then(resolve);
            }
        });
    }
    /**
     * Fallback polling method for transfer completion
     * @private
     */
    async pollForTransferCompletion(transferId, timeoutMs) {
        const startTime = Date.now();
        const pollIntervalMs = 500;
        while (Date.now() - startTime < timeoutMs) {
            try {
                const transfer = await this._wallet.getTransfer(transferId);
                if (transfer) {
                    if (transfer.status === "TRANSFER_STATUS_COMPLETED") {
                        return true;
                    }
                }
            }
            catch {
                // Ignore errors and continue polling
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
        return false;
    }
    /**
     * Suppress leaf optimization on the wallet. Sets the internal
     * optimizationInProgress flag so optimizeLeaves() returns immediately.
     * Returns a restore function that clears the flag.
     * @private
     */
    suppressOptimization() {
        const w = this._wallet;
        const was = w.optimizationInProgress;
        w.optimizationInProgress = true;
        return () => {
            w.optimizationInProgress = was;
        };
    }
    /**
     * Insta-claim: listen for the wallet's stream event that fires when
     * the coordinator broadcasts the transfer. The stream auto-claims
     * incoming transfers, so no polling is needed.
     *
     * After claim, refreshes the leaf cache from the coordinator to
     * ensure the balance is current.
     *
     * Caller is responsible for suppressing optimization around this call
     * if the claimed leaves must not be swapped before spending.
     * @private
     */
    async instaClaimTransfer(transferId, timeoutMs) {
        const w = this._wallet;
        const claimed = await new Promise((resolve) => {
            let done = false;
            const finish = (value) => {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timer);
                try {
                    w.removeListener?.("transfer:claimed", handler);
                }
                catch {
                    // Ignore
                }
                resolve(value);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            const handler = (claimedId) => {
                if (claimedId === transferId) {
                    finish(true);
                }
            };
            // The wallet's background gRPC stream auto-claims transfers.
            // We just listen for the event.
            if (typeof w.on === "function") {
                w.on("transfer:claimed", handler);
            }
            else {
                // No event support, fall back to passive polling
                clearTimeout(timer);
                this.pollForTransferCompletion(transferId, timeoutMs).then(resolve);
            }
        });
        if (claimed) {
            const leaves = await this._wallet.getLeaves(true);
            w.leaves = leaves;
        }
        return claimed;
    }
    /**
     * Get Lightning fee estimate for an invoice
     * @private
     */
    async getLightningFeeEstimate(invoice) {
        try {
            const feeEstimate = await this._wallet.getLightningSendFeeEstimate({
                encodedInvoice: invoice,
            });
            // The fee estimate might be returned as a number or an object
            if (typeof feeEstimate === "number") {
                return feeEstimate;
            }
            if (feeEstimate?.fee || feeEstimate?.feeEstimate) {
                return Number(feeEstimate.fee || feeEstimate.feeEstimate);
            }
            // Fallback to invoice amount-based estimate
            const invoiceAmount = await this.decodeInvoiceAmount(invoice);
            return Math.max(5, Math.ceil(invoiceAmount * 0.0017)); // 17 bps or 5 sats minimum
        }
        catch {
            // Fallback to invoice amount-based estimate
            const invoiceAmount = await this.decodeInvoiceAmount(invoice);
            return Math.max(5, Math.ceil(invoiceAmount * 0.0017));
        }
    }
    /**
     * Decode the amount from a Lightning invoice (in sats)
     * Uses light-bolt11-decoder (same library as Spark SDK) for reliable parsing.
     * @private
     */
    async decodeInvoiceAmount(invoice) {
        try {
            const decoded = lightBolt11Decoder.decode(invoice);
            const amountSection = decoded.sections.find((s) => s.name === "amount");
            if (!amountSection?.value) {
                return 0; // Zero-amount invoice
            }
            // The library returns amount in millisatoshis as a string
            const amountMSats = BigInt(amountSection.value);
            return Number(amountMSats / 1000n);
        }
        catch {
            // Fallback: if library fails, return 0 (treated as zero-amount invoice)
            return 0;
        }
    }
    /**
     * Clean up wallet connections
     */
    async cleanup() {
        await this._wallet.cleanupConnections();
    }
    // Config and Policy Enforcement Helpers
    async ensureAmmOperationAllowed(requiredFeature) {
        await this.ensurePingOk();
        const featureMap = await this.getFeatureStatusMap();
        if (featureMap.get("master_kill_switch")) {
            throw new Error("Service is temporarily disabled by master kill switch");
        }
        if (!featureMap.get(requiredFeature)) {
            throw new Error(`Operation not allowed: feature '${requiredFeature}' is disabled`);
        }
    }
    async ensurePingOk() {
        const now = Date.now();
        if (this.pingCache && this.pingCache.expiryMs > now) {
            if (!this.pingCache.ok) {
                throw new Error("Settlement service unavailable. Only read (GET) operations are allowed right now.");
            }
            return;
        }
        const ping = await this.typedApi.ping();
        const ok = !!ping &&
            typeof ping.status === "string" &&
            ping.status.toLowerCase() === "ok";
        this.pingCache = { ok, expiryMs: now + FlashnetClient.PING_TTL_MS };
        if (!ok) {
            throw new Error("Settlement service unavailable. Only read (GET) operations are allowed right now.");
        }
    }
    async getFeatureStatusMap() {
        const now = Date.now();
        if (this.featureStatusCache && this.featureStatusCache.expiryMs > now) {
            const map = new Map();
            for (const item of this.featureStatusCache.data) {
                map.set(item.feature_name, Boolean(item.enabled));
            }
            return map;
        }
        const data = await this.typedApi.getFeatureStatus();
        this.featureStatusCache = {
            data,
            expiryMs: now + FlashnetClient.FEATURE_STATUS_TTL_MS,
        };
        const map = new Map();
        for (const item of data) {
            map.set(item.feature_name, Boolean(item.enabled));
        }
        return map;
    }
    async getEnabledMinAmountsMap() {
        const now = Date.now();
        if (this.minAmountsCache && this.minAmountsCache.expiryMs > now) {
            return this.minAmountsCache.map;
        }
        const config = await this.typedApi.getMinAmounts();
        const map = new Map();
        for (const item of config) {
            if (item.enabled) {
                if (item.min_amount == null) {
                    continue;
                }
                const key = item.asset_identifier.toLowerCase();
                const value = bigint.safeBigInt(item.min_amount);
                map.set(key, value);
            }
        }
        this.minAmountsCache = {
            map,
            expiryMs: now + FlashnetClient.MIN_AMOUNTS_TTL_MS,
        };
        return map;
    }
    getHexAddress(addr) {
        return this.toHexTokenIdentifier(addr).toLowerCase();
    }
    async assertSwapMeetsMinAmounts(params) {
        const minMap = await this.getEnabledMinAmountsMap();
        if (minMap.size === 0) {
            return;
        }
        const inHex = this.getHexAddress(params.assetInAddress);
        const outHex = this.getHexAddress(params.assetOutAddress);
        const minIn = minMap.get(inHex);
        const minOut = minMap.get(outHex);
        const amountIn = BigInt(params.amountIn);
        const minAmountOut = BigInt(params.minAmountOut);
        if (minIn && minOut) {
            if (amountIn < minIn) {
                throw new Error(`Minimum amount not met for input asset. Required \
${minIn.toString()}, provided ${amountIn.toString()}`);
            }
            return;
        }
        if (minIn) {
            if (amountIn < minIn) {
                throw new Error(`Minimum amount not met for input asset. Required \
${minIn.toString()}, provided ${amountIn.toString()}`);
            }
            return;
        }
        if (minOut) {
            const relaxed = minOut / 2n; // 50% relaxation for slippage
            if (minAmountOut < relaxed) {
                throw new Error(`Minimum amount not met for output asset. Required at least \
${relaxed.toString()} (50% relaxed), provided minAmountOut ${minAmountOut.toString()}`);
            }
        }
    }
    async assertAddLiquidityMeetsMinAmounts(params) {
        const minMap = await this.getEnabledMinAmountsMap();
        if (minMap.size === 0) {
            return;
        }
        const pool = await this.getPool(params.poolId);
        const aHex = pool.assetAAddress.toLowerCase();
        const bHex = pool.assetBAddress.toLowerCase();
        const aMin = minMap.get(aHex);
        const bMin = minMap.get(bHex);
        if (aMin) {
            const aAmt = BigInt(params.assetAAmount);
            if (aAmt < aMin) {
                throw new Error(`Minimum amount not met for Asset A. Required ${aMin.toString()}, provided ${aAmt.toString()}`);
            }
        }
        if (bMin) {
            const bAmt = BigInt(params.assetBAmount);
            if (bAmt < bMin) {
                throw new Error(`Minimum amount not met for Asset B. Required ${bMin.toString()}, provided ${bAmt.toString()}`);
            }
        }
    }
    async assertRemoveLiquidityMeetsMinAmounts(params) {
        const minMap = await this.getEnabledMinAmountsMap();
        if (minMap.size === 0) {
            return;
        }
        const simulation = await this.simulateRemoveLiquidity({
            poolId: params.poolId,
            providerPublicKey: this.publicKey,
            lpTokensToRemove: String(params.lpTokensToRemove),
        });
        const pool = await this.getPool(params.poolId);
        const aHex = pool.assetAAddress.toLowerCase();
        const bHex = pool.assetBAddress.toLowerCase();
        const aMin = minMap.get(aHex);
        const bMin = minMap.get(bHex);
        if (aMin) {
            const predictedAOut = bigint.safeBigInt(simulation.assetAAmount);
            const relaxedA = aMin / 2n; // apply 50% relaxation for outputs
            if (predictedAOut < relaxedA) {
                throw new Error(`Minimum amount not met for Asset A on withdrawal. Required at least ${relaxedA.toString()} (50% relaxed), predicted ${predictedAOut.toString()}`);
            }
        }
        if (bMin) {
            const predictedBOut = bigint.safeBigInt(simulation.assetBAmount);
            const relaxedB = bMin / 2n;
            if (predictedBOut < relaxedB) {
                throw new Error(`Minimum amount not met for Asset B on withdrawal. Required at least ${relaxedB.toString()} (50% relaxed), predicted ${predictedBOut.toString()}`);
            }
        }
    }
    async assertAllowedAssetBForPoolCreation(assetBHex) {
        const now = Date.now();
        let allowed;
        if (this.allowedAssetsCache && this.allowedAssetsCache.expiryMs > now) {
            allowed = this.allowedAssetsCache.data;
        }
        else {
            allowed = await this.typedApi.getAllowedAssets();
            this.allowedAssetsCache = {
                data: allowed,
                expiryMs: now + FlashnetClient.ALLOWED_ASSETS_TTL_MS,
            };
        }
        if (!allowed || allowed.length === 0) {
            // Wildcard allowance
            return;
        }
        const isAllowed = allowed.some((it) => it.enabled &&
            it.asset_identifier.toLowerCase() === assetBHex.toLowerCase());
        if (!isAllowed) {
            throw new Error(`Asset B is not allowed for pool creation: ${assetBHex}`);
        }
    }
    // V3 Concentrated Liquidity Operations
    /**
     * Create a V3 concentrated liquidity pool
     *
     * Concentrated liquidity pools allow LPs to provide liquidity within specific
     * price ranges (tick ranges) for higher capital efficiency.
     *
     * @param params Pool creation parameters
     * @param params.assetAAddress - Address of asset A (base asset)
     * @param params.assetBAddress - Address of asset B (quote asset)
     * @param params.tickSpacing - Tick spacing (common values: 10, 60, 200)
     * @param params.initialPrice - Initial price of asset A in terms of asset B
     * @param params.lpFeeRateBps - LP fee rate in basis points
     * @param params.hostFeeRateBps - Host fee rate in basis points
     * @param params.hostNamespace - Optional host namespace
     * @param params.poolOwnerPublicKey - Optional pool owner (defaults to wallet pubkey)
     */
    async createConcentratedPool(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_pool_creation");
        await this.assertAllowedAssetBForPoolCreation(this.toHexTokenIdentifier(params.assetBAddress));
        const poolOwnerPublicKey = params.poolOwnerPublicKey ?? this.publicKey;
        // Generate intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateCreateConcentratedPoolIntentMessage({
            poolOwnerPublicKey,
            assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
            assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
            tickSpacing: params.tickSpacing,
            initialPrice: params.initialPrice,
            lpFeeRateBps: params.lpFeeRateBps.toString(),
            hostFeeRateBps: params.hostFeeRateBps.toString(),
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            poolOwnerPublicKey,
            assetAAddress: this.toHexTokenIdentifier(params.assetAAddress),
            assetBAddress: this.toHexTokenIdentifier(params.assetBAddress),
            tickSpacing: params.tickSpacing,
            initialPrice: params.initialPrice,
            lpFeeRateBps: params.lpFeeRateBps.toString(),
            hostFeeRateBps: params.hostFeeRateBps.toString(),
            hostNamespace: params.hostNamespace,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        return this.typedApi.createConcentratedPool(request);
    }
    /**
     * Add liquidity to a V3 concentrated position
     *
     * Increases liquidity within a specific tick range. If the position doesn't exist,
     * a new position is created.
     *
     * @param params Position parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.tickLower - Lower tick of the position
     * @param params.tickUpper - Upper tick of the position
     * @param params.amountADesired - Desired amount of asset A to add
     * @param params.amountBDesired - Desired amount of asset B to add
     * @param params.amountAMin - Minimum amount of asset A (slippage protection)
     * @param params.amountBMin - Minimum amount of asset B (slippage protection)
     * @param params.useFreeBalance - If true, use free balance from pool instead of Spark transfers
     * @param params.retainExcessInBalance - If true, retain any excess amounts in pool free balance instead of refunding via Spark
     */
    async increaseLiquidity(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_add_liquidity");
        // Get pool details to know asset addresses
        const pool = await this.getPool(params.poolId);
        // Transfer assets to pool (unless using free balance)
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: params.poolId,
            network: this.sparkNetwork,
        });
        let assetATransferId = "";
        let assetBTransferId = "";
        const transferIds = [];
        // Transfer assets if not using free balance
        if (!params.useFreeBalance) {
            if (BigInt(params.amountADesired) > 0n) {
                assetATransferId = await this.transferAsset({
                    receiverSparkAddress: lpSparkAddress,
                    assetAddress: pool.assetAAddress,
                    amount: params.amountADesired,
                }, "Insufficient balance for adding V3 liquidity (Asset A): ", params.useAvailableBalance);
                transferIds.push(assetATransferId);
            }
            if (BigInt(params.amountBDesired) > 0n) {
                assetBTransferId = await this.transferAsset({
                    receiverSparkAddress: lpSparkAddress,
                    assetAddress: pool.assetBAddress,
                    amount: params.amountBDesired,
                }, "Insufficient balance for adding V3 liquidity (Asset B): ", params.useAvailableBalance);
                transferIds.push(assetBTransferId);
            }
        }
        const executeIncrease = async () => {
            // Generate intent
            const nonce = index$2.generateNonce();
            const intentMessage = intents.generateIncreaseLiquidityIntentMessage({
                userPublicKey: this.publicKey,
                lpIdentityPublicKey: params.poolId,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                amountADesired: params.amountADesired,
                amountBDesired: params.amountBDesired,
                amountAMin: params.amountAMin,
                amountBMin: params.amountBMin,
                nonce,
            });
            // Sign intent
            const messageHash = sha256__default.default(intentMessage);
            const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
            const request = {
                poolId: params.poolId,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                amountADesired: params.amountADesired,
                amountBDesired: params.amountBDesired,
                amountAMin: params.amountAMin,
                amountBMin: params.amountBMin,
                useFreeBalance: params.useFreeBalance,
                retainExcessInBalance: params.retainExcessInBalance,
                nonce,
                signature: hex.getHexFromUint8Array(signature),
            };
            const response = await this.typedApi.increaseLiquidity(request);
            if (!response.accepted) {
                const errorMessage = response.error || "Increase liquidity rejected by the AMM";
                const hasRefund = !!(response.amountARefund || response.amountBRefund);
                const refundInfo = hasRefund
                    ? ` Refunds: Asset A: ${response.amountARefund || "0"}, Asset B: ${response.amountBRefund || "0"}`
                    : "";
                throw new errors.FlashnetError(`${errorMessage}.${refundInfo}`, {
                    response: {
                        errorCode: hasRefund ? "FSAG-4203" : "UNKNOWN",
                        errorCategory: hasRefund ? "Business" : "System",
                        message: `${errorMessage}.${refundInfo}`,
                        requestId: response.requestId || "",
                        timestamp: new Date().toISOString(),
                        service: "amm-gateway",
                        severity: "Error",
                    },
                    httpStatus: 400,
                    transferIds: hasRefund ? [] : transferIds,
                    lpIdentityPublicKey: params.poolId,
                });
            }
            return response;
        };
        // Execute with auto-clawback if we made transfers
        if (transferIds.length > 0) {
            return this.executeWithAutoClawback(executeIncrease, transferIds, params.poolId);
        }
        return executeIncrease();
    }
    /**
     * Remove liquidity from a V3 concentrated position
     *
     * Decreases liquidity from a specific tick range position.
     *
     * @param params Position parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.tickLower - Lower tick of the position
     * @param params.tickUpper - Upper tick of the position
     * @param params.liquidityToRemove - Amount of liquidity to remove (use "0" to remove all)
     * @param params.amountAMin - Minimum amount of asset A to receive (slippage protection)
     * @param params.amountBMin - Minimum amount of asset B to receive (slippage protection)
     * @param params.retainInBalance - If true, retain withdrawn assets in pool free balance instead of sending via Spark
     */
    async decreaseLiquidity(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_withdraw_liquidity");
        // Generate intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateDecreaseLiquidityIntentMessage({
            userPublicKey: this.publicKey,
            lpIdentityPublicKey: params.poolId,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidityToRemove: params.liquidityToRemove,
            amountAMin: params.amountAMin,
            amountBMin: params.amountBMin,
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            poolId: params.poolId,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidityToRemove: params.liquidityToRemove,
            amountAMin: params.amountAMin,
            amountBMin: params.amountBMin,
            retainInBalance: params.retainInBalance,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.decreaseLiquidity(request);
        if (!response.accepted) {
            const errorMessage = response.error || "Decrease liquidity rejected by the AMM";
            throw new Error(errorMessage);
        }
        return response;
    }
    /**
     * Collect accumulated fees from a V3 position
     *
     * Collects fees earned from trading activity without removing liquidity.
     *
     * @param params Position parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.tickLower - Lower tick of the position
     * @param params.tickUpper - Upper tick of the position
     * @param params.retainInBalance - If true, retain collected fees in pool free balance instead of sending via Spark
     */
    async collectFees(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_withdraw_fees");
        // Generate intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateCollectFeesIntentMessage({
            userPublicKey: this.publicKey,
            lpIdentityPublicKey: params.poolId,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            poolId: params.poolId,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            retainInBalance: params.retainInBalance,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.collectFees(request);
        if (!response.accepted) {
            const errorMessage = response.error || "Collect fees rejected by the AMM";
            throw new Error(errorMessage);
        }
        return response;
    }
    /**
     * Rebalance a V3 position to a new tick range
     *
     * Atomically moves liquidity from an old position to a new tick range.
     * Optionally can add additional funds during rebalancing.
     *
     * @param params Rebalance parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.oldTickLower - Lower tick of the current position
     * @param params.oldTickUpper - Upper tick of the current position
     * @param params.newTickLower - Lower tick for the new position
     * @param params.newTickUpper - Upper tick for the new position
     * @param params.liquidityToMove - Amount of liquidity to move (use "0" to move all)
     * @param params.additionalAmountA - Optional additional asset A to add
     * @param params.additionalAmountB - Optional additional asset B to add
     * @param params.retainInBalance - If true, retain any excess amounts in pool free balance instead of sending via Spark
     */
    async rebalancePosition(params) {
        await this.ensureInitialized();
        await this.ensureAmmOperationAllowed("allow_add_liquidity");
        // Get pool details
        const pool = await this.getPool(params.poolId);
        // Transfer additional assets if provided
        let assetATransferId;
        let assetBTransferId;
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: params.poolId,
            network: this.sparkNetwork,
        });
        if (params.additionalAmountA && BigInt(params.additionalAmountA) > 0n) {
            assetATransferId = await this.transferAsset({
                receiverSparkAddress: lpSparkAddress,
                assetAddress: pool.assetAAddress,
                amount: params.additionalAmountA,
            }, "Insufficient balance for rebalance (Asset A): ", params.useAvailableBalance);
        }
        if (params.additionalAmountB && BigInt(params.additionalAmountB) > 0n) {
            assetBTransferId = await this.transferAsset({
                receiverSparkAddress: lpSparkAddress,
                assetAddress: pool.assetBAddress,
                amount: params.additionalAmountB,
            }, "Insufficient balance for rebalance (Asset B): ", params.useAvailableBalance);
        }
        // Collect transfer IDs for potential clawback
        const transferIds = [];
        if (assetATransferId) {
            transferIds.push(assetATransferId);
        }
        if (assetBTransferId) {
            transferIds.push(assetBTransferId);
        }
        // Execute (with auto-clawback if we have transfers)
        const executeRebalance = async () => {
            // Generate intent
            const nonce = index$2.generateNonce();
            const intentMessage = intents.generateRebalancePositionIntentMessage({
                userPublicKey: this.publicKey,
                lpIdentityPublicKey: params.poolId,
                oldTickLower: params.oldTickLower,
                oldTickUpper: params.oldTickUpper,
                newTickLower: params.newTickLower,
                newTickUpper: params.newTickUpper,
                liquidityToMove: params.liquidityToMove,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                additionalAmountA: params.additionalAmountA,
                additionalAmountB: params.additionalAmountB,
                nonce,
            });
            // Sign intent
            const messageHash = sha256__default.default(intentMessage);
            const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
            const request = {
                poolId: params.poolId,
                oldTickLower: params.oldTickLower,
                oldTickUpper: params.oldTickUpper,
                newTickLower: params.newTickLower,
                newTickUpper: params.newTickUpper,
                liquidityToMove: params.liquidityToMove,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                additionalAmountA: params.additionalAmountA,
                additionalAmountB: params.additionalAmountB,
                retainInBalance: params.retainInBalance,
                nonce,
                signature: hex.getHexFromUint8Array(signature),
            };
            const response = await this.typedApi.rebalancePosition(request);
            if (!response.accepted) {
                const errorMessage = response.error || "Rebalance position rejected by the AMM";
                throw new errors.FlashnetError(errorMessage, {
                    response: {
                        errorCode: "UNKNOWN",
                        errorCategory: "System",
                        message: errorMessage,
                        requestId: response.requestId || "",
                        timestamp: new Date().toISOString(),
                        service: "amm-gateway",
                        severity: "Error",
                    },
                    httpStatus: 400,
                    transferIds,
                    lpIdentityPublicKey: params.poolId,
                });
            }
            return response;
        };
        // Use auto-clawback if we made transfers
        if (transferIds.length > 0) {
            return this.executeWithAutoClawback(executeRebalance, transferIds, params.poolId);
        }
        return executeRebalance();
    }
    /**
     * List V3 concentrated liquidity positions
     *
     * @param query Optional query parameters
     * @param query.poolId - Filter by pool ID
     * @param query.page - Page number (default: 1)
     * @param query.pageSize - Page size (default: 20, max: 100)
     */
    async listConcentratedPositions(query) {
        await this.ensureInitialized();
        return this.typedApi.listConcentratedPositions(query);
    }
    /**
     * Get pool liquidity distribution for visualization
     *
     * Returns aggregated liquidity ranges for visualizing the liquidity distribution.
     *
     * @param poolId - Pool ID (LP identity public key)
     */
    async getPoolLiquidity(poolId) {
        await this.ensureInitialized();
        return this.typedApi.getPoolLiquidity(poolId);
    }
    /**
     * Get pool ticks for simulation
     *
     * Returns all initialized ticks with their liquidity deltas for swap simulation.
     *
     * @param poolId - Pool ID (LP identity public key)
     */
    async getPoolTicks(poolId) {
        await this.ensureInitialized();
        return this.typedApi.getPoolTicks(poolId);
    }
    // V3 Free Balance Methods
    /**
     * Get user's free balance for a specific V3 pool
     *
     * Returns the user's current free balance in the pool, which can be used for
     * liquidity operations without needing to transfer from the wallet.
     *
     * @param poolId - Pool ID (LP identity public key)
     */
    async getConcentratedBalance(poolId) {
        await this.ensureInitialized();
        return this.typedApi.getConcentratedBalance(poolId);
    }
    /**
     * Get user's free balances across all V3 pools
     *
     * Returns all free balances for the authenticated user across all V3 pools.
     */
    async getConcentratedBalances() {
        await this.ensureInitialized();
        return this.typedApi.getConcentratedBalances();
    }
    /**
     * Withdraw free balance from a V3 pool to user's Spark wallet
     *
     * Withdraws accumulated free balance from a pool. Use "0" to skip an asset,
     * or "max" to withdraw all available balance of that asset.
     *
     * @param params Withdrawal parameters
     * @param params.poolId - Pool ID (LP identity public key)
     * @param params.amountA - Amount of asset A to withdraw ("0" to skip, "max" to withdraw all)
     * @param params.amountB - Amount of asset B to withdraw ("0" to skip, "max" to withdraw all)
     */
    async withdrawConcentratedBalance(params) {
        await this.ensureInitialized();
        // Generate intent
        const nonce = index$2.generateNonce();
        const intentMessage = intents.generateWithdrawBalanceIntentMessage({
            userPublicKey: this.publicKey,
            lpIdentityPublicKey: params.poolId,
            amountA: params.amountA,
            amountB: params.amountB,
            nonce,
        });
        // Sign intent
        const messageHash = sha256__default.default(intentMessage);
        const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
        const request = {
            poolId: params.poolId,
            amountA: params.amountA,
            amountB: params.amountB,
            nonce,
            signature: hex.getHexFromUint8Array(signature),
        };
        const response = await this.typedApi.withdrawConcentratedBalance(request);
        if (!response.accepted) {
            const errorMessage = response.error || "Withdraw balance rejected by the AMM";
            throw new Error(errorMessage);
        }
        return response;
    }
    /**
     * Deposits assets to your free balance in a V3 concentrated liquidity pool.
     *
     * Free balance can be used for adding liquidity to positions without requiring
     * additional Spark transfers. The SDK handles the Spark transfers internally.
     *
     * @param params - Deposit parameters
     * @param params.poolId - The pool identifier (LP identity public key)
     * @param params.amountA - Amount of asset A to deposit (use "0" to skip)
     * @param params.amountB - Amount of asset B to deposit (use "0" to skip)
     * @returns Promise resolving to deposit response with updated balances
     * @throws Error if the deposit is rejected
     */
    async depositConcentratedBalance(params) {
        await this.ensureInitialized();
        // Get pool details to know asset addresses
        const pool = await this.getPool(params.poolId);
        const lpSparkAddress = sparkAddress.encodeSparkAddressNew({
            identityPublicKey: params.poolId,
            network: this.sparkNetwork,
        });
        let assetATransferId = "";
        let assetBTransferId = "";
        const transferIds = [];
        // Transfer assets to pool
        if (BigInt(params.amountA) > 0n) {
            assetATransferId = await this.transferAsset({
                receiverSparkAddress: lpSparkAddress,
                assetAddress: pool.assetAAddress,
                amount: params.amountA,
            }, "Insufficient balance for depositing to V3 pool (Asset A): ", params.useAvailableBalance);
            transferIds.push(assetATransferId);
        }
        if (BigInt(params.amountB) > 0n) {
            assetBTransferId = await this.transferAsset({
                receiverSparkAddress: lpSparkAddress,
                assetAddress: pool.assetBAddress,
                amount: params.amountB,
            }, "Insufficient balance for depositing to V3 pool (Asset B): ", params.useAvailableBalance);
            transferIds.push(assetBTransferId);
        }
        const executeDeposit = async () => {
            // Generate intent
            const nonce = index$2.generateNonce();
            const intentMessage = intents.generateDepositBalanceIntentMessage({
                userPublicKey: this.publicKey,
                lpIdentityPublicKey: params.poolId,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                amountA: params.amountA,
                amountB: params.amountB,
                nonce,
            });
            // Sign intent
            const messageHash = sha256__default.default(intentMessage);
            const signature = await this._wallet.config.signer.signMessageWithIdentityKey(messageHash, true);
            const request = {
                poolId: params.poolId,
                amountA: params.amountA,
                amountB: params.amountB,
                assetASparkTransferId: assetATransferId,
                assetBSparkTransferId: assetBTransferId,
                nonce,
                signature: hex.getHexFromUint8Array(signature),
            };
            const response = await this.typedApi.depositConcentratedBalance(request);
            if (!response.accepted) {
                const errorMessage = response.error || "Deposit balance rejected by the AMM";
                throw new errors.FlashnetError(errorMessage, {
                    response: {
                        errorCode: "UNKNOWN",
                        errorCategory: "System",
                        message: errorMessage,
                        requestId: "",
                        timestamp: new Date().toISOString(),
                        service: "amm-gateway",
                        severity: "Error",
                    },
                    httpStatus: 400,
                    transferIds,
                    lpIdentityPublicKey: params.poolId,
                });
            }
            return response;
        };
        // Execute with auto-clawback if we made transfers
        if (transferIds.length > 0) {
            return this.executeWithAutoClawback(executeDeposit, transferIds, params.poolId);
        }
        return executeDeposit();
    }
}

exports.FlashnetClient = FlashnetClient;
//# sourceMappingURL=FlashnetClient.js.map

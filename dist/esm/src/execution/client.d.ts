/**
 * Flashnet Execution Client
 *
 * Client for interacting with the Flashnet execution gateway.
 * Handles authentication, intent construction, signing, deposit, and withdrawal.
 *
 * Takes a SparkWallet — the identity key is used for both gateway
 * authentication and EVM transaction signing.
 *
 * @example
 * ```typescript
 * import { ExecutionClient } from "@flashnet/sdk";
 *
 * const client = new ExecutionClient(sparkWallet, {
 *   gatewayUrl: "http://localhost:8080",
 *   rpcUrl: "http://localhost:8545",
 *   chainId: 21022,
 *   bridgeAddress: "0x...",
 * });
 *
 * await client.authenticate();
 *
 * await client.deposit({
 *   deposits: [
 *     { sparkTransferId: "aabb...", amount: 100000, asset: { type: "btc" } },
 *   ],
 * });
 *
 * await client.withdraw({ amount: 50000 });
 * ```
 */
import { type SparkWalletInput } from "./spark-evm-account";
import type { LocalAccount } from "viem/accounts";
import type { Deposit, ExecuteResponse } from "./types";
/**
 * JSON-stringify a value that may contain `bigint` fields, emitting each
 * bigint as a JSON numeric literal (not a string). Rust's serde_json
 * parses unquoted numeric literals up to u64 range, so this preserves
 * full u64 precision across languages — unlike `JSON.stringify` which
 * throws on bigint, and unlike `Number(bigint)` which loses precision
 * above 2^53.
 *
 * Implemented as a proper recursive encoder rather than a sentinel-and-regex
 * trick so user-supplied strings cannot accidentally collide with the
 * marker. Output is byte-for-byte equivalent to `JSON.stringify` for any
 * bigint-free input (same key ordering, same escaping, no whitespace).
 */
export declare function stringifyWithBigint(value: unknown): string;
/**
 * Configuration for the execution client.
 */
export interface ExecutionClientConfig {
    /** Base URL of the execution gateway (e.g. "http://localhost:8080"). */
    gatewayUrl: string;
    /** JSON-RPC URL of the sequencer (e.g. "http://localhost:8545"). */
    rpcUrl: string;
    /** Chain ID of the Flashnet EVM network. */
    chainId: number;
    /** SparkBridge contract address (0x-prefixed). */
    bridgeAddress: string;
}
/**
 * Optional absolute unix-millisecond timestamp past which the intent expires.
 *
 * Every intent carries this value through the signed canonical preimage; the
 * gateway rejects past or >24h-future timestamps, and the sequencer
 * admission / TTL-sweeper use it as a terminal deadline. When omitted, the
 * SDK applies `DEFAULT_INTENT_TTL_MS` (15 minutes) from the moment the
 * request is built. See `flashnet-execution/plan/deposit-oracle-admission-check.md`.
 */
export interface IntentExpiry {
    expiresAt?: number;
}
/** Parameters for a deposit intent. */
export interface DepositParams extends IntentExpiry {
    /** Spark transfers funding this deposit. */
    deposits: Deposit[];
    /** EVM address to credit. If omitted, credits the identity key's EVM address. */
    recipient?: string;
}
/** Parameters for a BTC withdrawal. */
export interface WithdrawParams extends IntentExpiry {
    /** Amount in satoshis to withdraw. */
    amount: bigint;
}
/** Parameters for a token withdrawal. */
export interface WithdrawTokenParams extends IntentExpiry {
    /** ERC20 token contract address. */
    tokenAddress: string;
    /** Amount in token base units. */
    amount: bigint;
}
/** Parameters for a raw execute intent (advanced). */
export interface ExecuteParams extends IntentExpiry {
    /** Spark transfers to credit before executing. */
    deposits?: Deposit[];
    /** Hex-encoded signed EVM transaction (RLP-serialized, 0x-prefixed). */
    signedTx: string;
}
/**
 * Client for the Flashnet execution gateway.
 *
 * Owns the SparkWallet, gateway auth, EVM signing, and RPC configuration.
 * Exposes deposit/withdraw/execute as methods — no loose function args.
 */
export declare class ExecutionClient {
    private readonly config;
    private readonly wallet;
    private readonly signer;
    private evmAccount;
    private accessToken;
    /**
     * @param wallet - SparkWallet instance (identity key used for auth + EVM signing).
     * @param config - Explicit endpoint configuration: gatewayUrl, rpcUrl,
     *   chainId, bridgeAddress. Named network shortcuts will be re-added
     *   once real deployments exist.
     */
    constructor(wallet: SparkWalletInput, config: ExecutionClientConfig);
    /**
     * The EVM address derived from the SparkWallet's identity key.
     * Available after calling `authenticate()` or `getEvmAccount()`.
     */
    getEvmAddress(): Promise<string>;
    /**
     * Get or create the viem LocalAccount derived from the identity key.
     */
    getEvmAccount(): Promise<LocalAccount>;
    /**
     * Authenticate with the execution gateway via challenge-response.
     * Must be called before submitting intents.
     */
    authenticate(): Promise<string>;
    /**
     * Submit a deposit intent.
     * Credits the deposited funds to the specified recipient or the identity key's EVM address.
     */
    deposit(params: DepositParams): Promise<ExecuteResponse>;
    /**
     * Withdraw native BTC (sats) from EVM back to Spark.
     * Signs a SparkBridge.withdrawSats transaction with the identity key.
     *
     * @param params.amount - Amount in satoshis.
     */
    withdraw(params: WithdrawParams): Promise<ExecuteResponse>;
    /**
     * Withdraw an ERC20 token from EVM back to Spark.
     * Signs a SparkBridge.withdrawBtkn transaction with the identity key.
     */
    withdrawToken(params: WithdrawTokenParams): Promise<ExecuteResponse>;
    /**
     * Submit a raw execute intent with a pre-signed EVM transaction.
     * For advanced use — prefer `withdraw()` or AMMClient methods.
     */
    execute(params: ExecuteParams): Promise<ExecuteResponse>;
    /**
     * Check if the gateway is healthy.
     */
    health(): Promise<boolean>;
    /** Returns the current access token, or null if not authenticated. */
    getAccessToken(): string | null;
    /** Returns the client configuration. */
    getConfig(): Readonly<ExecutionClientConfig>;
    /**
     * Accessor for the wrapped SparkWallet. Exposed so higher-level clients
     * (e.g. AMMClient) can issue Spark transfers to fund a bundled deposit
     * in the same execute intent without duplicating wallet ownership.
     *
     * Prefer the ExecutionClient / AMMClient methods over reaching for the
     * wallet directly — this is an escape hatch, not a recommended API.
     */
    getSparkWallet(): SparkWalletInput;
    /**
     * Get the Spark identity public key as a 0x-prefixed hex string
     * for use as the sparkRecipient in withdrawal calls.
     */
    getSparkRecipientHex(): Promise<string>;
    private submitIntent;
    private requireAuth;
    private post;
}
//# sourceMappingURL=client.d.ts.map
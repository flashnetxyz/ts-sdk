# Flashnet SDK

A comprehensive SDK for interacting with Flashnet's Spark AMM functionality.

## Features

- **Spark Wallet Integration** - Full wallet functionality based on `@buildonspark/issuer-sdk` or `@buildonspark/spark-sdk`
- **AMM Operations** - Create pools (single-sided & constant product), swap tokens, add/remove liquidity
- **Multi-Network Support** - Works across Mainnet and Regtest
- **Intent-Based Signing** - Transaction signing via intent
- **Custom Signers** - Support for arbitrary signing implementations (hardware wallets, remote signers, etc.)
- **TypeScript First** - Full type safety and IntelliSense support

## Installation

```bash
# Recommended (Bun)
bun add @flashnet/sdk

# Alternative package managers
npm install @flashnet/sdk
# or
yarn add @flashnet/sdk
```

### Optional Dependencies

The `@buildonspark/spark-sdk` and `@buildonspark/issuer-sdk` are now **optional peer dependencies**. You only need to install them if you're using the full `FlashnetClient` with wallet integration:

```bash
# For full wallet integration (frontend)
bun i @flashnet/sdk @buildonspark/spark-sdk @buildonspark/issuer-sdk

# For backend/lightweight usage (no wallet)
bun i @flashnet/sdk
```

## 🆕 Modular Imports

The SDK now supports modular imports for better tree-shaking and smaller bundle sizes:

```typescript
// Import only what you need - no wallet dependencies required
import { AuthManager } from "@flashnet/sdk/auth";
import { ApiClient } from "@flashnet/sdk/api";
import { encodeSparkAddress } from "@flashnet/sdk/utils";
import type { Signer } from "@flashnet/sdk/types";

// Full SDK (requires wallet dependencies)
import { FlashnetClient } from "@flashnet/sdk";
```

Available exports:

- `@flashnet/sdk/auth` - Authentication utilities
- `@flashnet/sdk/api` - API client and typed endpoints
- `@flashnet/sdk/utils` - Utility functions (addresses, intents, etc.)
- `@flashnet/sdk/types` - TypeScript types
- `@flashnet/sdk/config` - Network configurations
- `@flashnet/sdk/client` - FlashnetClient (requires wallet)

For detailed modular usage examples, see [docs/modular-usage.md](docs/modular-usage.md).

## Usage Options

The Flashnet SDK offers two approaches to suit different needs:

### 1. Full Client (Recommended for most users)

Use `FlashnetClient` for a complete, ready-to-use solution with automatic network detection, authentication, and balance checking.

```typescript
import { FlashnetClient } from "@flashnet/sdk";
import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";

// Initialize wallet
const { wallet } = await IssuerSparkWallet.initialize({
  mnemonicOrSeed: "your-mnemonic",
  options: { network: "MAINNET" },
});

// Create client - handles everything automatically
const client = new FlashnetClient(wallet);
await client.initialize(); // Auto-detects network and authenticates

// Ready to use!
const pools = await client.listPools();
const swapResult = await client.executeSwap({
  poolId: "pool-id",
  assetInTokenPublicKey: "token-in",
  assetOutTokenPublicKey: "token-out",
  amountIn: 1000000n,
  minAmountOut: 950000n,
  maxSlippageBps: 500,
});
```

### 2. 🧩 Modular Components (For advanced customization)

Build your own client using individual SDK components for maximum flexibility.

```typescript
import {
  ApiClient,
  AuthManager,
  getNetworkConfig,
  generatePoolSwapIntentMessage,
  type NetworkType,
} from "@flashnet/sdk";

// Manual setup
const network: NetworkType = "MAINNET";
const config = getNetworkConfig(network);
const apiClient = new ApiClient(config);

// Custom authentication
const authManager = new AuthManager(apiClient, publicKey, customSigner);
await authManager.authenticate();

// Direct API calls
const pools = await apiClient.ammGet("/v1/pools");
```

## When to Use Each Approach

### Use FlashnetClient when:

- ✅ You want to get started quickly
- ✅ You're using a standard SparkWallet
- ✅ You want automatic network detection from wallet
- ✅ You want built-in balance checking
- ✅ You need all standard AMM operations

### Use Modular Components when:

- ✅ You need custom authentication logic
- ✅ You're integrating with existing infrastructure
- ✅ You want fine-grained control over API calls
- ✅ You're building a specialized application
- ✅ You need to mix AMM operations with other protocols

## Quick Start Examples

### Using FlashnetClient (Full Client)

```typescript
import { FlashnetClient } from "@flashnet/sdk";
import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";

// Initialize wallet and client
const { wallet } = await IssuerSparkWallet.initialize({
  mnemonicOrSeed: process.env.MNEMONIC,
});

const client = new FlashnetClient(wallet);

// Check balance
const balance = await client.getBalance();
console.log(`BTC: ${balance.balance} sats`);
console.log(`Tokens: ${balance.tokenBalances.size}`);

// Create a constant product pool with initial liquidity
const pool = await client.createConstantProductPool({
  assetATokenPublicKey: "token-pubkey",
  assetBTokenPublicKey: BTC_ASSET_PUBKEY,
  lpFeeRateBps: 30, // 0.3%
  totalHostFeeRateBps: 10, // 0.1%
  initialLiquidity: {
    assetAAmount: 1000000n,
    assetBAmount: 5000n,
  },
});

// Execute a swap (with automatic balance checking)
const swap = await client.executeSwap({
  poolId: pool.poolId,
  assetInTokenPublicKey: "token-in",
  assetOutTokenPublicKey: BTC_ASSET_PUBKEY,
  amountIn: 100000n,
  minAmountOut: 450n,
  maxSlippageBps: 500, // 5% slippage tolerance
});
```

### Using Modular Components

```typescript
import {
  ApiClient,
  AuthManager,
  TypedAmmApi,
  getNetworkConfig,
  encodeSparkAddress,
  generatePoolSwapIntentMessage,
  generateNonce,
  createWalletSigner,
} from "@flashnet/sdk";

// Setup
const config = getNetworkConfig("MAINNET");
const apiClient = new ApiClient(config);
const api = new TypedAmmApi(apiClient); // Create typed API wrapper

// Authenticate with wallet
const signer = createWalletSigner(wallet);
const authManager = new AuthManager(apiClient, publicKey, signer);
const token = await authManager.authenticate();
apiClient.setAuthToken(token);

// Use typed endpoints
const pools = await api.listPools({
  limit: 10,
  sort: "tvlDesc",
  minTvl: 1000000, // $10k minimum
});

// Manual swap flow
const simulation = await api.simulateSwap({
  poolId: "pool-id",
  assetInTokenPublicKey: "token-in",
  assetOutTokenPublicKey: "token-out",
  amountIn: 1000000,
});

// Generate and sign intent
const intentMessage = generatePoolSwapIntentMessage({
  userPublicKey: publicKey,
  lpIdentityPublicKey: poolId,
  assetASparkTransferId: transferId,
  assetInTokenPublicKey: "token-in",
  assetOutTokenPublicKey: "token-out",
  amountIn: "1000000",
  minAmountOut: "950000",
  maxSlippageBps: "500",
  nonce: generateNonce(),
});

const signature = await signer.signMessage(
  await crypto.subtle.digest("SHA-256", intentMessage)
);

// Execute swap
const swap = await api.executeSwap({
  // ... swap parameters
  signature: Buffer.from(signature).toString("hex"),
});
```

## Configuration

The SDK supports the following networks:

- `MAINNET` - Production network
- `REGTEST` - Regression test network

Each network has preconfigured endpoints for:

- AMM Gateway
- Mempool API
- Block Explorer
- SparkScan (when available)

## FlashnetClient API Reference

The `FlashnetClient` provides a complete interface for AMM operations:

### Initialization

```typescript
const client = new FlashnetClient(wallet, {
  autoAuthenticate: true, // Default: true
});

// Properties
client.wallet; // Access underlying SparkWallet
client.networkType; // Get network type
client.pubkey; // Get wallet public key
client.address; // Get Spark address
```

### Pool Operations

```typescript
// List and search pools
await client.listPools({ limit: 10, sort: "tvlDesc" });

// Get pool details
await client.getPool(poolId);

// Get LP position
await client.getLpPosition(poolId);

// Create pools with automatic initial deposits
await client.createConstantProductPool({
  assetATokenPublicKey: "token-a",
  assetBTokenPublicKey: "token-b",
  lpFeeRateBps: 30,
  totalHostFeeRateBps: 10,
  initialLiquidity: {
    // Optional
    assetAAmount: 1000000n,
    assetBAmount: 5000n,
  },
});

await client.createSingleSidedPool({
  assetATokenPublicKey: "token-a",
  assetBTokenPublicKey: BTC_ASSET_PUBKEY,
  assetAInitialReserve: "1000000",
  // ... other parameters
});
```

### Swap Operations

```typescript
// Simulate first
const simulation = await client.simulateSwap({
  poolId: "pool-id",
  assetInTokenPublicKey: "token-in",
  assetOutTokenPublicKey: "token-out",
  amountIn: 1000000,
});

// Execute with automatic balance checking
await client.executeSwap({
  poolId: "pool-id",
  assetInTokenPublicKey: "token-in",
  assetOutTokenPublicKey: "token-out",
  amountIn: 1000000n,
  minAmountOut: 950000n,
  maxSlippageBps: 500,
});
```

### Liquidity Management

```typescript
// Add liquidity
await client.addLiquidity({
  poolId: "pool-id",
  assetAAmount: 1000000n,
  assetBAmount: 5000n,
});

await client.getLpPosition("pool-id");

// Remove liquidity
await client.removeLiquidity({
  poolId: "pool-id",
  lpTokensToRemove: "500000",
});
```

### Host Operations

```typescript
// Register as host
await client.registerHost({
  namespace: "my-exchange",
  minFeeBps: 50,
  feeRecipientPublicKey: "optional-different-pubkey",
});

await client.getHost("my-exchange");

await client.getPoolHostFees("my-exchange", "pool-id");

// Withdraw host fees
await client.withdrawHostFees({
  lpIdentityPublicKey: "pool-id",
  assetAAmount: "1000",
  assetBAmount: "500",
});
```

## Modular Components Reference

### 1. API Client

The API client handles all HTTP communication:

```typescript
import { ApiClient } from "@flashnet/sdk";

const client = new ApiClient(config);

// Direct endpoints
const pools = await client.ammGet("/v1/pools");
const swapResult = await client.ammPost("/v1/swap", swapData);

// Typed API wrapper
import { TypedAmmApi } from "@flashnet/sdk";
const api = new TypedAmmApi(client);
const pools = await api.listPools({ limit: 10 });
```

### 2. Authentication & Signing

Support for multiple signing methods:

```typescript
// Using Spark Wallet
const authManager = new AuthManager(apiClient, pubkey, wallet);

// Using Custom Signer
class MyCustomSigner implements Signer {
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    // Your signing logic
    return signature;
  }
}

const signer = new MyCustomSigner();
const authManager = new AuthManager(apiClient, pubkey, signer);
await authManager.authenticate();
```

### 3. Intent Generation

Generate intent messages for operations:

```typescript
import {
  generatePoolSwapIntentMessage,
  generateAddLiquidityIntentMessage,
  generateConstantProductPoolInitializationIntentMessage,
  generateNonce,
  BTC_ASSET_PUBKEY,
} from "@flashnet/sdk";

// Swap intent
const swapIntent = generatePoolSwapIntentMessage({
  userPublicKey: "userPubkey",
  lpIdentityPublicKey: "poolPubkey",
  assetASparkTransferId: "transferId",
  // ... other parameters
  nonce: generateNonce(),
});
```

### 4. Spark Address Utilities

Work with Spark addresses:

```typescript
import {
  encodeSparkAddress,
  decodeSparkAddress,
  isValidSparkAddress,
  getNetworkFromAddress,
} from "@flashnet/sdk";

// Encode public key to address
const sparkAddress = encodeSparkAddress({
  identityPublicKey: "02abc...",
  network: "MAINNET",
});

// Detect network from address
const network = getNetworkFromAddress(sparkAddress);
```

### 5. Validation Utilities

Validate requests before sending:

```typescript
import {
  validateRequest,
  commonValidationRules,
  ValidationError,
} from "@flashnet/sdk";

try {
  validateRequest(swapRequest, {
    userPublicKey: commonValidationRules.publicKey,
    amountIn: commonValidationRules.amount,
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`Invalid ${error.field}: ${error.reason}`);
  }
}
```

## Error Handling

```typescript
import { isFlashnetError } from "@flashnet/sdk";

try {
  const result = await client.executeSwap(/* ... */);
} catch (error) {
  if (isFlashnetError(error)) {
    console.error(`API Error ${error.code}: ${error.msg}`);
  }
  // Handle other errors
}
```

## Types

The SDK exports all necessary TypeScript types:

```typescript
import type {
  NetworkType,
  Pool,
  Token,
  SwapSimulationRequest,
  SwapSimulationResponse,
  ExecuteSwapRequest,
  AddLiquidityRequest,
  RemoveLiquidityRequest,
  LpPosition,
  Signer,
} from "@flashnet/sdk";
```

## License

MIT

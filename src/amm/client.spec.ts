import { secp256k1 } from "@noble/curves/secp256k1";
import { AMMClient } from "./client";
import { ExecutionClient } from "../execution/client";
import type { SparkWalletInput } from "../execution/spark-evm-account";

// Deterministic test key — private key = 1 (well-known test scalar).
const TEST_KEY = new Uint8Array(32);
TEST_KEY[31] = 1;

/**
 * Mock SparkWallet shape. The SDK reads `config.signer` via getWalletSigner;
 * for AMMClient's useAvailableBalance path it ALSO expects `.transfer` and
 * `.transferTokens` on the wallet (read through getSparkWallet()).
 */
function mockWallet(opts?: {
  transferId?: string;
  tokenTransferId?: string;
  onTransfer?: (args: unknown) => void;
  onTransferTokens?: (args: unknown) => void;
}): SparkWalletInput {
  const pubkey = secp256k1.getPublicKey(TEST_KEY, true);
  return {
    config: {
      signer: {
        async getIdentityPublicKey() {
          return pubkey;
        },
        async signMessageWithIdentityKey(msg: Uint8Array, compact?: boolean) {
          const sig = secp256k1.sign(msg, TEST_KEY);
          return compact ? sig.toCompactRawBytes() : sig.toDERRawBytes();
        },
      },
    },
    async transfer(args: { amountSats: number; receiverSparkAddress: string }) {
      opts?.onTransfer?.(args);
      return { id: opts?.transferId ?? "btc-transfer-id" };
    },
    async transferTokens(args: {
      tokenIdentifier: string;
      tokenAmount: bigint;
      receiverSparkAddress: string;
    }) {
      opts?.onTransferTokens?.(args);
      return opts?.tokenTransferId ?? "token-transfer-id";
    },
  } as unknown as SparkWalletInput;
}

const EXEC_CONFIG = {
  gatewayUrl: "http://localhost:8080",
  rpcUrl: "http://localhost:8545",
  chainId: 21022,
  bridgeAddress: "0x1e2861ce58eaa89260226b5704416b9a20589d47",
};

const AMM_CONFIG_WITH_CUSTODY = {
  conductorAddress: "0x1111111111111111111111111111111111111111",
  wbtcAddress: "0x2222222222222222222222222222222222222222",
  factoryAddress: "0x3333333333333333333333333333333333333333",
  bridgeCustodySparkAddress:
    "sparkrt1pgssx3qm405syfc0hcgul58t7ce9c9xjyu5w4pnda4eu6tts9d6cqkj94epdlw",
};

const AMM_CONFIG_NO_CUSTODY = {
  conductorAddress: "0x1111111111111111111111111111111111111111",
  wbtcAddress: "0x2222222222222222222222222222222222222222",
  factoryAddress: "0x3333333333333333333333333333333333333333",
};

describe("AMMClient.swap — useAvailableBalance validation", () => {
  it("rejects BTC → BTC unconditionally", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new AMMClient(client, AMM_CONFIG_WITH_CUSTODY);
    await expect(
      amm.swap({
        assetInAddress: "btc",
        assetOutAddress: "BTC",
        amountIn: "1000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/BTC → BTC/);
  });

  it("requires withdraw=true when useAvailableBalance is set", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new AMMClient(client, AMM_CONFIG_WITH_CUSTODY);
    await expect(
      amm.swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: "1000",
        minAmountOut: "0",
        fee: 3000,
        withdraw: false,
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/withdraw=true/);
  });

  it("requires bridgeCustodySparkAddress in config", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new AMMClient(client, AMM_CONFIG_NO_CUSTODY);
    await expect(
      amm.swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: "1000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/bridgeCustodySparkAddress/);
  });

  it("requires assetInSparkTokenId for ERC-20 inputs", async () => {
    const client = new ExecutionClient(mockWallet(), EXEC_CONFIG);
    const amm = new AMMClient(client, AMM_CONFIG_WITH_CUSTODY);
    await expect(
      amm.swap({
        assetInAddress: "0x4444444444444444444444444444444444444444",
        assetOutAddress: "btc",
        amountIn: "1000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
        // assetInSparkTokenId intentionally omitted
      })
    ).rejects.toThrow(/assetInSparkTokenId/);
  });

  it("rejects amountIn beyond Number.MAX_SAFE_INTEGER for BTC deposits", async () => {
    // SparkWallet.transfer caps amountSats at 2^53-1; a larger input
    // should surface as an actionable error rather than silent overflow.
    // We get here BEFORE the RPC-reaching parts of the flow: the transfer
    // helper runs first, so no mocking of the gateway/RPC is needed.
    const wallet = mockWallet();
    const client = new ExecutionClient(wallet, EXEC_CONFIG);
    const amm = new AMMClient(client, AMM_CONFIG_WITH_CUSTODY);
    const tooBig = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString();
    await expect(
      amm.swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: tooBig,
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
    ).rejects.toThrow(/number precision cap/);
  });
});

describe("AMMClient.swap — BTC → token deposit wiring", () => {
  it("calls wallet.transfer with the right amount and custody address", async () => {
    // We cannot fully exercise the happy path without stubbing the EVM RPC
    // (nonce, EIP-1559 fees) and the gateway. Instead verify the Spark
    // transfer is issued with the expected args — the first observable
    // side effect — and let the e2e script in the UI cover the rest.
    let observed: any = null;
    const wallet = mockWallet({
      transferId: "abc123",
      onTransfer: (args) => {
        observed = args;
      },
    });
    const client = new ExecutionClient(wallet, EXEC_CONFIG);
    const amm = new AMMClient(client, AMM_CONFIG_WITH_CUSTODY);

    // The call will throw when it reaches `fetchNonce` (no RPC running).
    // That's fine — by then `wallet.transfer` has already run and we can
    // assert on `observed`.
    await expect(
      amm.swap({
        assetInAddress: "btc",
        assetOutAddress: "0x4444444444444444444444444444444444444444",
        amountIn: "250000",
        minAmountOut: "0",
        fee: 3000,
        useAvailableBalance: true,
      })
    ).rejects.toBeDefined();

    expect(observed).not.toBeNull();
    expect(observed.amountSats).toBe(250000);
    expect(observed.receiverSparkAddress).toBe(
      AMM_CONFIG_WITH_CUSTODY.bridgeCustodySparkAddress
    );
  });
});

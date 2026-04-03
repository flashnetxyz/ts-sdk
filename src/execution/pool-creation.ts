/**
 * Conductor Pool Creation Helpers
 *
 * ABI encoding for Conductor.createPool() and Conductor.createBTCPool().
 * These build the calldata that goes into a deposit-and-execute intent.
 *
 * @example
 * ```typescript
 * import { encodeCreateBTCPool } from "@flashnet/sdk/execution";
 *
 * const calldata = encodeCreateBTCPool({
 *   wbtcAddress: "0x...",
 *   otherTokenAddress: "0x...",
 *   fee: 3000,
 *   tickSpacing: 60,
 *   sqrtPriceX96: 79228162514264337593543950336n,
 *   wbtcAmount: 1000000000000000000n,
 *   otherAmount: 1000000000000000000n,
 *   hostId: "0x...",
 *   feeRecipient: "0x...",
 *   permit: { value: 1000n, deadline: 9999999999n, v: 27, r: "0x...", s: "0x..." },
 * });
 * ```
 */

import { sortTokens } from "./pool";
import { fullRangeTicks } from "./price-math";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** EIP-2612 permit signature data for Conductor pool creation. */
export interface PermitSignature {
  value: bigint;
  deadline: bigint;
  v: number;
  r: string;
  s: string;
}

/** Parameters for creating a BTC + ERC-20 pool via Conductor. */
export interface CreateBTCPoolParams {
  /** WBTC contract address. */
  wbtcAddress: string;
  /** The other token address. */
  otherTokenAddress: string;
  /** Fee tier (e.g. 500, 3000, 10000). */
  fee: number;
  /** Tick spacing for the fee tier. */
  tickSpacing: number;
  /** Initial sqrtPriceX96 for the pool. */
  sqrtPriceX96: bigint;
  /** Amount of WBTC to provide (in wei). */
  wbtcAmount: bigint;
  /** Amount of the other token to provide (in base units). */
  otherAmount: bigint;
  /** Host identifier (32-byte hex). */
  hostId: string;
  /** Address to receive host fees. */
  feeRecipient: string;
  /** EIP-2612 permit for the non-BTC token. */
  permit: PermitSignature;
}

/** Parameters for creating an ERC-20 only pool via Conductor (Permit2). */
export interface CreatePoolParams {
  /** First token address. */
  tokenA: string;
  /** Second token address. */
  tokenB: string;
  /** Fee tier. */
  fee: number;
  /** Tick spacing for the fee tier. */
  tickSpacing: number;
  /** Initial sqrtPriceX96. */
  sqrtPriceX96: bigint;
  /** Amount of tokenA (in base units). */
  amountA: bigint;
  /** Amount of tokenB (in base units). */
  amountB: bigint;
  /** Host identifier (32-byte hex). */
  hostId: string;
  /** Address to receive host fees. */
  feeRecipient: string;
}

// ---------------------------------------------------------------------------
// ABI encoding helpers
// ---------------------------------------------------------------------------

function abiEncodeAddress(address: string): string {
  const clean = address.startsWith("0x") ? address.slice(2) : address;
  return clean.toLowerCase().padStart(64, "0");
}

function abiEncodeUint256(value: bigint): string {
  if (value < 0n) throw new Error("abiEncodeUint256: value must be non-negative");
  if (value >= 1n << 256n)
    throw new Error("abiEncodeUint256: value exceeds uint256 max");
  return value.toString(16).padStart(64, "0");
}

function abiEncodeUint160(value: bigint): string {
  if (value >= 1n << 160n)
    throw new Error("abiEncodeUint160: value exceeds uint160 max");
  return value.toString(16).padStart(64, "0");
}

function abiEncodeUint24(value: number): string {
  if (value < 0 || value >= 2 ** 24)
    throw new Error("abiEncodeUint24: value out of range");
  return value.toString(16).padStart(64, "0");
}

function abiEncodeInt24(value: number): string {
  if (value < -(2 ** 23) || value >= 2 ** 23)
    throw new Error("abiEncodeInt24: value out of range");
  if (value >= 0) {
    return value.toString(16).padStart(64, "0");
  }
  // Two's complement for negative values
  const twos = BigInt(value) + (1n << 256n);
  return twos.toString(16).padStart(64, "0");
}

function abiEncodeUint8(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function abiEncodeBytes32(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return clean.padStart(64, "0");
}

// ---------------------------------------------------------------------------
// Function selectors
// ---------------------------------------------------------------------------

/**
 * createBTCPool((address,address,uint24,uint160,int24,int24,uint256,uint256,uint256,uint256,bytes32,address),(uint256,uint256,uint8,bytes32,bytes32))
 */
const SEL_CREATE_BTC_POOL = "0xb1e2eda2";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode calldata for Conductor.createBTCPool().
 * Handles token sorting, full-range tick calculation, and permit struct encoding.
 *
 * @returns Object with calldata (0x-prefixed hex) and wbtcAmountWei for the tx value field
 */
export function encodeCreateBTCPool(params: CreateBTCPoolParams): {
  calldata: string;
  wbtcAmountWei: bigint;
} {
  const [token0, token1] = sortTokens(
    params.wbtcAddress,
    params.otherTokenAddress
  );
  const wbtcIsToken0 =
    token0.toLowerCase() === params.wbtcAddress.toLowerCase();

  const amount0Desired = wbtcIsToken0 ? params.wbtcAmount : params.otherAmount;
  const amount1Desired = wbtcIsToken0 ? params.otherAmount : params.wbtcAmount;

  const { tickLower, tickUpper } = fullRangeTicks(params.tickSpacing);

  // Encode the CreatePoolParams tuple (12 fields)
  const poolParams =
    abiEncodeAddress(token0) +
    abiEncodeAddress(token1) +
    abiEncodeUint24(params.fee) +
    abiEncodeUint160(params.sqrtPriceX96) +
    abiEncodeInt24(tickLower) +
    abiEncodeInt24(tickUpper) +
    abiEncodeUint256(amount0Desired) +
    abiEncodeUint256(amount1Desired) +
    abiEncodeUint256(0n) + // amount0Min
    abiEncodeUint256(0n) + // amount1Min
    abiEncodeBytes32(params.hostId) +
    abiEncodeAddress(params.feeRecipient);

  // Encode the ERC20PermitSig tuple (5 fields)
  const permitData =
    abiEncodeUint256(params.permit.value) +
    abiEncodeUint256(params.permit.deadline) +
    abiEncodeUint8(params.permit.v) +
    abiEncodeBytes32(params.permit.r) +
    abiEncodeBytes32(params.permit.s);

  // Both tuples contain only static types — encode inline without offset words.
  const calldata = SEL_CREATE_BTC_POOL + poolParams + permitData;

  return { calldata: "0x" + calldata.replace(/^0x/, ""), wbtcAmountWei: params.wbtcAmount };
}

/**
 * Encode calldata for Conductor.createPool() (ERC20-only pools via Permit2).
 *
 * Note: This function encodes the pool parameters only. The Permit2 batch
 * signature must be constructed separately based on the partner's signing flow.
 *
 * @returns Encoded pool parameters (not full calldata — Permit2 sig appended by caller)
 */
export function encodeCreatePoolParams(params: CreatePoolParams): {
  token0: string;
  token1: string;
  amount0Desired: bigint;
  amount1Desired: bigint;
  tickLower: number;
  tickUpper: number;
} {
  const [token0, token1] = sortTokens(params.tokenA, params.tokenB);
  const aIsToken0 = token0.toLowerCase() === params.tokenA.toLowerCase();

  const amount0Desired = aIsToken0 ? params.amountA : params.amountB;
  const amount1Desired = aIsToken0 ? params.amountB : params.amountA;

  const { tickLower, tickUpper } = fullRangeTicks(params.tickSpacing);

  return {
    token0,
    token1,
    amount0Desired,
    amount1Desired,
    tickLower,
    tickUpper,
  };
}

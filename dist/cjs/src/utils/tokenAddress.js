'use strict';

var bech32 = require('bech32');
var sha256 = require('fast-sha256');
var hex = require('./hex.js');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var sha256__default = /*#__PURE__*/_interopDefault(sha256);

const SparkHumanReadableTokenIdentifierNetworkPrefix = {
    MAINNET: "btkn",
    REGTEST: "btknrt",
    TESTNET: "btknt",
    SIGNET: "btkns",
    LOCAL: "btknl",
};
const NETWORK_MAGIC = {
    MAINNET: 3652501241,
    TESTNET: 118034699,
    REGTEST: 3669344250,
    SIGNET: 1294402529,
};
const SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY = "0205fe807e8fe1f368df955cc291f16d840b7f28374b0ed80b80c3e2e0921a0674";
/**
 * Encode token identifier using Spark network type
 * @param tokenIdentifier Token identifier as hex string or Uint8Array
 * @param network Spark network type
 * @returns Human-readable token identifier
 */
function encodeSparkHumanReadableTokenIdentifier(tokenIdentifier, network) {
    try {
        // Convert hex string to bytes if needed
        const tokenIdentifierBytes = typeof tokenIdentifier === "string"
            ? hex.getUint8ArrayFromHex(tokenIdentifier)
            : tokenIdentifier;
        const words = bech32.bech32m.toWords(tokenIdentifierBytes);
        return bech32.bech32m.encode(SparkHumanReadableTokenIdentifierNetworkPrefix[network], words, 500);
    }
    catch {
        throw new Error("Failed to encode Spark human readable token identifier");
    }
}
/**
 * Decode human-readable token identifier using Spark network type
 * @param humanReadableTokenIdentifier Human-readable token identifier
 * @param network Expected Spark network type
 * @returns Object containing token identifier and network
 */
function decodeSparkHumanReadableTokenIdentifier(humanReadableTokenIdentifier, network) {
    try {
        const decoded = bech32.bech32m.decode(humanReadableTokenIdentifier, 500);
        if (decoded.prefix !== SparkHumanReadableTokenIdentifierNetworkPrefix[network]) {
            throw new Error(`Invalid Spark human readable token identifier prefix, expected '${SparkHumanReadableTokenIdentifierNetworkPrefix[network]}' but got '${decoded.prefix}'`);
        }
        const tokenIdentifier = bech32.bech32m.fromWords(decoded.words);
        return {
            tokenIdentifier: hex.getHexFromUint8Array(new Uint8Array(tokenIdentifier)),
            network,
        };
    }
    catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Failed to decode Spark human readable token identifier");
    }
}
// BACKWARD COMPATIBILITY LAYER
/**
 * @deprecated Use SparkHumanReadableTokenIdentifierNetworkPrefix instead
 */
const HumanReadableTokenIdentifierNetworkPrefix = {
    MAINNET: "btkn",
    REGTEST: "btknrt",
    TESTNET: "btknt",
    SIGNET: "btkns",
    LOCAL: "btknl",
};
/**
 * @deprecated Use encodeSparkHumanReadableTokenIdentifier with SparkNetworkType instead
 */
function encodeHumanReadableTokenIdentifier(tokenIdentifier, network) {
    try {
        // Convert hex string to bytes if needed
        const tokenIdentifierBytes = typeof tokenIdentifier === "string"
            ? hex.getUint8ArrayFromHex(tokenIdentifier)
            : tokenIdentifier;
        const words = bech32.bech32m.toWords(tokenIdentifierBytes);
        return bech32.bech32m.encode(HumanReadableTokenIdentifierNetworkPrefix[network], words, 500);
    }
    catch {
        throw new Error("Failed to encode human readable token identifier");
    }
}
/**
 * @deprecated Use decodeSparkHumanReadableTokenIdentifier with SparkNetworkType instead
 */
function decodeHumanReadableTokenIdentifier(humanReadableTokenIdentifier, network) {
    try {
        const decoded = bech32.bech32m.decode(humanReadableTokenIdentifier, 500);
        if (decoded.prefix !== HumanReadableTokenIdentifierNetworkPrefix[network]) {
            throw new Error(`Invalid human readable token identifier prefix, expected '${HumanReadableTokenIdentifierNetworkPrefix[network]}' but got '${decoded.prefix}'`);
        }
        const tokenIdentifier = bech32.bech32m.fromWords(decoded.words);
        return {
            tokenIdentifier: hex.getHexFromUint8Array(new Uint8Array(tokenIdentifier)),
            network,
        };
    }
    catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Failed to decode human readable token identifier");
    }
}
function getTokenIdentifierHashes(token) {
    const encoder = new TextEncoder();
    const oneHash = sha256__default.default(new Uint8Array([1]));
    const versionHash = oneHash;
    const nameHash = sha256__default.default(encoder.encode(token.name));
    const tickerHash = sha256__default.default(encoder.encode(token.ticker));
    const decimalsHash = sha256__default.default(new Uint8Array([token.decimals]));
    const isFreezableHash = sha256__default.default(new Uint8Array([token.isFreezable ? 1 : 0]));
    const networkMagic = NETWORK_MAGIC[token.network];
    const networkBytes = new Uint8Array(4);
    new DataView(networkBytes.buffer).setUint32(0, networkMagic, false);
    const networkHash = sha256__default.default(networkBytes);
    const creationEntityBytes = typeof token.creationEntityPublicKey === "string"
        ? hex.getUint8ArrayFromHex(token.creationEntityPublicKey)
        : token.creationEntityPublicKey;
    const isL1 = !creationEntityBytes ||
        (creationEntityBytes.length === 33 &&
            creationEntityBytes.every((byte) => byte === 0));
    const creationEntityPublicKeyHash = isL1
        ? oneHash
        : (() => {
            const layerData = new Uint8Array(34);
            layerData[0] = 2;
            layerData.set(creationEntityBytes, 1);
            return sha256__default.default(layerData);
        })();
    const issuerPublicKeyHash = sha256__default.default(typeof token.issuerPublicKey === "string"
        ? hex.getUint8ArrayFromHex(token.issuerPublicKey)
        : token.issuerPublicKey);
    const maxSupplyBytes = bigintTo16ByteArray(token.maxSupply);
    const maxSupplyHash = sha256__default.default(maxSupplyBytes);
    return {
        versionHash,
        issuerPublicKeyHash,
        nameHash,
        tickerHash,
        decimalsHash,
        maxSupplyHash,
        isFreezableHash,
        networkHash,
        creationEntityPublicKeyHash,
    };
}
function bigintTo16ByteArray(value) {
    let valueToTrack = value;
    const buffer = new Uint8Array(16);
    for (let i = 15; i >= 0 && valueToTrack > 0n; i--) {
        buffer[i] = Number(valueToTrack & 255n);
        valueToTrack >>= 8n;
    }
    return buffer;
}
function getTokenIdentifierWithHashes(hashes) {
    const allHashes = [
        hashes.versionHash,
        hashes.issuerPublicKeyHash,
        hashes.nameHash,
        hashes.tickerHash,
        hashes.decimalsHash,
        hashes.maxSupplyHash,
        hashes.isFreezableHash,
        hashes.networkHash,
        hashes.creationEntityPublicKeyHash,
    ];
    const concatenated = new Uint8Array(allHashes.reduce((acc, h) => acc + h.length, 0));
    let offset = 0;
    for (const h of allHashes) {
        concatenated.set(h, offset);
        offset += h.length;
    }
    return sha256__default.default(concatenated);
}
function getTokenIdentifier(token) {
    const tokenHashes = getTokenIdentifierHashes(token);
    return getTokenIdentifierWithHashes(tokenHashes);
}
function getHumanReadableTokenIdentifier(token) {
    return encodeSparkHumanReadableTokenIdentifier(getTokenIdentifier(token), token.network);
}

exports.SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY = SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY;
exports.decodeHumanReadableTokenIdentifier = decodeHumanReadableTokenIdentifier;
exports.decodeSparkHumanReadableTokenIdentifier = decodeSparkHumanReadableTokenIdentifier;
exports.encodeHumanReadableTokenIdentifier = encodeHumanReadableTokenIdentifier;
exports.encodeSparkHumanReadableTokenIdentifier = encodeSparkHumanReadableTokenIdentifier;
exports.getHumanReadableTokenIdentifier = getHumanReadableTokenIdentifier;
exports.getTokenIdentifier = getTokenIdentifier;
exports.getTokenIdentifierHashes = getTokenIdentifierHashes;
exports.getTokenIdentifierWithHashes = getTokenIdentifierWithHashes;
//# sourceMappingURL=tokenAddress.js.map

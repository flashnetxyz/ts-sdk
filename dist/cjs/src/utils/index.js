'use strict';

require('fast-sha256');
var sparkAddress = require('./spark-address.js');
require('bech32');

// Helper function to generate random nonce (browser-compatible)
function generateNonce() {
    // Generate a random string using crypto.getRandomValues (works in both Node.js and browsers)
    const array = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(array);
    }
    else if (typeof globalThis !== "undefined" &&
        globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(array);
    }
    else {
        // Fallback for environments without crypto.getRandomValues
        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
    }
    // Convert to hex string
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
// Helper function to convert decimal amounts to smallest units
function toSmallestUnit(amount, decimals) {
    return BigInt(Math.floor(amount * 10 ** decimals));
}
// Helper function to convert from smallest units to decimal
function fromSmallestUnit(amount, decimals) {
    const bigintAmount = typeof amount === "bigint" ? amount : BigInt(amount);
    return Number(bigintAmount) / 10 ** decimals;
}
// Helper function to compare two non-negative decimal strings.
// Returns -1 if a < b, 0 if equal, and 1 if a > b.
function compareDecimalStrings(a, b) {
    const normalize = (s) => {
        const [whole = "", fraction = ""] = s.split(".");
        const wholeClean = whole.replace(/^0+/, "") || "0";
        const fractionClean = fraction.replace(/0+$/, "");
        return [wholeClean, fractionClean];
    };
    const [wholeA, fracA] = normalize(a);
    const [wholeB, fracB] = normalize(b);
    // Compare integer part length
    if (wholeA.length !== wholeB.length) {
        return wholeA.length < wholeB.length ? -1 : 1;
    }
    // Compare integer parts lexicographically
    if (wholeA !== wholeB) {
        return wholeA < wholeB ? -1 : 1;
    }
    // Integers are equal – compare fractional parts
    const maxFracLen = Math.max(fracA.length, fracB.length);
    const fracAPadded = fracA.padEnd(maxFracLen, "0");
    const fracBPadded = fracB.padEnd(maxFracLen, "0");
    if (fracAPadded === fracBPadded) {
        return 0;
    }
    return fracAPadded < fracBPadded ? -1 : 1;
}

exports.convertSparkAddressToNetwork = sparkAddress.convertSparkAddressToNetwork;
exports.convertSparkAddressToSparkNetwork = sparkAddress.convertSparkAddressToSparkNetwork;
exports.decodeSparkAddress = sparkAddress.decodeSparkAddress;
exports.decodeSparkAddressNew = sparkAddress.decodeSparkAddressNew;
exports.encodeSparkAddress = sparkAddress.encodeSparkAddress;
exports.encodeSparkAddressNew = sparkAddress.encodeSparkAddressNew;
exports.getNetworkFromAddress = sparkAddress.getNetworkFromAddress;
exports.getSparkNetworkFromAddress = sparkAddress.getSparkNetworkFromAddress;
exports.isValidPublicKey = sparkAddress.isValidPublicKey;
exports.isValidSparkAddress = sparkAddress.isValidSparkAddress;
exports.isValidSparkAddressNew = sparkAddress.isValidSparkAddressNew;
exports.looksLikePublicKey = sparkAddress.looksLikePublicKey;
exports.compareDecimalStrings = compareDecimalStrings;
exports.fromSmallestUnit = fromSmallestUnit;
exports.generateNonce = generateNonce;
exports.toSmallestUnit = toSmallestUnit;
//# sourceMappingURL=index.js.map

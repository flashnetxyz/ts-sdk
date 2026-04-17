'use strict';

function getHexFromUint8Array(bytes) {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
function getUint8ArrayFromHex(hex) {
    if (hex.length % 2 !== 0) {
        throw new Error("Invalid hex string length");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

exports.getHexFromUint8Array = getHexFromUint8Array;
exports.getUint8ArrayFromHex = getUint8ArrayFromHex;
//# sourceMappingURL=hex.js.map

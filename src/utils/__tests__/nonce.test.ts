import { generateNonce } from "../index";

describe("generateNonce", () => {
  it("returns a 16-byte hex nonce", () => {
    const nonce = generateNonce();

    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns unique nonces across many calls", () => {
    const nonces = new Set<string>();

    for (let i = 0; i < 500; i++) {
      nonces.add(generateNonce());
    }

    expect(nonces.size).toBe(500);
  });

  it("throws when secure RNG is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
    });

    try {
      expect(() => generateNonce()).toThrow(/Secure random source unavailable/);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: originalCrypto,
        configurable: true,
      });
    }
  });
});

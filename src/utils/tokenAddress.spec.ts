import {
  getHumanReadableTokenIdentifier,
  SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
} from "./tokenAddress";

describe("tokenAddress", () => {
  it("getHumanReadableTokenIdentifier", async () => {
    const generatedTokenAddress = getHumanReadableTokenIdentifier({
      issuerPublicKey:
        "029e4d50f931c170e100c1b7129e353cddd69c8ae50bf274e7a68b05144ef8b55e",
      decimals: 8,
      isFreezable: false,
      name: "FlashSparks",
      ticker: "FSPKS",
      maxSupply: 2100000000000000n,
      network: "MAINNET",
      creationEntityPublicKey: SPARK_TOKEN_CREATION_ENTITY_PUBLIC_KEY,
    });

    expect(generatedTokenAddress).toBe(
      "btkn1daywtenlww42njymqzyegvcwuy3p9f26zknme0srxa7tagewvuys86h553"
    );
  });
});

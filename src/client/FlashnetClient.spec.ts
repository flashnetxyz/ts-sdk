import { FlashnetClient } from "./FlashnetClient";

describe("FlashnetClient", () => {
  describe("calculateVirtualReserves", () => {
    it("works as intended", () => {
      const { virtualReserveA, virtualReserveB, threshold } =
        FlashnetClient.calculateVirtualReserves({
          initialTokenSupply: 1_000_000_000_00000000n,
          targetRaise: 25_000_000n,
          graduationThresholdPct: 80,
        });

      expect(virtualReserveA).toBe(66_666_666_66666666n);
      expect(virtualReserveB).toBe(8_333_333n);
      expect(threshold).toBe(800_000_000_00000000n);
    });

    it("works as intended round 2", () => {
      const { virtualReserveA, virtualReserveB, threshold } =
        FlashnetClient.calculateVirtualReserves({
          initialTokenSupply: 800_000_000_00000000n,
          targetRaise: 25_000_000n,
          graduationThresholdPct: 75,
        });

      expect(virtualReserveA).toBe(100_000_000_00000000n);
      expect(virtualReserveB).toBe(12_500_000n);
      expect(threshold).toBe(600_000_000_00000000n);
    });

    it.each([[0], [25], [50], [96], [100]])(
      "Cannot handle threshold out of bounds (%d)",
      (graduationThresholdPct) => {
        expect(() =>
          FlashnetClient.calculateVirtualReserves({
            initialTokenSupply: 800_000_000_00000000n,
            targetRaise: 25_000_000n,
            graduationThresholdPct: graduationThresholdPct,
          })
        ).toThrow();
      }
    );

    it("nonnegative initialTokenSupply does not work", () => {
      expect(() =>
        FlashnetClient.calculateVirtualReserves({
          initialTokenSupply: 0n,
          targetRaise: 25_000_000n,
          graduationThresholdPct: 80,
        })
      ).toThrow();
    });

    it("nonnegative targetRaise does not work", () => {
      expect(() =>
        FlashnetClient.calculateVirtualReserves({
          initialTokenSupply: 800_000_000_00000000n,
          targetRaise: 0n,
          graduationThresholdPct: 80,
        })
      ).toThrow();
    });
  });
});

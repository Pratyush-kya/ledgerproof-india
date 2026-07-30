import { describe, expect, it } from "vitest";

import {
  currentFinancialYear,
  financialYearBounds,
  isInFinancialYear,
  recentFinancialYears,
} from "../src/lib/financial-year";

describe("Indian financial-year helpers", () => {
  it("uses April 1 boundaries without local-time drift", () => {
    expect(financialYearBounds("2025-26")).toEqual({
      start: "2025-04-01T00:00:00.000Z",
      endExclusive: "2026-04-01T00:00:00.000Z",
    });
    expect(isInFinancialYear("2025-04-01T00:00:00.000Z", "2025-26")).toBe(
      true,
    );
    expect(isInFinancialYear("2026-04-01T00:00:00.000Z", "2025-26")).toBe(
      false,
    );
  });

  it("selects the current and recent financial years deterministically", () => {
    const reference = new Date("2026-03-31T23:59:59.000Z");
    expect(currentFinancialYear(reference)).toBe("2025-26");
    expect(recentFinancialYears(3, reference)).toEqual([
      "2025-26",
      "2024-25",
      "2023-24",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { DEMO_LEDGER, loadDemoLedger } from "../src/lib/demo-ledger";
import { EvmAddressSchema } from "../src/lib/schemas";

describe("EvmAddressSchema", () => {
  it("accepts a 42-character Ethereum address", () => {
    expect(EvmAddressSchema.parse("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234567890abcdef1234567890abcdef12345678",
    );
  });

  it.each([
    "0x1234",
    "1234567890abcdef1234567890abcdef12345678",
    "0x1234567890abcdef1234567890abcdef1234567g",
  ])("rejects an invalid address: %s", (address) => {
    expect(EvmAddressSchema.safeParse(address).success).toBe(false);
  });
});

describe("static demo ledger", () => {
  it("loads a schema-valid, visibly labelled fixture", () => {
    const report = loadDemoLedger();

    expect(report).toEqual(DEMO_LEDGER);
    expect(report.coverage.isDemoData).toBe(true);
    expect(report.coverage.source).toBe("static-demo-fixture");
    expect(report.transactions).toHaveLength(3);
    expect(report.classifications.some((item) => item.needsReview)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  canonicalReportHash,
  canonicalReportRepresentation,
} from "@/lib/report-receipt";
import {
  isDuplicateReceiptError,
  isWalletRejection,
} from "@/components/report-receipt-panel";

describe("canonical report receipt", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const report = {
      z: [{ second: 2, first: 1 }],
      a: "₹",
    };

    expect(canonicalReportRepresentation(report)).toBe(
      '{"report":{"a":"₹","z":[{"first":1,"second":2}]},"schema":"ledgerproof-report-receipt-v1"}',
    );
  });

  it("produces the same hash for semantically identical key ordering", () => {
    const first = {
      address: "0x1234",
      summary: { loss: "0", gain: "100" },
    };
    const second = {
      summary: { gain: "100", loss: "0" },
      address: "0x1234",
    };

    expect(canonicalReportHash(first)).toBe(canonicalReportHash(second));
    expect(canonicalReportHash(first)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes the hash when report evidence changes", () => {
    expect(canonicalReportHash({ gain: "100" })).not.toBe(
      canonicalReportHash({ gain: "101" }),
    );
  });

  it("rejects values that cannot have a stable JSON representation", () => {
    expect(() => canonicalReportRepresentation({ amount: BigInt(1) })).toThrow(
      "Canonical reports cannot contain bigint values.",
    );
    expect(() => canonicalReportRepresentation({ amount: Number.NaN })).toThrow(
      "Canonical reports cannot contain non-finite numbers.",
    );
  });
});

describe("wallet error classification", () => {
  it("recognizes explicit wallet rejection", () => {
    expect(isWalletRejection({ code: 4001 })).toBe(true);
    expect(isWalletRejection({ cause: { name: "UserRejectedRequestError" } })).toBe(
      true,
    );
  });

  it("recognizes the duplicate custom error without exposing raw errors", () => {
    expect(
      isDuplicateReceiptError({
        cause: { data: { errorName: "ReceiptAlreadyMinted" } },
      }),
    ).toBe(true);
    expect(isDuplicateReceiptError(new Error("network unavailable"))).toBe(
      false,
    );
  });
});

import { describe, expect, it } from "vitest";

import { configuredReportReceiptAddress } from "@/lib/report-receipt-config";

describe("report receipt configuration", () => {
  it("keeps the feature unavailable without a public contract address", () => {
    expect(configuredReportReceiptAddress(undefined)).toBeNull();
    expect(configuredReportReceiptAddress("")).toBeNull();
    expect(configuredReportReceiptAddress("0x0000000000000000000000000000000000000000")).toBeNull();
    expect(configuredReportReceiptAddress("not-an-address")).toBeNull();
  });

  it("accepts an explicitly configured nonzero address", () => {
    expect(
      configuredReportReceiptAddress(
        " 0xAa11111111111111111111111111111111111111 ",
      ),
    ).toBe("0xaa11111111111111111111111111111111111111");
  });
});

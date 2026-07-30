import { afterEach, describe, expect, it } from "vitest";

import { POST } from "../src/app/api/analysis/report/route";
import { resetRequestGuardsForTests } from "../src/lib/request-guard";
import type { NormalizedTransaction } from "../src/lib/schemas";

const TX_HASH = `0x${"d".repeat(64)}`;

const transaction: NormalizedTransaction = {
  id: "transfer-1",
  txHash: TX_HASH,
  chainId: 1,
  blockNumber: 1,
  timestamp: "2026-07-20T10:30:00.000Z",
  from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  to: "0x1234567890abcdef1234567890abcdef12345678",
  explorerUrl: `https://etherscan.io/tx/${TX_HASH}`,
  status: "confirmed",
  assetDeltas: [
    {
      assetId: "eip155:1/slip44:60",
      symbol: "ETH",
      decimals: 18,
      amountAtomic: "1000000000000000000",
      direction: "in",
      standard: "native",
    },
  ],
  gasFeeWei: "0",
};

function request() {
  return new Request("http://localhost/api/analysis/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({ transactions: [transaction] }),
  });
}

afterEach(() => {
  resetRequestGuardsForTests();
});

describe("POST /api/analysis/report", () => {
  it("distinguishes no supported disposal from a calculation failure", async () => {
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.calculation.summary.calculatedDisposals).toBe(0);
    expect(payload.data.calculation.summary.calculationStatus).toBe(
      "no_supported_disposals",
    );
    expect(payload.data.report.deterministicFindings[0]).toContain(
      "No supported disposals",
    );
    expect(payload.data.classificationMode).toBe("deterministic");
    expect(payload.data.classificationNotice).toBe(
      "DETERMINISTIC RULE ENGINE — tax calculations do not depend on AI.",
    );
  });

  it("enforces the per-client report request budget", async () => {
    let response = await POST(request());
    for (let index = 1; index < 31; index += 1) {
      response = await POST(request());
    }

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });
});

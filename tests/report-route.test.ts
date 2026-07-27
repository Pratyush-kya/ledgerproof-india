import { afterEach, describe, expect, it } from "vitest";

import { POST } from "../src/app/api/analysis/report/route";
import { resetRequestGuardsForTests } from "../src/lib/request-guard";
import type { NormalizedTransaction } from "../src/lib/schemas";

const TX_HASH = `0x${"d".repeat(64)}`;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

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
  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
});

describe("POST /api/analysis/report", () => {
  it("reports that figures were not calculated for a one-sided transfer", async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.calculation.summary.calculatedDisposals).toBe(0);
    expect(payload.data.report.deterministicFindings[0]).toContain(
      "Not calculated",
    );
  });

  it("enforces the per-client report request budget", async () => {
    delete process.env.OPENAI_API_KEY;
    let response = await POST(request());
    for (let index = 1; index < 11; index += 1) {
      response = await POST(request());
    }

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });
});

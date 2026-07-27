import { afterEach, describe, expect, it, vi } from "vitest";

import providerFixture from "../src/fixtures/goldrush-transactions.json";
import { POST } from "../src/app/api/analysis/fetch/route";
import { resetRequestGuardsForTests } from "../src/lib/request-guard";

const address = "0x1234567890abcdef1234567890abcdef12345678";
const originalApiKey = process.env.GOLDRUSH_API_KEY;

function request(body: unknown) {
  return new Request("http://localhost/api/analysis/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  resetRequestGuardsForTests();
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) {
    delete process.env.GOLDRUSH_API_KEY;
  } else {
    process.env.GOLDRUSH_API_KEY = originalApiKey;
  }
});

describe("POST /api/analysis/fetch", () => {
  it("returns the explicit invalid-address state before contacting a provider", async () => {
    const response = await POST(request({ address: "not-an-address" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_ADDRESS", retryable: false },
    });
  });

  it("returns the explicit missing-key state", async () => {
    delete process.env.GOLDRUSH_API_KEY;
    const response = await POST(request({ address }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MISSING_PROVIDER_KEY", retryable: false },
    });
  });

  it("returns the explicit upstream rate-limit state", async () => {
    process.env.GOLDRUSH_API_KEY = "test-only-key";
    vi.stubGlobal("fetch", async () => new Response(null, { status: 429 }));

    const response = await POST(request({ address }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPSTREAM_RATE_LIMIT", retryable: true },
    });
  });

  it("returns an explicit successful empty-history state", async () => {
    process.env.GOLDRUSH_API_KEY = "test-only-key";
    const emptyFixture = structuredClone(providerFixture);
    emptyFixture.data.items = [];
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify(emptyFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const response = await POST(request({ address }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        transactions: [],
        isEmpty: true,
        source: "goldrush",
      },
    });
  });
});

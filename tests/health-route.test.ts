import { afterEach, describe, expect, it } from "vitest";

import { GET } from "../src/app/api/health/route";

const originalEnvironment = {
  goldrush: process.env.GOLDRUSH_API_KEY,
  coingecko: process.env.COINGECKO_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
};

afterEach(() => {
  for (const [name, value] of Object.entries({
    GOLDRUSH_API_KEY: originalEnvironment.goldrush,
    COINGECKO_API_KEY: originalEnvironment.coingecko,
    OPENAI_API_KEY: originalEnvironment.openai,
    OPENAI_MODEL: originalEnvironment.model,
  })) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("GET /api/health", () => {
  it("reports configuration booleans without returning secret values", async () => {
    process.env.GOLDRUSH_API_KEY = "goldrush-secret";
    process.env.COINGECKO_API_KEY = "coingecko-secret";
    process.env.OPENAI_API_KEY = "openai-secret";
    process.env.OPENAI_MODEL = "gpt-test";

    const response = await GET();
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "ok",
      application: "ledgerproof-india",
      providers: {
        blockchainConfigured: true,
        historicalPricesConfigured: true,
        classificationConfigured: true,
        classificationModel: "gpt-test",
      },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(serialized).not.toContain("goldrush-secret");
    expect(serialized).not.toContain("coingecko-secret");
    expect(serialized).not.toContain("openai-secret");
  });
});

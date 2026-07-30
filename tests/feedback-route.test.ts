import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/feedback/route";
import { resetRequestGuardsForTests } from "../src/lib/request-guard";

const originalEndpoint = process.env.FEEDBACK_FORM_ENDPOINT;
const transactionHash = `0x${"b".repeat(64)}`;

function validFeedback(overrides: Record<string, unknown> = {}) {
  return {
    feedbackType: "wrong_classification",
    message: "This transaction appears to have the wrong classification.",
    email: "reviewer@example.test",
    transactionHash,
    reportReference: "report-example",
    currentPage: "/",
    appVersion: "client-supplied-version",
    website: "",
    sensitiveInformationConfirmed: true,
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.42",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  resetRequestGuardsForTests();
  vi.unstubAllGlobals();
  if (originalEndpoint === undefined) {
    delete process.env.FEEDBACK_FORM_ENDPOINT;
  } else {
    process.env.FEEDBACK_FORM_ENDPOINT = originalEndpoint;
  }
});

describe("POST /api/feedback", () => {
  it("validates required fields before contacting the provider", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    process.env.FEEDBACK_FORM_ENDPOINT = "https://feedback.example.test/form";

    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it("rejects the honeypot before contacting the provider", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    process.env.FEEDBACK_FORM_ENDPOINT = "https://feedback.example.test/form";

    const response = await POST(
      request(validFeedback({ website: "https://bot.example" })),
    );

    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BOT_DETECTED", retryable: false },
    });
  });

  it("returns a clear missing-endpoint state without false success", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    delete process.env.FEEDBACK_FORM_ENDPOINT;

    const response = await POST(request(validFeedback()));

    expect(response.status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FEEDBACK_NOT_CONFIGURED", retryable: false },
    });
  });

  it("treats an invalid or non-HTTPS endpoint as unconfigured", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    process.env.FEEDBACK_FORM_ENDPOINT = "http://feedback.example.test/form";

    const response = await POST(request(validFeedback()));

    expect(response.status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns provider failure without exposing the provider response", async () => {
    process.env.FEEDBACK_FORM_ENDPOINT = "https://feedback.example.test/form";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { internal: "provider detail that must not be exposed" },
          { status: 500 },
        ),
      ),
    );

    const response = await POST(request(validFeedback()));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      error: { code: "FEEDBACK_PROVIDER_FAILED", retryable: true },
    });
    expect(JSON.stringify(payload)).not.toContain("provider detail");
  });

  it("forwards only validated fields and returns a visible reference ID", async () => {
    process.env.FEEDBACK_FORM_ENDPOINT = "https://feedback.example.test/form";
    const provider = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", provider);

    const response = await POST(request(validFeedback()));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.referenceId).toMatch(/^LPF-[A-F0-9]{8}$/);
    expect(provider).toHaveBeenCalledOnce();

    const [url, init] = provider.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const forwarded = JSON.parse(String(init.body));

    expect(url).toBe("https://feedback.example.test/form");
    expect(init.redirect).toBe("error");
    expect(forwarded).toMatchObject({
      referenceId: payload.data.referenceId,
      feedbackType: "wrong_classification",
      message: validFeedback().message,
      email: "reviewer@example.test",
      transactionHash,
      reportReference: "report-example",
      currentPage: "/",
      appVersion: "0.1.0",
      sensitiveInformationConfirmed: true,
    });
    expect(forwarded).not.toHaveProperty("website");
    expect(forwarded).not.toHaveProperty("wallet");
    expect(forwarded).not.toHaveProperty("transactions");
    expect(forwarded).not.toHaveProperty("report");
  });

  it("enforces the per-client feedback request budget", async () => {
    delete process.env.FEEDBACK_FORM_ENDPOINT;
    let response = await POST(request(validFeedback()));
    for (let attempt = 1; attempt < 6; attempt += 1) {
      response = await POST(request(validFeedback()));
    }

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED", retryable: true },
    });
  });
});

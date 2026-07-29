import { describe, expect, it } from "vitest";

import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "../src/lib/request-body";

describe("bounded JSON request bodies", () => {
  it("parses a JSON body within the configured limit", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonBody(request, 1024)).resolves.toEqual({ ok: true });
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "{",
    });

    await expect(readJsonBody(request, 1024)).rejects.toBeInstanceOf(
      InvalidJsonBodyError,
    );
  });

  it("rejects oversized JSON even without trusting content-length", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(2048) }),
    });

    await expect(readJsonBody(request, 1024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});

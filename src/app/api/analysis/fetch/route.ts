import { NextResponse } from "next/server";
import { z } from "zod";

import {
  fetchGoldRushTransactions,
  GoldRushInvalidResponseError,
  GoldRushRateLimitError,
  GoldRushUnavailableError,
} from "@/lib/goldrush";
import {
  consumeRequestBudget,
  getCachedResponse,
  requestClientKey,
  setCachedResponse,
} from "@/lib/request-guard";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";
import {
  FetchApiErrorSchema,
  FetchTransactionsRequestSchema,
  FetchTransactionsSuccessSchema,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 4 * 1024;

function errorResponse(
  status: number,
  code: z.infer<typeof FetchApiErrorSchema>["error"]["code"],
  message: string,
  retryable: boolean,
) {
  return NextResponse.json(
    FetchApiErrorSchema.parse({
      error: { code, message, retryable },
    }),
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  if (
    !consumeRequestBudget({
      namespace: "wallet-fetch",
      clientKey: requestClientKey(request),
      limit: 20,
      windowMs: 60_000,
    })
  ) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Too many wallet requests. Please retry in about a minute.",
      true,
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(
        413,
        "INVALID_REQUEST",
        "Wallet request is too large.",
        false,
      );
    }
    if (!(error instanceof InvalidJsonBodyError)) {
      return errorResponse(400, "INVALID_REQUEST", "Request body could not be read.", false);
    }
    return errorResponse(400, "INVALID_REQUEST", "Request body must be valid JSON.", false);
  }

  const requestResult = FetchTransactionsRequestSchema.safeParse(body);
  if (!requestResult.success) {
    const isAddressFailure =
      typeof body === "object" &&
      body !== null &&
      "address" in body;
    return errorResponse(
      400,
      isAddressFailure ? "INVALID_ADDRESS" : "INVALID_REQUEST",
      isAddressFailure
        ? "Enter a valid Ethereum address and financial year."
        : "Request body must contain an Ethereum address and optional financial year.",
      false,
    );
  }

  const apiKey = process.env.GOLDRUSH_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse(
      503,
      "MISSING_PROVIDER_KEY",
      "Blockchain data is not configured on this server.",
      false,
    );
  }

  try {
    const cacheKey =
      `goldrush:${requestResult.data.address.toLowerCase()}:` +
      `${requestResult.data.financialYear ?? "all"}`;
    const cached = getCachedResponse<z.infer<typeof FetchTransactionsSuccessSchema>>(
      cacheKey,
    );
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: { "Cache-Control": "private, max-age=0" },
      });
    }

    const data = await fetchGoldRushTransactions({
      address: requestResult.data.address,
      apiKey,
      financialYear: requestResult.data.financialYear,
    });
    const payload = FetchTransactionsSuccessSchema.parse({ data });
    setCachedResponse(cacheKey, payload, 60_000);
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof GoldRushRateLimitError) {
      return errorResponse(
        429,
        "UPSTREAM_RATE_LIMIT",
        "Blockchain data is busy. Please retry shortly.",
        true,
      );
    }
    if (error instanceof GoldRushInvalidResponseError) {
      return errorResponse(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "Blockchain data could not be safely validated.",
        true,
      );
    }
    if (error instanceof GoldRushUnavailableError) {
      console.warn("[analysis/fetch] blockchain provider unavailable", {
        reason: error.reason,
        status: error.status,
      });
      return errorResponse(
        502,
        "UPSTREAM_UNAVAILABLE",
        "Blockchain data is temporarily unavailable.",
        true,
      );
    }

    return errorResponse(
      502,
      "UPSTREAM_INVALID_RESPONSE",
      "Blockchain data could not be safely validated.",
      true,
    );
  }
}

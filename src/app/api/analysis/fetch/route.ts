import { NextResponse } from "next/server";
import { z } from "zod";

import {
  fetchGoldRushTransactions,
  GoldRushInvalidResponseError,
  GoldRushRateLimitError,
  GoldRushUnavailableError,
} from "@/lib/goldrush";
import {
  FetchApiErrorSchema,
  FetchTransactionsRequestSchema,
  FetchTransactionsSuccessSchema,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
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
        ? "Enter a valid 0x Ethereum wallet address."
        : "Request body must contain an Ethereum address.",
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
    const data = await fetchGoldRushTransactions({
      address: requestResult.data.address,
      apiKey,
    });
    return NextResponse.json(FetchTransactionsSuccessSchema.parse({ data }), {
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

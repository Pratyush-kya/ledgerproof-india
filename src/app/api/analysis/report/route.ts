import { NextResponse } from "next/server";

import { analyzeTransactions } from "@/lib/analysis-service";
import { buildHistoricalSwapEvidence } from "@/lib/coingecko";
import {
  consumeRequestBudget,
  requestClientKey,
} from "@/lib/request-guard";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";
import {
  AnalysisReportErrorSchema,
  AnalysisReportRequestSchema,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

function errorResponse(
  status: number,
  code: "INVALID_REQUEST" | "ANALYSIS_FAILED" | "RATE_LIMITED",
  message: string,
) {
  return NextResponse.json(
    AnalysisReportErrorSchema.parse({ error: { code, message } }),
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  if (
    !consumeRequestBudget({
      namespace: "analysis-report",
      clientKey: requestClientKey(request),
      limit: 30,
      windowMs: 60_000,
    })
  ) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Too many analysis requests. Please retry in about a minute.",
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
        "Analysis request is too large.",
      );
    }
    if (!(error instanceof InvalidJsonBodyError)) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Request body could not be read.",
      );
    }
    return errorResponse(400, "INVALID_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = AnalysisReportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Provide between 1 and 250 normalized Ethereum transactions with valid evidence.",
    );
  }

  try {
    const existingEvidenceHashes = new Set(
      parsed.data.evidence.flatMap((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "txHash" in item &&
          typeof item.txHash === "string"
        ) {
          return [item.txHash.toLowerCase()];
        }
        return [];
      }),
    );
    const historicalEvidence = (
      await buildHistoricalSwapEvidence(parsed.data.transactions, {
        apiKey: process.env.COINGECKO_API_KEY,
      })
    ).filter(
      (item) => !existingEvidenceHashes.has(item.txHash.toLowerCase()),
    );
    const result = await analyzeTransactions({
      ...parsed.data,
      evidence: [...parsed.data.evidence, ...historicalEvidence],
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return errorResponse(
      400,
      "ANALYSIS_FAILED",
      "The deterministic reconciliation input could not be safely validated.",
    );
  }
}

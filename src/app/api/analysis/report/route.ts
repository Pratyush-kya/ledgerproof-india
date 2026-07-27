import { NextResponse } from "next/server";

import { analyzeTransactions } from "@/lib/analysis-service";
import {
  AnalysisReportErrorSchema,
  AnalysisReportRequestSchema,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(
  status: number,
  code: "INVALID_REQUEST" | "ANALYSIS_FAILED",
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
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = AnalysisReportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Provide between 1 and 50 normalized Ethereum transactions.",
    );
  }

  try {
    const result = await analyzeTransactions(parsed.data);

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

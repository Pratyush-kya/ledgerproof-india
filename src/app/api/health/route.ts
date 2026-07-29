import "server-only";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      application: "ledgerproof-india",
      providers: {
        blockchainConfigured: Boolean(
          process.env.GOLDRUSH_API_KEY?.trim(),
        ),
        historicalPricesConfigured: Boolean(
          process.env.COINGECKO_API_KEY?.trim(),
        ),
        classificationConfigured: Boolean(
          process.env.OPENAI_API_KEY?.trim(),
        ),
        classificationModel:
          process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

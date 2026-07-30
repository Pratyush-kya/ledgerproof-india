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
        classificationMode: "deterministic",
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

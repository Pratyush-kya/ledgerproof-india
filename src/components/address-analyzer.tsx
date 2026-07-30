"use client";

import Link from "next/link";
import { useState } from "react";

import {
  AnalysisResults,
  fixtureResultsViewModel,
  liveResultsViewModel,
  type ResultsViewModel,
} from "@/components/analysis-results";
import { DEMO_LEDGER } from "@/lib/demo-ledger";
import {
  currentFinancialYear,
  financialYearBounds,
  recentFinancialYears,
} from "@/lib/financial-year";
import { parseOpeningLotCsv } from "@/lib/opening-lot-csv";
import {
  AnalysisReportErrorSchema,
  AnalysisReportSuccessSchema,
  EvmAddressSchema,
  FetchApiErrorSchema,
  FetchTransactionsSuccessSchema,
  type FetchTransactionsResult,
  type OpeningLot,
  type TransactionEvidence,
} from "@/lib/schemas";

type FlowState =
  | { status: "idle" }
  | { status: "fetching"; message: string }
  | { status: "analyzing"; message: string }
  | { status: "empty"; message: string }
  | {
      status: "error";
      title: string;
      message: string;
      retryable: boolean;
    }
  | { status: "success"; message: string };

const REQUEST_TIMEOUT_MS = 45_000;
const demoAddress = DEMO_LEDGER.coverage.address;
const financialYears = recentFinancialYears(6);

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function isTimeoutError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function replaceEvidence(
  current: TransactionEvidence[],
  next: TransactionEvidence,
) {
  return [
    ...current.filter(
      (item) => item.txHash.toLowerCase() !== next.txHash.toLowerCase(),
    ),
    next,
  ];
}

export function AddressAnalyzer({
  receiptContractAddress,
}: {
  receiptContractAddress: string | null;
}) {
  const [address, setAddress] = useState("");
  const [financialYear, setFinancialYear] = useState(currentFinancialYear);
  const [flow, setFlow] = useState<FlowState>({ status: "idle" });
  const [result, setResult] = useState<ResultsViewModel | null>(null);
  const [fetchResult, setFetchResult] =
    useState<FetchTransactionsResult | null>(null);
  const [evidence, setEvidence] = useState<TransactionEvidence[]>([]);
  const [openingLots, setOpeningLots] = useState<OpeningLot[]>([]);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);

  const isLoading =
    flow.status === "fetching" || flow.status === "analyzing";

  async function runAnalysis({
    fetched,
    nextEvidence,
    nextOpeningLots,
    message,
  }: {
    fetched: FetchTransactionsResult;
    nextEvidence: TransactionEvidence[];
    nextOpeningLots: OpeningLot[];
    message: string;
  }) {
    setFlow({ status: "analyzing", message });

    const analysisResponse = await fetchWithTimeout("/api/analysis/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: fetched.transactions,
        evidence: nextEvidence,
        openingLots: nextOpeningLots,
        historyComplete: fetched.historyComplete,
        calculationPeriod: fetched.financialYear
          ? financialYearBounds(fetched.financialYear)
          : undefined,
      }),
    });
    const analysisPayload: unknown = await analysisResponse.json();
    const parsedAnalysis =
      AnalysisReportSuccessSchema.safeParse(analysisPayload);

    if (!analysisResponse.ok || !parsedAnalysis.success) {
      const parsedAnalysisError =
        AnalysisReportErrorSchema.safeParse(analysisPayload);
      setFlow({
        status: "error",
        title:
          parsedAnalysisError.success &&
          parsedAnalysisError.data.error.code === "RATE_LIMITED"
            ? "Analysis rate limit reached"
            : "Reconciliation report unavailable",
        message: parsedAnalysisError.success
          ? parsedAnalysisError.data.error.message
          : "The validated report could not be produced. The previous result, if any, remains visible.",
        retryable: true,
      });
      return false;
    }

    setResult(
      liveResultsViewModel(
        fetched,
        parsedAnalysis.data.data,
        nextEvidence,
        nextOpeningLots,
      ),
    );
    setFlow({
      status: "success",
      message: `Reconciled ${fetched.transactions.length} validated transaction${fetched.transactions.length === 1 ? "" : "s"} with ${nextEvidence.length} user evidence record${nextEvidence.length === 1 ? "" : "s"} and ${nextOpeningLots.length} opening lot${nextOpeningLots.length === 1 ? "" : "s"}.`,
    });
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = EvmAddressSchema.safeParse(address.trim());

    if (!validation.success) {
      setResult(null);
      setFlow({
        status: "error",
        title: "Check the wallet address",
        message:
          validation.error.issues[0]?.message ??
          "Enter a valid Ethereum address.",
        retryable: false,
      });
      return;
    }

    setResult(null);
    setFetchResult(null);
    setEvidence([]);
    setOpeningLots([]);
    setCsvMessage(null);
    setFlow({
      status: "fetching",
      message: `Fetching paginated Ethereum history for FY ${financialYear}…`,
    });

    try {
      const response = await fetchWithTimeout("/api/analysis/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: validation.data,
          financialYear,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const parsedError = FetchApiErrorSchema.safeParse(payload);
        if (parsedError.success) {
          const isRateLimit =
            parsedError.data.error.code === "UPSTREAM_RATE_LIMIT" ||
            parsedError.data.error.code === "RATE_LIMITED";
          setFlow({
            status: "error",
            title: isRateLimit
              ? "Provider rate limit reached"
              : parsedError.data.error.code === "MISSING_PROVIDER_KEY"
                ? "Live data is not configured"
                : "Live wallet fetch failed",
            message: parsedError.data.error.message,
            retryable: parsedError.data.error.retryable,
          });
        } else {
          setFlow({
            status: "error",
            title: "Unreadable provider response",
            message:
              "The server returned an error that did not match the safety schema.",
            retryable: true,
          });
        }
        return;
      }

      const parsedResult = FetchTransactionsSuccessSchema.safeParse(payload);
      if (!parsedResult.success) {
        setFlow({
          status: "error",
          title: "Provider data failed validation",
          message:
            "Nothing was analyzed because the blockchain response could not be safely validated.",
          retryable: true,
        });
        return;
      }

      if (parsedResult.data.data.isEmpty) {
        setFlow({
          status: "empty",
          message: `No Ethereum transactions were returned for FY ${financialYear}. Try another financial year, another public address, or the static demo.`,
        });
        return;
      }

      const fetched = parsedResult.data.data;
      setFetchResult(fetched);
      await runAnalysis({
        fetched,
        nextEvidence: [],
        nextOpeningLots: [],
        message:
          "Running deterministic FIFO reconciliation and evidence checks…",
      });
    } catch (error) {
      setFlow({
        status: "error",
        title: isTimeoutError(error)
          ? "Analysis timed out"
          : "Could not reach the analysis service",
        message: isTimeoutError(error)
          ? "The request exceeded 45 seconds and was stopped. No partial result is shown."
          : "Check your connection and retry. You can still inspect the offline demo.",
        retryable: true,
      });
    }
  }

  async function handleResolveEvidence(next: TransactionEvidence) {
    if (!fetchResult) {
      return;
    }
    const nextEvidence = replaceEvidence(evidence, next);

    try {
      const completed = await runAnalysis({
        fetched: fetchResult,
        nextEvidence,
        nextOpeningLots: openingLots,
        message: "Applying evidence and rerunning deterministic FIFO…",
      });
      if (completed) {
        setEvidence(nextEvidence);
      }
    } catch (error) {
      setFlow({
        status: "error",
        title: isTimeoutError(error)
          ? "Recalculation timed out"
          : "Evidence could not be applied",
        message: isTimeoutError(error)
          ? "The request exceeded 45 seconds. The previous result remains visible."
          : "The evidence was not saved. Check the value and retry.",
        retryable: true,
      });
    }
  }

  async function handleOpeningLots(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const nextOpeningLots = parseOpeningLotCsv(await file.text());
      setCsvMessage(
        `${nextOpeningLots.length} opening FIFO lot${nextOpeningLots.length === 1 ? "" : "s"} validated locally. The file is not uploaded or stored.`,
      );

      if (!fetchResult) {
        setOpeningLots(nextOpeningLots);
        return;
      }

      const completed = await runAnalysis({
        fetched: fetchResult,
        nextEvidence: evidence,
        nextOpeningLots,
        message: "Applying opening lots and rerunning deterministic FIFO…",
      });
      if (completed) {
        setOpeningLots(nextOpeningLots);
      }
    } catch (error) {
      setCsvMessage(null);
      setFlow({
        status: "error",
        title: "Opening-lot CSV rejected",
        message:
          error instanceof Error
            ? error.message
            : "The CSV could not be validated.",
        retryable: false,
      });
    }
  }

  function loadDemo() {
    setAddress(demoAddress);
    setResult(fixtureResultsViewModel(DEMO_LEDGER));
    setFetchResult(null);
    setEvidence([]);
    setOpeningLots([]);
    setCsvMessage(null);
    setFlow({
      status: "success",
      message:
        "Static demo ledger loaded. Every value below is demonstration data, not live blockchain analysis.",
    });
  }

  return (
    <section>
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
        <p className="text-sm font-medium text-cyan-200">
          Ethereum evidence intake
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Start with a public wallet address
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Select an Indian financial year and fetch paginated Ethereum history
          through the server. The public demo cap is 250 validated records. No
          wallet connection, private key, seed phrase, or AI subscription is
          required.
        </p>

        <form className="mt-7" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
            <label className="text-sm font-medium text-slate-100">
              Ethereum wallet address
              <input
                id="wallet-address"
                name="wallet-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoCapitalize="off"
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                aria-describedby="address-help flow-status"
                aria-invalid={
                  flow.status === "error" &&
                  flow.title === "Check the wallet address"
                    ? true
                    : undefined
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-100">
              Financial year
              <select
                value={financialYear}
                onChange={(event) => setFinancialYear(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 text-sm text-white"
              >
                {financialYears.map((year) => (
                  <option key={year} value={year}>
                    FY {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p id="address-help" className="mt-2 text-xs leading-5 text-slate-400">
            Use a public 42-character EVM address. Never enter a seed phrase or
            private key.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={isLoading}
              className="min-h-12 rounded-xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              {flow.status === "fetching"
                ? "Fetching history…"
                : flow.status === "analyzing"
                  ? "Reconciling…"
                  : "Analyze live wallet"}
            </button>
            <button
              type="button"
              onClick={loadDemo}
              disabled={isLoading}
              className="min-h-12 rounded-xl border border-slate-500 px-5 text-sm font-semibold text-white transition hover:border-slate-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Load static demo ledger
            </button>
          </div>
        </form>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <label
            htmlFor="opening-lots"
            className="block text-sm font-semibold text-slate-100"
          >
            Optional opening FIFO lots CSV
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Use this when complete acquisition history is unavailable. Exact
            header: asset,quantity,acquired_at,cost_basis_inr,transaction_hash.
            The browser validates the file locally and sends only structured
            lots for this calculation.
          </p>
          <input
            id="opening-lots"
            type="file"
            accept=".csv,text/csv"
            disabled={isLoading || !fetchResult}
            onChange={handleOpeningLots}
            className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          {!fetchResult ? (
            <p className="mt-2 text-xs text-slate-500">
              Analyze a live wallet first, then attach opening lots to that
              report.
            </p>
          ) : null}
          {csvMessage ? (
            <p className="mt-2 text-xs text-emerald-200" role="status">
              {csvMessage}
            </p>
          ) : null}
        </div>

        <FlowFeedback flow={flow} />
      </div>

      {result ? (
        <AnalysisResults
          result={result}
          receiptContractAddress={receiptContractAddress}
          isReanalyzing={flow.status === "analyzing"}
          onResolveEvidence={
            result.source === "live" ? handleResolveEvidence : undefined
          }
        />
      ) : null}
    </section>
  );
}

function FlowFeedback({ flow }: { flow: FlowState }) {
  if (flow.status === "idle") {
    return null;
  }

  const isError = flow.status === "error";
  const isLoading =
    flow.status === "fetching" || flow.status === "analyzing";

  return (
    <div
      id="flow-status"
      className={`mt-5 rounded-xl border px-4 py-3 ${
        isError
          ? "border-rose-300/30 bg-rose-300/10"
          : flow.status === "empty"
            ? "border-amber-300/30 bg-amber-300/10"
            : "border-slate-700 bg-slate-900/80"
      }`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300" />
        </div>
      ) : null}
      {isError ? (
        <p className="text-sm font-semibold text-rose-100">{flow.title}</p>
      ) : null}
      <p
        className={`text-sm leading-6 ${
          isError ? "text-rose-50" : "text-slate-200"
        }`}
      >
        {flow.message}
      </p>
      {isError && flow.retryable ? (
        <p className="mt-1 text-xs text-rose-100/80">
          This error is retryable. Submit again after a short wait.
        </p>
      ) : null}
      {isError ? (
        <Link
          href="/feedback?from=%2F&source=analysis-error"
          className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-rose-200/40 px-3 text-sm font-semibold text-rose-50 transition hover:bg-rose-200/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100"
        >
          Report this issue
        </Link>
      ) : null}
    </div>
  );
}

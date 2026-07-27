"use client";

import { useState } from "react";

import {
  AnalysisResults,
  fixtureResultsViewModel,
  liveResultsViewModel,
  type ResultsViewModel,
} from "@/components/analysis-results";
import { DEMO_LEDGER } from "@/lib/demo-ledger";
import {
  AnalysisReportSuccessSchema,
  AnalysisReportErrorSchema,
  EvmAddressSchema,
  FetchApiErrorSchema,
  FetchTransactionsSuccessSchema,
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

const REQUEST_TIMEOUT_MS = 15_000;
const demoAddress = DEMO_LEDGER.coverage.address;

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

export function AddressAnalyzer() {
  const [address, setAddress] = useState("");
  const [flow, setFlow] = useState<FlowState>({ status: "idle" });
  const [result, setResult] = useState<ResultsViewModel | null>(null);

  const isLoading = flow.status === "fetching" || flow.status === "analyzing";

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
    setFlow({
      status: "fetching",
      message: "Fetching and validating recent Ethereum history…",
    });

    try {
      const response = await fetchWithTimeout("/api/analysis/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: validation.data }),
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
          message:
            "No recent Ethereum transactions were returned for this address. Try another public address or inspect the static demo.",
        });
        return;
      }

      setFlow({
        status: "analyzing",
        message:
          "Running deterministic FIFO reconciliation and validating classification evidence…",
      });
      const analysisResponse = await fetchWithTimeout("/api/analysis/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: parsedResult.data.data.transactions,
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
            : "Transactions loaded, but the validated report could not be produced. No partial figures are shown.",
          retryable: true,
        });
        return;
      }

      setResult(
        liveResultsViewModel(
          parsedResult.data.data,
          parsedAnalysis.data.data,
        ),
      );
      setFlow({
        status: "success",
        message: `Loaded and reconciled ${parsedResult.data.data.transactions.length} validated Ethereum transaction${parsedResult.data.data.transactions.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setFlow({
        status: "error",
        title: isTimeoutError(error)
          ? "Analysis timed out"
          : "Could not reach the analysis service",
        message: isTimeoutError(error)
          ? "The request exceeded 15 seconds and was stopped. No partial result is shown."
          : "Check your connection and retry. You can still inspect the offline demo.",
        retryable: true,
      });
    }
  }

  function loadDemo() {
    setAddress(demoAddress);
    setResult(fixtureResultsViewModel(DEMO_LEDGER));
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
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Fetch up to 50 recent Ethereum transactions through the server, or
          load the clearly labelled offline fixture. No wallet connection,
          private key, or seed phrase is needed.
        </p>

        <form className="mt-7" onSubmit={handleSubmit} noValidate>
          <label
            className="block text-sm font-medium text-slate-100"
            htmlFor="wallet-address"
          >
            Ethereum wallet address
          </label>
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

        <FlowFeedback flow={flow} />
      </div>

      {result ? (
        <AnalysisResults
          key={`${result.source}-${result.generatedAt}`}
          result={result}
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
  const isLoading = flow.status === "fetching" || flow.status === "analyzing";

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
      <p className={`text-sm leading-6 ${isError ? "text-rose-50" : "text-slate-200"}`}>
        {flow.message}
      </p>
      {isError && flow.retryable ? (
        <p className="mt-1 text-xs text-rose-100/80">
          This error is retryable. Submit the address again after a short wait.
        </p>
      ) : null}
    </div>
  );
}

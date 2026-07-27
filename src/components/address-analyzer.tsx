"use client";

import { useState } from "react";

import { DEMO_LEDGER } from "@/lib/demo-ledger";
import {
  AnalysisReportSuccessSchema,
  EvmAddressSchema,
  FetchApiErrorSchema,
  FetchTransactionsSuccessSchema,
  type AnalysisReportSuccess,
  type FetchTransactionsResult,
} from "@/lib/schemas";

const demoAddress = DEMO_LEDGER.coverage.address;

export function AddressAnalyzer() {
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showDemoLedger, setShowDemoLedger] = useState(false);
  const [liveResult, setLiveResult] = useState<FetchTransactionsResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<
    AnalysisReportSuccess["data"] | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = EvmAddressSchema.safeParse(address.trim());

    if (!validation.success) {
      setMessage(validation.error.issues[0]?.message ?? "Enter a valid Ethereum address.");
      setShowDemoLedger(false);
      setLiveResult(null);
      setAnalysisResult(null);
      return;
    }

    setIsLoading(true);
    setMessage("Fetching and validating Ethereum history…");
    setShowDemoLedger(false);
    setLiveResult(null);
    setAnalysisResult(null);

    try {
      const response = await fetch("/api/analysis/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: validation.data }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const parsedError = FetchApiErrorSchema.safeParse(payload);
        setMessage(
          parsedError.success
            ? parsedError.data.error.message
            : "The server returned an unreadable error.",
        );
        return;
      }

      const parsedResult = FetchTransactionsSuccessSchema.safeParse(payload);
      if (!parsedResult.success) {
        setMessage("The server returned data that could not be safely validated.");
        return;
      }

      setLiveResult(parsedResult.data.data);
      const transactions = parsedResult.data.data.transactions;

      if (transactions.length > 0) {
        const analysisResponse = await fetch("/api/analysis/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions }),
        });
        const analysisPayload: unknown = await analysisResponse.json();
        const parsedAnalysis =
          AnalysisReportSuccessSchema.safeParse(analysisPayload);

        if (!analysisResponse.ok || !parsedAnalysis.success) {
          setMessage(
            "Transactions loaded, but the reconciliation report could not be safely validated.",
          );
          return;
        }

        setAnalysisResult(parsedAnalysis.data.data);
      }
      setMessage(
        parsedResult.data.data.isEmpty
          ? "No Ethereum transactions were found for this address."
          : `Loaded and reconciled ${parsedResult.data.data.transactions.length} validated Ethereum transactions.`,
      );
    } catch {
      setMessage("Could not reach the analysis service. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }

  function loadDemo() {
    setAddress(demoAddress);
    setMessage("Static demo ledger loaded. This is not live blockchain data.");
    setShowDemoLedger(true);
    setLiveResult(null);
    setAnalysisResult(null);
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
      <p className="text-sm font-medium text-cyan-200">Ethereum-only starter</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
        Start with a public wallet address
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
        Fetch up to 50 recent Ethereum transactions through the server, or load the clearly labelled offline demo. No wallet connection or private key is needed.
      </p>

      <form className="mt-7" onSubmit={handleSubmit} noValidate>
        <label className="block text-sm font-medium text-slate-100" htmlFor="wallet-address">
          Ethereum wallet address
        </label>
        <input
          id="wallet-address"
          name="wallet-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x..."
          spellCheck={false}
          autoCapitalize="off"
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
          aria-describedby="address-help address-status"
        />
        <p id="address-help" className="mt-2 text-xs leading-5 text-slate-400">
          Use a public 42-character EVM address. Never enter a seed phrase or private key.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={isLoading}
            className="min-h-12 rounded-xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            {isLoading ? "Fetching…" : "Analyze live wallet"}
          </button>
          <button
            type="button"
            onClick={loadDemo}
            className="min-h-12 rounded-xl border border-slate-500 px-5 text-sm font-semibold text-white transition hover:border-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Load static demo ledger
          </button>
        </div>
      </form>

      <div id="address-status" className="mt-5" aria-live="polite">
        {message ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
            {message}
          </p>
        ) : null}
      </div>

      {showDemoLedger ? <DemoLedgerPreview /> : null}
      {liveResult && !liveResult.isEmpty ? <LiveLedgerPreview result={liveResult} /> : null}
      {analysisResult ? <AnalysisReportPreview result={analysisResult} /> : null}
    </section>
  );
}

function LiveLedgerPreview({ result }: { result: FetchTransactionsResult }) {
  return (
    <section
      className="mt-6 rounded-2xl border border-emerald-200/20 bg-emerald-100/5 p-5"
      aria-label="Validated provider transactions"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-100">
            Validated Ethereum history
          </p>
          <p className="mt-1 text-xs text-emerald-100/75">
            {result.transactions.length} transaction
            {result.transactions.length === 1 ? "" : "s"}
            {result.truncated ? " · capped at 50" : ""}
          </p>
        </div>
        <span className="rounded-full border border-emerald-200/30 px-3 py-1 text-xs font-medium text-emerald-100">
          LIVE PROVIDER DATA
        </span>
      </div>
      <ul className="mt-4 divide-y divide-emerald-100/10">
        {result.transactions.map((transaction) => (
          <li className="py-3 text-sm" key={transaction.id}>
            <a
              className="font-mono text-emerald-100 underline decoration-emerald-300/40 underline-offset-4"
              href={transaction.explorerUrl}
              rel="noreferrer"
              target="_blank"
            >
              {transaction.txHash.slice(0, 10)}…{transaction.txHash.slice(-6)}
            </a>
            <p className="mt-1 text-xs text-slate-400">
              {transaction.assetDeltas.length
                ? transaction.assetDeltas
                    .map(
                      (asset) =>
                        `${asset.direction} ${asset.amountAtomic} ${asset.symbol} atomic units (${asset.decimals} decimals)`,
                    )
                    .join(" · ")
                : "No wallet-relative native or ERC-20 movement decoded"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnalysisReportPreview({
  result,
}: {
  result: AnalysisReportSuccess["data"];
}) {
  const isFallback = result.classificationMode === "rule_fallback";

  return (
    <section
      className="mt-6 rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5"
      aria-label="Plain-English tax report"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-100">
            {result.report.title}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            {result.report.overview}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            isFallback
              ? "border-amber-200/40 text-amber-100"
              : "border-violet-200/40 text-violet-100"
          }`}
        >
          {isFallback ? "RULE FALLBACK" : "AGENT CLASSIFICATION"}
        </span>
      </div>

      <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs leading-5 text-slate-300">
        {result.classificationNotice}
      </p>

      <h3 className="mt-5 text-sm font-semibold text-white">
        Deterministic calculation
      </h3>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
        {result.report.deterministicFindings.map((finding) => (
          <li key={finding}>{finding}</li>
        ))}
      </ul>

      <h3 className="mt-5 text-sm font-semibold text-white">
        Classification evidence
      </h3>
      <ul className="mt-2 divide-y divide-white/10">
        {result.classifications.map((classification) => (
          <li className="py-3 text-sm" key={classification.transactionId}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="capitalize text-slate-100">
                {classification.category.replaceAll("_", " ")}
              </span>
              <span className="text-xs text-slate-400">
                {Math.round(classification.confidence * 100)}% confidence
              </span>
              {classification.needsReview ? (
                <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">
                  NEEDS REVIEW
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {classification.reason}
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-500">
              Evidence: {classification.evidenceTxHashes.join(", ")}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-amber-100/80">
        {result.report.disclaimer}
      </p>
    </section>
  );
}

function DemoLedgerPreview() {
  return (
    <section className="mt-6 rounded-2xl border border-cyan-200/20 bg-cyan-100/5 p-5" aria-label="Static demo ledger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-cyan-100">Static demo ledger</p>
          <p className="mt-1 text-xs text-cyan-100/75">
            {DEMO_LEDGER.coverage.fetchedTransactions} fixture transactions · {DEMO_LEDGER.coverage.needsReviewTransactions} needs review
          </p>
        </div>
        <span className="rounded-full border border-cyan-200/30 px-3 py-1 text-xs font-medium text-cyan-100">
          DEMO DATA
        </span>
      </div>
      <ul className="mt-4 divide-y divide-cyan-100/10">
        {DEMO_LEDGER.classifications.map((classification) => {
          const transaction = DEMO_LEDGER.transactions.find(
            (item) => item.id === classification.transactionId,
          );
          const assets = transaction?.assetDeltas.map((asset) => asset.symbol).join(" / ") ?? "Unknown asset";

          return (
            <li className="flex items-center justify-between gap-4 py-3 text-sm" key={classification.transactionId}>
              <span className="font-mono text-cyan-50">{assets}</span>
              <span className="capitalize text-slate-200">{classification.category.replace("_", " ")}</span>
              <span className="text-xs text-slate-400">{Math.round(classification.confidence * 100)}% confidence</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { EvidenceReview } from "@/components/evidence-review";
import {
  type AnalysisReportSuccess,
  type Classification,
  type ExcludedAssetMovement,
  type FetchTransactionsResult,
  type GasTreatment,
  type NormalizedTransaction,
  type OpeningLot,
  type ReconciledDisposal,
  type TaxLot,
  type TaxReport,
  type TransactionEvidence,
} from "@/lib/schemas";

const ReportReceiptPanel = dynamic(
  () =>
    import("@/components/report-receipt-panel").then(
      (module) => module.ReportReceiptPanel,
    ),
  {
    loading: () => (
      <div className="rounded-2xl border border-slate-700 p-5 text-sm text-slate-400">
        Loading optional receipt controls…
      </div>
    ),
  },
);

function UnavailableReceiptPanel() {
  return (
    <section
      className="rounded-2xl border border-slate-600 bg-slate-950/55 p-5"
      aria-labelledby="receipt-heading"
    >
      <h3 id="receipt-heading" className="text-lg font-semibold text-white">
        Optional Base Sepolia report receipt
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Unavailable until a reviewed public contract address is explicitly
        configured. The reconciliation report remains fully usable without
        this feature.
      </p>
    </section>
  );
}

type ReportText = AnalysisReportSuccess["data"]["report"];
type DeterministicSummary =
  AnalysisReportSuccess["data"]["calculation"]["summary"];

export type ResultsViewModel = {
  source: "live" | "fixture";
  address: string;
  generatedAt: string;
  transactions: NormalizedTransaction[];
  classifications: Classification[];
  classificationMode: "deterministic" | "fixture";
  classificationNotice: string;
  summary: DeterministicSummary;
  remainingLots: TaxLot[];
  disposals: ReconciledDisposal[];
  gasTreatments: GasTreatment[];
  quarantinedAssets: ExcludedAssetMovement[];
  unsupportedAssetsRequiringReview: ExcludedAssetMovement[];
  evidence: TransactionEvidence[];
  openingLots: OpeningLot[];
  limitations: string[];
  report: ReportText;
  coverage: {
    fetchedTransactions: number;
    supportedAssetMovements: number;
    calculatedDisposals: number;
    needsUserEvidence: number;
    quarantinedAssetMovements: number;
    historyComplete: boolean;
    financialYear: string | null;
    periodStart: string | null;
    periodEnd: string | null;
  };
};

function formatInr(value: string | null) {
  if (value === null) {
    return "Not available";
  }

  const paisa = BigInt(value);
  const rupees = paisa / BigInt(100);
  const remainder = (paisa % BigInt(100)).toString().padStart(2, "0");
  return `₹${rupees.toLocaleString("en-IN")}.${remainder}`;
}

function formatAtomic(value: string, decimals: number) {
  const padded = value.padStart(decimals + 1, "0");
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fraction =
    decimals === 0 ? "" : padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function categoryLabel(category: Classification["category"]) {
  return category.replaceAll("_", " ");
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function calculationState(summary: DeterministicSummary) {
  switch (summary.calculationStatus) {
    case "no_supported_disposals":
      return {
        title: "No supported disposals detected",
        detail: "Only supported acquisitions or holdings exist in the selected evidence.",
      };
    case "blocked_missing_basis":
      return {
        title: "Calculation blocked: acquisition cost missing",
        detail: "Resolve the missing purchase or opening-lot evidence to calculate FIFO cost.",
      };
    case "blocked_missing_valuation":
      return {
        title: "Calculation blocked: sale or swap valuation missing",
        detail: "Add actual INR proceeds or supported valuation evidence.",
      };
    case "partial":
      return {
        title: "Partial calculation",
        detail: `${summary.calculatedDisposals} disposal(s) calculated; ${summary.needsUserEvidence} transaction(s) need evidence or the fetched history is incomplete.`,
      };
    case "complete":
      return {
        title: "Complete calculation",
        detail: `${summary.calculatedDisposals} supported disposal(s) were calculated from the available deterministic evidence.`,
      };
    case "complete_zero":
      return {
        title: "₹0 calculated — complete",
        detail: "Complete evidence genuinely produced zero positive gain and zero VDA loss.",
      };
  }
}

export function liveResultsViewModel(
  fetchResult: FetchTransactionsResult,
  analysis: AnalysisReportSuccess["data"],
  evidence: TransactionEvidence[] = [],
  openingLots: OpeningLot[] = [],
): ResultsViewModel {
  const timestamps = fetchResult.transactions
    .map((item) => item.timestamp)
    .sort();
  const summary = analysis.calculation.summary;

  return {
    source: "live",
    address: fetchResult.address,
    generatedAt: fetchResult.fetchedAt,
    transactions: fetchResult.transactions,
    classifications: analysis.classifications,
    classificationMode: analysis.classificationMode,
    classificationNotice: analysis.classificationNotice,
    summary,
    remainingLots: analysis.calculation.remainingLots,
    disposals: analysis.calculation.disposals,
    gasTreatments: analysis.calculation.gasTreatments,
    quarantinedAssets: analysis.calculation.quarantinedAssets,
    unsupportedAssetsRequiringReview:
      analysis.calculation.unsupportedAssetsRequiringReview,
    evidence,
    openingLots,
    limitations: analysis.calculation.limitations,
    report: analysis.report,
    coverage: {
      fetchedTransactions: fetchResult.transactions.length,
      supportedAssetMovements: summary.supportedAssetMovements,
      calculatedDisposals: summary.calculatedDisposals,
      needsUserEvidence: summary.needsUserEvidence,
      quarantinedAssetMovements: summary.quarantinedAssetMovements,
      historyComplete: summary.historyComplete,
      financialYear: fetchResult.financialYear,
      periodStart: summary.calculationPeriod?.start ?? timestamps[0] ?? null,
      periodEnd:
        summary.calculationPeriod?.endExclusive ?? timestamps.at(-1) ?? null,
    },
  };
}

export function fixtureResultsViewModel(fixture: TaxReport): ResultsViewModel {
  const calculatedDisposals =
    fixture.taxSummary.pricedTaxableGainsInrPaisa !== "0" ||
    fixture.taxSummary.vdaLossesInrPaisa !== "0"
      ? 1
      : 0;
  const supportedAssetMovements = fixture.transactions.reduce(
    (total, transaction) => total + transaction.assetDeltas.length,
    0,
  );

  return {
    source: "fixture",
    address: fixture.coverage.address,
    generatedAt: fixture.generatedAt,
    transactions: fixture.transactions,
    classifications: fixture.classifications,
    classificationMode: "fixture",
    classificationNotice:
      "STATIC FIXTURE — pre-authored demonstration evidence, not live wallet analysis.",
    summary: {
      positiveTaxableGainsInrPaisa:
        fixture.taxSummary.pricedTaxableGainsInrPaisa,
      vdaLossesInrPaisa: fixture.taxSummary.vdaLossesInrPaisa,
      estimatedBaseTax30PercentInrPaisa:
        fixture.taxSummary.estimatedBaseTaxInrPaisa,
      includeCess: false,
      estimatedCess4PercentInrPaisa: null,
      estimatedTaxIncludingCessInrPaisa:
        fixture.taxSummary.estimatedBaseTaxInrPaisa,
      calculatedDisposals,
      excludedTransactions: fixture.taxSummary.excludedTransactions,
      supportedAssetMovements,
      needsUserEvidence: fixture.coverage.needsReviewTransactions,
      quarantinedAssetMovements: 0,
      unsafeUnsupportedAssetMovements: 0,
      historyComplete: true,
      calculationPeriod: null,
      calculationStatus:
        fixture.taxSummary.calculationStatus === "complete"
          ? "complete"
          : "partial",
      excludesSurcharge: true,
      excludesTdsCredit: true,
    },
    remainingLots: fixture.taxLots,
    disposals: [],
    gasTreatments: [],
    quarantinedAssets: [],
    unsupportedAssetsRequiringReview: [],
    evidence: [],
    openingLots: [],
    limitations: fixture.limitations,
    report: {
      title: "Static crypto reconciliation preview",
      overview:
        "This fixture demonstrates evidence, FIFO inventory, exclusions, and a limited tax preview. It is not derived from current on-chain activity.",
      deterministicFindings: [
        `Fixture positive gains: ${formatInr(
          fixture.taxSummary.pricedTaxableGainsInrPaisa,
        )}.`,
        `Fixture VDA losses shown separately: ${formatInr(
          fixture.taxSummary.vdaLossesInrPaisa,
        )}.`,
        `Fixture 30% base-tax preview: ${formatInr(
          fixture.taxSummary.estimatedBaseTaxInrPaisa,
        )}.`,
      ],
      reviewWarnings: fixture.limitations,
      disclaimer:
        "Educational demonstration only. This is not tax advice, a legal conclusion, or a filing-ready return.",
    },
    coverage: {
      fetchedTransactions: fixture.coverage.fetchedTransactions,
      supportedAssetMovements,
      calculatedDisposals,
      needsUserEvidence: fixture.coverage.needsReviewTransactions,
      quarantinedAssetMovements: 0,
      historyComplete: true,
      financialYear: null,
      periodStart: fixture.coverage.analysisStartedAt,
      periodEnd: fixture.coverage.analysisEndedAt,
    },
  };
}

export function AnalysisResults({
  result,
  receiptContractAddress,
  isReanalyzing = false,
  onResolveEvidence,
}: {
  result: ResultsViewModel;
  receiptContractAddress: string | null;
  isReanalyzing?: boolean;
  onResolveEvidence?: (evidence: TransactionEvidence) => void;
}) {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const classificationById = useMemo(
    () =>
      new Map(
        result.classifications.map((classification) => [
          classification.transactionId,
          classification,
        ]),
      ),
    [result.classifications],
  );
  const unresolved = result.classifications.filter(
    (item) => item.needsReview,
  );
  const state = calculationState(result.summary);
  const showFigures =
    result.summary.calculatedDisposals > 0 ||
    result.summary.calculationStatus === "complete_zero";

  function exportReport() {
    downloadJson(
      `ledgerproof-${result.source}-${result.address.slice(0, 10)}.json`,
      {
        exportVersion: "0.2",
        exportedAt: new Date().toISOString(),
        source:
          result.source === "fixture"
            ? "static-demo-fixture"
            : "live-provider-result",
        warning:
          "Educational deterministic reconciliation preview only. Verify all user-supplied evidence before filing.",
        result,
        evidence: result.evidence,
        openingLots: result.openingLots,
        quarantinedAssets: result.quarantinedAssets,
        unsupportedAssetsRequiringReview:
          result.unsupportedAssetsRequiringReview,
      },
    );
    setExportMessage("JSON evidence downloaded, including quarantined movements.");
  }

  return (
    <section className="mt-8 space-y-6" aria-labelledby="results-heading">
      <div className="rounded-3xl border border-cyan-200/20 bg-slate-950/80 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-cyan-300 uppercase">
              Evidence-first result
            </p>
            <h2
              id="results-heading"
              className="mt-2 text-2xl font-semibold text-white"
            >
              Reconciliation review
            </h2>
            <p className="mt-2 break-all font-mono text-xs text-slate-400">
              {result.address}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                result.source === "fixture"
                  ? "border-amber-200/40 bg-amber-300/10 text-amber-100"
                  : "border-emerald-200/40 bg-emerald-300/10 text-emerald-100"
              }`}
            >
              {result.source === "fixture"
                ? "STATIC DEMO DATA"
                : "LIVE PROVIDER DATA"}
            </span>
            <button
              type="button"
              onClick={exportReport}
              className="min-h-11 rounded-xl border border-cyan-300/50 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              Download JSON evidence
            </button>
          </div>
        </div>
        {exportMessage ? (
          <p className="mt-3 text-sm text-emerald-200" role="status">
            {exportMessage}
          </p>
        ) : null}
      </div>

      {receiptContractAddress ? (
        <ReportReceiptPanel
          key={`${result.source}:${result.address}:${result.generatedAt}`}
          contractAddress={receiptContractAddress}
          report={result}
        />
      ) : (
        <UnavailableReceiptPanel />
      )}

      <section
        className="rounded-2xl border border-white/10 bg-slate-950/55 p-5"
        aria-labelledby="coverage-heading"
      >
        <h3 id="coverage-heading" className="text-lg font-semibold text-white">
          Report coverage
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric
            label="Records fetched"
            value={String(result.coverage.fetchedTransactions)}
          />
          <Metric
            label="Supported asset movements"
            value={String(result.coverage.supportedAssetMovements)}
          />
          <Metric
            label="Calculated disposals"
            value={String(result.coverage.calculatedDisposals)}
          />
          <Metric
            label="Needs user evidence"
            value={String(result.coverage.needsUserEvidence)}
            warning={result.coverage.needsUserEvidence > 0}
          />
          <Metric
            label="Unsupported tokens quarantined"
            value={String(result.coverage.quarantinedAssetMovements)}
          />
          <Metric
            label="Complete history"
            value={result.coverage.historyComplete ? "Yes" : "No"}
            warning={!result.coverage.historyComplete}
          />
        </dl>
        <p className="mt-4 text-xs leading-5 text-slate-400">
          {result.coverage.financialYear
            ? `Financial year ${result.coverage.financialYear}. `
            : ""}
          Period: {formatDate(result.coverage.periodStart)} to{" "}
          {formatDate(result.coverage.periodEnd)}. Generated{" "}
          {formatDate(result.generatedAt)}.
        </p>
      </section>

      <section
        className="rounded-2xl border border-cyan-200/20 bg-cyan-100/5 p-5"
        aria-labelledby="calculation-state-heading"
      >
        <h3
          id="calculation-state-heading"
          className="text-lg font-semibold text-cyan-100"
        >
          {state.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{state.detail}</p>
      </section>

      <section
        className="rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5"
        aria-labelledby="limitations-heading"
      >
        <h3
          id="limitations-heading"
          className="text-lg font-semibold text-amber-100"
        >
          Data limitations
        </h3>
        <p className="mt-2 text-sm leading-6 text-amber-50/90">
          Missing evidence is excluded or flagged; it is never silently guessed.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          {result.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="financial-heading">
        <h3 id="financial-heading" className="text-xl font-semibold text-white">
          Limited tax preview
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Deterministic figures only. Positive gains and VDA losses stay
          separate and are not netted.
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinancialMetric
            label="Positive gains"
            value={
              showFigures
                ? formatInr(result.summary.positiveTaxableGainsInrPaisa)
                : state.title
            }
            detail="Included disposals with complete evidence"
          />
          <FinancialMetric
            label="VDA losses"
            value={
              showFigures
                ? formatInr(result.summary.vdaLossesInrPaisa)
                : state.title
            }
            detail="Shown separately; not netted"
          />
          <FinancialMetric
            label="30% base preview"
            value={
              showFigures
                ? formatInr(result.summary.estimatedBaseTax30PercentInrPaisa)
                : state.title
            }
            detail="Before surcharge, cess selection, and TDS credit"
          />
          <FinancialMetric
            label={result.summary.includeCess ? "Preview with 4% cess" : "Cess"}
            value={
              !showFigures
                ? state.title
                : result.summary.includeCess
                  ? formatInr(
                      result.summary.estimatedTaxIncludingCessInrPaisa,
                    )
                  : "Not added"
            }
            detail={`${result.summary.excludedTransactions} excluded transaction(s)`}
          />
        </dl>
      </section>

      {result.source === "live" && onResolveEvidence ? (
        <EvidenceReview
          transactions={result.transactions}
          classifications={result.classifications}
          isSubmitting={isReanalyzing}
          onResolve={onResolveEvidence}
        />
      ) : null}

      <section
        className="rounded-2xl border border-violet-200/20 bg-violet-100/5 p-5"
        aria-labelledby="explanation-heading"
      >
        <h3
          id="explanation-heading"
          className="text-lg font-semibold text-violet-100"
        >
          Plain-English explanation
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          {result.report.overview}
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          {result.report.deterministicFindings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
        <p className="mt-4 border-t border-violet-100/15 pt-4 text-xs leading-5 text-violet-100/85">
          {result.report.disclaimer}
        </p>
      </section>

      <section
        className="rounded-2xl border border-white/10 bg-slate-950/55 p-5"
        aria-labelledby="transactions-heading"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3
              id="transactions-heading"
              className="text-lg font-semibold text-white"
            >
              Transaction classifications
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Facts supplied through “Resolve missing evidence” rerun the
              deterministic FIFO engine and immediately replace these results.
            </p>
          </div>
          <span className="max-w-md text-xs text-slate-400">
            {result.classificationNotice}
          </span>
        </div>
        <ol className="mt-4 space-y-4">
          {result.transactions.map((transaction) => {
            const classification = classificationById.get(transaction.id);
            if (!classification) {
              return null;
            }

            return (
              <li
                key={transaction.id}
                className="[content-visibility:auto] rounded-xl border border-white/10 bg-slate-900/70 p-4 [contain-intrinsic-size:auto_12rem]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold capitalize text-cyan-100">
                    {categoryLabel(classification.category)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {Math.round(classification.confidence * 100)}% deterministic
                    confidence
                  </span>
                  {classification.needsReview ? (
                    <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                      NEEDS EVIDENCE
                    </span>
                  ) : null}
                  {classification.source === "user" ? (
                    <span className="rounded-full bg-fuchsia-300/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-100">
                      USER EVIDENCE
                    </span>
                  ) : null}
                </div>
                <a
                  href={transaction.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block break-all font-mono text-xs text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                  aria-label={`Open transaction ${transaction.txHash} in Etherscan`}
                >
                  {shortHash(transaction.txHash)} ↗
                </a>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {classification.reason}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {transaction.assetDeltas.length
                    ? transaction.assetDeltas
                        .map(
                          (asset) =>
                            `${asset.direction} ${formatAtomic(
                              asset.amountAtomic,
                              asset.decimals,
                            )} ${asset.symbol}`,
                        )
                        .join(" · ")
                    : "No wallet-relative asset movement decoded"}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        className="rounded-2xl border border-white/10 bg-slate-950/55 p-5"
        aria-labelledby="fifo-heading"
      >
        <h3 id="fifo-heading" className="text-lg font-semibold text-white">
          FIFO lots and disposal matches
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          FIFO is LedgerProof’s accounting assumption: the oldest available
          acquisition lot is matched to a disposal first. It is not presented
          as a legally mandated method.
        </p>
        {result.remainingLots.length === 0 && result.disposals.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-600 p-4 text-sm text-slate-400">
            No FIFO lots or disposals are available in this result.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">
                Remaining inventory lots
              </h4>
              <ul className="mt-2 space-y-3">
                {result.remainingLots.map((lot) => (
                  <li
                    key={lot.lotId}
                    className="rounded-xl border border-white/10 p-4 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-white">
                        {formatAtomic(lot.quantityAtomic, lot.decimals)}{" "}
                        {lot.symbol}
                      </strong>
                      {lot.needsReview ? (
                        <span className="text-xs font-semibold text-amber-100">
                          REVIEW
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Acquired {formatDate(lot.acquiredAt)} · remaining cost
                      basis {formatInr(lot.costBasisInrPaisa)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-100">Disposals</h4>
              <ul className="mt-2 space-y-3">
                {result.disposals.map((disposal) => (
                  <li
                    key={`${disposal.transactionId}-${disposal.assetId}`}
                    className="rounded-xl border border-white/10 p-4 text-sm"
                  >
                    <strong className="text-white">
                      {disposal.symbol} · {disposal.matchedLots.length} FIFO
                      match{disposal.matchedLots.length === 1 ? "" : "es"}
                    </strong>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Proceeds {formatInr(disposal.proceedsInrPaisa)} · cost
                      basis {formatInr(disposal.costBasisInrPaisa)} · gain{" "}
                      {formatInr(disposal.taxableGainInrPaisa)} · loss{" "}
                      {formatInr(disposal.vdaLossInrPaisa)}
                    </p>
                    {disposal.reviewReasons.length ? (
                      <p className="mt-2 text-xs leading-5 text-amber-100">
                        {disposal.reviewReasons.join(" ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section
        className="rounded-2xl border border-emerald-200/20 bg-emerald-100/5 p-5"
        aria-labelledby="quarantine-heading"
      >
        <h3
          id="quarantine-heading"
          className="text-lg font-semibold text-emerald-100"
        >
          Unsupported inbound tokens quarantined
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {result.quarantinedAssets.length} unsupported inbound token movement(s)
          quarantined. They do not affect supported ETH calculations.
        </p>
        {result.quarantinedAssets.length > 0 ? (
          <details className="mt-3 text-sm text-slate-300">
            <summary className="cursor-pointer text-emerald-100">
              Show quarantined evidence
            </summary>
            <ul className="mt-3 space-y-2">
              {result.quarantinedAssets.map((movement, index) => (
                <li
                  key={`${movement.txHash}-${movement.assetId}-${index}`}
                  className="rounded-lg border border-white/10 p-3"
                >
                  {movement.symbol} {movement.direction} in{" "}
                  {shortHash(movement.txHash)} — {movement.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section
        className="rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5"
        aria-labelledby="excluded-heading"
      >
        <h3
          id="excluded-heading"
          className="text-lg font-semibold text-amber-100"
        >
          Items needing evidence
        </h3>
        {unresolved.length === 0 &&
        result.unsupportedAssetsRequiringReview.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">
            No transaction currently needs user evidence.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              {unresolved.map((item) => (
                <li key={item.transactionId}>
                  <strong className="capitalize text-white">
                    {categoryLabel(item.category)}
                  </strong>
                  : {item.reason}
                </li>
              ))}
            </ul>
            {result.unsupportedAssetsRequiringReview.length > 0 ? (
              <p className="mt-3 text-xs leading-5 text-amber-100/80">
                {result.unsupportedAssetsRequiringReview.length} unsupported
                movement(s) were not safe to treat as spam because the wallet
                sent assets or the transaction may contain consideration.
              </p>
            ) : null}
          </>
        )}
      </section>
    </section>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/65 p-4">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd
        className={`mt-2 text-lg font-semibold ${
          warning ? "text-amber-100" : "text-white"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function FinancialMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-cyan-200/15 bg-slate-950/65 p-5">
      <dt className="text-xs font-medium tracking-wide text-cyan-200 uppercase">
        {label}
      </dt>
      <dd className="mt-3 text-xl font-semibold text-white">{value}</dd>
      <dd className="mt-2 text-xs leading-5 text-slate-400">{detail}</dd>
    </div>
  );
}

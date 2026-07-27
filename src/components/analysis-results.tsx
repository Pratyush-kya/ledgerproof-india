"use client";

import { useState } from "react";

import {
  type AnalysisReportSuccess,
  type Classification,
  type FetchTransactionsResult,
  type GasTreatment,
  type NormalizedTransaction,
  type ReconciledDisposal,
  type TaxLot,
  type TaxReport,
  TransactionCategorySchema,
} from "@/lib/schemas";

type ReportText = AnalysisReportSuccess["data"]["report"];
type DeterministicSummary =
  AnalysisReportSuccess["data"]["calculation"]["summary"];

export type ResultsViewModel = {
  source: "live" | "fixture";
  address: string;
  generatedAt: string;
  transactions: NormalizedTransaction[];
  classifications: Classification[];
  classificationMode: "agent" | "rule_fallback" | "fixture";
  classificationNotice: string;
  summary: DeterministicSummary;
  remainingLots: TaxLot[];
  disposals: ReconciledDisposal[];
  gasTreatments: GasTreatment[];
  limitations: string[];
  report: ReportText;
  coverage: {
    fetchedTransactions: number;
    includedTransactions: number;
    needsReviewTransactions: number;
    truncated: boolean;
    periodStart: string | null;
    periodEnd: string | null;
  };
};

type Correction = {
  transactionId: string;
  originalCategory: Classification["category"];
  correctedCategory: Classification["category"];
  correctedAt: string;
  marker: "user corrected";
  affectsCalculation: false;
};

const categoryOptions = TransactionCategorySchema.options;

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

export function liveResultsViewModel(
  fetchResult: FetchTransactionsResult,
  analysis: AnalysisReportSuccess["data"],
): ResultsViewModel {
  const timestamps = fetchResult.transactions.map((item) => item.timestamp);

  return {
    source: "live",
    address: fetchResult.address,
    generatedAt: fetchResult.fetchedAt,
    transactions: fetchResult.transactions,
    classifications: analysis.classifications,
    classificationMode: analysis.classificationMode,
    classificationNotice: analysis.classificationNotice,
    summary: analysis.calculation.summary,
    remainingLots: analysis.calculation.remainingLots,
    disposals: analysis.calculation.disposals,
    gasTreatments: analysis.calculation.gasTreatments,
    limitations: analysis.calculation.limitations,
    report: analysis.report,
    coverage: {
      fetchedTransactions: fetchResult.transactions.length,
      includedTransactions:
        fetchResult.transactions.length -
        analysis.calculation.summary.excludedTransactions,
      needsReviewTransactions: analysis.classifications.filter(
        (item) => item.needsReview,
      ).length,
      truncated: fetchResult.truncated,
      periodStart: timestamps.length ? timestamps.sort()[0] : null,
      periodEnd: timestamps.length ? timestamps.sort().at(-1) ?? null : null,
    },
  };
}

export function fixtureResultsViewModel(fixture: TaxReport): ResultsViewModel {
  return {
    source: "fixture",
    address: fixture.coverage.address,
    generatedAt: fixture.generatedAt,
    transactions: fixture.transactions,
    classifications: fixture.classifications,
    classificationMode: "fixture",
    classificationNotice:
      "STATIC FIXTURE — classifications and figures are pre-authored demonstration evidence, not live wallet analysis.",
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
      excludedTransactions: fixture.taxSummary.excludedTransactions,
      calculationStatus: "partial",
      excludesSurcharge: true,
      excludesTdsCredit: true,
    },
    remainingLots: fixture.taxLots,
    disposals: [],
    gasTreatments: [],
    limitations: fixture.limitations,
    report: {
      title: "Static crypto reconciliation preview",
      overview:
        "This fixture demonstrates how evidence, FIFO inventory, exclusions, and a limited tax preview are presented. It is not derived from the address currently on-chain.",
      deterministicFindings: [
        `Fixture positive gains: ${formatInr(
          fixture.taxSummary.pricedTaxableGainsInrPaisa,
        )}.`,
        `Fixture VDA losses, shown separately: ${formatInr(
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
      includedTransactions: fixture.coverage.includedTransactions,
      needsReviewTransactions: fixture.coverage.needsReviewTransactions,
      truncated: false,
      periodStart: fixture.coverage.analysisStartedAt,
      periodEnd: fixture.coverage.analysisEndedAt,
    },
  };
}

export function AnalysisResults({ result }: { result: ResultsViewModel }) {
  const [corrections, setCorrections] = useState<Record<string, Correction>>({});
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const classificationById = new Map(
    result.classifications.map((classification) => [
      classification.transactionId,
      classification,
    ]),
  );
  const excluded = result.classifications.filter(
    (item) => item.needsReview || item.category === "unknown",
  );

  function correctCategory(
    classification: Classification,
    category: Classification["category"],
  ) {
    if (category === classification.category) {
      setCorrections((current) => {
        const next = { ...current };
        delete next[classification.transactionId];
        return next;
      });
      return;
    }

    setCorrections((current) => ({
      ...current,
      [classification.transactionId]: {
        transactionId: classification.transactionId,
        originalCategory: classification.category,
        correctedCategory: category,
        correctedAt: new Date().toISOString(),
        marker: "user corrected",
        affectsCalculation: false,
      },
    }));
  }

  function exportReport() {
    downloadJson(
      `ledgerproof-${result.source}-${result.address.slice(0, 10)}.json`,
      {
        exportVersion: "0.1",
        exportedAt: new Date().toISOString(),
        source:
          result.source === "fixture"
            ? "static-demo-fixture"
            : "live-provider-result",
        warning:
          "Educational reconciliation preview only. User corrections do not recalculate deterministic financial figures.",
        result,
        correctionAudit: Object.values(corrections),
      },
    );
    setExportMessage("JSON export downloaded with the correction audit trail.");
  }

  return (
    <section className="mt-8 space-y-6" aria-labelledby="results-heading">
      <div className="rounded-3xl border border-cyan-200/20 bg-slate-950/80 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-cyan-300 uppercase">
              Evidence-first result
            </p>
            <h2 id="results-heading" className="mt-2 text-2xl font-semibold text-white">
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

      <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-5" aria-labelledby="coverage-heading">
        <h3 id="coverage-heading" className="text-lg font-semibold text-white">
          Report coverage
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Records read" value={String(result.coverage.fetchedTransactions)} />
          <Metric label="Included" value={String(result.coverage.includedTransactions)} />
          <Metric label="Needs review" value={String(result.coverage.needsReviewTransactions)} warning />
          <Metric
            label="Coverage"
            value={result.coverage.truncated ? "Latest 50 only" : "Returned page"}
          />
        </dl>
        <p className="mt-4 text-xs leading-5 text-slate-400">
          Period: {formatDate(result.coverage.periodStart)} to{" "}
          {formatDate(result.coverage.periodEnd)}. Generated{" "}
          {formatDate(result.generatedAt)}.
        </p>
      </section>

      <section className="rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5" aria-labelledby="limitations-heading">
        <h3 id="limitations-heading" className="text-lg font-semibold text-amber-100">
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
          Deterministic figures only. Positive gains and VDA losses are kept
          separate; this preview does not net them.
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinancialMetric
            label="Positive gains"
            value={formatInr(result.summary.positiveTaxableGainsInrPaisa)}
            detail="Included, priced disposals only"
          />
          <FinancialMetric
            label="VDA losses"
            value={formatInr(result.summary.vdaLossesInrPaisa)}
            detail="Shown separately; not netted"
          />
          <FinancialMetric
            label="30% base preview"
            value={formatInr(result.summary.estimatedBaseTax30PercentInrPaisa)}
            detail="Before surcharge and TDS credit"
          />
          <FinancialMetric
            label={result.summary.includeCess ? "Preview with 4% cess" : "Cess"}
            value={
              result.summary.includeCess
                ? formatInr(result.summary.estimatedTaxIncludingCessInrPaisa)
                : "Not added"
            }
            detail={`${result.summary.excludedTransactions} excluded transaction(s)`}
          />
        </dl>
        <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-5 text-slate-300">
          Calculation status:{" "}
          <strong className="uppercase text-white">
            {result.summary.calculationStatus}
          </strong>
          . Surcharge and TDS credits are excluded. This is a reconciliation
          preview, not a filing-ready return.
        </p>
      </section>

      <section className="rounded-2xl border border-violet-200/20 bg-violet-100/5 p-5" aria-labelledby="explanation-heading">
        <h3 id="explanation-heading" className="text-lg font-semibold text-violet-100">
          Plain-English explanation
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-200">{result.report.overview}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          {result.report.deterministicFindings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
        <p className="mt-4 border-t border-violet-100/15 pt-4 text-xs leading-5 text-violet-100/85">
          {result.report.disclaimer}
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-5" aria-labelledby="transactions-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="transactions-heading" className="text-lg font-semibold text-white">
              Transaction classifications
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Classification can be corrected for audit purposes. Financial
              figures remain unchanged until deterministic evidence is rerun.
            </p>
          </div>
          <span className="text-xs text-slate-400">{result.classificationNotice}</span>
        </div>
        <ol className="mt-4 space-y-4">
          {result.transactions.map((transaction) => {
            const classification = classificationById.get(transaction.id);
            if (!classification) {
              return null;
            }
            const correction = corrections[transaction.id];
            const shownCategory =
              correction?.correctedCategory ?? classification.category;

            return (
              <li
                key={transaction.id}
                className="rounded-xl border border-white/10 bg-slate-900/70 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold capitalize text-cyan-100">
                        {categoryLabel(shownCategory)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {Math.round(classification.confidence * 100)}% model/rule confidence
                      </span>
                      {classification.needsReview ? (
                        <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                          NEEDS REVIEW
                        </span>
                      ) : null}
                      {correction ? (
                        <span className="rounded-full bg-fuchsia-300/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-100">
                          USER CORRECTED
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
                    {correction ? (
                      <p className="mt-2 text-xs leading-5 text-fuchsia-100/90">
                        Audit: changed from{" "}
                        <strong className="capitalize">
                          {categoryLabel(correction.originalCategory)}
                        </strong>{" "}
                        at {formatDate(correction.correctedAt)}. This marker does
                        not alter deterministic calculations.
                      </p>
                    ) : null}
                  </div>
                  <div className="w-full shrink-0 lg:w-52">
                    <label
                      className="block text-xs font-medium text-slate-300"
                      htmlFor={`category-${transaction.id}`}
                    >
                      Correct category
                    </label>
                    <select
                      id={`category-${transaction.id}`}
                      value={shownCategory}
                      onChange={(event) =>
                        correctCategory(
                          classification,
                          TransactionCategorySchema.parse(event.target.value),
                        )
                      }
                      className="mt-2 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm capitalize text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    >
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {categoryLabel(category)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-5" aria-labelledby="fifo-heading">
        <h3 id="fifo-heading" className="text-lg font-semibold text-white">
          FIFO lots and disposal matches
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          FIFO means the oldest available acquisition lot is matched to a
          disposal first.
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
                  <li key={lot.lotId} className="rounded-xl border border-white/10 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-white">
                        {formatAtomic(lot.quantityAtomic, lot.decimals)} {lot.symbol}
                      </strong>
                      {lot.needsReview ? (
                        <span className="text-xs font-semibold text-amber-100">REVIEW</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Acquired {formatDate(lot.acquiredAt)} · remaining cost basis{" "}
                      {formatInr(lot.costBasisInrPaisa)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-100">Disposals</h4>
              <ul className="mt-2 space-y-3">
                {result.disposals.map((disposal) => (
                  <li key={`${disposal.transactionId}-${disposal.assetId}`} className="rounded-xl border border-white/10 p-4 text-sm">
                    <strong className="text-white">
                      {disposal.symbol} · {disposal.matchedLots.length} FIFO match
                      {disposal.matchedLots.length === 1 ? "" : "es"}
                    </strong>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Proceeds {formatInr(disposal.proceedsInrPaisa)} · cost basis{" "}
                      {formatInr(disposal.costBasisInrPaisa)} · gain{" "}
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

      <section className="rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5" aria-labelledby="excluded-heading">
        <h3 id="excluded-heading" className="text-lg font-semibold text-amber-100">
          Excluded and unknown items
        </h3>
        {excluded.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">
            No classification is currently marked unknown or needs review.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            {excluded.map((item) => (
              <li key={item.transactionId}>
                <strong className="capitalize text-white">
                  {categoryLabel(item.category)}
                </strong>
                : {item.reason}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-5 text-amber-100/80">
          The deterministic summary reports {result.summary.excludedTransactions}{" "}
          excluded transaction(s). Classification review flags and financial
          exclusions can differ because they measure different evidence checks.
        </p>
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
      <dd className={`mt-2 text-lg font-semibold ${warning ? "text-amber-100" : "text-white"}`}>
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
      <dd className="mt-3 text-2xl font-semibold text-white">{value}</dd>
      <dd className="mt-2 text-xs leading-5 text-slate-400">{detail}</dd>
    </div>
  );
}

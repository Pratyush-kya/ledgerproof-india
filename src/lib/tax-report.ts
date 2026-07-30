import type { ReconciliationResult } from "@/lib/reconciliation";
import type { CalculationStatus } from "@/lib/schemas";

function formatInrFromPaisa(value: string) {
  const paisa = BigInt(value);
  const rupees = paisa / BigInt(100);
  const remainder = (paisa % BigInt(100)).toString().padStart(2, "0");

  return `INR ${rupees.toLocaleString("en-IN")}.${remainder}`;
}

function overviewFor(
  status: CalculationStatus,
  excludedTransactions: number,
) {
  switch (status) {
    case "no_supported_disposals":
      return "No supported disposals were detected in the available history, so holdings and acquisition lots are shown without a tax figure.";
    case "blocked_missing_basis":
      return "The calculation is blocked because at least one disposal lacks complete FIFO acquisition-cost evidence.";
    case "blocked_missing_valuation":
      return "The calculation is blocked because at least one disposal lacks supported INR sale or swap valuation evidence.";
    case "partial":
      return `This is a partial estimate. ${excludedTransactions} transaction(s) still need evidence or the available wallet history is incomplete.`;
    case "complete_zero":
      return "The deterministic engine completed the supported disposal calculation and the resulting positive gain and VDA loss are both zero.";
    case "complete":
      return "The deterministic engine had the evidence needed for every supported disposal, but this remains a limited preview that must be checked before filing.";
  }
}

export function buildPlainEnglishTaxReport(
  reconciliation: ReconciliationResult,
) {
  const summary = reconciliation.summary;
  const reviewClassifications = reconciliation.classifications.filter(
    (classification) => classification.needsReview,
  );
  const hasCalculatedDisposals = summary.calculatedDisposals > 0;

  const deterministicFindings = hasCalculatedDisposals
    ? [
        `Positive taxable gains included by the deterministic engine: ${formatInrFromPaisa(
          summary.positiveTaxableGainsInrPaisa,
        )}.`,
        `VDA losses shown separately and not netted against gains: ${formatInrFromPaisa(
          summary.vdaLossesInrPaisa,
        )}.`,
        `Indicative 30% base-tax calculation on included positive gains: ${formatInrFromPaisa(
          summary.estimatedBaseTax30PercentInrPaisa,
        )}.`,
        summary.includeCess
          ? `Indicative total including the selected 4% cess: ${formatInrFromPaisa(
              summary.estimatedTaxIncludingCessInrPaisa,
            )}.`
          : "The displayed estimate does not add cess, surcharge, or TDS credits.",
      ]
    : [
        overviewFor(
          summary.calculationStatus,
          summary.excludedTransactions,
        ),
        "No unverified financial amount was substituted for missing acquisition cost or consideration.",
      ];

  return {
    title: "Deterministic crypto tax reconciliation preview",
    overview: overviewFor(
      summary.calculationStatus,
      summary.excludedTransactions,
    ),
    deterministicFindings,
    reviewWarnings: [
      "Transaction categories and all financial arithmetic come from deterministic rules and validated evidence; AI is not used.",
      reviewClassifications.length > 0
        ? `${reviewClassifications.length} transaction(s) need user evidence.`
        : "No transaction classification currently needs user evidence.",
      reconciliation.quarantinedAssets.length > 0
        ? `${reconciliation.quarantinedAssets.length} unsupported inbound token movement(s) were quarantined and preserved in the evidence export.`
        : "No unsupported inbound token movements were quarantined.",
      ...reconciliation.limitations,
    ],
    disclaimer:
      "This is an educational reconciliation estimate, not tax advice, a legal conclusion, or a filing-ready return. Verify wallet ownership, acquisition costs, valuations, TDS, surcharge, cess selection, the FIFO assumption, and current Indian tax rules with a qualified professional.",
  };
}

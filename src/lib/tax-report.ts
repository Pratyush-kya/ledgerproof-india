import type { ReconciliationResult } from "@/lib/reconciliation";
import type {
  Classification,
  ClassificationMode,
} from "@/lib/schemas";

function formatInrFromPaisa(value: string) {
  const paisa = BigInt(value);
  const rupees = paisa / BigInt(100);
  const remainder = (paisa % BigInt(100)).toString().padStart(2, "0");

  return `INR ${rupees.toLocaleString("en-IN")}.${remainder}`;
}

export function buildPlainEnglishTaxReport(
  reconciliation: ReconciliationResult,
  classifications: Classification[],
  classificationMode: ClassificationMode,
) {
  const reviewClassifications = classifications.filter(
    (classification) => classification.needsReview,
  );
  const classificationEvidence =
    classifications.length === 0
      ? "No transactions were available for classification."
      : classifications
          .map(
            (classification) =>
              `${classification.category.replaceAll("_", " ")} (${Math.round(
                classification.confidence * 100,
              )}% confidence; ${classification.reason})`,
          )
          .join(" ");

  return {
    title: "Deterministic crypto tax reconciliation preview",
    overview:
      reconciliation.summary.calculationStatus === "complete"
        ? "The deterministic engine had the evidence needed for every included transaction, but this remains a limited preview and must be checked before filing."
        : `This is a partial estimate. ${reconciliation.summary.excludedTransactions} transaction(s) were excluded from calculated figures because required evidence was missing or ambiguous.`,
    deterministicFindings: [
      `Positive taxable gains included by the deterministic engine: ${formatInrFromPaisa(
        reconciliation.summary.positiveTaxableGainsInrPaisa,
      )}.`,
      `VDA losses shown separately and not netted against gains: ${formatInrFromPaisa(
        reconciliation.summary.vdaLossesInrPaisa,
      )}.`,
      `Indicative 30% base-tax calculation on included positive gains: ${formatInrFromPaisa(
        reconciliation.summary.estimatedBaseTax30PercentInrPaisa,
      )}.`,
      reconciliation.summary.includeCess
        ? `Indicative total including the selected 4% cess: ${formatInrFromPaisa(
            reconciliation.summary.estimatedTaxIncludingCessInrPaisa,
          )}.`
        : "The displayed estimate does not add cess, surcharge, or TDS credits.",
    ],
    reviewWarnings: [
      classificationMode === "agent"
        ? `Agent evidence was used only for classification explanations: ${classificationEvidence}`
        : `Rule fallback evidence is displayed because valid agent output was unavailable: ${classificationEvidence}`,
      reviewClassifications.length > 0
        ? `${reviewClassifications.length} classification(s) need human review.`
        : "No classification was automatically flagged, but source records should still be checked.",
      ...reconciliation.limitations,
    ],
    disclaimer:
      "This is an educational reconciliation estimate, not tax advice, a legal conclusion, or a filing-ready return. Verify wallet ownership, acquisition costs, valuations, TDS, surcharge, cess selection, and current Indian tax rules with a qualified professional.",
  };
}

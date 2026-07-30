import "server-only";

import {
  ReconciliationInputSchema,
  reconcileTransactions,
} from "@/lib/reconciliation";
import {
  AnalysisReportSuccessSchema,
  type NormalizedTransaction,
  type OpeningLot,
  type CalculationPeriod,
  type TransactionEvidence,
} from "@/lib/schemas";
import { buildPlainEnglishTaxReport } from "@/lib/tax-report";

type AnalyzeInput = {
  transactions: NormalizedTransaction[];
  evidence?: TransactionEvidence[];
  openingLots?: OpeningLot[];
  calculationPeriod?: CalculationPeriod;
  historyComplete?: boolean;
  includeCess?: boolean;
};

export async function analyzeTransactions(input: AnalyzeInput) {
  const validatedInput = ReconciliationInputSchema.parse({
    transactions: input.transactions,
    evidence: input.evidence ?? [],
    openingLots: input.openingLots ?? [],
    calculationPeriod: input.calculationPeriod,
    historyComplete: input.historyComplete ?? false,
    includeCess: input.includeCess ?? false,
  });
  const reconciliation = reconcileTransactions(validatedInput);
  const report = buildPlainEnglishTaxReport(reconciliation);

  return AnalysisReportSuccessSchema.parse({
    data: {
      classificationMode: "deterministic",
      classificationNotice:
        "DETERMINISTIC RULE ENGINE — tax calculations do not depend on AI.",
      classifications: reconciliation.classifications,
      calculation: {
        engineVersion: reconciliation.engineVersion,
        method: reconciliation.method,
        summary: reconciliation.summary,
        limitations: reconciliation.limitations,
        remainingLots: reconciliation.remainingLots,
        disposals: reconciliation.disposals,
        gasTreatments: reconciliation.gasTreatments,
        quarantinedAssets: reconciliation.quarantinedAssets,
        unsupportedAssetsRequiringReview:
          reconciliation.unsupportedAssetsRequiringReview,
      },
      report,
    },
  });
}

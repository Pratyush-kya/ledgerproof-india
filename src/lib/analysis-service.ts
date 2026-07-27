import "server-only";

import {
  ReconciliationInputSchema,
  reconcileTransactions,
} from "@/lib/reconciliation";
import {
  AgentExplanationSchema,
  AnalysisReportSuccessSchema,
  ClassificationSchema,
  type Classification,
  type NormalizedTransaction,
} from "@/lib/schemas";
import { buildPlainEnglishTaxReport } from "@/lib/tax-report";
import { classifyTransactionsWithAgent } from "@/lib/transaction-agent";

type AnalyzeInput = {
  transactions: NormalizedTransaction[];
  evidence?: unknown[];
  includeCess?: boolean;
};

type AgentClassifier = (
  transactions: NormalizedTransaction[],
) => Promise<Classification[]>;

type AnalyzeOptions = {
  agentClassifier?: AgentClassifier;
  apiKey?: string;
  model?: string;
};

function validateAgentClassifications(
  transactions: NormalizedTransaction[],
  classifications: Classification[],
) {
  const parsed = classifications.map((classification) =>
    ClassificationSchema.parse(classification),
  );
  const expectedIds = new Set(transactions.map((transaction) => transaction.id));
  const allowedHashes = new Set(
    transactions.map((transaction) => transaction.txHash.toLowerCase()),
  );
  const seenIds = new Set<string>();

  if (parsed.length !== transactions.length) {
    throw new Error("Agent classification coverage is incomplete.");
  }

  for (const classification of parsed) {
    if (
      classification.source !== "agent" ||
      !expectedIds.has(classification.transactionId) ||
      seenIds.has(classification.transactionId) ||
      classification.evidenceTxHashes.some(
        (hash) => !allowedHashes.has(hash.toLowerCase()),
      )
    ) {
      throw new Error("Agent classification evidence is invalid.");
    }

    AgentExplanationSchema.parse(classification.reason);
    seenIds.add(classification.transactionId);
  }

  return parsed;
}

export async function analyzeTransactions(
  input: AnalyzeInput,
  options: AnalyzeOptions = {},
) {
  const validatedInput = ReconciliationInputSchema.parse({
    transactions: input.transactions,
    evidence: input.evidence ?? [],
    includeCess: input.includeCess ?? false,
  });
  const reconciliation = reconcileTransactions(validatedInput);

  let classifications = reconciliation.classifications;
  let classificationMode: "agent" | "rule_fallback" = "rule_fallback";
  let classificationNotice =
    "RULE FALLBACK — deterministic classifications are shown because the LLM agent is not configured.";

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  const model = options.model ?? process.env.OPENAI_MODEL?.trim() ?? "gpt-5-mini";
  const agentClassifier =
    options.agentClassifier ??
    (apiKey
      ? (transactions: NormalizedTransaction[]) =>
          classifyTransactionsWithAgent(transactions, { apiKey, model })
      : undefined);

  if (agentClassifier) {
    try {
      classifications = validateAgentClassifications(
        input.transactions,
        await agentClassifier(input.transactions),
      );
      classificationMode = "agent";
      classificationNotice =
        "AGENT CLASSIFICATION — model explanations passed strict validation; deterministic rules still own every financial calculation.";
    } catch {
      classifications = reconciliation.classifications;
      classificationNotice =
        "RULE FALLBACK — the model response was missing, invalid, or unavailable. Deterministic classifications are shown.";
    }
  }

  const report = buildPlainEnglishTaxReport(
    reconciliation,
    classifications,
    classificationMode,
  );

  return AnalysisReportSuccessSchema.parse({
    data: {
      classificationMode,
      classificationNotice,
      classifications,
      calculation: {
        engineVersion: reconciliation.engineVersion,
        method: reconciliation.method,
        summary: reconciliation.summary,
        limitations: reconciliation.limitations,
      },
      report,
    },
  });
}

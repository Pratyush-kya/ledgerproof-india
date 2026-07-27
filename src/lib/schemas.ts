import { z } from "zod";

export const EvmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid 0x Ethereum wallet address.");

export const TransactionCategorySchema = z.enum([
  "buy",
  "sell",
  "swap",
  "transfer_in",
  "transfer_out",
  "gas",
  "approval",
  "unknown",
]);

const AtomicAmountSchema = z
  .string()
  .regex(/^\d+$/, "Amounts must be stored as non-negative atomic-unit strings.");

export const AssetDeltaSchema = z.object({
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(24),
  decimals: z.number().int().min(0).max(255),
  amountAtomic: AtomicAmountSchema,
  direction: z.enum(["in", "out"]),
  standard: z.enum(["native", "erc20"]),
});

export const NormalizedTransactionSchema = z.object({
  id: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  chainId: z.literal(1),
  blockNumber: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
  from: EvmAddressSchema,
  to: EvmAddressSchema.nullable(),
  explorerUrl: z.string().url(),
  status: z.enum(["confirmed", "failed"]),
  assetDeltas: z.array(AssetDeltaSchema),
  gasFeeWei: AtomicAmountSchema,
});

export const FetchTransactionsRequestSchema = z.object({
  address: EvmAddressSchema,
});

export const FetchTransactionsResultSchema = z.object({
  address: EvmAddressSchema,
  chainId: z.literal(1),
  source: z.literal("goldrush"),
  fetchedAt: z.string().datetime({ offset: true }),
  transactions: z.array(NormalizedTransactionSchema).max(50),
  isEmpty: z.boolean(),
  truncated: z.boolean(),
});

export const FetchTransactionsSuccessSchema = z.object({
  data: FetchTransactionsResultSchema,
});

export const FetchApiErrorCodeSchema = z.enum([
  "INVALID_ADDRESS",
  "INVALID_REQUEST",
  "MISSING_PROVIDER_KEY",
  "UPSTREAM_RATE_LIMIT",
  "UPSTREAM_INVALID_RESPONSE",
  "UPSTREAM_UNAVAILABLE",
]);

export const FetchApiErrorSchema = z.object({
  error: z.object({
    code: FetchApiErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
});

export const ClassificationSchema = z.strictObject({
  transactionId: z.string().min(1),
  category: TransactionCategorySchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  evidenceTxHashes: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/)).min(1),
  needsReview: z.boolean(),
  source: z.enum(["rule", "agent", "user"]),
});

export const AgentExplanationSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(
    /^(?!.*(?:₹|\bINR\b|\bUSD\b|%|\btax\b|\bgain\b|\bloss\b|\bprice\b|\btotal\b|\bcost basis\b|\bproceeds\b|\d+\s*[+\-*/=]\s*\d+)).*$/i,
    "Agent explanations must not contain financial calculations or tax conclusions.",
  );

export const AgentClassificationOutputSchema = z.strictObject({
  classifications: z
    .array(
      z.strictObject({
        transactionId: z.string().regex(/^tx_\d+$/),
        category: TransactionCategorySchema,
        confidence: z.number().min(0).max(1),
        reason: AgentExplanationSchema,
        evidenceTxHashes: z
          .array(z.string().regex(/^0x[a-fA-F0-9]{64}$/))
          .min(1)
          .max(10),
        needsReview: z.boolean(),
      }),
    )
    .max(50),
});

export const ClassificationModeSchema = z.enum(["agent", "rule_fallback"]);

export const DeterministicSummarySchema = z.strictObject({
  positiveTaxableGainsInrPaisa: AtomicAmountSchema,
  vdaLossesInrPaisa: AtomicAmountSchema,
  estimatedBaseTax30PercentInrPaisa: AtomicAmountSchema,
  includeCess: z.boolean(),
  estimatedCess4PercentInrPaisa: AtomicAmountSchema.nullable(),
  estimatedTaxIncludingCessInrPaisa: AtomicAmountSchema,
  excludedTransactions: z.number().int().nonnegative(),
  calculationStatus: z.enum(["complete", "partial"]),
  excludesSurcharge: z.literal(true),
  excludesTdsCredit: z.literal(true),
});

export const PlainEnglishTaxReportSchema = z.strictObject({
  title: z.string().min(1),
  overview: z.string().min(1),
  deterministicFindings: z.array(z.string().min(1)).min(1),
  reviewWarnings: z.array(z.string().min(1)).min(1),
  disclaimer: z.string().min(1),
});

export const AnalysisReportRequestSchema = z.strictObject({
  transactions: z.array(NormalizedTransactionSchema).min(1).max(50),
  evidence: z.array(z.unknown()).max(50).default([]),
  includeCess: z.boolean().default(false),
});

export const AnalysisReportSuccessSchema = z.strictObject({
  data: z.strictObject({
    classificationMode: ClassificationModeSchema,
    classificationNotice: z.string().min(1),
    classifications: z.array(ClassificationSchema),
    calculation: z.strictObject({
      engineVersion: z.literal("0.1"),
      method: z.literal("deterministic-rules-and-fifo"),
      summary: DeterministicSummarySchema,
      limitations: z.array(z.string().min(1)).min(1),
    }),
    report: PlainEnglishTaxReportSchema,
  }),
});

export const AnalysisReportErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(["INVALID_REQUEST", "ANALYSIS_FAILED"]),
    message: z.string().min(1),
  }),
});

export const TaxLotSchema = z.object({
  lotId: z.string().min(1),
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(24),
  quantityAtomic: AtomicAmountSchema,
  decimals: z.number().int().min(0).max(255),
  acquiredAt: z.string().datetime({ offset: true }),
  costBasisInrPaisa: AtomicAmountSchema.nullable(),
  sourceTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  needsReview: z.boolean(),
});

export const ReportCoverageSchema = z.object({
  address: EvmAddressSchema,
  chainId: z.literal(1),
  source: z.enum(["static-demo-fixture", "provider"]),
  isDemoData: z.boolean(),
  analysisStartedAt: z.string().datetime({ offset: true }),
  analysisEndedAt: z.string().datetime({ offset: true }),
  fetchedTransactions: z.number().int().nonnegative(),
  includedTransactions: z.number().int().nonnegative(),
  needsReviewTransactions: z.number().int().nonnegative(),
});

export const TaxSummarySchema = z.object({
  pricedTaxableGainsInrPaisa: AtomicAmountSchema,
  vdaLossesInrPaisa: AtomicAmountSchema,
  estimatedBaseTaxInrPaisa: AtomicAmountSchema,
  excludedTransactions: z.number().int().nonnegative(),
  calculationStatus: z.enum(["demo_only", "partial", "complete"]),
});

export const TaxReportSchema = z.object({
  version: z.literal("0.1"),
  generatedAt: z.string().datetime({ offset: true }),
  coverage: ReportCoverageSchema,
  transactions: z.array(NormalizedTransactionSchema),
  classifications: z.array(ClassificationSchema),
  taxLots: z.array(TaxLotSchema),
  taxSummary: TaxSummarySchema,
  limitations: z.array(z.string().min(1)).min(1),
});

export type EvmAddress = z.infer<typeof EvmAddressSchema>;
export type NormalizedTransaction = z.infer<typeof NormalizedTransactionSchema>;
export type FetchTransactionsResult = z.infer<typeof FetchTransactionsResultSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type ClassificationMode = z.infer<typeof ClassificationModeSchema>;
export type AnalysisReportSuccess = z.infer<typeof AnalysisReportSuccessSchema>;
export type TaxLot = z.infer<typeof TaxLotSchema>;
export type ReportCoverage = z.infer<typeof ReportCoverageSchema>;
export type TaxReport = z.infer<typeof TaxReportSchema>;

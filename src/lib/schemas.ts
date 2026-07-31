 import { z } from "zod";

    export const MAX_DEMO_TRANSACTIONS = 100;

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

const PositiveAtomicAmountSchema = AtomicAmountSchema.refine(
  (value) => BigInt(value) > BigInt(0),
  "Use a positive atomic-unit string.",
);

const TransactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const FinancialYearSchema = z
  .string()
  .regex(/^20\d{2}-\d{2}$/, "Use an Indian financial year such as 2026-27.")
  .refine((value) => {
    const startYear = Number(value.slice(0, 4));
    const endYear = Number(value.slice(5, 7));
    return (startYear + 1) % 100 === endYear;
  }, "The financial-year end must immediately follow its start.");

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
  txHash: TransactionHashSchema,
  chainId: z.literal(1),
  blockNumber: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
  from: EvmAddressSchema,
  to: EvmAddressSchema.nullable(),
  explorerUrl: z.string().url(),
  status: z.enum(["confirmed", "failed"]),
  assetDeltas: z.array(AssetDeltaSchema),
  gasFeeWei: AtomicAmountSchema,
  methodName: z.string().min(1).max(128).nullable().optional(),
  decodedEventNames: z.array(z.string().min(1).max(128)).max(20).optional(),
  contractAddresses: z.array(EvmAddressSchema).max(20).optional(),
});

export const FetchTransactionsRequestSchema = z.object({
  address: EvmAddressSchema,
  financialYear: FinancialYearSchema.optional(),
});

export const FetchTransactionsResultSchema = z.object({
  address: EvmAddressSchema,
  chainId: z.literal(1),
  source: z.literal("goldrush"),
  fetchedAt: z.string().datetime({ offset: true }),
  financialYear: FinancialYearSchema.nullable(),
  transactions: z
    .array(NormalizedTransactionSchema)
    .max(MAX_DEMO_TRANSACTIONS),
  isEmpty: z.boolean(),
  truncated: z.boolean(),
  historyComplete: z.boolean(),
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
  "RATE_LIMITED",
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
  evidenceTxHashes: z.array(TransactionHashSchema).min(1),
  needsReview: z.boolean(),
  source: z.enum(["rule", "user"]),
});

export const EvidenceResolutionSchema = z.enum([
  "bought_for_inr",
  "sold_for_inr",
  "self_transfer",
  "gift_reward_airdrop",
  "unknown",
  "ignore_inbound_spam",
]);

export const FiatFlowSchema = z.strictObject({
  direction: z.enum(["paid", "received"]),
  amountInrPaisa: PositiveAtomicAmountSchema,
});

export const AssetValuationSchema = z.strictObject({
  assetId: z.string().min(1),
  direction: z.enum(["in", "out"]),
  amountInrPaisa: PositiveAtomicAmountSchema,
});

export const TransactionEvidenceSchema = z
  .strictObject({
    txHash: TransactionHashSchema,
    resolution: EvidenceResolutionSchema.optional(),
    operationHint: z.enum(["approval", "gas"]).optional(),
    fiatFlow: FiatFlowSchema.optional(),
    carriedCostBasisInrPaisa: AtomicAmountSchema.optional(),
    assetValuations: z.array(AssetValuationSchema).default([]),
    gasValueInrPaisa: PositiveAtomicAmountSchema.optional(),
  })
  .superRefine((evidence, context) => {
    const valuationKeys = new Set<string>();

    for (const valuation of evidence.assetValuations) {
      const key = `${valuation.assetId.toLowerCase()}:${valuation.direction}`;
      if (valuationKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["assetValuations"],
          message: `Duplicate valuation for ${key}.`,
        });
      }
      valuationKeys.add(key);
    }

    if (
      evidence.resolution === "bought_for_inr" &&
      evidence.fiatFlow?.direction !== "paid"
    ) {
      context.addIssue({
        code: "custom",
        path: ["fiatFlow"],
        message: "A purchase requires an explicit INR-paid amount.",
      });
    }

    if (
      evidence.resolution === "sold_for_inr" &&
      evidence.fiatFlow?.direction !== "received"
    ) {
      context.addIssue({
        code: "custom",
        path: ["fiatFlow"],
        message: "A sale requires an explicit INR-received amount.",
      });
    }
  });

export const OpeningLotSchema = z.strictObject({
  lotId: z.string().min(1).max(160),
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(24),
  decimals: z.number().int().min(0).max(255),
  standard: z.enum(["native", "erc20"]),
  quantityAtomic: PositiveAtomicAmountSchema,
  acquiredAt: z.string().datetime({ offset: true }),
  costBasisInrPaisa: AtomicAmountSchema,
  sourceTxHash: TransactionHashSchema,
});

export const ExcludedAssetMovementSchema = z.strictObject({
  transactionId: z.string().min(1),
  txHash: TransactionHashSchema,
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(24),
  decimals: z.number().int().min(0).max(255),
  amountAtomic: PositiveAtomicAmountSchema,
  direction: z.enum(["in", "out"]),
  reason: z.string().min(1),
});

export const CalculationStatusSchema = z.enum([
  "no_supported_disposals",
  "blocked_missing_basis",
  "blocked_missing_valuation",
  "partial",
  "complete",
  "complete_zero",
]);

export const CalculationPeriodSchema = z
  .strictObject({
    start: z.string().datetime({ offset: true }),
    endExclusive: z.string().datetime({ offset: true }),
  })
  .refine(
    (period) => Date.parse(period.start) < Date.parse(period.endExclusive),
    "Calculation period start must be before its end.",
  );

export const DeterministicSummarySchema = z.strictObject({
  positiveTaxableGainsInrPaisa: AtomicAmountSchema,
  vdaLossesInrPaisa: AtomicAmountSchema,
  estimatedBaseTax30PercentInrPaisa: AtomicAmountSchema,
  includeCess: z.boolean(),
  estimatedCess4PercentInrPaisa: AtomicAmountSchema.nullable(),
  estimatedTaxIncludingCessInrPaisa: AtomicAmountSchema,
  calculatedDisposals: z.number().int().nonnegative(),
  excludedTransactions: z.number().int().nonnegative(),
  supportedAssetMovements: z.number().int().nonnegative(),
  needsUserEvidence: z.number().int().nonnegative(),
  quarantinedAssetMovements: z.number().int().nonnegative(),
  unsafeUnsupportedAssetMovements: z.number().int().nonnegative(),
  historyComplete: z.boolean(),
  calculationPeriod: CalculationPeriodSchema.nullable(),
  calculationStatus: CalculationStatusSchema,
  excludesSurcharge: z.literal(true),
  excludesTdsCredit: z.literal(true),
});

export const ReconciledLotSchema = z.strictObject({
  lotId: z.string().min(1),
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(24),
  decimals: z.number().int().min(0).max(255),
  quantityAtomic: AtomicAmountSchema,
  acquiredAt: z.string().datetime({ offset: true }),
  costBasisInrPaisa: AtomicAmountSchema.nullable(),
  sourceTxHash: TransactionHashSchema,
  needsReview: z.boolean(),
});

export const DisposalMatchSchema = z.strictObject({
  lotId: z.string().min(1),
  quantityAtomic: AtomicAmountSchema,
  costBasisInrPaisa: AtomicAmountSchema.nullable(),
});

export const ReconciledDisposalSchema = z.strictObject({
  transactionId: z.string().min(1),
  txHash: TransactionHashSchema,
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(24),
  quantityAtomic: AtomicAmountSchema,
  proceedsInrPaisa: AtomicAmountSchema.nullable(),
  costBasisInrPaisa: AtomicAmountSchema.nullable(),
  taxableGainInrPaisa: AtomicAmountSchema.nullable(),
  vdaLossInrPaisa: AtomicAmountSchema.nullable(),
  matchedLots: z.array(DisposalMatchSchema),
  needsReview: z.boolean(),
  reviewReasons: z.array(z.string().min(1)),
});

export const GasTreatmentSchema = z.strictObject({
  transactionId: z.string().min(1),
  txHash: TransactionHashSchema,
  gasFeeWei: AtomicAmountSchema,
  valueInrPaisa: AtomicAmountSchema.nullable(),
  includedInCostBasis: z.literal(false),
  deductedFromProceeds: z.literal(false),
  needsReview: z.boolean(),
  reason: z.string().min(1),
});

export const PlainEnglishTaxReportSchema = z.strictObject({
  title: z.string().min(1),
  overview: z.string().min(1),
  deterministicFindings: z.array(z.string().min(1)).min(1),
  reviewWarnings: z.array(z.string().min(1)).min(1),
  disclaimer: z.string().min(1),
});

export const AnalysisReportRequestSchema = z.strictObject({
  transactions: z
    .array(NormalizedTransactionSchema)
    .min(1)
    .max(MAX_DEMO_TRANSACTIONS),
  evidence: z
    .array(TransactionEvidenceSchema)
    .max(MAX_DEMO_TRANSACTIONS)
    .default([]),
  openingLots: z.array(OpeningLotSchema).max(MAX_DEMO_TRANSACTIONS).default([]),
  calculationPeriod: CalculationPeriodSchema.optional(),
  historyComplete: z.boolean().default(false),
  includeCess: z.boolean().default(false),
});

export const AnalysisReportSuccessSchema = z.strictObject({
  data: z.strictObject({
    classificationMode: z.literal("deterministic"),
    classificationNotice: z.string().min(1),
    classifications: z.array(ClassificationSchema),
    calculation: z.strictObject({
      engineVersion: z.literal("0.2"),
      method: z.literal("deterministic-rules-and-fifo"),
      summary: DeterministicSummarySchema,
      limitations: z.array(z.string().min(1)).min(1),
      remainingLots: z.array(ReconciledLotSchema),
      disposals: z.array(ReconciledDisposalSchema),
      gasTreatments: z.array(GasTreatmentSchema),
      quarantinedAssets: z.array(ExcludedAssetMovementSchema),
      unsupportedAssetsRequiringReview: z.array(
        ExcludedAssetMovementSchema,
      ),
    }),
    report: PlainEnglishTaxReportSchema,
  }),
});

export const AnalysisReportErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(["INVALID_REQUEST", "ANALYSIS_FAILED", "RATE_LIMITED"]),
    message: z.string().min(1),
  }),
});

export const TaxLotSchema = ReconciledLotSchema;

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
export type FetchTransactionsResult = z.infer<
  typeof FetchTransactionsResultSchema
>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type TransactionEvidence = z.infer<typeof TransactionEvidenceSchema>;
export type OpeningLot = z.infer<typeof OpeningLotSchema>;
export type ExcludedAssetMovement = z.infer<
  typeof ExcludedAssetMovementSchema
>;
export type CalculationStatus = z.infer<typeof CalculationStatusSchema>;
export type CalculationPeriod = z.infer<typeof CalculationPeriodSchema>;
export type AnalysisReportSuccess = z.infer<typeof AnalysisReportSuccessSchema>;
export type TaxLot = z.infer<typeof TaxLotSchema>;
export type ReconciledDisposal = z.infer<typeof ReconciledDisposalSchema>;
export type GasTreatment = z.infer<typeof GasTreatmentSchema>;
export type ReportCoverage = z.infer<typeof ReportCoverageSchema>;
export type TaxReport = z.infer<typeof TaxReportSchema>;

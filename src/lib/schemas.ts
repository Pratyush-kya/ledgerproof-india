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
  decimals: z.number().int().min(0).max(36),
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
  to: EvmAddressSchema,
  explorerUrl: z.string().url(),
  status: z.enum(["confirmed", "failed"]),
  assetDeltas: z.array(AssetDeltaSchema),
  gasFeeWei: AtomicAmountSchema,
});

export const ClassificationSchema = z.object({
  transactionId: z.string().min(1),
  category: TransactionCategorySchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  evidenceTxHashes: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/)).min(1),
  needsReview: z.boolean(),
  source: z.enum(["rule", "agent", "user"]),
});

export const TaxLotSchema = z.object({
  lotId: z.string().min(1),
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(24),
  quantityAtomic: AtomicAmountSchema,
  decimals: z.number().int().min(0).max(36),
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
export type Classification = z.infer<typeof ClassificationSchema>;
export type TaxLot = z.infer<typeof TaxLotSchema>;
export type ReportCoverage = z.infer<typeof ReportCoverageSchema>;
export type TaxReport = z.infer<typeof TaxReportSchema>;

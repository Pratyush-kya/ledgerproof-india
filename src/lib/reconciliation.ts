import { z } from "zod";

import {
  inspectSupportedAsset,
  type SupportedAsset,
} from "@/lib/asset-registry";
import {
  ClassificationSchema,
  NormalizedTransactionSchema,
  type Classification,
  type NormalizedTransaction,
} from "@/lib/schemas";

const IntegerStringSchema = z
  .string()
  .regex(/^\d+$/, "Use a non-negative integer string.");

const PositiveIntegerStringSchema = IntegerStringSchema.refine(
  (value) => BigInt(value) > BigInt(0),
  "Use a positive integer string.",
);

const TransactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const FiatFlowSchema = z.object({
  direction: z.enum(["paid", "received"]),
  amountInrPaisa: PositiveIntegerStringSchema,
});

const AssetValuationSchema = z.object({
  assetId: z.string().min(1),
  direction: z.enum(["in", "out"]),
  amountInrPaisa: PositiveIntegerStringSchema,
});

const TransactionEvidenceSchema = z
  .object({
    txHash: TransactionHashSchema,
    operationHint: z.enum(["approval", "gas"]).optional(),
    fiatFlow: FiatFlowSchema.optional(),
    assetValuations: z.array(AssetValuationSchema).default([]),
    gasValueInrPaisa: PositiveIntegerStringSchema.optional(),
  })
  .superRefine((evidence, context) => {
    const keys = new Set<string>();

    for (const valuation of evidence.assetValuations) {
      const key = `${valuation.assetId.toLowerCase()}:${valuation.direction}`;

      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["assetValuations"],
          message: `Duplicate valuation for ${key}.`,
        });
      }

      keys.add(key);
    }
  });

export const ReconciliationInputSchema = z
  .object({
    transactions: z.array(NormalizedTransactionSchema),
    evidence: z.array(TransactionEvidenceSchema).default([]),
    includeCess: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    const transactionHashes = new Set(
      input.transactions.map((transaction) => transaction.txHash.toLowerCase()),
    );
    const evidenceHashes = new Set<string>();

    for (const [index, evidence] of input.evidence.entries()) {
      const hash = evidence.txHash.toLowerCase();

      if (evidenceHashes.has(hash)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "txHash"],
          message: "Only one evidence record is allowed per transaction.",
        });
      }

      if (!transactionHashes.has(hash)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "txHash"],
          message: "Evidence references a transaction that is not in the input.",
        });
      }

      evidenceHashes.add(hash);
    }
  });

type ReconciliationInput = z.input<typeof ReconciliationInputSchema>;
type TransactionEvidence = z.infer<typeof TransactionEvidenceSchema>;
type AssetDelta = NormalizedTransaction["assetDeltas"][number];

export type ReconciledLot = {
  lotId: string;
  assetId: string;
  symbol: string;
  decimals: number;
  quantityAtomic: string;
  acquiredAt: string;
  costBasisInrPaisa: string | null;
  sourceTxHash: string;
  needsReview: boolean;
};

export type DisposalMatch = {
  lotId: string;
  quantityAtomic: string;
  costBasisInrPaisa: string | null;
};

export type ReconciledDisposal = {
  transactionId: string;
  txHash: string;
  assetId: string;
  symbol: string;
  quantityAtomic: string;
  proceedsInrPaisa: string | null;
  costBasisInrPaisa: string | null;
  taxableGainInrPaisa: string | null;
  vdaLossInrPaisa: string | null;
  matchedLots: DisposalMatch[];
  needsReview: boolean;
  reviewReasons: string[];
};

export type GasTreatment = {
  transactionId: string;
  txHash: string;
  gasFeeWei: string;
  valueInrPaisa: string | null;
  includedInCostBasis: false;
  deductedFromProceeds: false;
  needsReview: boolean;
  reason: string;
};

export type ReconciliationResult = {
  engineVersion: "0.1";
  method: "deterministic-rules-and-fifo";
  classifications: Classification[];
  remainingLots: ReconciledLot[];
  disposals: ReconciledDisposal[];
  gasTreatments: GasTreatment[];
  summary: {
    positiveTaxableGainsInrPaisa: string;
    vdaLossesInrPaisa: string;
    estimatedBaseTax30PercentInrPaisa: string;
    includeCess: boolean;
    estimatedCess4PercentInrPaisa: string | null;
    estimatedTaxIncludingCessInrPaisa: string;
    excludedTransactions: number;
    calculationStatus: "complete" | "partial";
    excludesSurcharge: true;
    excludesTdsCredit: true;
  };
  limitations: string[];
};

type ClassificationDecision = {
  category: Classification["category"];
  needsReview: boolean;
  reason: string;
};

type InternalLot = {
  lotId: string;
  asset: SupportedAsset;
  quantityAtomic: bigint;
  costBasisInrPaisa: bigint | null;
  acquiredAt: string;
  sourceTxHash: string;
  needsReview: boolean;
};

const ZERO = BigInt(0);
const ONE_HUNDRED = BigInt(100);

function sortTransactions(transactions: NormalizedTransaction[]) {
  return [...transactions].sort((left, right) => {
    const timestampOrder =
      Date.parse(left.timestamp) - Date.parse(right.timestamp);

    if (timestampOrder !== 0) {
      return timestampOrder;
    }

    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }

    return left.id.localeCompare(right.id);
  });
}

function positiveDeltas(transaction: NormalizedTransaction) {
  return transaction.assetDeltas.filter(
    (delta) => BigInt(delta.amountAtomic) > ZERO,
  );
}

function getAssetIssue(delta: AssetDelta) {
  const inspection = inspectSupportedAsset(delta);
  return inspection.supported ? null : inspection.reason;
}

function classifyTransaction(
  transaction: NormalizedTransaction,
  evidence: TransactionEvidence | undefined,
): ClassificationDecision {
  const deltas = positiveDeltas(transaction);

  if (transaction.status === "failed") {
    return {
      category: "unknown",
      needsReview: true,
      reason: "Failed transactions do not create or dispose tax lots.",
    };
  }

  const assetIssue = deltas.map(getAssetIssue).find(Boolean);

  if (assetIssue) {
    return {
      category: "unknown",
      needsReview: true,
      reason: assetIssue,
    };
  }

  if (evidence?.operationHint) {
    if (deltas.length > 0 || evidence.fiatFlow) {
      return {
        category: "unknown",
        needsReview: true,
        reason: "The operation hint conflicts with asset or fiat movement.",
      };
    }

    return {
      category: evidence.operationHint,
      needsReview: false,
      reason: `Explicit ${evidence.operationHint} operation evidence with no asset movement.`,
    };
  }

  const incoming = deltas.filter((delta) => delta.direction === "in");
  const outgoing = deltas.filter((delta) => delta.direction === "out");

  if (incoming.length === 0 && outgoing.length === 0) {
    return {
      category: "unknown",
      needsReview: true,
      reason: "No asset movement or explicit approval/gas operation evidence.",
    };
  }

  if (incoming.length === 1 && outgoing.length === 0) {
    if (evidence?.fiatFlow?.direction === "paid") {
      return {
        category: "buy",
        needsReview: false,
        reason: "One supported asset received with explicit INR paid evidence.",
      };
    }

    if (evidence?.fiatFlow) {
      return {
        category: "unknown",
        needsReview: true,
        reason: "Incoming asset conflicts with INR received evidence.",
      };
    }

    return {
      category: "transfer_in",
      needsReview: true,
      reason: "One supported asset received without acquisition-cost evidence.",
    };
  }

  if (incoming.length === 0 && outgoing.length === 1) {
    if (evidence?.fiatFlow?.direction === "received") {
      return {
        category: "sell",
        needsReview: false,
        reason: "One supported asset sent with explicit INR received evidence.",
      };
    }

    if (evidence?.fiatFlow) {
      return {
        category: "unknown",
        needsReview: true,
        reason: "Outgoing asset conflicts with INR paid evidence.",
      };
    }

    return {
      category: "transfer_out",
      needsReview: true,
      reason: "Destination ownership is unknown, so no taxable disposal is assumed.",
    };
  }

  if (
    incoming.length === 1 &&
    outgoing.length === 1 &&
    !evidence?.fiatFlow
  ) {
    const missingValuation =
      !findAssetValuation(evidence, incoming[0]) ||
      !findAssetValuation(evidence, outgoing[0]);

    return {
      category: "swap",
      needsReview: missingValuation,
      reason: missingValuation
        ? "Supported asset exchange has one or more missing INR valuations."
        : "One supported asset sent and one supported asset received with explicit valuations.",
    };
  }

  return {
    category: "unknown",
    needsReview: true,
    reason: "Asset movements do not match a supported deterministic rule.",
  };
}

function findAssetValuation(
  evidence: TransactionEvidence | undefined,
  delta: AssetDelta,
) {
  return evidence?.assetValuations.find(
    (valuation) =>
      valuation.assetId.toLowerCase() === delta.assetId.toLowerCase() &&
      valuation.direction === delta.direction,
  )?.amountInrPaisa;
}

function getSupportedAsset(delta: AssetDelta) {
  const inspection = inspectSupportedAsset(delta);
  return inspection.supported ? inspection.asset : null;
}

function createLot({
  transaction,
  delta,
  costBasisInrPaisa,
  lots,
}: {
  transaction: NormalizedTransaction;
  delta: AssetDelta;
  costBasisInrPaisa: string | null;
  lots: InternalLot[];
}) {
  const asset = getSupportedAsset(delta);

  if (!asset) {
    return;
  }

  lots.push({
    lotId: `${transaction.txHash}:${delta.assetId}:${lots.length}`,
    asset,
    quantityAtomic: BigInt(delta.amountAtomic),
    costBasisInrPaisa:
      costBasisInrPaisa === null ? null : BigInt(costBasisInrPaisa),
    acquiredAt: transaction.timestamp,
    sourceTxHash: transaction.txHash,
    needsReview: costBasisInrPaisa === null,
  });
}

function prorate(
  total: bigint,
  selectedQuantity: bigint,
  totalQuantity: bigint,
) {
  return (total * selectedQuantity) / totalQuantity;
}

function matchDisposal({
  transaction,
  delta,
  proceedsInrPaisa,
  lots,
}: {
  transaction: NormalizedTransaction;
  delta: AssetDelta;
  proceedsInrPaisa: string | null;
  lots: InternalLot[];
}): ReconciledDisposal {
  const reviewReasons: string[] = [];
  const matches: DisposalMatch[] = [];
  const asset = getSupportedAsset(delta);

  if (!asset) {
    return {
      transactionId: transaction.id,
      txHash: transaction.txHash,
      assetId: delta.assetId,
      symbol: delta.symbol,
      quantityAtomic: delta.amountAtomic,
      proceedsInrPaisa,
      costBasisInrPaisa: null,
      taxableGainInrPaisa: null,
      vdaLossInrPaisa: null,
      matchedLots: [],
      needsReview: true,
      reviewReasons: ["The disposed asset is outside the supported registry."],
    };
  }

  let remainingQuantity = BigInt(delta.amountAtomic);
  let knownCostBasis = ZERO;
  let hasUnknownCostBasis = false;

  for (const lot of lots) {
    if (
      lot.asset.assetId !== asset.assetId ||
      lot.quantityAtomic === ZERO ||
      remainingQuantity === ZERO
    ) {
      continue;
    }

    const quantityBeforeMatch = lot.quantityAtomic;
    const matchedQuantity =
      remainingQuantity < quantityBeforeMatch
        ? remainingQuantity
        : quantityBeforeMatch;
    const matchedCost =
      lot.costBasisInrPaisa === null
        ? null
        : prorate(
            lot.costBasisInrPaisa,
            matchedQuantity,
            quantityBeforeMatch,
          );

    matches.push({
      lotId: lot.lotId,
      quantityAtomic: matchedQuantity.toString(),
      costBasisInrPaisa: matchedCost?.toString() ?? null,
    });

    lot.quantityAtomic -= matchedQuantity;
    remainingQuantity -= matchedQuantity;

    if (lot.costBasisInrPaisa === null || matchedCost === null) {
      hasUnknownCostBasis = true;
    } else {
      lot.costBasisInrPaisa -= matchedCost;
      knownCostBasis += matchedCost;
    }
  }

  if (remainingQuantity > ZERO) {
    reviewReasons.push(
      `FIFO inventory is short by ${remainingQuantity.toString()} atomic units.`,
    );
  }

  if (hasUnknownCostBasis) {
    reviewReasons.push("One or more FIFO acquisition lots have no INR cost basis.");
  }

  if (proceedsInrPaisa === null) {
    reviewReasons.push("The disposal has no explicit INR valuation.");
  }

  const isComplete =
    reviewReasons.length === 0 && remainingQuantity === ZERO;

  if (!isComplete || proceedsInrPaisa === null) {
    return {
      transactionId: transaction.id,
      txHash: transaction.txHash,
      assetId: delta.assetId,
      symbol: delta.symbol,
      quantityAtomic: delta.amountAtomic,
      proceedsInrPaisa,
      costBasisInrPaisa: null,
      taxableGainInrPaisa: null,
      vdaLossInrPaisa: null,
      matchedLots: matches,
      needsReview: true,
      reviewReasons,
    };
  }

  const proceeds = BigInt(proceedsInrPaisa);
  const gain =
    proceeds > knownCostBasis ? proceeds - knownCostBasis : ZERO;
  const loss =
    knownCostBasis > proceeds ? knownCostBasis - proceeds : ZERO;

  return {
    transactionId: transaction.id,
    txHash: transaction.txHash,
    assetId: delta.assetId,
    symbol: delta.symbol,
    quantityAtomic: delta.amountAtomic,
    proceedsInrPaisa,
    costBasisInrPaisa: knownCostBasis.toString(),
    taxableGainInrPaisa: gain.toString(),
    vdaLossInrPaisa: loss.toString(),
    matchedLots: matches,
    needsReview: false,
    reviewReasons: [],
  };
}

function excludeReviewedSwapDisposal(
  disposal: ReconciledDisposal,
  classification: Classification,
): ReconciledDisposal {
  if (!classification.needsReview || disposal.needsReview) {
    return disposal;
  }

  return {
    ...disposal,
    taxableGainInrPaisa: null,
    vdaLossInrPaisa: null,
    needsReview: true,
    reviewReasons: [
      ...disposal.reviewReasons,
      "The overall swap has incomplete valuation evidence.",
    ],
  };
}

function serializeLots(lots: InternalLot[]): ReconciledLot[] {
  return lots
    .filter((lot) => lot.quantityAtomic > ZERO)
    .map((lot) => ({
      lotId: lot.lotId,
      assetId: lot.asset.assetId,
      symbol: lot.asset.symbol,
      decimals: lot.asset.decimals,
      quantityAtomic: lot.quantityAtomic.toString(),
      acquiredAt: lot.acquiredAt,
      costBasisInrPaisa: lot.costBasisInrPaisa?.toString() ?? null,
      sourceTxHash: lot.sourceTxHash,
      needsReview: lot.needsReview,
    }));
}

function makeClassification(
  transaction: NormalizedTransaction,
  decision: ClassificationDecision,
) {
  return ClassificationSchema.parse({
    transactionId: transaction.id,
    category: decision.category,
    confidence: decision.needsReview ? 0.5 : 1,
    reason: decision.reason,
    evidenceTxHashes: [transaction.txHash],
    needsReview: decision.needsReview,
    source: "rule",
  });
}

export function reconcileTransactions(
  rawInput: ReconciliationInput,
): ReconciliationResult {
  const input = ReconciliationInputSchema.parse(rawInput);
  const transactions = sortTransactions(input.transactions);
  const evidenceByHash = new Map(
    input.evidence.map((evidence) => [
      evidence.txHash.toLowerCase(),
      evidence,
    ]),
  );
  const classifications: Classification[] = [];
  const disposals: ReconciledDisposal[] = [];
  const gasTreatments: GasTreatment[] = [];
  const lots: InternalLot[] = [];

  for (const transaction of transactions) {
    const evidence = evidenceByHash.get(transaction.txHash.toLowerCase());
    const decision = classifyTransaction(transaction, evidence);
    const classification = makeClassification(transaction, decision);
    const deltas = positiveDeltas(transaction);

    classifications.push(classification);

    if (BigInt(transaction.gasFeeWei) > ZERO) {
      gasTreatments.push({
        transactionId: transaction.id,
        txHash: transaction.txHash,
        gasFeeWei: transaction.gasFeeWei,
        valueInrPaisa: evidence?.gasValueInrPaisa ?? null,
        includedInCostBasis: false,
        deductedFromProceeds: false,
        needsReview: !evidence?.gasValueInrPaisa,
        reason:
          "Gas is reported separately and is not included in basis or proceeds by this preview.",
      });
    }

    if (transaction.status === "failed") {
      continue;
    }

    if (classification.category === "buy") {
      const incoming = deltas.find((delta) => delta.direction === "in");

      if (incoming) {
        createLot({
          transaction,
          delta: incoming,
          costBasisInrPaisa:
            evidence?.fiatFlow?.direction === "paid"
              ? evidence.fiatFlow.amountInrPaisa
              : null,
          lots,
        });
      }
    }

    if (classification.category === "transfer_in") {
      const incoming = deltas.find((delta) => delta.direction === "in");

      if (incoming) {
        createLot({
          transaction,
          delta: incoming,
          costBasisInrPaisa: null,
          lots,
        });
      }
    }

    if (classification.category === "sell") {
      const outgoing = deltas.find((delta) => delta.direction === "out");

      if (outgoing) {
        disposals.push(
          matchDisposal({
            transaction,
            delta: outgoing,
            proceedsInrPaisa:
              evidence?.fiatFlow?.direction === "received"
                ? evidence.fiatFlow.amountInrPaisa
                : null,
            lots,
          }),
        );
      }
    }

    if (classification.category === "swap") {
      const outgoing = deltas.find((delta) => delta.direction === "out");
      const incoming = deltas.find((delta) => delta.direction === "in");

      if (outgoing) {
        const disposal = matchDisposal({
            transaction,
            delta: outgoing,
            proceedsInrPaisa:
              findAssetValuation(evidence, outgoing) ?? null,
              lots,
            });

        disposals.push(
          excludeReviewedSwapDisposal(disposal, classification),
        );
      }

      if (incoming) {
        createLot({
          transaction,
          delta: incoming,
          costBasisInrPaisa:
            findAssetValuation(evidence, incoming) ?? null,
          lots,
        });
      }
    }
  }

  let positiveGains = ZERO;
  let losses = ZERO;

  for (const disposal of disposals) {
    if (disposal.needsReview) {
      continue;
    }

    positiveGains += BigInt(disposal.taxableGainInrPaisa ?? "0");
    losses += BigInt(disposal.vdaLossInrPaisa ?? "0");
  }

  const baseTax = (positiveGains * BigInt(30)) / ONE_HUNDRED;
  const cess = input.includeCess
    ? (baseTax * BigInt(4)) / ONE_HUNDRED
    : ZERO;
  const excludedTransactionIds = new Set(
    classifications
      .filter((classification) => classification.needsReview)
      .map((classification) => classification.transactionId),
  );

  for (const disposal of disposals) {
    if (disposal.needsReview) {
      excludedTransactionIds.add(disposal.transactionId);
    }
  }

  return {
    engineVersion: "0.1",
    method: "deterministic-rules-and-fifo",
    classifications,
    remainingLots: serializeLots(lots),
    disposals,
    gasTreatments,
    summary: {
      positiveTaxableGainsInrPaisa: positiveGains.toString(),
      vdaLossesInrPaisa: losses.toString(),
      estimatedBaseTax30PercentInrPaisa: baseTax.toString(),
      includeCess: input.includeCess,
      estimatedCess4PercentInrPaisa: input.includeCess
        ? cess.toString()
        : null,
      estimatedTaxIncludingCessInrPaisa: (baseTax + cess).toString(),
      excludedTransactions: excludedTransactionIds.size,
      calculationStatus:
        excludedTransactionIds.size === 0 ? "complete" : "partial",
      excludesSurcharge: true,
      excludesTdsCredit: true,
    },
    limitations: [
      "This deterministic preview is not tax advice or an ITR filing service.",
      "Only registered Ethereum-mainnet ETH, WETH, USDC, and USDT are calculated.",
      "Positive VDA gains and VDA losses are shown separately and are not netted.",
      "The 30% base-tax estimate optionally adds 4% cess; surcharge and TDS credit are excluded.",
      "Gas is reported separately and is not included in cost basis or deducted from proceeds.",
      "Missing basis, missing valuation, unsupported assets, and ambiguous movements require review.",
    ],
  };
}

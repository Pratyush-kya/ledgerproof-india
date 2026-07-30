import { z } from "zod";

import {
  inspectSupportedAsset,
  type SupportedAsset,
} from "@/lib/asset-registry";
import {
  CalculationPeriodSchema,
  ClassificationSchema,
  NormalizedTransactionSchema,
  OpeningLotSchema,
  TransactionEvidenceSchema,
  type CalculationStatus,
  type CalculationPeriod,
  type Classification,
  type ExcludedAssetMovement,
  type NormalizedTransaction,
  type OpeningLot,
  type TransactionEvidence,
} from "@/lib/schemas";

export const ReconciliationInputSchema = z
  .object({
    transactions: z.array(NormalizedTransactionSchema),
    evidence: z.array(TransactionEvidenceSchema).default([]),
    openingLots: z.array(OpeningLotSchema).default([]),
    calculationPeriod: CalculationPeriodSchema.optional(),
    historyComplete: z.boolean().default(false),
    includeCess: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    const transactionHashes = new Set(
      input.transactions.map((transaction) => transaction.txHash.toLowerCase()),
    );
    const evidenceHashes = new Set<string>();
    const openingLotIds = new Set<string>();

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

    for (const [index, lot] of input.openingLots.entries()) {
      if (openingLotIds.has(lot.lotId)) {
        context.addIssue({
          code: "custom",
          path: ["openingLots", index, "lotId"],
          message: "Opening-lot identifiers must be unique.",
        });
      }
      openingLotIds.add(lot.lotId);

      const inspection = inspectSupportedAsset({
        assetId: lot.assetId,
        symbol: lot.symbol,
        decimals: lot.decimals,
        standard: lot.standard,
        amountAtomic: lot.quantityAtomic,
        direction: "in",
      });
      if (!inspection.supported) {
        context.addIssue({
          code: "custom",
          path: ["openingLots", index],
          message: inspection.reason,
        });
      }
    }
  });

type ReconciliationInput = z.input<typeof ReconciliationInputSchema>;
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
  engineVersion: "0.2";
  method: "deterministic-rules-and-fifo";
  classifications: Classification[];
  remainingLots: ReconciledLot[];
  disposals: ReconciledDisposal[];
  gasTreatments: GasTreatment[];
  quarantinedAssets: ExcludedAssetMovement[];
  unsupportedAssetsRequiringReview: ExcludedAssetMovement[];
  summary: {
    positiveTaxableGainsInrPaisa: string;
    vdaLossesInrPaisa: string;
    estimatedBaseTax30PercentInrPaisa: string;
    includeCess: boolean;
    estimatedCess4PercentInrPaisa: string | null;
    estimatedTaxIncludingCessInrPaisa: string;
    calculatedDisposals: number;
    excludedTransactions: number;
    supportedAssetMovements: number;
    needsUserEvidence: number;
    quarantinedAssetMovements: number;
    unsafeUnsupportedAssetMovements: number;
    historyComplete: boolean;
    calculationPeriod: CalculationPeriod | null;
    calculationStatus: CalculationStatus;
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

type DeltaPartition = {
  supported: AssetDelta[];
  quarantined: AssetDelta[];
  unsafeUnsupported: AssetDelta[];
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

function partitionDeltas(transaction: NormalizedTransaction): DeltaPartition {
  const deltas = positiveDeltas(transaction);
  const supported: AssetDelta[] = [];
  const unsupported: AssetDelta[] = [];

  for (const delta of deltas) {
    if (inspectSupportedAsset(delta).supported) {
      supported.push(delta);
    } else {
      unsupported.push(delta);
    }
  }

  const hasWalletOutflow = deltas.some((delta) => delta.direction === "out");
  const quarantined = unsupported.filter(
    (delta) => delta.direction === "in" && !hasWalletOutflow,
  );
  const quarantinedSet = new Set(quarantined);

  return {
    supported,
    quarantined,
    unsafeUnsupported: unsupported.filter(
      (delta) => !quarantinedSet.has(delta),
    ),
  };
}

function classifyTransaction(
  transaction: NormalizedTransaction,
  evidence: TransactionEvidence | undefined,
  partition: DeltaPartition,
): ClassificationDecision {
  const deltas = partition.supported;

  if (transaction.status === "failed") {
    return {
      category: "unknown",
      needsReview: true,
      reason: "Failed transactions do not create or dispose tax lots.",
    };
  }

  if (partition.unsafeUnsupported.length > 0) {
    const unsafe = partition.unsafeUnsupported[0];
    return {
      category: "unknown",
      needsReview: true,
      reason:
        `${unsafe.symbol} is unsupported and cannot be safely quarantined ` +
        "because the wallet also has an outflow in this transaction.",
    };
  }

  if (evidence?.resolution === "gift_reward_airdrop") {
    return {
      category: "unknown",
      needsReview: false,
      reason:
        "The user identified gift, reward, or airdrop treatment; this preview keeps it excluded from automatic tax figures.",
    };
  }

  if (evidence?.resolution === "unknown") {
    return {
      category: "unknown",
      needsReview: false,
      reason: "The user kept this transaction excluded as unknown.",
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
      reason: `Explicit ${evidence.operationHint} operation evidence with no supported asset movement.`,
    };
  }

  const incoming = deltas.filter((delta) => delta.direction === "in");
  const outgoing = deltas.filter((delta) => delta.direction === "out");

  if (incoming.length === 0 && outgoing.length === 0) {
    if (partition.quarantined.length > 0) {
      return {
        category: "unknown",
        needsReview: false,
        reason: `${partition.quarantined.length} unsupported inbound token movement(s) quarantined without affecting tax calculations.`,
      };
    }

    return {
      category: "unknown",
      needsReview: true,
      reason: "No supported asset movement or explicit approval/gas evidence.",
    };
  }

  if (incoming.length === 1 && outgoing.length === 0) {
    if (
      evidence?.resolution === "bought_for_inr" ||
      evidence?.fiatFlow?.direction === "paid"
    ) {
      return {
        category: "buy",
        needsReview: false,
        reason: "One supported asset received with explicit INR-paid evidence.",
      };
    }

    if (evidence?.resolution === "self_transfer") {
      return {
        category: "transfer_in",
        needsReview: evidence.carriedCostBasisInrPaisa === undefined,
        reason:
          evidence.carriedCostBasisInrPaisa === undefined
            ? "Self-transfer confirmed, but the carried INR cost basis is missing."
            : "Inbound self-transfer confirmed with carried INR cost basis.",
      };
    }

    if (evidence?.fiatFlow) {
      return {
        category: "unknown",
        needsReview: true,
        reason: "Incoming asset conflicts with INR-received evidence.",
      };
    }

    return {
      category: "transfer_in",
      needsReview: true,
      reason: "One supported asset received without acquisition-cost evidence.",
    };
  }

  if (incoming.length === 0 && outgoing.length === 1) {
    if (
      evidence?.resolution === "sold_for_inr" ||
      evidence?.fiatFlow?.direction === "received"
    ) {
      return {
        category: "sell",
        needsReview: false,
        reason: "One supported asset sent with explicit INR-received evidence.",
      };
    }

    if (evidence?.resolution === "self_transfer") {
      return {
        category: "transfer_out",
        needsReview: false,
        reason: "Outbound self-transfer confirmed as non-disposal movement.",
      };
    }

    if (evidence?.fiatFlow) {
      return {
        category: "unknown",
        needsReview: true,
        reason: "Outgoing asset conflicts with INR-paid evidence.",
      };
    }

    return {
      category: "transfer_out",
      needsReview: true,
      reason:
        "Destination ownership is unknown, so no taxable disposal is assumed.",
    };
  }

  if (
    incoming.length === 1 &&
    outgoing.length === 1 &&
    !evidence?.fiatFlow &&
    evidence?.resolution !== "self_transfer"
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

function openingLotToInternal(lot: OpeningLot): InternalLot {
  const inspection = inspectSupportedAsset({
    assetId: lot.assetId,
    symbol: lot.symbol,
    decimals: lot.decimals,
    standard: lot.standard,
    amountAtomic: lot.quantityAtomic,
    direction: "in",
  });

  if (!inspection.supported) {
    throw new Error(inspection.reason);
  }

  return {
    lotId: lot.lotId,
    asset: inspection.asset,
    quantityAtomic: BigInt(lot.quantityAtomic),
    costBasisInrPaisa: BigInt(lot.costBasisInrPaisa),
    acquiredAt: lot.acquiredAt,
    sourceTxHash: lot.sourceTxHash,
    needsReview: false,
  };
}

function prorate(
  total: bigint,
  selectedQuantity: bigint,
  totalQuantity: bigint,
) {
  return (total * selectedQuantity) / totalQuantity;
}

function availableLotsFor(
  lots: InternalLot[],
  asset: SupportedAsset,
  timestamp: string,
) {
  const cutoff = Date.parse(timestamp);
  return lots
    .filter(
      (lot) =>
        lot.asset.assetId === asset.assetId &&
        lot.quantityAtomic > ZERO &&
        Date.parse(lot.acquiredAt) <= cutoff,
    )
    .sort((left, right) => {
      const timestampOrder =
        Date.parse(left.acquiredAt) - Date.parse(right.acquiredAt);
      return timestampOrder || left.lotId.localeCompare(right.lotId);
    });
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

  for (const lot of availableLotsFor(lots, asset, transaction.timestamp)) {
    if (remainingQuantity === ZERO) {
      break;
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

  if (reviewReasons.length > 0 || proceedsInrPaisa === null) {
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
  const gain = proceeds > knownCostBasis ? proceeds - knownCostBasis : ZERO;
  const loss = knownCostBasis > proceeds ? knownCostBasis - proceeds : ZERO;

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

function consumeSelfTransfer({
  transaction,
  delta,
  lots,
}: {
  transaction: NormalizedTransaction;
  delta: AssetDelta;
  lots: InternalLot[];
}) {
  const asset = getSupportedAsset(delta);
  if (!asset) {
    return "The self-transfer asset is unsupported.";
  }

  let remainingQuantity = BigInt(delta.amountAtomic);
  for (const lot of availableLotsFor(lots, asset, transaction.timestamp)) {
    if (remainingQuantity === ZERO) {
      break;
    }
    const moved =
      remainingQuantity < lot.quantityAtomic
        ? remainingQuantity
        : lot.quantityAtomic;
    lot.quantityAtomic -= moved;
    remainingQuantity -= moved;
    if (lot.costBasisInrPaisa !== null) {
      lot.costBasisInrPaisa -= prorate(
        lot.costBasisInrPaisa,
        moved,
        lot.quantityAtomic + moved,
      );
    }
  }

  return remainingQuantity > ZERO
    ? `Self-transfer inventory is short by ${remainingQuantity.toString()} atomic units.`
    : null;
}

function serializeLots(lots: InternalLot[]): ReconciledLot[] {
  return lots
    .filter((lot) => lot.quantityAtomic > ZERO)
    .sort((left, right) => {
      const timestampOrder =
        Date.parse(left.acquiredAt) - Date.parse(right.acquiredAt);
      return timestampOrder || left.lotId.localeCompare(right.lotId);
    })
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
  evidence: TransactionEvidence | undefined,
) {
  return ClassificationSchema.parse({
    transactionId: transaction.id,
    category: decision.category,
    confidence: decision.needsReview ? 0.5 : 1,
    reason: decision.reason,
    evidenceTxHashes: [transaction.txHash],
    needsReview: decision.needsReview,
    source: evidence?.resolution ? "user" : "rule",
  });
}

function excludedMovement(
  transaction: NormalizedTransaction,
  delta: AssetDelta,
  reason: string,
): ExcludedAssetMovement {
  return {
    transactionId: transaction.id,
    txHash: transaction.txHash,
    assetId: delta.assetId,
    symbol: delta.symbol,
    decimals: delta.decimals,
    amountAtomic: delta.amountAtomic,
    direction: delta.direction,
    reason,
  };
}

function isInCalculationPeriod(
  timestamp: string,
  period: CalculationPeriod | undefined,
) {
  if (!period) {
    return true;
  }
  const value = Date.parse(timestamp);
  return (
    value >= Date.parse(period.start) &&
    value < Date.parse(period.endExclusive)
  );
}

function calculationStatus({
  disposals,
  calculatedDisposals,
  positiveGains,
  losses,
  historyComplete,
  hasExcludedOrUnresolvedSupportedOutflow,
}: {
  disposals: ReconciledDisposal[];
  calculatedDisposals: number;
  positiveGains: bigint;
  losses: bigint;
  historyComplete: boolean;
  hasExcludedOrUnresolvedSupportedOutflow: boolean;
}): CalculationStatus {
  if (disposals.length === 0) {
    return hasExcludedOrUnresolvedSupportedOutflow
      ? "partial"
      : "no_supported_disposals";
  }

  const unresolved = disposals.filter((disposal) => disposal.needsReview);
  if (unresolved.length > 0 && calculatedDisposals > 0) {
    return "partial";
  }

  if (unresolved.length > 0) {
    const reasons = unresolved.flatMap((disposal) => disposal.reviewReasons);
    const missingBasis = reasons.some(
      (reason) =>
        reason.toLowerCase().includes("cost basis") ||
        reason.toLowerCase().includes("inventory is short"),
    );
    return missingBasis
      ? "blocked_missing_basis"
      : "blocked_missing_valuation";
  }

  if (!historyComplete) {
    return "partial";
  }

  return positiveGains === ZERO && losses === ZERO
    ? "complete_zero"
    : "complete";
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
  const quarantinedAssets: ExcludedAssetMovement[] = [];
  const unsupportedAssetsRequiringReview: ExcludedAssetMovement[] = [];
  const lots = input.openingLots.map(openingLotToInternal);
  let supportedAssetMovements = 0;
  let priorPeriodUnresolved = false;
  let hasExcludedOrUnresolvedSupportedOutflow = false;

  for (const transaction of transactions) {
    const evidence = evidenceByHash.get(transaction.txHash.toLowerCase());
    const partition = partitionDeltas(transaction);
    supportedAssetMovements += partition.supported.length;

    for (const delta of partition.quarantined) {
      quarantinedAssets.push(
        excludedMovement(
          transaction,
          delta,
          "Unsupported inbound token quarantined; it has no wallet outflow and does not affect supported-asset calculations.",
        ),
      );
    }
    for (const delta of partition.unsafeUnsupported) {
      unsupportedAssetsRequiringReview.push(
        excludedMovement(
          transaction,
          delta,
          "Unsupported movement requires review because it cannot be isolated from a wallet outflow.",
        ),
      );
    }

    const decision = classifyTransaction(transaction, evidence, partition);
    let classification = makeClassification(transaction, decision, evidence);
    const inCalculationPeriod = isInCalculationPeriod(
      transaction.timestamp,
      input.calculationPeriod,
    );

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

    if (transaction.status === "confirmed") {
      const incoming = partition.supported.find(
        (delta) => delta.direction === "in",
      );
      const outgoing = partition.supported.find(
        (delta) => delta.direction === "out",
      );

      if (classification.category === "buy" && incoming) {
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

      if (classification.category === "transfer_in" && incoming) {
        createLot({
          transaction,
          delta: incoming,
          costBasisInrPaisa:
            evidence?.resolution === "self_transfer"
              ? evidence.carriedCostBasisInrPaisa ?? null
              : null,
          lots,
        });
      }

      if (
        classification.category === "transfer_out" &&
        outgoing &&
        evidence?.resolution === "self_transfer"
      ) {
        const transferIssue = consumeSelfTransfer({
          transaction,
          delta: outgoing,
          lots,
        });
        if (transferIssue) {
          classification = ClassificationSchema.parse({
            ...classification,
            confidence: 0.5,
            needsReview: true,
            reason: transferIssue,
          });
        }
      }

      if (classification.category === "sell" && outgoing) {
        const disposal = matchDisposal({
          transaction,
          delta: outgoing,
          proceedsInrPaisa:
            evidence?.fiatFlow?.direction === "received"
              ? evidence.fiatFlow.amountInrPaisa
              : null,
          lots,
        });
        if (inCalculationPeriod) {
          disposals.push(disposal);
        } else if (disposal.needsReview) {
          priorPeriodUnresolved = true;
        }
      }

      if (classification.category === "swap" && incoming && outgoing) {
        const disposal = matchDisposal({
          transaction,
          delta: outgoing,
          proceedsInrPaisa:
            findAssetValuation(evidence, outgoing) ?? null,
          lots,
        });
        if (inCalculationPeriod) {
          disposals.push(disposal);
        } else if (disposal.needsReview) {
          priorPeriodUnresolved = true;
        }
        createLot({
          transaction,
          delta: incoming,
          costBasisInrPaisa:
            findAssetValuation(evidence, incoming) ?? null,
          lots,
        });
      }
    }

    if (
      inCalculationPeriod &&
      partition.supported.some((delta) => delta.direction === "out") &&
      (classification.needsReview || classification.category === "unknown")
    ) {
      hasExcludedOrUnresolvedSupportedOutflow = true;
    }

    classifications.push(classification);
  }

  let positiveGains = ZERO;
  let losses = ZERO;
  let calculatedDisposals = 0;

  for (const disposal of disposals) {
    if (disposal.needsReview) {
      continue;
    }
    calculatedDisposals += 1;
    positiveGains += BigInt(disposal.taxableGainInrPaisa ?? "0");
    losses += BigInt(disposal.vdaLossInrPaisa ?? "0");
  }

  const baseTax = (positiveGains * BigInt(30)) / ONE_HUNDRED;
  const cess = input.includeCess
    ? (baseTax * BigInt(4)) / ONE_HUNDRED
    : ZERO;
  const effectiveHistoryComplete =
    input.historyComplete && !priorPeriodUnresolved;
  const excludedTransactionIds = new Set(
    classifications
      .filter(
        (classification) =>
          classification.needsReview ||
          (classification.category === "unknown" &&
            classification.source === "user"),
      )
      .map((classification) => classification.transactionId),
  );

  for (const disposal of disposals) {
    if (disposal.needsReview) {
      excludedTransactionIds.add(disposal.transactionId);
    }
  }

  return {
    engineVersion: "0.2",
    method: "deterministic-rules-and-fifo",
    classifications,
    remainingLots: serializeLots(lots),
    disposals,
    gasTreatments,
    quarantinedAssets,
    unsupportedAssetsRequiringReview,
    summary: {
      positiveTaxableGainsInrPaisa: positiveGains.toString(),
      vdaLossesInrPaisa: losses.toString(),
      estimatedBaseTax30PercentInrPaisa: baseTax.toString(),
      includeCess: input.includeCess,
      estimatedCess4PercentInrPaisa: input.includeCess
        ? cess.toString()
        : null,
      estimatedTaxIncludingCessInrPaisa: (baseTax + cess).toString(),
      calculatedDisposals,
      excludedTransactions: excludedTransactionIds.size,
      supportedAssetMovements,
      needsUserEvidence: classifications.filter(
        (classification) => classification.needsReview,
      ).length,
      quarantinedAssetMovements: quarantinedAssets.length,
      unsafeUnsupportedAssetMovements:
        unsupportedAssetsRequiringReview.length,
      historyComplete: effectiveHistoryComplete,
      calculationPeriod: input.calculationPeriod ?? null,
      calculationStatus: calculationStatus({
        disposals,
        calculatedDisposals,
        positiveGains,
        losses,
        historyComplete: effectiveHistoryComplete,
        hasExcludedOrUnresolvedSupportedOutflow,
      }),
      excludesSurcharge: true,
      excludesTdsCredit: true,
    },
    limitations: [
      "This deterministic preview is not tax advice or an ITR filing service.",
      "Only registered Ethereum-mainnet ETH, WETH, USDC, and USDT are calculated.",
      "Unsupported inbound tokens are quarantined only when no wallet outflow makes that isolation unsafe.",
      "Positive VDA gains and VDA losses are shown separately and are not netted.",
      "The 30% base-tax estimate optionally adds 4% cess; surcharge and TDS credit are excluded.",
      "Gas is reported separately and is not included in cost basis or deducted from proceeds.",
      "FIFO is an explicit accounting assumption in this preview, not a claim that Indian law mandates FIFO.",
      "Missing basis, missing valuation, incomplete history, and ambiguous movements require review.",
    ],
  };
}

import { describe, expect, it } from "vitest";

import fixture from "./fixtures/day-03-reconciliation.json";
import {
  SUPPORTED_ASSET_REGISTRY,
  type SupportedAsset,
} from "../src/lib/asset-registry";
import {
  ReconciliationInputSchema,
  reconcileTransactions,
} from "../src/lib/reconciliation";
import type { NormalizedTransaction } from "../src/lib/schemas";

type FixtureDelta = {
  asset: keyof typeof SUPPORTED_ASSET_REGISTRY | "UNKNOWN";
  assetId?: string;
  symbol?: string;
  decimals?: number;
  standard?: "native" | "erc20";
  direction: "in" | "out";
  amountAtomic: string;
};

type FixtureEvent = {
  id: string;
  day: number;
  status?: "confirmed" | "failed";
  deltas: FixtureDelta[];
  fiatFlow?: {
    direction: "paid" | "received";
    amountInrPaisa: string;
  };
  assetValuations?: Array<{
    asset: keyof typeof SUPPORTED_ASSET_REGISTRY;
    direction: "in" | "out";
    amountInrPaisa: string;
  }>;
  operationHint?: "approval" | "gas";
  gasFeeWei?: string;
  gasValueInrPaisa?: string;
};

type FixtureExpected = {
  categories: string[];
  categoryNeedsReview?: boolean[];
  positiveTaxableGainsInrPaisa: string;
  vdaLossesInrPaisa: string;
  estimatedBaseTax30PercentInrPaisa: string;
  estimatedCess4PercentInrPaisa: string | null;
  estimatedTaxIncludingCessInrPaisa: string;
  excludedTransactions: number;
  remainingLot?: {
    symbol: string;
    quantityAtomic: string;
    costBasisInrPaisa: string | null;
  };
  disposal?: {
    costBasisInrPaisa: string | null;
    taxableGainInrPaisa: string | null;
    vdaLossInrPaisa: string | null;
    needsReview: boolean;
    matchedLotCount?: number;
  };
  gas?: {
    valueInrPaisa: string | null;
    includedInCostBasis: boolean;
    deductedFromProceeds: boolean;
    needsReview: boolean;
  };
};

type FixtureCase = {
  name: string;
  includeCess: boolean;
  events: FixtureEvent[];
  expected: FixtureExpected;
};

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const COUNTERPARTY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function hashFor(index: number) {
  return `0x${(index + 1).toString(16).padStart(64, "0")}`;
}

function resolveAsset(delta: FixtureDelta): SupportedAsset | FixtureDelta {
  if (delta.asset === "UNKNOWN") {
    return delta;
  }

  return SUPPORTED_ASSET_REGISTRY[delta.asset];
}

function buildTransaction(
  event: FixtureEvent,
  index: number,
): NormalizedTransaction {
  const txHash = hashFor(index);
  const hasOutgoing = event.deltas.some((delta) => delta.direction === "out");

  return {
    id: event.id,
    txHash,
    chainId: 1,
    blockNumber: event.day,
    timestamp: `2026-04-${event.day.toString().padStart(2, "0")}T00:00:00.000Z`,
    from: hasOutgoing ? WALLET : COUNTERPARTY,
    to: hasOutgoing ? COUNTERPARTY : WALLET,
    explorerUrl: `https://etherscan.io/tx/${txHash}`,
    status: event.status ?? "confirmed",
    assetDeltas: event.deltas.map((delta) => {
      const asset = resolveAsset(delta);
      const registeredAsset = delta.asset === "UNKNOWN" ? null : asset;

      return {
        assetId:
          delta.assetId ??
          registeredAsset?.assetId ??
          "eip155:1/erc20:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        symbol: delta.symbol ?? registeredAsset?.symbol ?? "UNKNOWN",
        decimals: delta.decimals ?? registeredAsset?.decimals ?? 18,
        standard: delta.standard ?? registeredAsset?.standard ?? "erc20",
        direction: delta.direction,
        amountAtomic: delta.amountAtomic,
      };
    }),
    gasFeeWei: event.gasFeeWei ?? "0",
  };
}

function buildInput(testCase: FixtureCase) {
  const transactions = testCase.events.map(buildTransaction);

  return {
    transactions,
    includeCess: testCase.includeCess,
    evidence: testCase.events.flatMap((event, index) => {
      const hasEvidence =
        event.fiatFlow ||
        event.assetValuations ||
        event.operationHint ||
        event.gasValueInrPaisa;

      if (!hasEvidence) {
        return [];
      }

      return [
        {
          txHash: hashFor(index),
          fiatFlow: event.fiatFlow,
          operationHint: event.operationHint,
          gasValueInrPaisa: event.gasValueInrPaisa,
          assetValuations: (event.assetValuations ?? []).map((valuation) => ({
            assetId: SUPPORTED_ASSET_REGISTRY[valuation.asset].assetId,
            direction: valuation.direction,
            amountInrPaisa: valuation.amountInrPaisa,
          })),
        },
      ];
    }),
  };
}

describe("deterministic reconciliation fixtures", () => {
  it.each(fixture.cases as FixtureCase[])("$name", (testCase) => {
    const result = reconcileTransactions(buildInput(testCase));
    const expected = testCase.expected;

    expect(result.classifications.map((item) => item.category)).toEqual(
      expected.categories,
    );

    if (expected.categoryNeedsReview) {
      expect(result.classifications.map((item) => item.needsReview)).toEqual(
        expected.categoryNeedsReview,
      );
    }

    expect(result.summary).toMatchObject({
      positiveTaxableGainsInrPaisa:
        expected.positiveTaxableGainsInrPaisa,
      vdaLossesInrPaisa: expected.vdaLossesInrPaisa,
      estimatedBaseTax30PercentInrPaisa:
        expected.estimatedBaseTax30PercentInrPaisa,
      estimatedCess4PercentInrPaisa:
        expected.estimatedCess4PercentInrPaisa,
      estimatedTaxIncludingCessInrPaisa:
        expected.estimatedTaxIncludingCessInrPaisa,
      excludedTransactions: expected.excludedTransactions,
    });

    if (expected.remainingLot) {
      expect(
        result.remainingLots.find(
          (lot) => lot.symbol === expected.remainingLot?.symbol,
        ),
      ).toMatchObject(expected.remainingLot);
    }

    if (expected.disposal) {
      expect(result.disposals[0]).toMatchObject({
        costBasisInrPaisa: expected.disposal.costBasisInrPaisa,
        taxableGainInrPaisa: expected.disposal.taxableGainInrPaisa,
        vdaLossInrPaisa: expected.disposal.vdaLossInrPaisa,
        needsReview: expected.disposal.needsReview,
      });

      if (expected.disposal.matchedLotCount !== undefined) {
        expect(result.disposals[0].matchedLots).toHaveLength(
          expected.disposal.matchedLotCount,
        );
      }
    }

    if (expected.gas) {
      expect(result.gasTreatments[0]).toMatchObject(expected.gas);
    }
  });

  it("covers every initially supported asset with exact decimals", () => {
    expect(
      Object.values(SUPPORTED_ASSET_REGISTRY).map(
        ({ symbol, decimals }) => `${symbol}:${decimals}`,
      ),
    ).toEqual(["ETH:18", "WETH:18", "USDC:6", "USDT:6"]);
  });

  it("is deterministic even when input transactions are unsorted", () => {
    const testCase = (fixture.cases as FixtureCase[]).find(
      (item) => item.name === "matches multiple acquisition lots by FIFO",
    );

    expect(testCase).toBeDefined();

    const input = buildInput(testCase!);
    const forward = reconcileTransactions(input);
    const reversed = reconcileTransactions({
      ...input,
      transactions: [...input.transactions].reverse(),
    });

    expect(reversed).toEqual(forward);
  });

  it("rejects duplicate valuation evidence rather than selecting one", () => {
    const testCase = (fixture.cases as FixtureCase[])[0];
    const input = buildInput(testCase);
    const txHash = input.transactions[0].txHash;
    const assetId = SUPPORTED_ASSET_REGISTRY.ETH.assetId;

    expect(() =>
      ReconciliationInputSchema.parse({
        transactions: input.transactions,
        evidence: [
          {
            txHash,
            assetValuations: [
              { assetId, direction: "in", amountInrPaisa: "1" },
              { assetId, direction: "in", amountInrPaisa: "2" },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("does not create lots or disposals for failed transactions", () => {
    const event: FixtureEvent = {
      id: "failed-buy",
      day: 1,
      status: "failed",
      deltas: [
        {
          asset: "ETH",
          direction: "in",
          amountAtomic: "1000000000000000000",
        },
      ],
      fiatFlow: { direction: "paid", amountInrPaisa: "100000" },
      gasFeeWei: "100",
      gasValueInrPaisa: "10",
    };

    const result = reconcileTransactions(
      buildInput({
        name: "failed",
        includeCess: false,
        events: [event],
        expected: {
          categories: ["unknown"],
          positiveTaxableGainsInrPaisa: "0",
          vdaLossesInrPaisa: "0",
          estimatedBaseTax30PercentInrPaisa: "0",
          estimatedCess4PercentInrPaisa: null,
          estimatedTaxIncludingCessInrPaisa: "0",
          excludedTransactions: 1,
        },
      }),
    );

    expect(result.classifications[0]).toMatchObject({
      category: "unknown",
      needsReview: true,
    });
    expect(result.remainingLots).toEqual([]);
    expect(result.disposals).toEqual([]);
    expect(result.gasTreatments).toHaveLength(1);
  });

  it("quarantines unsupported inbound spam without losing a supported ETH purchase", () => {
    const transaction = buildTransaction(
      {
        id: "eth-buy-with-spam",
        day: 1,
        deltas: [
          {
            asset: "ETH",
            direction: "in",
            amountAtomic: "1000000000000000000",
          },
          {
            asset: "UNKNOWN",
            assetId:
              "eip155:1/erc20:0x1111111111111111111111111111111111111111",
            symbol: "VITALIK",
            decimals: 18,
            standard: "erc20",
            direction: "in",
            amountAtomic: "999000000000000000000",
          },
        ],
      },
      0,
    );

    const result = reconcileTransactions({
      transactions: [transaction],
      evidence: [
        {
          txHash: transaction.txHash,
          resolution: "bought_for_inr",
          fiatFlow: {
            direction: "paid",
            amountInrPaisa: "100000",
          },
          assetValuations: [],
        },
      ],
      historyComplete: true,
    });

    expect(result.classifications[0]).toMatchObject({
      category: "buy",
      needsReview: false,
      source: "user",
    });
    expect(result.remainingLots[0]).toMatchObject({
      symbol: "ETH",
      costBasisInrPaisa: "100000",
    });
    expect(result.quarantinedAssets).toHaveLength(1);
    expect(result.quarantinedAssets[0].symbol).toBe("VITALIK");
    expect(result.unsupportedAssetsRequiringReview).toEqual([]);
    expect(result.summary).toMatchObject({
      supportedAssetMovements: 1,
      quarantinedAssetMovements: 1,
      needsUserEvidence: 0,
    });
  });

  it("keeps unsupported consideration with a supported wallet outflow in review", () => {
    const transaction = buildTransaction(
      {
        id: "unsafe-possible-swap",
        day: 1,
        deltas: [
          {
            asset: "ETH",
            direction: "out",
            amountAtomic: "100000000000000000",
          },
          {
            asset: "UNKNOWN",
            assetId:
              "eip155:1/erc20:0x2222222222222222222222222222222222222222",
            symbol: "MYST",
            decimals: 18,
            standard: "erc20",
            direction: "in",
            amountAtomic: "1",
          },
        ],
      },
      0,
    );

    const result = reconcileTransactions({
      transactions: [transaction],
      historyComplete: true,
    });

    expect(result.classifications[0]).toMatchObject({
      category: "unknown",
      needsReview: true,
    });
    expect(result.quarantinedAssets).toEqual([]);
    expect(result.unsupportedAssetsRequiringReview).toHaveLength(1);
    expect(result.disposals).toEqual([]);
    expect(result.summary.calculationStatus).toBe("partial");
  });

  it("accepts a user decision to keep an outgoing movement excluded", () => {
    const transaction = buildTransaction(
      {
        id: "user-excluded-outflow",
        day: 1,
        deltas: [
          {
            asset: "ETH",
            direction: "out",
            amountAtomic: "100000000000000000",
          },
        ],
      },
      0,
    );

    const result = reconcileTransactions({
      transactions: [transaction],
      evidence: [
        {
          txHash: transaction.txHash,
          resolution: "unknown",
          assetValuations: [],
        },
      ],
      historyComplete: true,
    });

    expect(result.classifications[0]).toMatchObject({
      category: "unknown",
      needsReview: false,
      source: "user",
    });
    expect(result.summary).toMatchObject({
      needsUserEvidence: 0,
      excludedTransactions: 1,
      calculationStatus: "partial",
    });
  });

  it("uses an opening FIFO lot and user sale evidence for exact tax arithmetic", () => {
    const transaction = buildTransaction(
      {
        id: "sale-with-opening-lot",
        day: 10,
        deltas: [
          {
            asset: "ETH",
            direction: "out",
            amountAtomic: "1000000000000000000",
          },
        ],
      },
      0,
    );

    const result = reconcileTransactions({
      transactions: [transaction],
      evidence: [
        {
          txHash: transaction.txHash,
          resolution: "sold_for_inr",
          fiatFlow: {
            direction: "received",
            amountInrPaisa: "150000",
          },
          assetValuations: [],
        },
      ],
      openingLots: [
        {
          lotId: "opening-eth",
          ...SUPPORTED_ASSET_REGISTRY.ETH,
          quantityAtomic: "1000000000000000000",
          acquiredAt: "2025-04-01T00:00:00.000Z",
          costBasisInrPaisa: "100000",
          sourceTxHash: `0x${"f".repeat(64)}`,
        },
      ],
      historyComplete: true,
    });

    expect(result.disposals[0]).toMatchObject({
      proceedsInrPaisa: "150000",
      costBasisInrPaisa: "100000",
      taxableGainInrPaisa: "50000",
      needsReview: false,
    });
    expect(result.summary).toMatchObject({
      estimatedBaseTax30PercentInrPaisa: "15000",
      calculationStatus: "complete",
    });
  });
});

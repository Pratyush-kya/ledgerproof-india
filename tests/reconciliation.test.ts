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

      return {
        assetId: delta.assetId ?? asset.assetId,
        symbol: delta.symbol ?? asset.symbol,
        decimals: delta.decimals ?? asset.decimals,
        standard: delta.standard ?? asset.standard,
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
});

import { afterEach, describe, expect, it } from "vitest";

import {
  buildHistoricalSwapEvidence,
  CoinGeckoInvalidResponseError,
  CoinGeckoRateLimitError,
  CoinGeckoTimeoutError,
  fetchHistoricalInrPrice,
  resetCoinGeckoPriceCacheForTests,
} from "../src/lib/coingecko";
import { SUPPORTED_ASSET_REGISTRY } from "../src/lib/asset-registry";
import type { NormalizedTransaction } from "../src/lib/schemas";

const TX_HASH = `0x${"c".repeat(64)}`;
const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const COUNTERPARTY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function transaction(
  assetDeltas: NormalizedTransaction["assetDeltas"],
): NormalizedTransaction {
  return {
    id: "swap-1",
    txHash: TX_HASH,
    chainId: 1,
    blockNumber: 1,
    timestamp: "2026-07-20T10:30:00.000Z",
    from: WALLET,
    to: COUNTERPARTY,
    explorerUrl: `https://etherscan.io/tx/${TX_HASH}`,
    status: "confirmed",
    assetDeltas,
    gasFeeWei: "0",
  };
}

afterEach(() => {
  resetCoinGeckoPriceCacheForTests();
});

describe("CoinGecko historical INR prices", () => {
  it("validates and converts a historical INR price to integer paisa", async () => {
    const result = await fetchHistoricalInrPrice({
      coinId: "ethereum",
      timestamp: "2026-07-20T10:30:00.000Z",
      fetchImpl: async (url) => {
        expect(String(url)).toContain("date=20-07-2026");
        return jsonResponse({
          market_data: { current_price: { inr: 250000.125 } },
        });
      },
    });

    expect(result).toBe(BigInt(25_000_013));
  });

  it("rejects a response where the requested historical price is missing", async () => {
    await expect(
      fetchHistoricalInrPrice({
        coinId: "ethereum",
        timestamp: "2026-07-20T10:30:00.000Z",
        fetchImpl: async () => jsonResponse({ market_data: null }),
      }),
    ).rejects.toBeInstanceOf(CoinGeckoInvalidResponseError);
  });

  it("rejects an invalid historical price type", async () => {
    await expect(
      fetchHistoricalInrPrice({
        coinId: "ethereum",
        timestamp: "2026-07-20T10:30:00.000Z",
        fetchImpl: async () =>
          jsonResponse({
            market_data: { current_price: { inr: "not-a-number" } },
          }),
      }),
    ).rejects.toBeInstanceOf(CoinGeckoInvalidResponseError);
  });

  it("maps an upstream 429 to a dedicated rate-limit error", async () => {
    await expect(
      fetchHistoricalInrPrice({
        coinId: "ethereum",
        timestamp: "2026-07-20T10:30:00.000Z",
        fetchImpl: async () => jsonResponse({}, 429),
      }),
    ).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
  });

  it("maps an aborted request to a dedicated timeout error", async () => {
    await expect(
      fetchHistoricalInrPrice({
        coinId: "ethereum",
        timestamp: "2026-07-20T10:30:00.000Z",
        timeoutMs: 5,
        fetchImpl: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Timed out", "TimeoutError"));
            });
          }),
      }),
    ).rejects.toBeInstanceOf(CoinGeckoTimeoutError);
  });

  it("values supported two-sided swaps but never invents one-sided basis", async () => {
    const eth = SUPPORTED_ASSET_REGISTRY.ETH;
    const usdc = SUPPORTED_ASSET_REGISTRY.USDC;
    const fetchImpl = async () =>
      jsonResponse({
        market_data: { current_price: { inr: 100 } },
      });
    const swap = transaction([
      { ...eth, amountAtomic: "1000000000000000000", direction: "out" },
      { ...usdc, amountAtomic: "1000000", direction: "in" },
    ]);
    const transfer = transaction([
      { ...eth, amountAtomic: "1000000000000000000", direction: "in" },
    ]);

    const swapEvidence = await buildHistoricalSwapEvidence([swap], {
      fetchImpl,
    });
    const transferEvidence = await buildHistoricalSwapEvidence([transfer], {
      fetchImpl,
    });

    expect(swapEvidence[0]?.assetValuations).toHaveLength(2);
    expect(transferEvidence).toEqual([]);
  });
});

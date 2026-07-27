import { describe, expect, it } from "vitest";

import providerFixture from "../src/fixtures/goldrush-transactions.json";
import {
  fetchGoldRushTransactions,
  GoldRushInvalidResponseError,
  GoldRushRateLimitError,
} from "../src/lib/goldrush";

const address = "0x1234567890abcdef1234567890abcdef12345678";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GoldRush ingestion", () => {
  it("validates the fixture and preserves native/token atomic amounts and decimals", async () => {
    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => jsonResponse(providerFixture),
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      txHash: `0x${"a".repeat(64)}`,
      timestamp: "2026-07-20T10:30:00Z",
      explorerUrl: `https://etherscan.io/tx/0x${"a".repeat(64)}`,
      assetDeltas: [
        {
          amountAtomic: "125000000000000000",
          decimals: 18,
          symbol: "ETH",
          direction: "in",
        },
      ],
    });
    expect(result.transactions[1]?.assetDeltas[0]).toMatchObject({
      amountAtomic: "25000000",
      decimals: 6,
      symbol: "USDC",
      direction: "out",
    });
  });

  it("accepts a null current_page returned by GoldRush", async () => {
    const nullPageFixture = structuredClone(providerFixture);
    nullPageFixture.data.current_page = null;

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => jsonResponse(nullPageFixture),
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]?.txHash).toBe(`0x${"a".repeat(64)}`);
  });

  it("caps an oversized provider page at 50 transactions", async () => {
    const baseItem = providerFixture.data.items[0];
    const oversizedFixture = structuredClone(providerFixture);
    oversizedFixture.data.items = Array.from({ length: 55 }, (_, index) => ({
      ...baseItem,
      tx_hash: `0x${index.toString(16).padStart(64, "0")}`,
    }));

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => jsonResponse(oversizedFixture),
    });

    expect(result.transactions).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("follows a validated GoldRush next-page link", async () => {
    const firstPage = structuredClone(providerFixture);
    const secondPage = structuredClone(providerFixture);
    firstPage.data.items = [firstPage.data.items[0]];
    firstPage.data.links.next =
      `https://api.covalenthq.com/v1/eth-mainnet/address/${address}/transactions_v3/page/1/`;
    secondPage.data.items = [secondPage.data.items[1]];
    let calls = 0;

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(calls === 1 ? firstPage : secondPage);
      },
    });

    expect(calls).toBe(2);
    expect(result.transactions.map((transaction) => transaction.txHash)).toEqual([
      `0x${"a".repeat(64)}`,
      `0x${"b".repeat(64)}`,
    ]);
  });

  it("rejects pagination links that could leak the authorization header", async () => {
    const unsafeFixture = structuredClone(providerFixture);
    unsafeFixture.data.links.next = `https://attacker.example/v1/eth-mainnet/address/${address}/transactions_v3/`;

    await expect(
      fetchGoldRushTransactions({
        address,
        apiKey: "test-only-key",
        fetchImpl: async () => jsonResponse(unsafeFixture),
      }),
    ).rejects.toBeInstanceOf(GoldRushInvalidResponseError);
  });

  it("maps an upstream 429 to a dedicated rate-limit error", async () => {
    await expect(
      fetchGoldRushTransactions({
        address,
        apiKey: "test-only-key",
        fetchImpl: async () => jsonResponse({}, 429),
      }),
    ).rejects.toBeInstanceOf(GoldRushRateLimitError);
  });

  it("rejects a valid-looking page for a different wallet", async () => {
    const wrongWalletFixture = structuredClone(providerFixture);
    wrongWalletFixture.data.address = "0x9999999999999999999999999999999999999999";

    await expect(
      fetchGoldRushTransactions({
        address,
        apiKey: "test-only-key",
        fetchImpl: async () => jsonResponse(wrongWalletFixture),
      }),
    ).rejects.toBeInstanceOf(GoldRushInvalidResponseError);
  });
});

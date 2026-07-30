import { describe, expect, it } from "vitest";

import providerFixture from "../src/fixtures/goldrush-transactions.json";
import {
  fetchGoldRushTransactions,
  GoldRushInvalidResponseError,
  GoldRushRateLimitError,
  GoldRushUnavailableError,
} from "../src/lib/goldrush";

const address = "0x1234567890abcdef1234567890abcdef12345678";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cursorEnvelope({
  items = structuredClone(providerFixture.data.items),
  cursorBefore = null,
}: {
  items?: Array<(typeof providerFixture.data.items)[number]>;
  cursorBefore?: string | null;
} = {}) {
  return {
    data: {
      cursor_before: cursorBefore,
      cursor_after: null,
      items: items.map((item) => ({
        ...item,
        gas_spent: 21_000,
        gas_price: Number(BigInt(item.fees_paid) / BigInt(21_000)),
        chain_id: "1",
        chain_name: "eth-mainnet",
      })),
    },
    error: false,
    error_message: null,
    error_code: null,
  };
}

describe("GoldRush ingestion", () => {
  it("validates the fixture and preserves native/token atomic amounts and decimals", async () => {
    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => jsonResponse(cursorEnvelope()),
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
    expect(result.transactions[1]).toMatchObject({
      decodedEventNames: ["Transfer"],
      contractAddresses: [
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ],
    });
  });

  it("accepts a null cursor on the first or only page", async () => {
    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => jsonResponse(cursorEnvelope()),
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]?.txHash).toBe(`0x${"a".repeat(64)}`);
  });

  it("derives an exact gas fee when the cursor API returns fees_paid as a number", async () => {
    const numericFeeFixture = cursorEnvelope({
      items: [structuredClone(providerFixture.data.items[0])],
    });
    numericFeeFixture.data.items[0]!.fees_paid =
      21_000_000_000_000 as unknown as string;
    numericFeeFixture.data.items[0]!.gas_spent = 21_000;
    numericFeeFixture.data.items[0]!.gas_price = 1_000_000_000;

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => jsonResponse(numericFeeFixture),
    });

    expect(result.transactions[0]?.gasFeeWei).toBe("21000000000000");
  });

  it("treats a missing decoded log as undecoded evidence", async () => {
    const missingDecodedFixture = cursorEnvelope({
      items: [structuredClone(providerFixture.data.items[1])],
    });
    delete (
      missingDecodedFixture.data.items[0]!.log_events[0]! as {
        decoded?: unknown;
      }
    ).decoded;

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () => jsonResponse(missingDecodedFixture),
    });

    expect(result.transactions[0]?.decodedEventNames).toEqual([]);
  });

  it("caps an oversized provider page at 250 transactions", async () => {
    const baseItem = providerFixture.data.items[0];
    const oversizedItems = Array.from({ length: 255 }, (_, index) => ({
      ...baseItem,
      tx_hash: `0x${index.toString(16).padStart(64, "0")}`,
    }));

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async () =>
        jsonResponse(
          cursorEnvelope({
            items: oversizedItems,
            cursorBefore: "older-page",
          }),
        ),
    });

    expect(result.transactions).toHaveLength(250);
    expect(result.truncated).toBe(true);
    expect(result.historyComplete).toBe(false);
  });

  it("follows an opaque cursor on a bounded provider URL", async () => {
    const firstPage = cursorEnvelope({
      items: [structuredClone(providerFixture.data.items[0])],
      cursorBefore: "older&redirect=https://attacker.example",
    });
    const secondPage = cursorEnvelope({
      items: [structuredClone(providerFixture.data.items[1])],
    });
    const requestedUrls: URL[] = [];
    let calls = 0;

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      fetchImpl: async (input) => {
        calls += 1;
        requestedUrls.push(new URL(String(input)));
        return jsonResponse(calls === 1 ? firstPage : secondPage);
      },
    });

    expect(calls).toBe(2);
    expect(requestedUrls[0]).toMatchObject({
      origin: "https://api.covalenthq.com",
      pathname: "/v1/allchains/transactions/",
    });
    expect(requestedUrls[0]?.searchParams.get("limit")).toBe("50");
    expect(requestedUrls[0]?.searchParams.get("with-decoded-logs")).toBe(
      "true",
    );
    expect(requestedUrls[1]?.origin).toBe("https://api.covalenthq.com");
    expect(requestedUrls[1]?.searchParams.get("before")).toBe(
      "older&redirect=https://attacker.example",
    );
    expect(result.transactions.map((transaction) => transaction.txHash)).toEqual([
      `0x${"a".repeat(64)}`,
      `0x${"b".repeat(64)}`,
    ]);
  });

  it("rejects a repeated pagination cursor", async () => {
    const repeatedCursorPage = cursorEnvelope({
      cursorBefore: "same-cursor",
    });
    let calls = 0;

    await expect(
      fetchGoldRushTransactions({
        address,
        apiKey: "test-only-key",
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse(repeatedCursorPage);
        },
      }),
    ).rejects.toBeInstanceOf(GoldRushInvalidResponseError);
    expect(calls).toBe(2);
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

  it("stops a provider request that exceeds the server timeout", async () => {
    await expect(
      fetchGoldRushTransactions({
        address,
        apiKey: "test-only-key",
        timeoutMs: 5,
        fetchImpl: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Timed out", "TimeoutError"));
            });
          }),
      }),
    ).rejects.toBeInstanceOf(GoldRushUnavailableError);
  });

  it("returns validated partial history if a later cursor page times out", async () => {
    const firstPage = cursorEnvelope({
      items: [structuredClone(providerFixture.data.items[0])],
      cursorBefore: "older-page",
    });
    let calls = 0;

    const result = await fetchGoldRushTransactions({
      address,
      apiKey: "test-only-key",
      timeoutMs: 5,
      totalTimeoutMs: 2_000,
      fetchImpl: async (_input, init) => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse(firstPage);
        }

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Timed out", "TimeoutError"));
          });
        });
      },
    });

    expect(calls).toBe(2);
    expect(result.transactions).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.historyComplete).toBe(false);
  });

  it("rejects transaction data from a different chain", async () => {
    const wrongChainFixture = cursorEnvelope();
    wrongChainFixture.data.items[0]!.chain_id = "8453";
    wrongChainFixture.data.items[0]!.chain_name = "base-mainnet";

    await expect(
      fetchGoldRushTransactions({
        address,
        apiKey: "test-only-key",
        fetchImpl: async () => jsonResponse(wrongChainFixture),
      }),
    ).rejects.toBeInstanceOf(GoldRushInvalidResponseError);
  });
});

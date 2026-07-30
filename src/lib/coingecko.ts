import "server-only";

import { z } from "zod";

import {
  inspectSupportedAsset,
  type SupportedAsset,
} from "@/lib/asset-registry";
import type { NormalizedTransaction } from "@/lib/schemas";

const COINGECKO_ORIGIN = "https://api.coingecko.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;

const HistoricalPriceSchema = z.object({
  market_data: z
    .object({
      current_price: z.object({
        inr: z.number().finite().positive(),
      }),
    })
    .nullable()
    .optional(),
});

const COINGECKO_ID_BY_SYMBOL: Record<SupportedAsset["symbol"], string> = {
  ETH: "ethereum",
  WETH: "ethereum",
  USDC: "usd-coin",
  USDT: "tether",
};

type FetchLike = typeof fetch;
type PriceEvidence = {
  txHash: string;
  assetValuations: Array<{
    assetId: string;
    direction: "in" | "out";
    amountInrPaisa: string;
  }>;
};

type PriceOptions = {
  apiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxPriceLookups?: number;
};

type CachedPrice = { priceInrPaisa: bigint; expiresAt: number };
const priceCache = new Map<string, CachedPrice>();

export class CoinGeckoRateLimitError extends Error {
  constructor() {
    super("CoinGecko rate limit reached.");
    this.name = "CoinGeckoRateLimitError";
  }
}

export class CoinGeckoInvalidResponseError extends Error {
  constructor(message = "CoinGecko returned an invalid historical price.") {
    super(message);
    this.name = "CoinGeckoInvalidResponseError";
  }
}

export class CoinGeckoUnavailableError extends Error {
  constructor() {
    super("CoinGecko historical prices are temporarily unavailable.");
    this.name = "CoinGeckoUnavailableError";
  }
}

export class CoinGeckoTimeoutError extends Error {
  constructor() {
    super("CoinGecko historical price request timed out.");
    this.name = "CoinGeckoTimeoutError";
  }
}

function formatHistoryDate(timestamp: string) {
  const date = new Date(timestamp);
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

function inrNumberToPaisa(value: number) {
  const [rupees, fraction = ""] = value.toFixed(2).split(".");
  return BigInt(rupees) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export async function fetchHistoricalInrPrice({
  coinId,
  timestamp,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: PriceOptions & { coinId: string; timestamp: string }): Promise<bigint> {
  const date = formatHistoryDate(timestamp);
  const cacheKey = `${coinId}:${date}`;
  const cached = priceCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.priceInrPaisa;
  }

  const url = new URL(`/api/v3/coins/${encodeURIComponent(coinId)}/history`, COINGECKO_ORIGIN);
  url.searchParams.set("date", date);
  url.searchParams.set("localization", "false");

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        ...(apiKey?.trim()
          ? { "x-cg-demo-api-key": apiKey.trim() }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new CoinGeckoTimeoutError();
    }
    throw new CoinGeckoUnavailableError();
  }

  if (response.status === 429) {
    throw new CoinGeckoRateLimitError();
  }
  if (!response.ok) {
    throw new CoinGeckoUnavailableError();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CoinGeckoInvalidResponseError();
  }

  const parsed = HistoricalPriceSchema.safeParse(payload);
  const inrPrice = parsed.success
    ? parsed.data.market_data?.current_price.inr
    : undefined;

  if (inrPrice === undefined) {
    throw new CoinGeckoInvalidResponseError(
      "CoinGecko did not return an INR price for that date.",
    );
  }

  const priceInrPaisa = inrNumberToPaisa(inrPrice);
  priceCache.set(cacheKey, {
    priceInrPaisa,
    expiresAt: Date.now() + PRICE_CACHE_TTL_MS,
  });
  return priceInrPaisa;
}

function valuationFromAtomicAmount(
  amountAtomic: string,
  decimals: number,
  priceInrPaisa: bigint,
) {
  return (
    (BigInt(amountAtomic) * priceInrPaisa) /
    BigInt(10) ** BigInt(decimals)
  );
}

export async function buildHistoricalSwapEvidence(
  transactions: NormalizedTransaction[],
  options: PriceOptions = {},
): Promise<PriceEvidence[]> {
  let remainingLookups = options.maxPriceLookups ?? 12;
  const results = await Promise.all(transactions.map(async (transaction) => {
    if (transaction.status !== "confirmed") {
      return null;
    }

    const deltas = transaction.assetDeltas.filter(
      (delta) =>
        BigInt(delta.amountAtomic) > BigInt(0) &&
        inspectSupportedAsset(delta).supported,
    );
    const incoming = deltas.filter((delta) => delta.direction === "in");
    const outgoing = deltas.filter((delta) => delta.direction === "out");

    // A one-sided movement may be a self-transfer, gift, or exchange movement.
    // Market price alone is not evidence of acquisition cost or sale proceeds.
    if (incoming.length !== 1 || outgoing.length !== 1) {
      return null;
    }

    const valuations = (
      await Promise.all([incoming[0], outgoing[0]].map(async (delta) => {
      const inspection = inspectSupportedAsset(delta);
      if (!inspection.supported || remainingLookups <= 0) {
        return null;
      }
      remainingLookups -= 1;

      try {
        const price = await fetchHistoricalInrPrice({
          coinId: COINGECKO_ID_BY_SYMBOL[inspection.asset.symbol],
          timestamp: transaction.timestamp,
          ...options,
        });
        const amountInrPaisa = valuationFromAtomicAmount(
          delta.amountAtomic,
          delta.decimals,
          price,
        );

        if (amountInrPaisa > BigInt(0)) {
          return {
            assetId: delta.assetId,
            direction: delta.direction,
            amountInrPaisa: amountInrPaisa.toString(),
          };
        }
      } catch {
        // Missing price evidence is represented by omission. Reconciliation
        // will flag the swap and will not emit a guessed financial result.
      }
      return null;
    }))
    ).filter(
      (
        valuation,
      ): valuation is PriceEvidence["assetValuations"][number] =>
        valuation !== null,
    );

    if (valuations.length > 0) {
      return { txHash: transaction.txHash, assetValuations: valuations };
    }
    return null;
  }));

  return results.filter(
    (item): item is PriceEvidence => item !== null,
  );
}

export function resetCoinGeckoPriceCacheForTests() {
  priceCache.clear();
}

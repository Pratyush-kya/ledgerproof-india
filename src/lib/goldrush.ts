import "server-only";

import { z } from "zod";

import {
  EvmAddressSchema,
  FetchTransactionsResultSchema,
  FinancialYearSchema,
  MAX_DEMO_TRANSACTIONS,
  NormalizedTransactionSchema,
  type FetchTransactionsResult,
  type NormalizedTransaction,
} from "@/lib/schemas";
import {
  financialYearBounds,
  isInFinancialYear,
} from "@/lib/financial-year";

 const GOLDRUSH_ORIGIN = "https://api.covalenthq.com";
    const CHAIN_NAME = "eth-mainnet";
    const ETH_ASSET_ID = "eip155:1/slip44:60";
    const PROVIDER_PAGE_SIZE = 50;
    const MAX_PROVIDER_PAGES = Math.ceil(
      MAX_DEMO_TRANSACTIONS / PROVIDER_PAGE_SIZE,
);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 40_000;
const MIN_PAGE_BUDGET_MS = 1_000;

const AtomicAmountSchema = z.string().regex(/^\d+$/);
const TransactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const GoldRushDecodedParamSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  indexed: z.boolean().optional(),
  decoded: z.boolean().optional(),

  // GoldRush may return strings, booleans, arrays or objects here.
  value: z.unknown(),
});

const GoldRushLogEventSchema = z.object({
  sender_contract_decimals: z.number().int().min(0).max(255).nullable(),
  sender_contract_ticker_symbol: z.string().min(1).max(24).nullable(),
  sender_address: EvmAddressSchema,
  decoded: z
    .object({
      name: z.string(),
      signature: z.string().optional(),

      // GoldRush sometimes returns params: null.
      params: z
        .array(GoldRushDecodedParamSchema)
        .nullish()
        .transform((params) => params ?? []),
    })
    .nullish()
    .transform((decoded) => decoded ?? null),
});

const GoldRushTransactionSchema = z.object({
  block_signed_at: z.string().datetime({ offset: true }),
  block_height: z.number().int().nonnegative(),
  tx_hash: TransactionHashSchema,
  successful: z.boolean(),
  from_address: EvmAddressSchema,
  to_address: EvmAddressSchema.nullable(),
  value: AtomicAmountSchema,
  gas_spent: z.number().int().nonnegative().safe(),
  gas_price: z.number().int().nonnegative().safe(),
  fees_paid: z.union([AtomicAmountSchema, z.number().nonnegative()]),
  function_name: z.string().min(1).nullable().optional(),
  explorers: z
    .array(
      z.object({
        label: z.string().optional(),
        url: z.string().url(),
      }),
    )
    .optional()
    .default([]),
  chain_id: z.union([z.literal(1), z.literal("1")]),
  chain_name: z.literal(CHAIN_NAME),

  // Convert missing or null log_events to an empty array.
  log_events: z
    .array(GoldRushLogEventSchema)
    .nullish()
    .transform((events) => events ?? []),
});

const GoldRushCursorPageSchema = z.object({
  cursor_before: z.string().min(1).max(4_096).nullable().optional(),
  cursor_after: z.string().min(1).max(4_096).nullable().optional(),
  items: z.array(GoldRushTransactionSchema),
});

const GoldRushEnvelopeSchema = z.object({
  data: GoldRushCursorPageSchema.nullable(),
  error: z.boolean(),
  error_message: z.string().nullable().optional(),
  error_code: z.number().nullable().optional(),
});

type GoldRushCursorPage = z.infer<typeof GoldRushCursorPageSchema>;
type GoldRushTransaction = z.infer<typeof GoldRushTransactionSchema>;
type FetchImplementation = typeof fetch;

export class GoldRushRateLimitError extends Error {
  constructor() {
    super("GoldRush rate limit reached.");
    this.name = "GoldRushRateLimitError";
  }
}

export class GoldRushInvalidResponseError extends Error {
  constructor(message = "GoldRush returned an invalid response.") {
    super(message);
    this.name = "GoldRushInvalidResponseError";
  }
}

export class GoldRushUnavailableError extends Error {
  readonly reason: "network" | "timeout" | "http";
  readonly status: number | null;

  constructor({
    reason = "network",
    status = null,
  }: {
    reason?: "network" | "timeout" | "http";
    status?: number | null;
  } = {}) {
    super("GoldRush is temporarily unavailable.");
    this.name = "GoldRushUnavailableError";
    this.reason = reason;
    this.status = status;
  }
}

function buildTransactionsUrl(address: string, before: string | null) {
  const url = new URL("/v1/allchains/transactions/", GOLDRUSH_ORIGIN);

  url.searchParams.set("chains", CHAIN_NAME);
  url.searchParams.set("addresses", address);
  url.searchParams.set("limit", String(PROVIDER_PAGE_SIZE));
  url.searchParams.set("with-decoded-logs", "true");
  url.searchParams.set("quote-currency", "INR");

  if (before) {
    url.searchParams.set("before", before);
  }

  return url;
}

function logValidationIssues(error: z.ZodError) {
  console.error(
    "[goldrush] response validation failed",
    error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    })),
  );
}

function unwrapProviderPage(payload: unknown): GoldRushCursorPage {
  /*
   * Determine whether GoldRush returned its normal envelope:
   * { data, error, error_message, error_code }
   */
  const envelopeProbe = z
    .object({
      data: z.unknown(),
    })
    .passthrough()
    .safeParse(payload);

  if (envelopeProbe.success) {
    const parsedEnvelope = GoldRushEnvelopeSchema.safeParse(payload);

    if (!parsedEnvelope.success) {
      logValidationIssues(parsedEnvelope.error);
      throw new GoldRushInvalidResponseError();
    }

    if (parsedEnvelope.data.error || parsedEnvelope.data.data === null) {
      throw new GoldRushInvalidResponseError(
        parsedEnvelope.data.error_message ??
          "GoldRush returned an error response.",
      );
    }

    return parsedEnvelope.data.data;
  }

  // Support a direct-page response without weakening field validation.
  const parsedPage = GoldRushCursorPageSchema.safeParse(payload);

  if (!parsedPage.success) {
    logValidationIssues(parsedPage.error);
    throw new GoldRushInvalidResponseError();
  }

  return parsedPage.data;
}

function findDecodedParam(
  params: z.infer<typeof GoldRushDecodedParamSchema>[],
  name: string,
): string | undefined {
  const value = params.find(
    (param) => param.name.toLowerCase() === name.toLowerCase(),
  )?.value;

  /*
   * Addresses and atomic token amounts must be strings.
   * Boolean/object/array metadata is ignored safely.
   */
  return typeof value === "string" ? value : undefined;
}

function addNativeDeltas(
  transaction: GoldRushTransaction,
  walletAddress: string,
  deltas: NormalizedTransaction["assetDeltas"],
) {
  if (transaction.value === "0") {
    return;
  }

  const wallet = walletAddress.toLowerCase();

  const nativeAsset = {
    assetId: ETH_ASSET_ID,
    symbol: "ETH",
    decimals: 18,
    amountAtomic: transaction.value,
    standard: "native" as const,
  };

  if (transaction.from_address.toLowerCase() === wallet) {
    deltas.push({
      ...nativeAsset,
      direction: "out",
    });
  }

  if (transaction.to_address?.toLowerCase() === wallet) {
    deltas.push({
      ...nativeAsset,
      direction: "in",
    });
  }
}

function addErc20Deltas(
  transaction: GoldRushTransaction,
  walletAddress: string,
  deltas: NormalizedTransaction["assetDeltas"],
) {
  const wallet = walletAddress.toLowerCase();

  for (const event of transaction.log_events) {
    if (event.decoded?.name.toLowerCase() !== "transfer") {
      continue;
    }

    const from = findDecodedParam(event.decoded.params, "from");
    const to = findDecodedParam(event.decoded.params, "to");
    const amountAtomic = findDecodedParam(
      event.decoded.params,
      "value",
    );

    /*
     * Ignore malformed event metadata instead of rejecting the
     * entire wallet transaction history.
     */
    if (
      event.sender_contract_decimals === null ||
      !from ||
      !to ||
      !amountAtomic ||
      !EvmAddressSchema.safeParse(from).success ||
      !EvmAddressSchema.safeParse(to).success ||
      !AtomicAmountSchema.safeParse(amountAtomic).success
    ) {
      continue;
    }

    const tokenAsset = {
      assetId: `eip155:1/erc20:${event.sender_address.toLowerCase()}`,
      symbol: event.sender_contract_ticker_symbol ?? "UNKNOWN",
      decimals: event.sender_contract_decimals,
      amountAtomic,
      standard: "erc20" as const,
    };

    if (from.toLowerCase() === wallet) {
      deltas.push({
        ...tokenAsset,
        direction: "out",
      });
    }

    if (to.toLowerCase() === wallet) {
      deltas.push({
        ...tokenAsset,
        direction: "in",
      });
    }
  }
}

export function normalizeGoldRushTransaction(
  transaction: GoldRushTransaction,
  walletAddress: string,
) {
  const assetDeltas: NormalizedTransaction["assetDeltas"] = [];

  addNativeDeltas(transaction, walletAddress, assetDeltas);
  addErc20Deltas(transaction, walletAddress, assetDeltas);
  const decodedEventNames = [
    ...new Set(
      transaction.log_events
        .map((event) => event.decoded?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ].slice(0, 20);
  const contractAddresses = [
    ...new Set(
      transaction.log_events.map((event) =>
        event.sender_address.toLowerCase(),
      ),
    ),
  ].slice(0, 20);

  return NormalizedTransactionSchema.parse({
    id: transaction.tx_hash,
    txHash: transaction.tx_hash,
    chainId: 1,
    blockNumber: transaction.block_height,
    timestamp: transaction.block_signed_at,
    from: transaction.from_address,
    to: transaction.to_address,
    explorerUrl:
      transaction.explorers[0]?.url ??
      `https://etherscan.io/tx/${transaction.tx_hash}`,
    status: transaction.successful ? "confirmed" : "failed",
    assetDeltas,
    gasFeeWei:
      typeof transaction.fees_paid === "string"
        ? transaction.fees_paid
        : (
            BigInt(transaction.gas_price) * BigInt(transaction.gas_spent)
          ).toString(),
    methodName: transaction.function_name ?? null,
    decodedEventNames,
    contractAddresses,
  });
}

export async function fetchGoldRushTransactions({
  address,
  apiKey,
  financialYear,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
}: {
  address: string;
  apiKey: string;
  financialYear?: string;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
  totalTimeoutMs?: number;
}): Promise<FetchTransactionsResult> {
  const validAddress = EvmAddressSchema.parse(address);
  const selectedFinancialYear = financialYear
    ? FinancialYearSchema.parse(financialYear)
    : null;
  const periodEnd = selectedFinancialYear
    ? Date.parse(financialYearBounds(selectedFinancialYear).endExclusive)
    : null;
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    throw new GoldRushUnavailableError();
  }

  const transactions: NormalizedTransaction[] = [];
  const seenHashes = new Set<string>();

  const startedAt = Date.now();
  let cursorBefore: string | null = null;
  let hasMore = true;
  let pagesFetched = 0;
  let truncated = false;
  let selectedPeriodTransactions = 0;

  while (
    hasMore &&
    transactions.length < MAX_DEMO_TRANSACTIONS &&
    pagesFetched < MAX_PROVIDER_PAGES
  ) {
    const remainingTotalMs =
      totalTimeoutMs - (Date.now() - startedAt);

    if (pagesFetched > 0 && remainingTotalMs < MIN_PAGE_BUDGET_MS) {
      truncated = true;
      break;
    }

    const requestTimeoutMs = Math.max(
      1,
      Math.min(timeoutMs, remainingTotalMs),
    );
    let response: Response;

    try {
      response = await fetchImpl(
        buildTransactionsUrl(validAddress, cursorBefore),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${trimmedApiKey}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      );
    } catch (error) {
      if (pagesFetched > 0) {
        truncated = true;
        break;
      }

      throw new GoldRushUnavailableError({
        reason:
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
            ? "timeout"
            : "network",
      });
    }

    if (response.status === 429) {
      throw new GoldRushRateLimitError();
    }

    if (!response.ok) {
      throw new GoldRushUnavailableError({
        reason: "http",
        status: response.status,
      });
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new GoldRushInvalidResponseError();
    }

    const page = unwrapProviderPage(payload);

    pagesFetched += 1;

    for (const providerTransaction of page.items) {
      if (seenHashes.has(providerTransaction.tx_hash)) {
        continue;
      }

      if (transactions.length === MAX_DEMO_TRANSACTIONS) {
        truncated = true;
        break;
      }

      seenHashes.add(providerTransaction.tx_hash);

      const normalized = normalizeGoldRushTransaction(
        providerTransaction,
        validAddress,
      );

      if (
        periodEnd !== null &&
        Date.parse(normalized.timestamp) >= periodEnd
      ) {
        continue;
      }

      if (
        selectedFinancialYear &&
        isInFinancialYear(normalized.timestamp, selectedFinancialYear)
      ) {
        selectedPeriodTransactions += 1;
      }

      transactions.push(normalized);
    }

    const nextCursor = page.cursor_before ?? null;
    if (nextCursor && nextCursor === cursorBefore) {
      throw new GoldRushInvalidResponseError(
        "GoldRush returned a repeated pagination cursor.",
      );
    }

    cursorBefore = nextCursor;
    hasMore = Boolean(cursorBefore);

    if (transactions.length === MAX_DEMO_TRANSACTIONS) {
      truncated = truncated || hasMore;
      break;
    }
  }

  if (hasMore) {
    truncated = true;
  }

  return FetchTransactionsResultSchema.parse({
    address: validAddress,
    chainId: 1,
    source: "goldrush",
    fetchedAt: new Date().toISOString(),
    financialYear: selectedFinancialYear,
    transactions,
    isEmpty: selectedFinancialYear
      ? selectedPeriodTransactions === 0
      : transactions.length === 0,
    truncated,
    historyComplete: !truncated && !hasMore,
  });
}

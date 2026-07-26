import "server-only";

import { z } from "zod";

import {
  EvmAddressSchema,
  FetchTransactionsResultSchema,
  NormalizedTransactionSchema,
  type FetchTransactionsResult,
  type NormalizedTransaction,
} from "@/lib/schemas";

const GOLDRUSH_ORIGIN = "https://api.covalenthq.com";
const CHAIN_NAME = "eth-mainnet";
const ETH_ASSET_ID = "eip155:1/slip44:60";
const PAGE_LIMIT = 50;
const MAX_PROVIDER_PAGES = 10;

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
    .nullable(),
});

const GoldRushTransactionSchema = z.object({
  block_signed_at: z.string().datetime({ offset: true }),
  block_height: z.number().int().nonnegative(),
  tx_hash: TransactionHashSchema,
  successful: z.boolean(),
  from_address: EvmAddressSchema,
  to_address: EvmAddressSchema.nullable(),
  value: AtomicAmountSchema,
  fees_paid: AtomicAmountSchema,
  explorers: z
    .array(
      z.object({
        label: z.string().optional(),
        url: z.string().url(),
      }),
    )
    .optional()
    .default([]),

  // Convert missing or null log_events to an empty array.
  log_events: z
    .array(GoldRushLogEventSchema)
    .nullish()
    .transform((events) => events ?? []),
});

const GoldRushPageSchema = z.object({
  address: EvmAddressSchema,
  chain_id: z.literal(1),
  chain_name: z.literal(CHAIN_NAME),
  current_page: z.number().int().nonnegative().optional(),
  links: z.object({
    prev: z.string().url().nullable().optional(),
    next: z.string().url().nullable().optional(),
  }),
  items: z.array(GoldRushTransactionSchema),
});

const GoldRushEnvelopeSchema = z.object({
  data: GoldRushPageSchema.nullable(),
  error: z.boolean(),
  error_message: z.string().nullable().optional(),
  error_code: z.number().nullable().optional(),
});

type GoldRushPage = z.infer<typeof GoldRushPageSchema>;
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
  constructor() {
    super("GoldRush is temporarily unavailable.");
    this.name = "GoldRushUnavailableError";
  }
}

function buildInitialUrl(address: string) {
  const url = new URL(
    `/v1/${CHAIN_NAME}/address/${encodeURIComponent(address)}/transactions_v3/`,
    GOLDRUSH_ORIGIN,
  );

  url.searchParams.set("quote-currency", "INR");

  return url;
}

function validateNextUrl(nextUrl: string, address: string) {
  const parsed = new URL(nextUrl);

  const expectedPathPrefix =
    `/v1/${CHAIN_NAME}/address/${encodeURIComponent(address)}/transactions_v3/`.toLowerCase();

  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== GOLDRUSH_ORIGIN ||
    !parsed.pathname.toLowerCase().startsWith(expectedPathPrefix)
  ) {
    throw new GoldRushInvalidResponseError(
      "GoldRush returned an unsafe pagination link.",
    );
  }

  return parsed;
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

function unwrapProviderPage(payload: unknown): GoldRushPage {
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

  // Support direct-page responses used by fixtures or provider variations.
  const parsedPage = GoldRushPageSchema.safeParse(payload);

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
    gasFeeWei: transaction.fees_paid,
  });
}

export async function fetchGoldRushTransactions({
  address,
  apiKey,
  fetchImpl = fetch,
}: {
  address: string;
  apiKey: string;
  fetchImpl?: FetchImplementation;
}): Promise<FetchTransactionsResult> {
  const validAddress = EvmAddressSchema.parse(address);
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    throw new GoldRushUnavailableError();
  }

  const transactions: NormalizedTransaction[] = [];
  const seenHashes = new Set<string>();

  let nextUrl: URL | null = buildInitialUrl(validAddress);
  let pagesFetched = 0;
  let truncated = false;

  while (
    nextUrl &&
    transactions.length < PAGE_LIMIT &&
    pagesFetched < MAX_PROVIDER_PAGES
  ) {
    let response: Response;

    try {
      response = await fetchImpl(nextUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${trimmedApiKey}`,
        },
        cache: "no-store",
      });
    } catch {
      throw new GoldRushUnavailableError();
    }

    if (response.status === 429) {
      throw new GoldRushRateLimitError();
    }

    if (!response.ok) {
      throw new GoldRushUnavailableError();
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new GoldRushInvalidResponseError();
    }

    const page = unwrapProviderPage(payload);

    if (page.address.toLowerCase() !== validAddress.toLowerCase()) {
      throw new GoldRushInvalidResponseError(
        "GoldRush returned history for a different wallet address.",
      );
    }

    pagesFetched += 1;

    for (const providerTransaction of page.items) {
      if (seenHashes.has(providerTransaction.tx_hash)) {
        continue;
      }

      if (transactions.length === PAGE_LIMIT) {
        truncated = true;
        break;
      }

      seenHashes.add(providerTransaction.tx_hash);

      transactions.push(
        normalizeGoldRushTransaction(
          providerTransaction,
          validAddress,
        ),
      );
    }

    if (transactions.length === PAGE_LIMIT) {
      truncated = truncated || Boolean(page.links.next);
      break;
    }

    nextUrl = page.links.next
      ? validateNextUrl(page.links.next, validAddress)
      : null;
  }

  if (nextUrl) {
    truncated = true;
  }

  return FetchTransactionsResultSchema.parse({
    address: validAddress,
    chainId: 1,
    source: "goldrush",
    fetchedAt: new Date().toISOString(),
    transactions,
    isEmpty: transactions.length === 0,
    truncated,
  });
}
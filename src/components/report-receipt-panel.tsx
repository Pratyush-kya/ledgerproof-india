"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";

import {
  canonicalReportHash,
  REPORT_RECEIPT_ABI,
} from "@/lib/report-receipt";

type PreparedReceipt = {
  account: Address;
  reportHash: Hex;
};

type ReceiptState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | ({ kind: "connected" } & PreparedReceipt)
  | ({ kind: "confirming" } & PreparedReceipt)
  | ({ kind: "pending"; transactionHash: Hex } & PreparedReceipt)
  | ({ kind: "success"; transactionHash: Hex } & PreparedReceipt)
  | { kind: "rejected"; prepared: PreparedReceipt | null }
  | { kind: "wrong-chain" }
  | { kind: "provider-error" }
  | {
      kind: "duplicate";
      owner: Address | null;
      timestamp: bigint;
      reportHash: Hex;
    };

type ErrorRecord = {
  cause?: unknown;
  code?: unknown;
  data?: unknown;
  message?: unknown;
  name?: unknown;
  shortMessage?: unknown;
};

function errorRecords(error: unknown): ErrorRecord[] {
  const records: ErrorRecord[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current);
    const record = current as ErrorRecord;
    records.push(record);
    current = record.cause;
  }

  return records;
}

export function isWalletRejection(error: unknown) {
  return errorRecords(error).some(
    (record) =>
      record.code === 4001 ||
      record.name === "UserRejectedRequestError" ||
      (record.name === "TransactionExecutionError" &&
        typeof record.message === "string" &&
        record.message.includes("User rejected")),
  );
}

export function isDuplicateReceiptError(error: unknown) {
  return errorRecords(error).some((record) => {
    const data =
      typeof record.data === "object" && record.data !== null
        ? (record.data as { errorName?: unknown })
        : null;
    const messages = [record.shortMessage, record.message].filter(
      (value): value is string => typeof value === "string",
    );

    return (
      data?.errorName === "ReceiptAlreadyMinted" ||
      messages.some((message) => message.includes("ReceiptAlreadyMinted"))
    );
  });
}

function shortValue(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function providerClients() {
  const provider = window.ethereum;
  if (!provider) {
    return null;
  }

  const transport = custom(provider);
  return {
    publicClient: createPublicClient({
      chain: baseSepolia,
      transport,
    }),
    walletClient: createWalletClient({
      chain: baseSepolia,
      transport,
    }),
  };
}

type ReceiptPublicClient = NonNullable<
  ReturnType<typeof providerClients>
>["publicClient"];

export function ReportReceiptPanel({
  contractAddress,
  report,
}: {
  contractAddress: string | null;
  report: unknown;
}) {
  const [state, setState] = useState<ReceiptState>({ kind: "idle" });
  const configuredAddress = useMemo(
    () =>
      contractAddress ? getAddress(contractAddress.toLowerCase()) : null,
    [contractAddress],
  );

  async function existingReceipt(
    reportHash: Hex,
    address: Address,
    publicClient: ReceiptPublicClient,
  ) {
    const [owner, timestamp] = await publicClient.readContract({
      address,
      abi: REPORT_RECEIPT_ABI,
      functionName: "receipts",
      args: [reportHash],
    });

    return { owner, timestamp };
  }

  async function prepareReceipt() {
    if (!configuredAddress) {
      return;
    }

    const clients = providerClients();
    if (!clients) {
      setState({ kind: "provider-error" });
      return;
    }

    setState({ kind: "connecting" });
    try {
      const [account] = await clients.walletClient.requestAddresses();
      if (!account) {
        setState({ kind: "provider-error" });
        return;
      }

      const chainId = await clients.walletClient.getChainId();
      if (chainId !== baseSepolia.id) {
        setState({ kind: "wrong-chain" });
        return;
      }

      const reportHash = canonicalReportHash(report);
      const receipt = await existingReceipt(
        reportHash,
        configuredAddress,
        clients.publicClient,
      );
      if (receipt.owner !== zeroAddress) {
        setState({
          kind: "duplicate",
          owner: receipt.owner,
          timestamp: receipt.timestamp,
          reportHash,
        });
        return;
      }

      setState({ kind: "connected", account, reportHash });
    } catch (error) {
      setState(
        isWalletRejection(error)
          ? {
              kind: "rejected",
              prepared: null,
            }
          : {
              kind: "provider-error",
            },
      );
    }
  }

  async function mintReceipt(prepared: PreparedReceipt) {
    if (!configuredAddress) {
      return;
    }

    const receiptRequest: PreparedReceipt = {
      account: prepared.account,
      reportHash: prepared.reportHash,
    };
    const clients = providerClients();
    if (!clients) {
      setState({ kind: "provider-error" });
      return;
    }

    try {
      const chainId = await clients.walletClient.getChainId();
      if (chainId !== baseSepolia.id) {
        setState({ kind: "wrong-chain" });
        return;
      }

      const receipt = await existingReceipt(
        receiptRequest.reportHash,
        configuredAddress,
        clients.publicClient,
      );
      if (receipt.owner !== zeroAddress) {
        setState({
          kind: "duplicate",
          owner: receipt.owner,
          timestamp: receipt.timestamp,
          reportHash: receiptRequest.reportHash,
        });
        return;
      }

      flushSync(() => {
        setState({ ...receiptRequest, kind: "confirming" });
      });
      const transactionHash = await clients.walletClient.writeContract({
        account: receiptRequest.account,
        address: configuredAddress,
        abi: REPORT_RECEIPT_ABI,
        functionName: "mintReceipt",
        args: [receiptRequest.reportHash],
        chain: baseSepolia,
      });

      flushSync(() => {
        setState({ ...receiptRequest, kind: "pending", transactionHash });
      });
      const transactionReceipt =
        await clients.publicClient.waitForTransactionReceipt({
          hash: transactionHash,
          confirmations: 1,
          timeout: 60_000,
        });

      if (transactionReceipt.status !== "success") {
        setState({ kind: "provider-error" });
        return;
      }

      setState({ ...receiptRequest, kind: "success", transactionHash });
    } catch (error) {
      if (isDuplicateReceiptError(error)) {
        setState({
          kind: "duplicate",
          owner: null,
          timestamp: BigInt(0),
          reportHash: receiptRequest.reportHash,
        });
      } else if (isWalletRejection(error)) {
        setState({ kind: "rejected", prepared: receiptRequest });
      } else {
        setState({ kind: "provider-error" });
      }
    }
  }

  if (!configuredAddress) {
    return (
      <section
        className="rounded-2xl border border-slate-600 bg-slate-950/55 p-5"
        aria-labelledby="receipt-heading"
      >
        <h3 id="receipt-heading" className="text-lg font-semibold text-white">
          Optional Base Sepolia report receipt
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Unavailable until a reviewed public contract address is explicitly
          configured. The reconciliation report remains fully usable without
          this feature.
        </p>
      </section>
    );
  }

  const explorerBase = "https://sepolia-explorer.base.org";
  const preparedForMint =
    state.kind === "connected"
      ? state
      : state.kind === "rejected"
        ? state.prepared
        : null;

  return (
    <section
      className="rounded-2xl border border-fuchsia-200/20 bg-fuchsia-100/5 p-5"
      aria-labelledby="receipt-heading"
    >
      <h3 id="receipt-heading" className="text-lg font-semibold text-white">
        Optional Base Sepolia report receipt
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        This stores only a deterministic report hash, your signing address, and
        the block timestamp. It never stores the report, wallet history, tax
        figures, or personal details.
      </p>
      <p className="mt-2 text-xs leading-5 text-amber-100">
        The hash is public and linkable. Keep the underlying report private.
        Base Sepolia test ETH is required and has no monetary value.
      </p>

      <div
        className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-200"
        role={state.kind === "provider-error" ? "alert" : "status"}
        aria-live="polite"
      >
        {state.kind === "idle" ? (
          <p>Connect a browser wallet to review the hash. Nothing is sent.</p>
        ) : null}
        {state.kind === "connecting" ? (
          <p>Connection: waiting for the browser wallet…</p>
        ) : null}
        {state.kind === "connected" ? (
          <div className="space-y-2">
            <p className="font-semibold text-emerald-200">
              Connected on Base Sepolia. Review before confirming.
            </p>
            <p>Account: {shortValue(state.account)}</p>
            <p className="break-all font-mono text-xs">
              Report hash: {state.reportHash}
            </p>
          </div>
        ) : null}
        {state.kind === "confirming" ? (
          <p>Confirmation: review and approve the transaction in your wallet.</p>
        ) : null}
        {state.kind === "pending" ? (
          <p>
            Pending: transaction sent.{" "}
            <a
              className="font-semibold text-cyan-200 underline"
              href={`${explorerBase}/tx/${state.transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View {shortValue(state.transactionHash)}
            </a>
          </p>
        ) : null}
        {state.kind === "success" ? (
          <div className="space-y-2">
            <p className="font-semibold text-emerald-200">
              Success: the receipt is confirmed on Base Sepolia.
            </p>
            <a
              className="inline-block font-semibold text-cyan-200 underline"
              href={`${explorerBase}/tx/${state.transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Verify transaction {shortValue(state.transactionHash)}
            </a>
          </div>
        ) : null}
        {state.kind === "rejected" ? (
          <p>
            Rejected: your wallet declined the request. Nothing was written.
          </p>
        ) : null}
        {state.kind === "wrong-chain" ? (
          <p>
            Wrong chain: switch your wallet to Base Sepolia (chain 84532), then
            retry. LedgerProof will not switch networks or mint automatically.
          </p>
        ) : null}
        {state.kind === "provider-error" ? (
          <p>
            Wallet or RPC unavailable. Check the browser wallet connection and
            retry; the report itself is unaffected.
          </p>
        ) : null}
        {state.kind === "duplicate" ? (
          <div className="space-y-2">
            <p className="font-semibold text-amber-100">
              Duplicate receipt: this report hash is already registered.
            </p>
            {state.owner ? <p>Owner: {shortValue(state.owner)}</p> : null}
            {state.timestamp > BigInt(0) ? (
              <p>
                Stored at{" "}
                {new Date(Number(state.timestamp) * 1_000).toLocaleString(
                  "en-IN",
                )}
                .
              </p>
            ) : null}
            <p className="break-all font-mono text-xs">{state.reportHash}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {state.kind === "idle" ||
        state.kind === "wrong-chain" ||
        state.kind === "provider-error" ||
        (state.kind === "rejected" && !state.prepared) ? (
          <button
            type="button"
            onClick={() => {
              void prepareReceipt();
            }}
            className="min-h-11 rounded-xl border border-fuchsia-200/50 px-4 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-200/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-100"
          >
            Connect wallet and review hash
          </button>
        ) : null}
        {preparedForMint ? (
          <button
            type="button"
            onClick={() => {
              void mintReceipt(preparedForMint);
            }}
            className="min-h-11 rounded-xl bg-fuchsia-200 px-4 text-sm font-semibold text-slate-950 transition hover:bg-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-100"
          >
            Confirm receipt in wallet
          </button>
        ) : null}
        {state.kind === "connecting" ||
        state.kind === "confirming" ||
        state.kind === "pending" ? (
          <button
            type="button"
            disabled
            className="min-h-11 cursor-wait rounded-xl border border-slate-600 px-4 text-sm font-semibold text-slate-400"
          >
            {state.kind === "connecting"
              ? "Connecting…"
              : state.kind === "confirming"
                ? "Awaiting confirmation…"
                : "Waiting for receipt…"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

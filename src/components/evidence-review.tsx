"use client";

import { useMemo, useState } from "react";

import { inspectSupportedAsset } from "@/lib/asset-registry";
import {
  EvidenceResolutionSchema,
  type Classification,
  type NormalizedTransaction,
  type TransactionEvidence,
} from "@/lib/schemas";

type Resolution = NonNullable<TransactionEvidence["resolution"]>;

function rupeesToPaisa(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    throw new Error("Enter INR using at most two decimal places.");
  }
  return (
    BigInt(match[1]) * BigInt(100) +
    BigInt((match[2] ?? "").padEnd(2, "0") || "0")
  ).toString();
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function availableResolutions(transaction: NormalizedTransaction) {
  const supported = transaction.assetDeltas.filter(
    (delta) =>
      BigInt(delta.amountAtomic) > BigInt(0) &&
      inspectSupportedAsset(delta).supported,
  );
  const incoming = supported.some((delta) => delta.direction === "in");
  const outgoing = supported.some((delta) => delta.direction === "out");
  const options: Array<{ value: Resolution; label: string }> = [];

  if (incoming && !outgoing) {
    options.push(
      { value: "bought_for_inr", label: "Bought for INR" },
      { value: "self_transfer", label: "Transfer between my wallets" },
    );
  }
  if (outgoing && !incoming) {
    options.push(
      { value: "sold_for_inr", label: "Sold for INR" },
      { value: "self_transfer", label: "Transfer between my wallets" },
    );
  }
  options.push(
    { value: "gift_reward_airdrop", label: "Gift / reward / airdrop" },
    { value: "unknown", label: "Unknown — keep excluded" },
  );
  return options;
}

export function EvidenceReview({
  transactions,
  classifications,
  isSubmitting,
  onResolve,
}: {
  transactions: NormalizedTransaction[];
  classifications: Classification[];
  isSubmitting: boolean;
  onResolve: (evidence: TransactionEvidence) => void;
}) {
  const unresolved = useMemo(
    () =>
      classifications
        .filter((classification) => classification.needsReview)
        .map((classification) => ({
          classification,
          transaction: transactions.find(
            (transaction) =>
              transaction.id === classification.transactionId,
          ),
        }))
        .filter(
          (
            item,
          ): item is {
            classification: Classification;
            transaction: NormalizedTransaction;
          } => Boolean(item.transaction),
        ),
    [classifications, transactions],
  );
  const [selectedHash, setSelectedHash] = useState(
    unresolved[0]?.transaction.txHash ?? "",
  );
  const [resolution, setResolution] = useState<Resolution | undefined>(
    unresolved[0]
      ? availableResolutions(unresolved[0].transaction)[0]?.value
      : undefined,
  );
  const [inrAmount, setInrAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const effectiveSelectedHash = unresolved.some(
    (item) => item.transaction.txHash === selectedHash,
  )
    ? selectedHash
    : (unresolved[0]?.transaction.txHash ?? "");
  const selected = unresolved.find(
    (item) => item.transaction.txHash === effectiveSelectedHash,
  );
  const options = selected
    ? availableResolutions(selected.transaction)
    : [];
  const effectiveResolution = options.some(
    (option) => option.value === resolution,
  )
    ? resolution
    : options[0]?.value;
  const requiresInr =
    effectiveResolution === "bought_for_inr" ||
    effectiveResolution === "sold_for_inr" ||
    (effectiveResolution === "self_transfer" &&
      selected?.transaction.assetDeltas.some(
        (delta) =>
          delta.direction === "in" &&
          inspectSupportedAsset(delta).supported,
      ));

  function selectTransaction(hash: string) {
    const next = unresolved.find(
      (item) => item.transaction.txHash === hash,
    );
    setSelectedHash(hash);
    setResolution(
      next ? availableResolutions(next.transaction)[0]?.value : undefined,
    );
    setInrAmount("");
    setMessage(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !effectiveResolution) {
      setMessage("Choose a transaction and resolution.");
      return;
    }

    try {
      const parsedResolution =
        EvidenceResolutionSchema.parse(effectiveResolution);
      const amountInrPaisa = requiresInr
        ? rupeesToPaisa(inrAmount)
        : undefined;
      const evidence: TransactionEvidence = {
        txHash: selected.transaction.txHash,
        resolution: parsedResolution,
        assetValuations: [],
        ...(parsedResolution === "bought_for_inr"
          ? {
              fiatFlow: {
                direction: "paid" as const,
                amountInrPaisa: amountInrPaisa!,
              },
            }
          : {}),
        ...(parsedResolution === "sold_for_inr"
          ? {
              fiatFlow: {
                direction: "received" as const,
                amountInrPaisa: amountInrPaisa!,
              },
            }
          : {}),
        ...(parsedResolution === "self_transfer" &&
        selected.transaction.assetDeltas.some(
          (delta) =>
            delta.direction === "in" &&
            inspectSupportedAsset(delta).supported,
        )
          ? { carriedCostBasisInrPaisa: amountInrPaisa }
          : {}),
      };
      setMessage(null);
      onResolve(evidence);
      setSelectedHash("");
      setResolution(undefined);
      setInrAmount("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Evidence could not be validated.",
      );
    }
  }

  if (unresolved.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-200/20 bg-emerald-100/5 p-5">
        <h3 className="text-lg font-semibold text-emerald-100">
          Evidence review complete
        </h3>
        <p className="mt-2 text-sm text-slate-300">
          No transaction currently needs user evidence.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5"
      aria-labelledby="evidence-review-heading"
    >
      <h3
        id="evidence-review-heading"
        className="text-lg font-semibold text-amber-100"
      >
        Resolve missing evidence
      </h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
        Supply facts the blockchain cannot prove. LedgerProof performs the
        arithmetic and reruns FIFO; you do not calculate gains or tax manually.
      </p>
      <form className="mt-4 grid gap-4 lg:grid-cols-3" onSubmit={submit}>
        <label className="text-sm text-slate-200">
          Transaction
          <select
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white"
            value={effectiveSelectedHash}
            onChange={(event) => selectTransaction(event.target.value)}
          >
            {unresolved.map(({ transaction, classification }) => (
              <option key={transaction.txHash} value={transaction.txHash}>
                {shortHash(transaction.txHash)} —{" "}
                {classification.category.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-200">
          What happened?
          <select
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white"
            value={effectiveResolution ?? ""}
            onChange={(event) => {
              setResolution(
                EvidenceResolutionSchema.parse(event.target.value),
              );
              setInrAmount("");
              setMessage(null);
            }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {requiresInr ? (
          <label className="text-sm text-slate-200">
            {effectiveResolution === "self_transfer"
              ? "Carried cost basis (INR)"
              : effectiveResolution === "bought_for_inr"
                ? "INR paid"
                : "INR received"}
            <input
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white"
              inputMode="decimal"
              placeholder="54000.00"
              value={inrAmount}
              onChange={(event) => setInrAmount(event.target.value)}
              required
            />
          </label>
        ) : (
          <div className="text-sm text-slate-400 lg:self-end">
            This choice remains visible in the audit trail. Special tax
            treatment stays excluded.
          </div>
        )}
        <div className="lg:col-span-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-11 rounded-xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Rerunning reconciliation…" : "Apply and recalculate"}
          </button>
          {message ? (
            <p className="mt-2 text-sm text-rose-200" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

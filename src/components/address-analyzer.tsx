"use client";

import { useState } from "react";

import { DEMO_LEDGER } from "@/lib/demo-ledger";
import { EvmAddressSchema } from "@/lib/schemas";

const demoAddress = DEMO_LEDGER.coverage.address;

export function AddressAnalyzer() {
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showDemoLedger, setShowDemoLedger] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = EvmAddressSchema.safeParse(address.trim());

    if (!validation.success) {
      setMessage(validation.error.issues[0]?.message ?? "Enter a valid Ethereum address.");
      setShowDemoLedger(false);
      return;
    }

    setMessage("Address format confirmed. Live wallet retrieval begins on Day 2; no data has been fetched yet.");
    setShowDemoLedger(false);
  }

  function loadDemo() {
    setAddress(demoAddress);
    setMessage("Static demo ledger loaded. This is not live blockchain data.");
    setShowDemoLedger(true);
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
      <p className="text-sm font-medium text-cyan-200">Ethereum-only starter</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
        Start with a public wallet address
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
        Day 1 validates an address and loads a labelled fixture. It does not connect a wallet, call a blockchain provider, or make a tax calculation.
      </p>

      <form className="mt-7" onSubmit={handleSubmit} noValidate>
        <label className="block text-sm font-medium text-slate-100" htmlFor="wallet-address">
          Ethereum wallet address
        </label>
        <input
          id="wallet-address"
          name="wallet-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x..."
          spellCheck={false}
          autoCapitalize="off"
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
          aria-describedby="address-help address-status"
        />
        <p id="address-help" className="mt-2 text-xs leading-5 text-slate-400">
          Use a public 42-character EVM address. Never enter a seed phrase or private key.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            className="min-h-12 rounded-xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Check address
          </button>
          <button
            type="button"
            onClick={loadDemo}
            className="min-h-12 rounded-xl border border-slate-500 px-5 text-sm font-semibold text-white transition hover:border-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Load static demo ledger
          </button>
        </div>
      </form>

      <div id="address-status" className="mt-5" aria-live="polite">
        {message ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
            {message}
          </p>
        ) : null}
      </div>

      {showDemoLedger ? <DemoLedgerPreview /> : null}
    </section>
  );
}

function DemoLedgerPreview() {
  return (
    <section className="mt-6 rounded-2xl border border-cyan-200/20 bg-cyan-100/5 p-5" aria-label="Static demo ledger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-cyan-100">Static demo ledger</p>
          <p className="mt-1 text-xs text-cyan-100/75">
            {DEMO_LEDGER.coverage.fetchedTransactions} fixture transactions · {DEMO_LEDGER.coverage.needsReviewTransactions} needs review
          </p>
        </div>
        <span className="rounded-full border border-cyan-200/30 px-3 py-1 text-xs font-medium text-cyan-100">
          DEMO DATA
        </span>
      </div>
      <ul className="mt-4 divide-y divide-cyan-100/10">
        {DEMO_LEDGER.classifications.map((classification) => {
          const transaction = DEMO_LEDGER.transactions.find(
            (item) => item.id === classification.transactionId,
          );
          const assets = transaction?.assetDeltas.map((asset) => asset.symbol).join(" / ") ?? "Unknown asset";

          return (
            <li className="flex items-center justify-between gap-4 py-3 text-sm" key={classification.transactionId}>
              <span className="font-mono text-cyan-50">{assets}</span>
              <span className="capitalize text-slate-200">{classification.category.replace("_", " ")}</span>
              <span className="text-xs text-slate-400">{Math.round(classification.confidence * 100)}% confidence</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

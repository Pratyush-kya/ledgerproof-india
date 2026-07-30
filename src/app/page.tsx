import { AddressAnalyzer } from "@/components/address-analyzer";
import { configuredReportReceiptAddress } from "@/lib/report-receipt-config";

export default function Home() {
  const receiptContractAddress = configuredReportReceiptAddress(
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_REPORT_RECEIPT_ADDRESS,
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#17304e,_#06111f_48rem)] px-5 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-slate-700/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-cyan-300 uppercase">
              LedgerProof India
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Crypto tax reconciliation, with the evidence left visible.
            </h1>
          </div>
          <p className="max-w-xs text-sm leading-6 text-slate-300">
            Day 7 release candidate · Ethereum-only · evidence before conclusions.
          </p>
        </header>

        <section className="py-10">
          <AddressAnalyzer
            receiptContractAddress={receiptContractAddress}
          />
        </section>

        <aside
          className="grid gap-4 pb-10 md:grid-cols-2"
          aria-label="Product scope"
        >
            <div className="rounded-2xl border border-cyan-200/15 bg-slate-950/45 p-5 shadow-2xl shadow-slate-950/20">
              <h2 className="text-lg font-semibold text-white">What the result proves</h2>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li><span className="mr-2 font-mono text-cyan-300">01</span>Shows exactly which records were covered.</li>
                <li><span className="mr-2 font-mono text-cyan-300">02</span>Runs classification and arithmetic through deterministic rules.</li>
                <li><span className="mr-2 font-mono text-cyan-300">03</span>Keeps unknowns, FIFO evidence, and limitations visible.</li>
              </ol>
            </div>
            <div className="rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5 text-sm leading-6 text-amber-50">
              <h2 className="font-semibold text-amber-100">Important boundary</h2>
              <p className="mt-2">
                This is a reconciliation preview, not tax advice, an ITR filing service, or a request for private keys. It will show coverage and unknowns instead of guessing.
              </p>
            </div>
        </aside>

        <footer className="border-t border-slate-700/70 pt-6 text-sm text-slate-400">
          Public address only. No wallet connection is needed to read a public ledger.
        </footer>
      </div>
    </main>
  );
}

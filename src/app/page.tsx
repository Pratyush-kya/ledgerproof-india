import { AddressAnalyzer } from "@/components/address-analyzer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#17304e,_#06111f_48rem)] px-5 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
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
            Day 1 prototype · Ethereum address validation and static demo ledger only.
          </p>
        </header>

        <section className="grid gap-6 py-10 lg:grid-cols-[1.45fr_0.85fr]">
          <AddressAnalyzer />
          <aside className="space-y-4" aria-label="Product scope">
            <div className="rounded-2xl border border-cyan-200/15 bg-slate-950/45 p-5 shadow-2xl shadow-slate-950/20">
              <h2 className="text-lg font-semibold text-white">What this preview will do</h2>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li><span className="mr-2 font-mono text-cyan-300">01</span>Read public Ethereum wallet activity.</li>
                <li><span className="mr-2 font-mono text-cyan-300">02</span>Classify and reconcile transaction evidence.</li>
                <li><span className="mr-2 font-mono text-cyan-300">03</span>Produce a transparent tax-review summary.</li>
              </ol>
            </div>
            <div className="rounded-2xl border border-amber-200/20 bg-amber-100/5 p-5 text-sm leading-6 text-amber-50">
              <h2 className="font-semibold text-amber-100">Important boundary</h2>
              <p className="mt-2">
                This is a reconciliation preview, not tax advice, an ITR filing service, or a request for private keys. It will show coverage and unknowns instead of guessing.
              </p>
            </div>
          </aside>
        </section>

        <footer className="border-t border-slate-700/70 pt-6 text-sm text-slate-400">
          Public address only. No wallet connection is needed to read a public ledger.
        </footer>
      </div>
    </main>
  );
}

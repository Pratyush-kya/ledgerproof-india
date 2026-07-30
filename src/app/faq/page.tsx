import Link from "next/link";

import { FaqList } from "@/components/faq-list";
import { FAQ_ITEMS } from "@/lib/faq-content";

export const metadata = {
  title: "FAQ & Help | LedgerProof India",
  description:
    "Beginner-friendly answers about LedgerProof India's evidence-first Ethereum tax-reconciliation preview.",
};

export default function FaqPage() {
  return (
    <main className="flex-1 bg-[radial-gradient(circle_at_top,_#17304e,_#06111f_48rem)] px-5 py-10 text-slate-100 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-cyan-300 uppercase">
          FAQ &amp; Help
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Clear answers before you trust a number.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
          LedgerProof is a tax-reconciliation preview, not an ITR-filing
          service. It never needs a private key or seed phrase, and it leaves
          uncertain information excluded or marked Needs review.
        </p>

        <div className="mt-8 rounded-2xl border border-amber-200/25 bg-amber-100/5 p-5 text-sm leading-6 text-amber-50">
          A public wallet cannot reveal every centralized-exchange trade,
          acquisition cost, TDS credit, or relationship between wallets. Keep
          those limits in mind when reviewing any result.
        </div>

        <div className="mt-10">
          <FaqList items={FAQ_ITEMS} />
        </div>

        <aside className="mt-10 rounded-2xl border border-cyan-200/20 bg-cyan-100/5 p-6">
          <h2 className="text-xl font-semibold text-white">
            Something wrong or still unclear?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Send a safe issue report. Do not include a complete report, seed
            phrase, private key, PAN, password, or wallet history.
          </p>
          <Link
            href="/feedback?from=%2Ffaq&source=faq"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
          >
            Report an issue
          </Link>
        </aside>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNavigation() {
  const pathname = usePathname();
  const feedbackHref =
    `/feedback?from=${encodeURIComponent(pathname)}` +
    "&source=navigation";

  return (
    <header className="border-b border-slate-700/70 bg-slate-950/85 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link
          href="/"
          className="text-base font-semibold tracking-wide text-white transition hover:text-cyan-200 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
        >
          LedgerProof India
        </Link>
        <nav
          className="flex flex-wrap items-center gap-2 text-sm"
          aria-label="Primary navigation"
        >
          <Link
            href="/faq"
            aria-current={pathname === "/faq" ? "page" : undefined}
            className="min-h-10 rounded-lg px-3 py-2 font-medium text-slate-200 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 aria-[current=page]:bg-cyan-300/10 aria-[current=page]:text-cyan-100"
          >
            FAQ &amp; Help
          </Link>
          <Link
            href={feedbackHref}
            aria-current={pathname === "/feedback" ? "page" : undefined}
            className="min-h-10 rounded-lg border border-cyan-300/45 px-3 py-2 font-semibold text-cyan-100 transition hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            Report an issue
          </Link>
        </nav>
      </div>
    </header>
  );
}

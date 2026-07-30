"use client";

import { useMemo, useState } from "react";

import type { FaqItem } from "@/lib/faq-content";

export function FaqList({ items }: { items: FaqItem[] }) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      `${item.question} ${item.answer}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, query]);

  return (
    <section aria-labelledby="faq-list-heading">
      <h2 id="faq-list-heading" className="sr-only">
        Frequently asked questions
      </h2>
      <label
        htmlFor="faq-search"
        className="block text-sm font-semibold text-slate-100"
      >
        Search questions and answers
      </label>
      <input
        id="faq-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Try “seed phrase”, “FIFO”, or “TDS”"
        autoComplete="off"
        className="mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
        aria-describedby="faq-result-count"
      />
      <p
        id="faq-result-count"
        className="mt-2 text-sm text-slate-400"
        role="status"
        aria-live="polite"
      >
        {filteredItems.length}{" "}
        {filteredItems.length === 1 ? "answer" : "answers"} shown
      </p>

      {filteredItems.length > 0 ? (
        <div className="mt-6 space-y-3">
          {filteredItems.map((item) => (
            <details
              key={item.id}
              className="group rounded-2xl border border-white/10 bg-slate-950/65 open:border-cyan-200/30 open:bg-slate-950/90"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left font-semibold text-white outline-none transition hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-200 [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="text-xl leading-none text-cyan-300 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="border-t border-white/10 px-5 py-4 text-sm leading-6 text-slate-300">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      ) : (
        <div
          className="mt-6 rounded-2xl border border-amber-200/25 bg-amber-100/5 p-5"
          role="status"
        >
          <p className="font-semibold text-amber-100">No matching answer</p>
          <p className="mt-2 text-sm text-slate-300">
            Clear the search or report a question that this page should cover.
          </p>
        </div>
      )}
    </section>
  );
}

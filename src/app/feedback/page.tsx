import { FeedbackForm } from "@/components/feedback-form";
import {
  configuredSupportEmail,
  type FeedbackType,
} from "@/lib/feedback-schema";

export const metadata = {
  title: "Report an issue | LedgerProof India",
  description:
    "Safely report a LedgerProof India bug, data problem, or unclear result.",
};

type SearchValue = string | string[] | undefined;

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function safeOriginatingPage(value: SearchValue) {
  const page = firstValue(value);
  if (
    page &&
    page.length <= 500 &&
    page.startsWith("/") &&
    !page.startsWith("//")
  ) {
    return page;
  }
  return "/feedback";
}

function initialFeedbackType(source: SearchValue): FeedbackType {
  switch (firstValue(source)) {
    case "needs-review":
      return "wrong_classification";
    case "analysis-error":
      return "bug";
    default:
      return "other";
  }
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const params = await searchParams;
  const supportEmail = configuredSupportEmail(
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  );

  return (
    <main className="flex-1 bg-[radial-gradient(circle_at_top,_#17304e,_#06111f_48rem)] px-5 py-10 text-slate-100 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-cyan-300 uppercase">
          Safe feedback
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Report an issue
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-300">
          Describe one problem without attaching a complete wallet history or
          tax report. Optional contact and reference fields are sent only when
          you enter them.
        </p>

        <section className="mt-8 rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
          <FeedbackForm
            currentPage={safeOriginatingPage(params.from)}
            initialType={initialFeedbackType(params.source)}
            supportEmail={supportEmail}
          />
        </section>
      </div>
    </main>
  );
}

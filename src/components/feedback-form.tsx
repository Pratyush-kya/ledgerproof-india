"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { APP_VERSION } from "@/lib/app-version";
import {
  FeedbackApiErrorSchema,
  FeedbackApiSuccessSchema,
  FeedbackSubmissionSchema,
  type FeedbackSubmission,
  type FeedbackType,
} from "@/lib/feedback-schema";

const FEEDBACK_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: "bug", label: "Bug" },
  { value: "wrong_classification", label: "Wrong classification" },
  { value: "missing_transaction", label: "Missing transaction" },
  { value: "data_or_price_issue", label: "Data or price issue" },
  { value: "tax_explanation_unclear", label: "Tax explanation unclear" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Other" },
];

type FormStatus =
  | "idle"
  | "validation-error"
  | "submitting"
  | "success"
  | "server-error";

type FieldErrors = Partial<
  Record<keyof FeedbackSubmission, string[] | undefined>
>;

function valueFromForm(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function FieldError({
  id,
  errors,
}: {
  id: string;
  errors: string[] | undefined;
}) {
  if (!errors?.[0]) {
    return null;
  }

  return (
    <p id={id} className="mt-2 text-xs text-rose-200">
      {errors[0]}
    </p>
  );
}

export function FeedbackForm({
  currentPage,
  initialType,
  supportEmail,
}: {
  currentPage: string;
  initialType: FeedbackType;
  supportEmail: string | null;
}) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (status === "success") {
      successRef.current?.focus();
    }
  }, [status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const input = {
      feedbackType: valueFromForm(formData, "feedbackType"),
      message: valueFromForm(formData, "message"),
      email: valueFromForm(formData, "email"),
      transactionHash: valueFromForm(formData, "transactionHash"),
      reportReference: valueFromForm(formData, "reportReference"),
      currentPage,
      appVersion: APP_VERSION,
      website: valueFromForm(formData, "website"),
      sensitiveInformationConfirmed:
        formData.get("sensitiveInformationConfirmed") === "on",
    };
    const parsed = FeedbackSubmissionSchema.safeParse(input);

    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setServerMessage(
        "Review the highlighted fields. Nothing has been submitted.",
      );
      setStatus("validation-error");
      return;
    }

    submissionLock.current = true;
    setFieldErrors({});
    setServerMessage(null);
    setReferenceId(null);
    setStatus("submitting");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json().catch(() => null);
      const success = FeedbackApiSuccessSchema.safeParse(payload);

      if (response.ok && success.success) {
        setReferenceId(success.data.data.referenceId);
        setStatus("success");
        formRef.current?.reset();
        return;
      }

      const failure = FeedbackApiErrorSchema.safeParse(payload);
      setServerMessage(
        failure.success
          ? failure.data.error.message
          : "Feedback could not be submitted. Your message remains in the form; please retry.",
      );
      setStatus("server-error");
    } catch {
      setServerMessage(
        "Feedback could not reach the server. Your message remains in the form; check your connection and retry.",
      );
      setStatus("server-error");
    } finally {
      submissionLock.current = false;
    }
  }

  function startAnotherSubmission() {
    setStatus("idle");
    setReferenceId(null);
    setServerMessage(null);
    setFieldErrors({});
  }

  if (status === "success" && referenceId) {
    return (
      <section
        ref={successRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-emerald-200/30 bg-emerald-100/5 p-6"
        aria-labelledby="feedback-success-heading"
      >
        <h2
          id="feedback-success-heading"
          className="text-xl font-semibold text-emerald-100"
        >
          Feedback submitted
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          Keep this reference if you need to follow up:
        </p>
        <p className="mt-2 break-all font-mono text-base font-semibold text-white">
          {referenceId}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={startAnotherSubmission}
            className="min-h-11 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
          >
            Submit another report
          </button>
          <Link
            href="/"
            className="min-h-11 rounded-xl border border-slate-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
          >
            Return to analysis
          </Link>
        </div>
      </section>
    );
  }

  const isSubmitting = status === "submitting";
  const fieldClass =
    "mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 aria-[invalid=true]:border-rose-300";

  return (
    <>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6"
      >
        <div>
          <label
            htmlFor="feedback-type"
            className="text-sm font-semibold text-slate-100"
          >
            Feedback type
          </label>
          <select
            id="feedback-type"
            name="feedbackType"
            defaultValue={initialType}
            className={fieldClass}
            aria-invalid={Boolean(fieldErrors.feedbackType)}
            aria-describedby={
              fieldErrors.feedbackType ? "feedback-type-error" : undefined
            }
          >
            {FEEDBACK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError
            id="feedback-type-error"
            errors={fieldErrors.feedbackType}
          />
        </div>

        <div>
          <label
            htmlFor="feedback-message"
            className="text-sm font-semibold text-slate-100"
          >
            Message <span className="text-rose-200">*</span>
          </label>
          <textarea
            id="feedback-message"
            name="message"
            rows={7}
            minLength={20}
            maxLength={2000}
            required
            placeholder="Describe what happened, what you expected, and any safe steps to reproduce it."
            className={`${fieldClass} py-3`}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby="feedback-message-help feedback-message-error"
          />
          <p
            id="feedback-message-help"
            className="mt-2 text-xs leading-5 text-slate-400"
          >
            20–2000 characters. Do not paste a complete wallet history, report,
            CSV, seed phrase, or private key.
          </p>
          <FieldError
            id="feedback-message-error"
            errors={fieldErrors.message}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="feedback-email"
              className="text-sm font-semibold text-slate-100"
            >
              Email <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="feedback-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={fieldClass}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={
                fieldErrors.email ? "feedback-email-error" : undefined
              }
            />
            <FieldError
              id="feedback-email-error"
              errors={fieldErrors.email}
            />
          </div>
          <div>
            <label
              htmlFor="feedback-transaction"
              className="text-sm font-semibold text-slate-100"
            >
              Transaction hash{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="feedback-transaction"
              name="transactionHash"
              type="text"
              spellCheck={false}
              autoCapitalize="off"
              placeholder="0x + 64 hexadecimal characters"
              className={`${fieldClass} font-mono`}
              aria-invalid={Boolean(fieldErrors.transactionHash)}
              aria-describedby={
                fieldErrors.transactionHash
                  ? "feedback-transaction-error"
                  : undefined
              }
            />
            <FieldError
              id="feedback-transaction-error"
              errors={fieldErrors.transactionHash}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="feedback-report-reference"
            className="text-sm font-semibold text-slate-100"
          >
            Report ID or report hash{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="feedback-report-reference"
            name="reportReference"
            type="text"
            maxLength={200}
            spellCheck={false}
            className={`${fieldClass} font-mono`}
            aria-invalid={Boolean(fieldErrors.reportReference)}
            aria-describedby={
              fieldErrors.reportReference
                ? "feedback-report-reference-error"
                : undefined
            }
          />
          <FieldError
            id="feedback-report-reference-error"
            errors={fieldErrors.reportReference}
          />
        </div>

        <div aria-hidden="true" className="absolute -left-[10000px] top-auto">
          <label htmlFor="feedback-website">Website</label>
          <input
            id="feedback-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="rounded-xl border border-amber-200/25 bg-amber-100/5 p-4">
          <label className="flex items-start gap-3 text-sm leading-6 text-amber-50">
            <input
              name="sensitiveInformationConfirmed"
              type="checkbox"
              required
              className="mt-1 h-4 w-4 shrink-0 accent-cyan-300"
              aria-invalid={Boolean(
                fieldErrors.sensitiveInformationConfirmed,
              )}
              aria-describedby="sensitive-confirmation-error"
            />
            <span>
              I have not included a seed phrase, private key, PAN, password, or
              other sensitive personal information.
            </span>
          </label>
          <FieldError
            id="sensitive-confirmation-error"
            errors={fieldErrors.sensitiveInformationConfirmed}
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4 text-xs leading-5 text-slate-400">
          <p>
            Submitted: the fields you enter, originating page{" "}
            <span className="font-mono text-slate-300">{currentPage}</span>, and
            app version{" "}
            <span className="font-mono text-slate-300">{APP_VERSION}</span>.
            LedgerProof does not automatically attach a wallet address,
            transaction history, tax report, or CSV.
          </p>
          {supportEmail ? (
            <p className="mt-2">
              Prefer email?{" "}
              <a
                href={`mailto:${supportEmail}`}
                className="font-semibold text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 hover:text-cyan-100"
              >
                Contact project support
              </a>
              .
            </p>
          ) : null}
        </div>

        {status === "validation-error" || status === "server-error" ? (
          <div
            className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-4"
            role="alert"
          >
            <p className="font-semibold text-rose-100">
              {status === "validation-error"
                ? "Feedback not submitted"
                : "Submission failed"}
            </p>
            <p className="mt-1 text-sm leading-6 text-rose-50">
              {serverMessage}
            </p>
            {supportEmail ? (
              <a
                href={`mailto:${supportEmail}`}
                className="mt-2 inline-block text-sm font-semibold text-rose-100 underline underline-offset-4"
              >
                Use the fallback support email
              </a>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-12 rounded-xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting
            ? "Submitting feedback…"
            : status === "server-error"
              ? "Retry submission"
              : "Submit feedback"}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {isSubmitting ? "Submitting feedback." : ""}
        </span>
      </form>
    </>
  );
}

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { APP_VERSION } from "@/lib/app-version";
import {
  FeedbackApiErrorSchema,
  FeedbackApiSuccessSchema,
  FeedbackSubmissionSchema,
} from "@/lib/feedback-schema";
import {
  consumeRequestBudget,
  requestClientKey,
} from "@/lib/request-guard";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 16 * 1024;
const PROVIDER_TIMEOUT_MS = 8_000;

function errorResponse(
  status: number,
  code: z.infer<typeof FeedbackApiErrorSchema>["error"]["code"],
  message: string,
  retryable: boolean,
) {
  return NextResponse.json(
    FeedbackApiErrorSchema.parse({
      error: { code, message, retryable },
    }),
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function configuredEndpoint(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const endpoint = new URL(value.trim());
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password
    ) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}

function feedbackReferenceId() {
  return `LPF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function POST(request: Request) {
  if (
    !consumeRequestBudget({
      namespace: "feedback",
      clientKey: requestClientKey(request),
      limit: 5,
      windowMs: 60_000,
    })
  ) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Too many feedback attempts. Please retry in about a minute.",
      true,
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(
        413,
        "INVALID_REQUEST",
        "Feedback request is too large.",
        false,
      );
    }
    if (!(error instanceof InvalidJsonBodyError)) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Feedback request could not be read.",
        false,
      );
    }
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Feedback request must be valid JSON.",
      false,
    );
  }

  const parsed = FeedbackSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Review the feedback fields and sensitive-information confirmation.",
      false,
    );
  }

  if (parsed.data.website.trim()) {
    return errorResponse(
      400,
      "BOT_DETECTED",
      "Feedback could not be accepted.",
      false,
    );
  }

  const endpoint = configuredEndpoint(process.env.FEEDBACK_FORM_ENDPOINT);
  if (!endpoint) {
    return errorResponse(
      503,
      "FEEDBACK_NOT_CONFIGURED",
      "Feedback delivery is not configured. Use the support email link if one is available.",
      false,
    );
  }

  const referenceId = feedbackReferenceId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const providerResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": `LedgerProof-India/${APP_VERSION}`,
      },
      body: JSON.stringify({
        referenceId,
        feedbackType: parsed.data.feedbackType,
        message: parsed.data.message,
        email: parsed.data.email,
        transactionHash: parsed.data.transactionHash,
        reportReference: parsed.data.reportReference,
        currentPage: parsed.data.currentPage,
        appVersion: APP_VERSION,
        sensitiveInformationConfirmed:
          parsed.data.sensitiveInformationConfirmed,
        submittedAt: new Date().toISOString(),
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (!providerResponse.ok) {
      return errorResponse(
        502,
        "FEEDBACK_PROVIDER_FAILED",
        "Feedback delivery failed. Your message was not accepted; please retry or use the support email link.",
        true,
      );
    }

    return NextResponse.json(
      FeedbackApiSuccessSchema.parse({
        data: { referenceId },
      }),
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return errorResponse(
      502,
      "FEEDBACK_PROVIDER_FAILED",
      "Feedback delivery is temporarily unavailable. Your message was not accepted; please retry or use the support email link.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

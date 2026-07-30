import { z } from "zod";

export const FeedbackTypeSchema = z.enum([
  "bug",
  "wrong_classification",
  "missing_transaction",
  "data_or_price_issue",
  "tax_explanation_unclear",
  "feature_request",
  "other",
]);

const optionalTrimmedString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === ""
        ? undefined
        : typeof value === "string"
          ? value.trim()
          : value,
    schema.optional(),
  );

export const FeedbackSubmissionSchema = z.strictObject({
  feedbackType: FeedbackTypeSchema,
  message: z
    .string()
    .trim()
    .min(20, "Message must be at least 20 characters.")
    .max(2000, "Message must be no more than 2000 characters."),
  email: optionalTrimmedString(
    z
      .string()
      .max(320, "Email must be no more than 320 characters.")
      .email("Enter a valid email address."),
  ),
  transactionHash: optionalTrimmedString(
    z
      .string()
      .regex(
        /^0x[a-fA-F0-9]{64}$/,
        "Enter a 0x-prefixed 32-byte transaction hash.",
      ),
  ),
  reportReference: optionalTrimmedString(
    z
      .string()
      .max(200, "Report reference must be no more than 200 characters.")
      .regex(/^[^\r\n]+$/, "Report reference must be a single line."),
  ),
  currentPage: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^\/(?!\/)/, "Current page must be an application path."),
  appVersion: z.string().trim().min(1).max(50),
  website: z.string().max(200).optional().default(""),
  sensitiveInformationConfirmed: z.boolean().refine(Boolean, {
    message:
      "Confirm that the feedback contains no secret or sensitive personal information.",
  }),
});

export const FeedbackApiSuccessSchema = z.strictObject({
  data: z.strictObject({
    referenceId: z.string().min(1).max(80),
  }),
});

export const FeedbackApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "INVALID_REQUEST",
      "BOT_DETECTED",
      "RATE_LIMITED",
      "FEEDBACK_NOT_CONFIGURED",
      "FEEDBACK_PROVIDER_FAILED",
    ]),
    message: z.string().min(1).max(300),
    retryable: z.boolean(),
  }),
});

export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

export function configuredSupportEmail(value: string | undefined) {
  const parsed = z
    .string()
    .trim()
    .max(320)
    .email()
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}

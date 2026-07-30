import { describe, expect, it } from "vitest";

import {
  configuredSupportEmail,
  FeedbackSubmissionSchema,
} from "../src/lib/feedback-schema";

const transactionHash = `0x${"a".repeat(64)}`;

function validFeedback(overrides: Record<string, unknown> = {}) {
  return {
    feedbackType: "bug",
    message: "The analysis stopped after I selected the financial year.",
    email: "",
    transactionHash: "",
    reportReference: "",
    currentPage: "/",
    appVersion: "0.1.0",
    website: "",
    sensitiveInformationConfirmed: true,
    ...overrides,
  };
}

describe("feedback validation", () => {
  it("accepts a valid submission and normalizes optional blank fields", () => {
    const parsed = FeedbackSubmissionSchema.parse(
      validFeedback({ transactionHash }),
    );

    expect(parsed.transactionHash).toBe(transactionHash);
    expect(parsed.email).toBeUndefined();
    expect(parsed.reportReference).toBeUndefined();
  });

  it("enforces both message-length limits", () => {
    expect(
      FeedbackSubmissionSchema.safeParse(
        validFeedback({ message: "x".repeat(19) }),
      ).success,
    ).toBe(false);
    expect(
      FeedbackSubmissionSchema.safeParse(
        validFeedback({ message: "x".repeat(2001) }),
      ).success,
    ).toBe(false);
  });

  it("rejects invalid email and transaction hashes", () => {
    const parsed = FeedbackSubmissionSchema.safeParse(
      validFeedback({
        email: "not-an-email",
        transactionHash: "0x1234",
      }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      expect(errors.email?.[0]).toContain("valid email");
      expect(errors.transactionHash?.[0]).toContain("32-byte");
    }
  });

  it("requires the sensitive-information confirmation", () => {
    const parsed = FeedbackSubmissionSchema.safeParse(
      validFeedback({ sensitiveInformationConfirmed: false }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.flatten().fieldErrors
          .sensitiveInformationConfirmed?.[0],
      ).toContain("secret or sensitive");
    }
  });

  it("accepts only safe application paths and a single-line report reference", () => {
    expect(
      FeedbackSubmissionSchema.safeParse(
        validFeedback({ currentPage: "https://example.com/" }),
      ).success,
    ).toBe(false);
    expect(
      FeedbackSubmissionSchema.safeParse(
        validFeedback({ reportReference: "first\nsecond" }),
      ).success,
    ).toBe(false);
  });

  it("exposes only valid configured support emails", () => {
    expect(configuredSupportEmail(" support@example.test ")).toBe(
      "support@example.test",
    );
    expect(configuredSupportEmail("not-an-email")).toBeNull();
    expect(configuredSupportEmail(undefined)).toBeNull();
  });
});

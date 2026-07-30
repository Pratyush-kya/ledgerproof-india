import { expect, test } from "@playwright/test";

const address = "0x1234567890abcdef1234567890abcdef12345678";

async function completeFeedbackForm(page: import("@playwright/test").Page) {
  await page
    .getByLabel("Message *")
    .fill("The displayed classification does not match the safe evidence.");
  await page.getByLabel(/I have not included a seed phrase/).check();
}

test("renders, filters, and opens the FAQ with keyboard controls", async ({
  page,
}) => {
  await page.goto("/faq");

  await expect(
    page.getByRole("heading", {
      name: "Clear answers before you trust a number.",
    }),
  ).toBeVisible();
  await expect(page.locator("details")).toHaveCount(23);
  await expect(page.getByText("23 answers shown")).toBeVisible();

  const firstSummary = page.locator("summary").filter({
    hasText: "What is LedgerProof India?",
  });
  await firstSummary.focus();
  await page.keyboard.press("Enter");
  await expect(firstSummary.locator("..")).toHaveAttribute("open", "");
  await expect(
    page.getByText(
      "LedgerProof India is an evidence-first crypto tax-reconciliation preview.",
      { exact: false },
    ),
  ).toBeVisible();

  await page
    .getByLabel("Search questions and answers")
    .fill("How many transactions are analyzed?");
  await expect(page.locator("details")).toHaveCount(1);
  await expect(page.getByText("1 answer shown")).toBeVisible();

  await page.getByLabel("Search questions and answers").fill("no-match-xyz");
  await expect(page.getByText("No matching answer")).toBeVisible();
  await expect(
    page
      .getByRole("complementary")
      .getByRole("link", { name: "Report an issue" }),
  ).toBeVisible();
});

test("shows feedback validation for required, invalid, and short fields", async ({
  page,
}) => {
  await page.goto("/feedback?from=%2Ffaq&source=faq");
  await page.getByRole("button", { name: "Submit feedback" }).click();

  await expect(page.getByText("Message must be at least 20 characters.")).toBeVisible();
  await expect(
    page.getByText(
      "Confirm that the feedback contains no secret or sensitive personal information.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Feedback not submitted")).toBeVisible();

  await page.getByLabel("Message *").fill("This is too short.");
  await page.getByLabel("Email (optional)").fill("not-an-email");
  await page.getByLabel("Transaction hash (optional)").fill("0x1234");
  await page.getByRole("button", { name: "Submit feedback" }).click();

  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(
    page.getByText("Enter a 0x-prefixed 32-byte transaction hash."),
  ).toBeVisible();
});

test("prevents double submission and displays the returned reference", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/feedback", async (route) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { referenceId: "LPF-TEST1234" } }),
    });
  });

  await page.goto("/feedback?from=%2F&source=needs-review");
  await expect(page.getByLabel("Feedback type")).toHaveValue(
    "wrong_classification",
  );
  await completeFeedbackForm(page);

  const submit = page.getByRole("button", { name: "Submit feedback" });
  await submit.dblclick();

  await expect(
    page.getByRole("heading", { name: "Feedback submitted" }),
  ).toBeVisible();
  await expect(
    page.locator('section[aria-labelledby="feedback-success-heading"]'),
  ).toBeFocused();
  await expect(page.getByText("LPF-TEST1234")).toBeVisible();
  expect(requests).toBe(1);
});

test("shows missing-configuration and provider retry states without false success", async ({
  page,
}) => {
  await page.route("**/api/feedback", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "FEEDBACK_NOT_CONFIGURED",
          message:
            "Feedback delivery is not configured. Use the support email link if one is available.",
          retryable: false,
        },
      }),
    });
  });

  await page.goto("/feedback");
  await completeFeedbackForm(page);
  await page.getByRole("button", { name: "Submit feedback" }).click();

  await expect(page.getByText("Submission failed")).toBeVisible();
  await expect(page.getByText("Feedback delivery is not configured.", {
    exact: false,
  })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Feedback submitted" }),
  ).toHaveCount(0);

  await page.unroute("**/api/feedback");
  await page.route("**/api/feedback", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "FEEDBACK_PROVIDER_FAILED",
          message:
            "Feedback delivery failed. Your message was not accepted; please retry.",
          retryable: true,
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Retry submission" }).click();
  await expect(page.getByText("Your message was not accepted", {
    exact: false,
  })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry submission" }),
  ).toBeVisible();
});

test("rejects a populated honeypot through the real API route", async ({
  page,
}) => {
  await page.goto("/feedback");
  await completeFeedbackForm(page);
  await page.locator('input[name="website"]').fill("https://bot.example");
  await page.getByRole("button", { name: "Submit feedback" }).click();

  await expect(page.getByText("Feedback could not be accepted.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Feedback submitted" }),
  ).toHaveCount(0);
});

test("opens safe feedback from an analysis error and a Needs Review report", async ({
  page,
}) => {
  await page.route("**/api/analysis/fetch", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Blockchain data is temporarily unavailable.",
          retryable: true,
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Ethereum wallet address").fill(address);
  await page.getByRole("button", { name: "Analyze live wallet" }).click();
  await page.getByRole("link", { name: "Report this issue" }).click();

  await expect(page).toHaveURL(/\/feedback\?from=%2F&source=analysis-error/);
  await expect(page.getByLabel("Feedback type")).toHaveValue("bug");

  await page.goto("/");
  await page.getByRole("button", { name: "Load static demo ledger" }).click();
  await page
    .getByRole("link", { name: "Report a classification or report issue" })
    .click();

  await expect(page).toHaveURL(/\/feedback\?from=%2F&source=needs-review/);
  await expect(page.getByLabel("Feedback type")).toHaveValue(
    "wrong_classification",
  );
});

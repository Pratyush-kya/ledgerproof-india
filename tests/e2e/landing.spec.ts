import { expect, test } from "@playwright/test";

const address = "0x1234567890abcdef1234567890abcdef12345678";

test("renders the complete evidence-first fixture result and correction audit", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Crypto tax reconciliation, with the evidence left visible.",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Load static demo ledger" }).click();

  await expect(page.getByLabel("Ethereum wallet address")).toHaveValue(address);
  await expect(
    page.getByRole("heading", { name: "Reconciliation review" }),
  ).toBeVisible();
  await expect(page.getByText("STATIC DEMO DATA")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Report coverage" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Data limitations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Limited tax preview" }),
  ).toBeVisible();
  await expect(page.getByText("Positive gains", { exact: true })).toBeVisible();
  await expect(page.getByText("VDA losses", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Transaction classifications" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "FIFO lots and disposal matches" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Excluded and unknown items" }),
  ).toBeVisible();

  const firstCorrection = page.getByLabel("Correct category").first();
  await firstCorrection.selectOption("transfer_in");
  await expect(page.getByText("USER CORRECTED")).toBeVisible();
  await expect(
    page.getByText("does not alter deterministic calculations", {
      exact: false,
    }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON evidence" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^ledgerproof-fixture-0x12345678\.json$/,
  );
  await expect(
    page.getByText("JSON export downloaded with the correction audit trail."),
  ).toBeVisible();
});

test("shows a visible and actionable rate-limit state", async ({ page }) => {
  await page.route("**/api/analysis/fetch", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "UPSTREAM_RATE_LIMIT",
          message: "Blockchain data is busy. Please retry shortly.",
          retryable: true,
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Ethereum wallet address").fill(address);
  await page.getByRole("button", { name: "Analyze live wallet" }).click();

  const alert = page.locator("#flow-status");
  await expect(alert).toContainText("Provider rate limit reached");
  await expect(alert).toContainText(
    "Blockchain data is busy. Please retry shortly.",
  );
  await expect(alert).toContainText("This error is retryable.");
  await expect(
    page.getByRole("heading", { name: "Reconciliation review" }),
  ).toHaveCount(0);
});

test("rejects an invalid public address before making a request", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Ethereum wallet address").fill("not-an-address");
  await page.getByRole("button", { name: "Analyze live wallet" }).click();

  await expect(page.locator("#flow-status")).toContainText(
    "Enter a valid 0x Ethereum wallet address.",
  );
});

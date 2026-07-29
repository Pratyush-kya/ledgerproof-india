import { expect, test } from "@playwright/test";

import demoLedger from "../../src/fixtures/demo-ledger.json";

const address = "0x1234567890abcdef1234567890abcdef12345678";
const liveTransaction = demoLedger.transactions[0];

const liveFetchResponse = {
  data: {
    address,
    chainId: 1,
    source: "goldrush",
    fetchedAt: "2026-07-29T09:00:00.000Z",
    transactions: [liveTransaction],
    isEmpty: false,
    truncated: false,
  },
};

const liveReportResponse = {
  data: {
    classificationMode: "rule_fallback",
    classificationNotice:
      "RULE FALLBACK — deterministic classifications are shown because the LLM agent is unavailable.",
    classifications: [
      {
        transactionId: liveTransaction.id,
        category: "transfer_in",
        confidence: 0.5,
        reason:
          "One supported asset received without acquisition-cost evidence.",
        evidenceTxHashes: [liveTransaction.txHash],
        needsReview: true,
        source: "rule",
      },
    ],
    calculation: {
      engineVersion: "0.1",
      method: "deterministic-rules-and-fifo",
      summary: {
        positiveTaxableGainsInrPaisa: "0",
        vdaLossesInrPaisa: "0",
        estimatedBaseTax30PercentInrPaisa: "0",
        includeCess: false,
        estimatedCess4PercentInrPaisa: null,
        estimatedTaxIncludingCessInrPaisa: "0",
        calculatedDisposals: 0,
        excludedTransactions: 1,
        calculationStatus: "partial",
        excludesSurcharge: true,
        excludesTdsCredit: true,
      },
      limitations: [
        "This deterministic preview is not tax advice or an ITR filing service.",
      ],
      remainingLots: [
        {
          lotId: `${liveTransaction.txHash}:eip155:1/slip44:60:0`,
          assetId: "eip155:1/slip44:60",
          symbol: "ETH",
          decimals: 18,
          quantityAtomic: "250000000000000000",
          acquiredAt: liveTransaction.timestamp,
          costBasisInrPaisa: null,
          sourceTxHash: liveTransaction.txHash,
          needsReview: true,
        },
      ],
      disposals: [],
      gasTreatments: [
        {
          transactionId: liveTransaction.id,
          txHash: liveTransaction.txHash,
          gasFeeWei: liveTransaction.gasFeeWei,
          valueInrPaisa: null,
          includedInCostBasis: false,
          deductedFromProceeds: false,
          needsReview: true,
          reason:
            "Gas is reported separately and is not included in basis or proceeds by this preview.",
        },
      ],
    },
    report: {
      title: "Crypto tax reconciliation preview",
      overview:
        "This live provider record needs review because acquisition cost evidence is unavailable.",
      deterministicFindings: [
        "Not calculated: no disposal had complete basis and valuation evidence.",
      ],
      reviewWarnings: [
        "Confirm the acquisition cost before treating this transfer as a purchase.",
      ],
      disclaimer:
        "This is an educational reconciliation estimate, not tax advice or a filing-ready return.",
    },
  },
};

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

test("completes the live-wallet UI flow with validated provider responses", async ({
  page,
}) => {
  await page.route("**/api/analysis/fetch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(liveFetchResponse),
    });
  });
  await page.route("**/api/analysis/report", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(liveReportResponse),
    });
  });

  await page.goto("/");
  await page.getByLabel("Ethereum wallet address").fill(address);
  await page.getByRole("button", { name: "Analyze live wallet" }).click();

  await expect(page.getByText("LIVE PROVIDER DATA")).toBeVisible();
  await expect(page.locator("#flow-status")).toContainText(
    "Loaded and reconciled 1 validated Ethereum transaction.",
  );
  await expect(
    page.getByRole("heading", { name: "Reconciliation review" }),
  ).toBeVisible();
  await expect(page.getByText("RULE FALLBACK", { exact: false })).toBeVisible();
  await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
});

test("shows an explicit empty-history state", async ({ page }) => {
  await page.route("**/api/analysis/fetch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          ...liveFetchResponse.data,
          transactions: [],
          isEmpty: true,
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Ethereum wallet address").fill(address);
  await page.getByRole("button", { name: "Analyze live wallet" }).click();

  await expect(page.locator("#flow-status")).toContainText(
    "No recent Ethereum transactions were returned",
  );
  await expect(
    page.getByRole("heading", { name: "Reconciliation review" }),
  ).toHaveCount(0);
});

test("shows an explicit unavailable-provider state without blocking the demo", async ({
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

  await expect(page.locator("#flow-status")).toContainText(
    "Blockchain data is temporarily unavailable.",
  );
  await page.getByRole("button", { name: "Load static demo ledger" }).click();
  await expect(page.getByText("STATIC DEMO DATA")).toBeVisible();
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

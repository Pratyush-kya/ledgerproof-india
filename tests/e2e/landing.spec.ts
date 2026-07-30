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
    financialYear: "2026-27",
    transactions: [liveTransaction],
    isEmpty: false,
    truncated: false,
    historyComplete: true,
  },
};

function liveReportResponse(resolved = false) {
  return {
    data: {
      classificationMode: "deterministic",
      classificationNotice:
        "DETERMINISTIC RULE ENGINE — tax calculations do not depend on AI.",
      classifications: [
        {
          transactionId: liveTransaction.id,
          category: resolved ? "buy" : "transfer_in",
          confidence: resolved ? 1 : 0.5,
          reason: resolved
            ? "One supported asset received with explicit INR-paid evidence."
            : "One supported asset received without acquisition-cost evidence.",
          evidenceTxHashes: [liveTransaction.txHash],
          needsReview: !resolved,
          source: resolved ? "user" : "rule",
        },
      ],
      calculation: {
        engineVersion: "0.2",
        method: "deterministic-rules-and-fifo",
        summary: {
          positiveTaxableGainsInrPaisa: "0",
          vdaLossesInrPaisa: "0",
          estimatedBaseTax30PercentInrPaisa: "0",
          includeCess: false,
          estimatedCess4PercentInrPaisa: null,
          estimatedTaxIncludingCessInrPaisa: "0",
          calculatedDisposals: 0,
          excludedTransactions: resolved ? 0 : 1,
          supportedAssetMovements: 1,
          needsUserEvidence: resolved ? 0 : 1,
          quarantinedAssetMovements: 0,
          unsafeUnsupportedAssetMovements: 0,
          historyComplete: true,
          calculationPeriod: {
            start: "2026-04-01T00:00:00.000Z",
            endExclusive: "2027-04-01T00:00:00.000Z",
          },
          calculationStatus: "no_supported_disposals",
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
            costBasisInrPaisa: resolved ? "5400000" : null,
            sourceTxHash: liveTransaction.txHash,
            needsReview: !resolved,
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
        quarantinedAssets: [],
        unsupportedAssetsRequiringReview: [],
      },
      report: {
        title: "Deterministic crypto tax reconciliation preview",
        overview:
          "No supported disposals were detected in the available history.",
        deterministicFindings: [
          "No supported disposals were detected in the available history.",
        ],
        reviewWarnings: [
          resolved
            ? "No transaction classification currently needs user evidence."
            : "1 transaction needs user evidence.",
        ],
        disclaimer:
          "This is an educational reconciliation estimate, not tax advice or a filing-ready return.",
      },
    },
  };
}

test("renders the complete evidence-first fixture result and evidence export", async ({
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
    page.getByRole("heading", { name: "Items needing evidence" }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON evidence" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^ledgerproof-fixture-0x12345678\.json$/,
  );
  await expect(
    page.getByText(
      "JSON evidence downloaded, including quarantined movements.",
    ),
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

test("resolves missing INR evidence and reruns deterministic FIFO", async ({
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
    const requestBody = route.request().postDataJSON() as {
      evidence?: unknown[];
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        liveReportResponse(Boolean(requestBody.evidence?.length)),
      ),
    });
  });

  await page.goto("/");
  await page.getByLabel("Ethereum wallet address").fill(address);
  await page.getByRole("button", { name: "Analyze live wallet" }).click();

  await expect(page.getByText("LIVE PROVIDER DATA")).toBeVisible();
  await expect(page.locator("#flow-status")).toContainText(
    "Reconciled 1 validated transaction with 0 user evidence records",
  );
  await expect(
    page.getByText("DETERMINISTIC RULE ENGINE", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resolve missing evidence" }),
  ).toBeVisible();

  await page.getByLabel("INR paid").fill("54000.00");
  await page.getByRole("button", { name: "Apply and recalculate" }).click();

  await expect(
    page.getByRole("heading", { name: "Evidence review complete" }),
  ).toBeVisible();
  await expect(
    page.getByText("USER EVIDENCE", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#flow-status")).toContainText(
    "with 1 user evidence record",
  );
  await expect(page.getByText("₹54,000.00")).toBeVisible();
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
    "No Ethereum transactions were returned for FY",
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

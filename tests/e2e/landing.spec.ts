import { expect, test } from "@playwright/test";

test("validates a public address and loads clearly labelled static data", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Crypto tax reconciliation, with the evidence left visible." }),
  ).toBeVisible();

  const addressInput = page.getByLabel("Ethereum wallet address");
  await addressInput.fill("not-an-address");
  await page.getByRole("button", { name: "Analyze live wallet" }).click();
  await expect(page.getByText("Enter a valid 0x Ethereum wallet address.")).toBeVisible();

  await page.getByRole("button", { name: "Load static demo ledger" }).click();
  await expect(addressInput).toHaveValue("0x1234567890abcdef1234567890abcdef12345678");
  await expect(page.getByLabel("Static demo ledger")).toBeVisible();
  await expect(page.getByText("DEMO DATA")).toBeVisible();
});

test("shows a live label only after a successful validated API response", async ({ page }) => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";
  const txHash = `0x${"c".repeat(64)}`;

  await page.route("**/api/analysis/fetch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          address,
          chainId: 1,
          source: "goldrush",
          fetchedAt: "2026-07-26T10:00:00Z",
          transactions: [
            {
              id: txHash,
              txHash,
              chainId: 1,
              blockNumber: 23010000,
              timestamp: "2026-07-25T09:00:00Z",
              from: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
              to: address,
              explorerUrl: `https://etherscan.io/tx/${txHash}`,
              status: "confirmed",
              assetDeltas: [
                {
                  assetId: "eip155:1/slip44:60",
                  symbol: "ETH",
                  decimals: 18,
                  amountAtomic: "100000000000000000",
                  direction: "in",
                  standard: "native"
                }
              ],
              gasFeeWei: "21000000000000"
            }
          ],
          isEmpty: false,
          truncated: false
        }
      })
    });
  });

  await page.goto("/");
  await expect(page.getByText("LIVE PROVIDER DATA")).toHaveCount(0);
  await page.getByLabel("Ethereum wallet address").fill(address);
  await page.getByRole("button", { name: "Analyze live wallet" }).click();

  await expect(
    page.getByText("Loaded and reconciled 1 validated Ethereum transactions."),
  ).toBeVisible();
  await expect(page.getByLabel("Validated provider transactions")).toBeVisible();
  await expect(page.getByText("LIVE PROVIDER DATA")).toBeVisible();
  await expect(page.getByLabel("Plain-English tax report")).toBeVisible();
  await expect(page.getByText("RULE FALLBACK", { exact: true })).toBeVisible();
  await expect(
    page.getByText("deterministic rules still own every financial calculation", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("educational reconciliation estimate", { exact: false }),
  ).toBeVisible();
});

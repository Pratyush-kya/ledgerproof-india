import { expect, test } from "@playwright/test";

test("validates a public address and loads clearly labelled static data", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Crypto tax reconciliation, with the evidence left visible." }),
  ).toBeVisible();

  const addressInput = page.getByLabel("Ethereum wallet address");
  await addressInput.fill("not-an-address");
  await page.getByRole("button", { name: "Check address" }).click();
  await expect(page.getByText("Enter a valid 0x Ethereum wallet address.")).toBeVisible();

  await page.getByRole("button", { name: "Load static demo ledger" }).click();
  await expect(addressInput).toHaveValue("0x1234567890abcdef1234567890abcdef12345678");
  await expect(page.getByLabel("Static demo ledger")).toBeVisible();
  await expect(page.getByText("DEMO DATA")).toBeVisible();
});

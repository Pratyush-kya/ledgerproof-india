import { expect, test, type Page } from "@playwright/test";

const account = "0x2222222222222222222222222222222222222222";
const contract = "0x1111111111111111111111111111111111111111";
const transactionHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function openReceipt(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load static demo ledger" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Optional Base Sepolia report receipt",
    }),
  ).toBeVisible();
}

async function installProvider(
  page: Page,
  options: {
    chainId?: string;
    rejectAccounts?: boolean;
    rejectTransaction?: boolean;
    duplicate?: boolean;
    confirmTransaction?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({
      account,
      chainId,
      confirmTransaction,
      contract,
      duplicate,
      rejectAccounts,
      rejectTransaction,
      transactionHash,
    }) => {
      const zeroReceipt = `0x${"0".repeat(128)}`;
      const ownerWord = `${"0".repeat(24)}${account.slice(2)}`;
      const timestampWord = Math.floor(Date.now() / 1_000)
        .toString(16)
        .padStart(64, "0");
      type ReceiptTestControls = {
        releaseReceipt?: () => void;
        releaseTransaction?: () => void;
      };
      const controls: ReceiptTestControls = {};
      const testWindow = window as typeof window & {
        __receiptTestControls: ReceiptTestControls;
      };
      testWindow.__receiptTestControls = controls;

      const provider = {
        request: async ({ method }: { method: string }) => {
          switch (method) {
            case "eth_requestAccounts":
              if (rejectAccounts) {
                throw Object.assign(new Error("Request rejected"), {
                  code: 4001,
                });
              }
              return [account];
            case "eth_accounts":
              return [account];
            case "eth_chainId":
              return chainId;
            case "eth_call":
              return duplicate
                ? `0x${ownerWord}${timestampWord}`
                : zeroReceipt;
            case "eth_sendTransaction":
              if (rejectTransaction) {
                await new Promise<void>((resolve) => {
                  controls.releaseTransaction = resolve;
                });
                throw Object.assign(new Error("Transaction rejected"), {
                  code: 4001,
                });
              }
              return transactionHash;
            case "eth_getTransactionReceipt":
              if (!confirmTransaction) {
                return null;
              }
              await new Promise<void>((resolve) => {
                controls.releaseReceipt = resolve;
              });
              return {
                blockHash:
                  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                blockNumber: "0x1",
                contractAddress: null,
                cumulativeGasUsed: "0x5208",
                effectiveGasPrice: "0x1",
                from: account,
                gasUsed: "0x5208",
                logs: [],
                logsBloom: `0x${"0".repeat(512)}`,
                status: "0x1",
                to: contract,
                transactionHash,
                transactionIndex: "0x0",
                type: "0x2",
              };
            case "eth_blockNumber":
              return "0x1";
            default:
              throw new Error(`Unexpected wallet method: ${method}`);
          }
        },
      };
      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: provider,
      });
    },
    {
      account,
      chainId: options.chainId ?? "0x14a34",
      confirmTransaction: options.confirmTransaction ?? false,
      contract,
      duplicate: options.duplicate ?? false,
      rejectAccounts: options.rejectAccounts ?? false,
      rejectTransaction: options.rejectTransaction ?? false,
      transactionHash,
    },
  );
}

test("shows a provider error without a browser wallet", async ({ page }) => {
  await openReceipt(page);
  await page
    .getByRole("button", { name: "Connect wallet and review hash" })
    .click();
  await expect(
    page
      .getByRole("region", {
        name: "Optional Base Sepolia report receipt",
      })
      .getByRole("alert"),
  ).toContainText("Wallet or RPC unavailable.");
});

test("shows a rejected connection request without sending", async ({ page }) => {
  await installProvider(page, { rejectAccounts: true });
  await openReceipt(page);
  await page
    .getByRole("button", { name: "Connect wallet and review hash" })
    .click();
  await expect(page.getByText("Rejected:", { exact: false })).toBeVisible();
});

test("shows the wrong-chain state without sending", async ({ page }) => {
  await installProvider(page, { chainId: "0x1" });
  await openReceipt(page);
  await page
    .getByRole("button", { name: "Connect wallet and review hash" })
    .click();
  await expect(page.getByText("Wrong chain:", { exact: false })).toBeVisible();
});

test("separates connection from confirmation and handles wallet rejection", async ({
  page,
}) => {
  await installProvider(page, { rejectTransaction: true });
  await openReceipt(page);

  await page
    .getByRole("button", { name: "Connect wallet and review hash" })
    .click();
  await expect(
    page.getByText("Connected on Base Sepolia.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/^Report hash: 0x[0-9a-f]{64}$/)).toBeVisible();

  await page
    .getByRole("button", { name: "Confirm receipt in wallet" })
    .dispatchEvent("click");
  await expect(page.getByText("Confirmation:", { exact: false })).toBeVisible();
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __receiptTestControls?: {
        releaseTransaction?: () => void;
      };
    };
    testWindow.__receiptTestControls?.releaseTransaction?.();
  });
  await expect(page.getByText("Rejected:", { exact: false })).toBeVisible();
});

test("shows an existing duplicate receipt", async ({ page }) => {
  await installProvider(page, { duplicate: true });
  await openReceipt(page);
  await page
    .getByRole("button", { name: "Connect wallet and review hash" })
    .click();

  await expect(
    page.getByText("Duplicate receipt:", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(`Owner: ${account.slice(0, 10)}…${account.slice(-6)}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm receipt in wallet" }),
  ).toHaveCount(0);
});

test("shows pending and confirmed transaction states", async ({ page }) => {
  await installProvider(page, { confirmTransaction: true });
  await openReceipt(page);
  await page
    .getByRole("button", { name: "Connect wallet and review hash" })
    .click();
  await page
    .getByRole("button", { name: "Confirm receipt in wallet" })
    .dispatchEvent("click");

  await expect(page.getByText("Pending:", { exact: false })).toBeVisible();
  await page.waitForFunction(() => {
    const testWindow = window as typeof window & {
      __receiptTestControls?: {
        releaseReceipt?: () => void;
      };
    };
    return Boolean(testWindow.__receiptTestControls?.releaseReceipt);
  });
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __receiptTestControls?: {
        releaseReceipt?: () => void;
      };
    };
    testWindow.__receiptTestControls?.releaseReceipt?.();
  });
  await expect(
    page.getByText("Success: the receipt is confirmed", { exact: false }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("link", { name: /Verify transaction/ }),
  ).toHaveAttribute(
    "href",
    `https://sepolia-explorer.base.org/tx/${transactionHash}`,
  );
});

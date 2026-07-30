import { describe, expect, it } from "vitest";

import { parseOpeningLotCsv } from "../src/lib/opening-lot-csv";

const hash = `0x${"a".repeat(64)}`;

describe("opening FIFO lot CSV", () => {
  it("converts supported asset quantities and INR into exact integers", () => {
    const lots = parseOpeningLotCsv(
      [
        "asset,quantity,acquired_at,cost_basis_inr,transaction_hash",
        `ETH,0.25,2024-04-10,54000.25,${hash}`,
      ].join("\n"),
    );

    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      symbol: "ETH",
      quantityAtomic: "250000000000000000",
      costBasisInrPaisa: "5400025",
      acquiredAt: "2024-04-10T00:00:00.000Z",
      sourceTxHash: hash,
    });
  });

  it("rejects unknown assets, unsafe precision, and incorrect headers", () => {
    const header =
      "asset,quantity,acquired_at,cost_basis_inr,transaction_hash";

    expect(() =>
      parseOpeningLotCsv(
        `${header}\nDOGE,1,2024-04-10,10.00,${hash}`,
      ),
    ).toThrow(/ETH, WETH, USDC, or USDT/);
    expect(() =>
      parseOpeningLotCsv(
        `${header}\nUSDC,0.0000001,2024-04-10,10.00,${hash}`,
      ),
    ).toThrow(/more than 6 decimal places/);
    expect(() =>
      parseOpeningLotCsv(
        `asset,quantity,date,cost,hash\nETH,1,2024-04-10,10.00,${hash}`,
      ),
    ).toThrow(/header must be exactly/);
  });
});

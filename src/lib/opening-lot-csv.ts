import { SUPPORTED_ASSET_REGISTRY } from "@/lib/asset-registry";
import {
  MAX_DEMO_TRANSACTIONS,
  OpeningLotSchema,
  type OpeningLot,
} from "@/lib/schemas";

const EXPECTED_HEADERS = [
  "asset",
  "quantity",
  "acquired_at",
  "cost_basis_inr",
  "transaction_hash",
] as const;

function parseCsvRow(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  if (quoted) {
    throw new Error("CSV contains an unclosed quoted value.");
  }
  cells.push(current.trim());
  return cells;
}

function decimalToAtomic(
  value: string,
  decimals: number,
  fieldName: string,
) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`${fieldName} must be a non-negative decimal number.`);
  }

  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(
      `${fieldName} has more than ${decimals} decimal places.`,
    );
  }

  return (
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  ).toString();
}

function inrToPaisa(value: string) {
  return decimalToAtomic(value, 2, "cost_basis_inr");
}

export function parseOpeningLotCsv(csv: string): OpeningLot[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must contain a header and at least one opening lot.");
  }

  const headers = parseCsvRow(lines[0]).map((header) =>
    header.toLowerCase(),
  );
  if (
    headers.length !== EXPECTED_HEADERS.length ||
    headers.some((header, index) => header !== EXPECTED_HEADERS[index])
  ) {
    throw new Error(
      `CSV header must be exactly: ${EXPECTED_HEADERS.join(",")}`,
    );
  }

  if (lines.length - 1 > MAX_DEMO_TRANSACTIONS) {
    throw new Error(
      `CSV supports at most ${MAX_DEMO_TRANSACTIONS} opening lots.`,
    );
  }

  return lines.slice(1).map((line, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = parseCsvRow(line);
    if (cells.length !== EXPECTED_HEADERS.length) {
      throw new Error(`CSV row ${rowNumber} must contain five values.`);
    }

    const [rawSymbol, quantity, acquiredAt, costBasisInr, sourceTxHash] =
      cells;
    const symbol = rawSymbol.toUpperCase() as keyof typeof SUPPORTED_ASSET_REGISTRY;
    const asset = SUPPORTED_ASSET_REGISTRY[symbol];
    if (!asset) {
      throw new Error(
        `CSV row ${rowNumber} asset must be ETH, WETH, USDC, or USDT.`,
      );
    }

    const acquired = new Date(acquiredAt);
    if (Number.isNaN(acquired.getTime())) {
      throw new Error(`CSV row ${rowNumber} has an invalid acquired_at date.`);
    }

    const parsed = OpeningLotSchema.safeParse({
      lotId: `opening-${rowNumber}-${sourceTxHash.toLowerCase()}-${symbol}`,
      assetId: asset.assetId,
      symbol: asset.symbol,
      decimals: asset.decimals,
      standard: asset.standard,
      quantityAtomic: decimalToAtomic(
        quantity,
        asset.decimals,
        `CSV row ${rowNumber} quantity`,
      ),
      acquiredAt: acquired.toISOString(),
      costBasisInrPaisa: inrToPaisa(costBasisInr),
      sourceTxHash,
    });

    if (!parsed.success) {
      throw new Error(
        `CSV row ${rowNumber} failed validation: ${
          parsed.error.issues[0]?.message ?? "invalid opening lot"
        }`,
      );
    }
    return parsed.data;
  });
}

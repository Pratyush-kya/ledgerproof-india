import { keccak256, stringToHex, type Hex } from "viem";

export const REPORT_RECEIPT_SCHEMA = "ledgerproof-report-receipt-v1";

export const REPORT_RECEIPT_ABI = [
  {
    type: "error",
    name: "ReceiptAlreadyMinted",
    inputs: [{ name: "reportHash", type: "bytes32" }],
  },
  {
    type: "error",
    name: "ZeroReportHash",
    inputs: [],
  },
  {
    type: "event",
    name: "ReceiptMinted",
    anonymous: false,
    inputs: [
      { name: "reportHash", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "timestamp", type: "uint64", indexed: false },
    ],
  },
  {
    type: "function",
    name: "mintReceipt",
    stateMutability: "nonpayable",
    inputs: [{ name: "reportHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "receipts",
    stateMutability: "view",
    inputs: [{ name: "reportHash", type: "bytes32" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "timestamp", type: "uint64" },
    ],
  },
] as const;

function canonicalize(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("Canonical reports cannot contain non-finite numbers.");
      }
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError(
        `Canonical reports cannot contain ${typeof value} values.`,
      );
  }

  if (ancestors.has(value)) {
    throw new TypeError("Canonical reports cannot contain circular references.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item) => canonicalize(item, ancestors))
        .join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical reports must contain plain JSON objects.");
    }

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`,
      )
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalReportRepresentation(report: unknown): string {
  return canonicalize(
    {
      report,
      schema: REPORT_RECEIPT_SCHEMA,
    },
    new WeakSet(),
  );
}

export function canonicalReportHash(report: unknown): Hex {
  return keccak256(stringToHex(canonicalReportRepresentation(report)));
}

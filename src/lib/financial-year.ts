import { FinancialYearSchema } from "@/lib/schemas";

export function financialYearLabel(startYear: number) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function currentFinancialYear(reference = new Date()) {
  const utcMonth = reference.getUTCMonth();
  const startYear =
    utcMonth >= 3
      ? reference.getUTCFullYear()
      : reference.getUTCFullYear() - 1;
  return financialYearLabel(startYear);
}

export function recentFinancialYears(count = 5, reference = new Date()) {
  const current = currentFinancialYear(reference);
  const startYear = Number(current.slice(0, 4));
  return Array.from({ length: count }, (_, index) =>
    financialYearLabel(startYear - index),
  );
}

export function financialYearBounds(financialYear: string) {
  const parsed = FinancialYearSchema.parse(financialYear);
  const startYear = Number(parsed.slice(0, 4));

  return {
    start: new Date(Date.UTC(startYear, 3, 1)).toISOString(),
    endExclusive: new Date(Date.UTC(startYear + 1, 3, 1)).toISOString(),
  };
}

export function isInFinancialYear(
  timestamp: string,
  financialYear: string,
) {
  const bounds = financialYearBounds(financialYear);
  const value = Date.parse(timestamp);
  return (
    value >= Date.parse(bounds.start) &&
    value < Date.parse(bounds.endExclusive)
  );
}

import demoLedgerFixture from "../fixtures/demo-ledger.json";
import { TaxReportSchema, type TaxReport } from "./schemas";

export function loadDemoLedger(): TaxReport {
  return TaxReportSchema.parse(demoLedgerFixture);
}

export const DEMO_LEDGER = loadDemoLedger();

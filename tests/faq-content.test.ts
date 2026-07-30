import { describe, expect, it } from "vitest";

import { FAQ_ITEMS } from "../src/lib/faq-content";

const requiredQuestions = [
  "What is LedgerProof India?",
  "Is this a tax-filing service or professional tax advice?",
  "Why does the app need my public wallet address?",
  "Does entering an address give the app control of my wallet?",
  "Will LedgerProof ever ask for my private key or seed phrase?",
  "Which blockchain networks are supported?",
  "Which tokens are currently supported?",
  "How many transactions are analyzed?",
  "What do buy, sell, swap, transfer, gas, approval, and unknown mean?",
  'Why is a transaction marked "Needs review"?',
  "How does FIFO cost-basis matching work?",
  "Why are some transactions missing an INR value?",
  "Can the app see transactions from centralized exchanges?",
  "Are wallet transfers always taxable?",
  "How are gas fees handled?",
  "What does the estimated 30% VDA tax figure mean?",
  "Does the report calculate TDS or my final tax liability?",
  "What is the difference between live data and the demo ledger?",
  "Is my wallet or report information stored?",
  "What is the optional blockchain hash receipt?",
  "Does the hash receipt prove that the tax report is correct?",
  "What should I do when the analysis fails or times out?",
  "How can I report a wrong classification or missing transaction?",
];

describe("FAQ content", () => {
  it("contains every required beginner question exactly once", () => {
    expect(FAQ_ITEMS.map((item) => item.question)).toEqual(requiredQuestions);
    expect(new Set(FAQ_ITEMS.map((item) => item.id)).size).toBe(23);
  });

  it("keeps critical security and product boundaries explicit", () => {
    const content = FAQ_ITEMS.map((item) => item.answer).join(" ");

    expect(content).toContain("not an ITR-filing service");
    expect(content).toContain("never needs a private key, seed phrase");
    expect(content).toContain("centralized exchange");
    expect(content).toContain("TDS");
    expect(content).toContain("Needs review");
  });
});

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "about",
    question: "What is LedgerProof India?",
    answer:
      "LedgerProof India is an evidence-first crypto tax-reconciliation preview. It reads supported public Ethereum activity, applies deterministic classification and FIFO calculations, and keeps missing or uncertain evidence visible.",
  },
  {
    id: "not-tax-advice",
    question: "Is this a tax-filing service or professional tax advice?",
    answer:
      "No. It is an educational reconciliation preview, not an ITR-filing service, a final tax return, or professional tax, legal, or accounting advice.",
  },
  {
    id: "public-address",
    question: "Why does the app need my public wallet address?",
    answer:
      "A public address lets the server request that address's public Ethereum transaction history. It is used only to find records for the selected financial year and the acquisition context available from the provider.",
  },
  {
    id: "wallet-control",
    question: "Does entering an address give the app control of my wallet?",
    answer:
      "No. A public address is read-only information. Entering it cannot sign a transaction, move funds, or give LedgerProof control of the wallet.",
  },
  {
    id: "no-secrets",
    question: "Will LedgerProof ever ask for my private key or seed phrase?",
    answer:
      "No. LedgerProof never needs a private key, seed phrase, wallet password, or recovery phrase. Do not enter those secrets anywhere in the app or feedback form.",
  },
  {
    id: "networks",
    question: "Which blockchain networks are supported?",
    answer:
      "Live reconciliation currently supports Ethereum mainnet only. Base Sepolia is used only for the optional, disabled-by-default report-hash receipt and is not a source of tax records.",
  },
  {
    id: "tokens",
    question: "Which tokens are currently supported?",
    answer:
      "The deterministic registry currently supports ETH, WETH, USDC, and USDT on Ethereum mainnet. Other assets are quarantined or marked for review instead of being guessed from their symbol.",
  },
  {
    id: "transaction-cap",
    question: "How many transactions are analyzed?",
    answer:
      "The public demo analyzes up to 250 validated records. If the provider or this cap prevents complete history, the report says that history is incomplete rather than presenting a complete result.",
  },
  {
    id: "categories",
    question:
      "What do buy, sell, swap, transfer, gas, approval, and unknown mean?",
    answer:
      "Buy means an asset was acquired for known INR; sell means it was disposed of for known INR; swap exchanges assets; transfer moves assets in or out; gas pays network fees; approval grants a contract permission; and unknown means the evidence is not sufficient for a safe classification.",
  },
  {
    id: "needs-review",
    question: 'Why is a transaction marked "Needs review"?',
    answer:
      "The public ledger may not prove its INR value, purpose, wallet ownership, or counterparty. LedgerProof excludes uncertain information or marks it Needs review instead of inventing an answer.",
  },
  {
    id: "fifo",
    question: "How does FIFO cost-basis matching work?",
    answer:
      "FIFO matches each supported disposal against the earliest available acquisition lots first. LedgerProof labels FIFO as its reconciliation assumption; it does not claim that Indian tax law mandates FIFO.",
  },
  {
    id: "missing-inr",
    question: "Why are some transactions missing an INR value?",
    answer:
      "A blockchain transaction usually does not contain the actual INR paid or received. Historical prices are optional and limited to supported swap evidence, so unavailable or unsafe values remain missing.",
  },
  {
    id: "cex-trades",
    question: "Can the app see transactions from centralized exchanges?",
    answer:
      "It can see on-chain deposits and withdrawals involving the public address, but not every trade inside a centralized exchange. Exchange acquisition cost, sale proceeds, fees, and TDS records require separate evidence.",
  },
  {
    id: "wallet-transfers",
    question: "Are wallet transfers always taxable?",
    answer:
      "Not necessarily. A transfer between wallets owned by the same person may differ from a transfer to another person, but a public address does not prove ownership relationships. Ambiguous transfers are marked for review.",
  },
  {
    id: "gas-fees",
    question: "How are gas fees handled?",
    answer:
      "Gas is shown separately with its transaction evidence. The current preview does not automatically add gas to cost basis or deduct it from proceeds when the correct treatment cannot be established safely.",
  },
  {
    id: "vda-preview",
    question: "What does the estimated 30% VDA tax figure mean?",
    answer:
      "It is a simplified base preview calculated from supported positive gains with complete evidence. It is not a final liability and excludes personal circumstances, surcharge, and other filing adjustments.",
  },
  {
    id: "tds-final-liability",
    question: "Does the report calculate TDS or my final tax liability?",
    answer:
      "No. A public wallet cannot reveal every TDS credit or personal tax factor. LedgerProof does not calculate a filing-ready final liability and does not apply TDS credits.",
  },
  {
    id: "live-vs-demo",
    question: "What is the difference between live data and the demo ledger?",
    answer:
      "Live data is fetched for the public Ethereum address through the configured provider. The static demo is fixed, labelled example data that remains usable when a live provider is unavailable.",
  },
  {
    id: "storage",
    question: "Is my wallet or report information stored?",
    answer:
      "LedgerProof has no user account or report database. Analysis is processed for the current request, while the public address is sent to the server and blockchain provider. Do not submit a complete wallet history or report in feedback.",
  },
  {
    id: "hash-receipt",
    question: "What is the optional blockchain hash receipt?",
    answer:
      "It lets a browser wallet publish only a deterministic report hash, signing address, and timestamp on Base Sepolia. It is unavailable unless a reviewed contract address is explicitly configured.",
  },
  {
    id: "receipt-proof",
    question: "Does the hash receipt prove that the tax report is correct?",
    answer:
      "No. It can show that a particular hash was recorded by an address at a time. It does not verify the report's facts, ownership, completeness, tax treatment, or correctness.",
  },
  {
    id: "failures",
    question: "What should I do when the analysis fails or times out?",
    answer:
      "Retry after a short wait, check the address and financial year, or use the static demo. If the problem continues, report the error without including wallet secrets or a complete report.",
  },
  {
    id: "report-problem",
    question:
      "How can I report a wrong classification or missing transaction?",
    answer:
      "Use Report an issue and choose the closest feedback type. You may include one public transaction hash or report reference, but never include a seed phrase, private key, PAN, password, or complete wallet history.",
  },
];

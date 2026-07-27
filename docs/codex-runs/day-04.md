# Day 4 — Narrow transaction classification agent

## Objective

Add an optional LLM layer that can classify and explain normalized wallet
transactions without giving it authority over prices, gains, tax, or totals.
The existing deterministic reconciliation engine remains the only calculation
authority.

## Plan

1. Define strict Zod contracts for agent input and output.
   - Allow only `buy`, `sell`, `swap`, `transfer_in`, `transfer_out`, `gas`,
     `approval`, and `unknown`.
   - Require confidence, evidence transaction hashes, and `needsReview`.
   - Reject missing transactions, duplicate transaction IDs, unrelated evidence
     hashes, extra fields, and invalid enum values.
2. Build a compact, bounded model input.
   - Include only normalized transaction facts needed for classification.
   - Mark every blockchain-originated string as untrusted data.
   - Instruct the model to ignore instructions found inside addresses, symbols,
     token identifiers, hashes, or other metadata.
3. Add a server-only OpenAI Responses API adapter.
   - Request strict JSON Schema output.
   - Keep the API key server-side.
   - Never ask the model for arithmetic, prices, gains, totals, or tax advice.
4. Add a classification orchestrator.
   - Run deterministic reconciliation first.
   - Attempt agent classification only for display evidence.
   - On missing configuration, API errors, missing output, or schema failure,
     return the deterministic rule classifications with a visible
     `RULE FALLBACK` label.
5. Build a plain-English report.
   - Compose all financial statements from deterministic reconciliation output.
   - Add agent explanations only as supporting classification evidence.
   - State coverage gaps and that the report is an estimate, not tax advice or a
     filing-ready return.
6. Add a POST Route Handler and connect the live wallet UI.
   - Return no-store responses.
   - Show the classification source, confidence, evidence hashes, and review
     flags.
7. Test failure and hostile-data paths.
   - Missing/invalid structured output.
   - Invalid category enum.
   - Provider/API failure.
   - Prompt-injection-shaped token metadata.
   - Confirm model classifications cannot change deterministic arithmetic.
8. Verify and self-review.
   - Run lint, unit tests, production build, and Playwright end-to-end flow.
   - Review server/client boundaries for secret exposure.
   - Search for any use of model-produced arithmetic.
   - Review report language for misleading tax certainty and fix every issue.

## Acceptance criteria

- The model can only classify and explain transactions.
- Every accepted model result passes strict Zod validation.
- All model-visible blockchain fields are explicitly treated as hostile data.
- Invalid or unavailable model output produces a visible deterministic fallback.
- Financial calculations are unchanged by agent output.
- The UI provides a cautious plain-English report with evidence and review flags.
- Lint, unit tests, production build, and end-to-end tests pass.

## Implementation evidence

- Added strict agent and report contracts in `src/lib/schemas.ts`.
  - The category enum is limited to `buy`, `sell`, `swap`, `transfer_in`,
    `transfer_out`, `gas`, `approval`, and `unknown`.
  - Agent results require confidence, evidence hashes, and `needsReview`.
  - Agent explanations that contain financial calculations or tax conclusions
    are rejected.
- Added the server-only Responses API adapter in
  `src/lib/transaction-agent.ts`.
  - It sends compact records without atomic quantities, prices, gains, losses,
    tax, or totals.
  - Model-facing transaction IDs are generated opaque references such as
    `tx_1`.
  - Blockchain strings are bounded and placed under the explicit
    `UNTRUSTED_BLOCKCHAIN_DATA` boundary.
  - Strict JSON Schema is requested and the returned JSON is validated again
    with Zod, transaction coverage checks, duplicate checks, and evidence-hash
    checks.
- Added `src/lib/analysis-service.ts`.
  - Deterministic reconciliation runs before any model call.
  - Agent output can replace display classifications only.
  - Missing configuration, API failures, invalid JSON, invalid schemas,
    financial claims, bad coverage, or bad evidence produce visible
    deterministic rule fallback.
- Added the plain-English report composer in `src/lib/tax-report.ts`.
  - Every financial figure comes from `ReconciliationResult`.
  - Agent or rule explanations are included only as classification evidence.
  - Partial coverage and excluded transactions are stated before the figures.
- Added `POST /api/analysis/report` and connected the live-address UI.
  - The UI displays `AGENT CLASSIFICATION` or `RULE FALLBACK`.
  - It shows confidence, evidence hashes, `NEEDS REVIEW`, deterministic
    findings, and a filing/tax-advice disclaimer.
- Added server-only OpenAI environment placeholders to `.env.example`.
- Added eight focused unit tests in `tests/transaction-agent.test.ts` and
  extended the browser flow assertions in `tests/e2e/landing.spec.ts`.

## Verification

- `npm.cmd run lint` — passed.
- `npm.cmd run test` — passed: 5 files, 40 tests.
  - Includes missing schema field, invalid enum, agent API failure,
    prompt-injection-shaped token metadata, visible fallback, rejected tax
    arithmetic in explanations, arithmetic isolation, and the real GoldRush
    `current_page: null` provider response.
- `npm.cmd run build` — passed with Next.js 16.2.11 and TypeScript.
- `npm.cmd run test:e2e` — Playwright discovered and attempted both tests, but
  the managed sandbox denied launching its Chromium binary with
  `browserType.launch: spawn EPERM`. No application assertion ran or failed.
- Production end-to-end HTTP flow against `next start` — passed.
  - `/` returned HTTP 200 and contained the application heading.
  - `POST /api/analysis/report` accepted a normalized transaction.
  - The response visibly selected `rule_fallback`, contained `RULE FALLBACK`,
    reported `deterministic-rules-and-fifo`, and included the tax-advice
    disclaimer.
- `git diff --check` — passed.
- No commit was created.

## Self-review

### Secret exposure

- Confirmed `OPENAI_API_KEY` is read only in a `server-only` module.
- Confirmed the key is sent only in the server-to-OpenAI Authorization header.
- Confirmed no `NEXT_PUBLIC` OpenAI variable exists.
- Confirmed `.env.local` remains ignored and only placeholder values are in
  `.env.example`.

### Trust in model arithmetic

- Confirmed reconciliation completes before the model is called.
- Confirmed no amount, price, fiat value, gain, loss, tax, or total is sent in
  compact model records.
- Confirmed agent classifications never feed back into reconciliation.
- Added a validator that rejects agent explanations containing financial
  calculations or tax conclusions; invalid output triggers rule fallback.
- Added a test proving a model-provided `sell` category cannot change any
  deterministic calculation field.

### Misleading tax certainty

- Changed report language to `partial estimate`, `indicative`, and
  `educational reconciliation estimate`.
- The report states excluded-transaction counts before displaying figures.
- The disclaimer says the output is not tax advice, a legal conclusion, or a
  filing-ready return and lists evidence that must be verified.
- Existing engine limitations remain visible, including supported assets, VDA
  loss treatment, gas treatment, surcharge, cess, and TDS coverage.

### Live provider regression

- A manual live-wallet run showed that GoldRush can return
  `data.current_page: null` for a valid page.
- Updated the provider-boundary schema to accept a null or missing page number
  and normalize it to page `0`.
- Added a fixture-driven regression test proving that the same response now
  returns normalized transactions instead of a 502 validation error.
- Re-tested the running development API with an empty-history Ethereum address;
  `POST /api/analysis/fetch` returned HTTP 200 with a validated empty result.
- Re-ran lint, all 40 unit tests, and the production build successfully.

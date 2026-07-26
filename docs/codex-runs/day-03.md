# Day 03 - Deterministic reconciliation and FIFO tax engine

## Objective

Build a deterministic TypeScript engine that classifies normalized Ethereum
transactions, creates acquisition lots, matches supported taxable disposals by
FIFO, and produces a clearly labelled Indian VDA tax estimate. No LLM performs
classification arithmetic, valuation, lot matching, or tax calculation.

## Safety boundaries and decisions

- Money is accepted and returned as integer INR paise strings. The engine uses
  `bigint` internally and never uses floating-point arithmetic for money or
  token quantities.
- Token quantities remain atomic-unit integers. Decimal metadata is validated
  against an explicit Ethereum-mainnet registry.
- The initial registry contains only ETH, WETH, USDC, and USDT. Assets outside
  that registry, or registry/transaction decimal mismatches, are marked
  `needs review`.
- A buy requires one supported incoming asset and an explicit INR `paid` fiat
  flow. A sell requires one supported outgoing asset and an explicit INR
  `received` fiat flow.
- A swap requires one supported outgoing asset and one supported incoming
  asset. Each side requires its own explicit INR valuation; the engine does not
  assume that the two valuations are equal.
- A one-sided supported movement without explicit fiat consideration is a
  `transfer_in` or `transfer_out`, not a guessed buy or sell.
- Approval and gas-only classifications require an explicit operation hint
  because the Day 2 normalized transaction schema does not preserve calldata.
  Empty-asset transactions without a hint are `unknown`.
- `transfer_in` creates a supported-asset lot with unknown cost basis so a
  later disposal is reviewable rather than silently assigned zero basis.
  `transfer_out` is not treated as a taxable disposal because ownership of the
  destination is unknown.
- Failed transactions do not create or dispose lots. Their gas is still
  reported separately.
- Gas is recorded separately and is not silently added to acquisition cost or
  deducted from disposal proceeds. This is a conservative scope decision and
  is explicitly visible in the result.
- A disposal with missing valuation, insufficient quantity, or any matched lot
  with missing cost basis is excluded from calculated gain/loss totals and
  marked `needs review`.
- Positive taxable gains and absolute VDA losses are accumulated separately.
  Losses never offset gains.
- The base-tax estimate is 30% of positive priced gains. Optional cess is 4%
  of that base-tax estimate. Both calculations use integer division to paise.
  Surcharge, TDS liability/credit, filing-level rounding, and all other income
  are excluded.
- Asset valuations are total INR paise values for a specific transaction
  delta, not floating-point unit prices. FIFO partial-lot cost is rounded down
  to a whole paisa and the unallocated remainder stays with the remaining lot.
- The 30% VDA label and applicable 4% cess were checked against the Income Tax
  Department's [ITR-2 FAQ](https://www.incometax.gov.in/iec/foportal/help/FileITR-2Online-FAQ).
  The implementation remains an estimate because surcharge and return-level
  calculations are deliberately outside scope.
- This engine is a reconciliation preview, not tax advice or an ITR filing
  service.

## Implementation plan

1. Add a canonical asset registry for Ethereum mainnet ETH, WETH, USDC, and
   USDT with exact asset IDs and decimals.
2. Define Zod-validated reconciliation input/evidence and serialized output
   contracts.
3. Sort transactions deterministically and classify them with explicit rules
   for buy, sell, swap, transfer-in, transfer-out, gas, approval, and unknown.
4. Convert validated atomic-unit and paise strings to `bigint` only inside the
   engine.
5. Create acquisition lots for supported incoming assets and match supported
   sell/swap disposals against remaining lots in FIFO order.
6. Prorate lot cost and disposal proceeds using integer arithmetic. Exclude
   incomplete calculations rather than inventing values.
7. Track gas separately, retain review reasons, and produce separate positive
   gains, VDA losses, 30% base tax, and optional 4% cess.
8. Add fixture-driven tests covering every category, all four registry assets,
   18-decimal quantities, FIFO, missing basis, missing valuation, loss
   non-offsetting, gas, unknown assets, and deterministic ordering.
9. Run lint, unit tests, production build, and the existing browser flow.
10. Review the diff for floating-point money operations, implicit valuation
    assumptions, accidental gain/loss netting, registry/decimal mistakes, and
    misleading tax labels. Fix findings and record evidence below.

## Acceptance criteria

- The same valid input always produces the same reconciliation output.
- Only ETH, WETH, USDC, and USDT with exact registered decimals are calculated.
- All monetary and quantity arithmetic uses `bigint`.
- Missing information cannot become a zero value or inferred market price.
- FIFO matching is stable by transaction timestamp, block number, transaction
  ID, and asset-delta order.
- Positive gains and losses are separately visible and are never netted.
- The 30% estimate and optional cess are clearly labelled with exclusions.
- Fixture tests do not require network access.

## Verification evidence

- `npm run test`: passed 4 files and 31 tests. The Day 3 reconciliation suite
  contributes 16 tests and all inputs are local fixtures or in-memory
  validation cases.
- Day 3 fixture coverage includes all eight categories, ETH/WETH/USDC/USDT,
  exact 18- and 6-decimal metadata, paise values above JavaScript's safe
  integer range, FIFO partial lots, missing cost basis, both forms of
  incomplete swap valuation, a fully valued swap, loss non-offsetting, gas
  separation, unknown assets, incorrect decimals, duplicate evidence,
  deterministic ordering, and failed transactions.
- `npm run lint`: passed with no findings.
- `npm run build`: passed. Next.js compiled successfully, TypeScript passed,
  four static pages were generated, and `/api/analysis/fetch` remained a
  dynamic server route.
- `npm run test:e2e`: both existing Playwright flows were discovered. Chromium
  launch was denied by the managed Windows environment with
  `browserType.launch: spawn EPERM`, so assertions did not execute. The runner
  was stopped after its 180-second timeout; generated error contexts confirm
  the failure happened at browser-process launch rather than in application
  code.
- `git diff --check`: passed.
- Source audit found no `parseFloat`, `parseInt`, `Number`, `Math`, `toFixed`,
  or `toPrecision` calls in the engine or registry.

## Self-review findings and fixes

- **Floating-point money:** all paise and token quantities cross the JSON
  boundary as digit strings and become `bigint` internally. Added a fixture
  above `Number.MAX_SAFE_INTEGER` that retains an exact 100-paise gain and
  30-paise base-tax estimate.
- **Incomplete swap valuation:** the first implementation could calculate an
  outgoing disposal when that side was valued even if the incoming swap side
  was unvalued. Fixed it so an incompletely valued swap remains traceable in
  FIFO inventory but its disposal gain/loss is excluded for review.
- **FIFO ordering:** lexical ISO timestamp sorting can be wrong when timestamps
  use different UTC offsets. Fixed ordering to compare parsed instants, then
  block number and transaction ID.
- **Loss netting:** positive gains and absolute losses use independent
  accumulators. The tax estimate reads only the positive-gain accumulator;
  there is no subtraction path from losses.
- **Gas assumptions:** gas is emitted as a separate treatment record with
  `includedInCostBasis: false` and `deductedFromProceeds: false`. Missing gas
  valuation is visible on that record and never becomes zero INR.
- **Asset assumptions:** registry lookup requires canonical Ethereum-mainnet
  asset ID, exact symbol, decimals, and standard. Unknown assets and metadata
  mismatches produce `unknown` plus `needsReview`.
- **Tax labels:** output says estimate, names the 30% base component and
  optional 4% cess separately, and explicitly excludes surcharge and TDS
  credit. The engine does not claim to produce filing-ready liability.
- **LLM boundary:** the implementation contains no model call. Rules,
  valuation lookup, FIFO allocation, gains/losses, and estimates are entirely
  deterministic TypeScript.

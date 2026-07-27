# Day 5 — Evidence-first results experience

Date: 2026-07-27

## Plan written before implementation

### Goal

Turn the existing live-provider and static-fixture flows into one polished,
accessible results experience. The interface must keep deterministic financial
calculations separate from agent classifications and expose uncertainty instead
of presenting a filing-ready answer.

### Implementation sequence

1. Extend the validated analysis response so the UI can display the FIFO lots,
   disposal matches, and gas treatments already produced by the deterministic
   reconciliation engine.
2. Build a shared results view for live and fixture data with:
   - coverage and source labels;
   - data limitations and calculation status;
   - transaction classifications, confidence, evidence links, and review flags;
   - remaining FIFO lots and disposal-to-lot matches;
   - positive gains and VDA losses shown separately;
   - a limited 30% base-tax preview with cess, surcharge, and TDS boundaries;
   - excluded or unknown items;
   - the existing plain-English explanation and disclaimer.
3. Add local category corrections with the original category retained, a
   visible `USER CORRECTED` marker, and an explicit statement that corrections
   do not recalculate deterministic figures.
4. Add a JSON download containing the source records, validated result,
   classifications, and correction audit trail.
5. Replace the generic loading message with explicit fetch and reconciliation
   stages. Add timeout, rate-limit, empty, malformed-response,
   provider-configuration, and generic retryable error states.
6. Add Playwright coverage for the fixture success path and a visible
   rate-limit/error path.
7. Run unit tests, lint, production build, Playwright, and a browser visual
   check. Review accessibility, responsive behavior, legal wording, demo-data
   labels, secret exposure, and whether any model output appears to control
   arithmetic. Fix all findings before handoff.

## Acceptance criteria

- Both source modes render the same evidence hierarchy.
- Demo data is labelled at the results heading and within exported JSON.
- Every displayed transaction links to its explorer evidence.
- Confidence and `needsReview` remain visible after a user correction.
- A correction is auditable and never mutates server calculations.
- Financial cards distinguish gains, losses, and the limited tax preview.
- Empty and failure states use visible, actionable language.
- No interface copy describes the result as an ITR filing result.
- Interactive controls are keyboard reachable, labelled, and visibly focused.
- No provider or OpenAI secret is serialized into the client or export.

## Execution evidence

### Implemented

- Added a shared results experience for the provider and fixture flows.
- Exposed the deterministic engine's remaining FIFO lots, disposal matches, and
  gas treatments through the strict Zod-validated report response.
- Added coverage, limitations, separate gain/loss cards, the limited 30% tax
  preview, transaction confidence and explorer evidence, FIFO details,
  excluded/unknown items, and plain-English explanation sections.
- Added a local correction audit. It records the original category, corrected
  category, timestamp, `user corrected` marker, and
  `affectsCalculation: false`. The UI explicitly says that the correction does
  not recalculate deterministic figures.
- Added JSON export with source provenance, the validated result, warning text,
  and the correction audit. No environment variables or secrets are included.
- Added distinct fetch, reconciliation, timeout, empty, rate-limit,
  configuration, invalid-response, and generic error messages.
- Replaced legacy fixture asset IDs with the exact current ETH and USDC registry
  IDs and removed obsolete Day 1 fixture wording.
- Added Playwright scenarios for a complete fixture result plus correction and
  download, a visible retryable rate-limit error, and invalid-address handling.

### Verification

- `npm run lint` — passed.
- `npm test` — passed: 5 files, 40 tests.
- `npm run build` — passed, including TypeScript and static generation.
- `playwright test --list` — passed: all 3 Day 5 scenarios discovered.
- Direct localhost flow — passed:
  `POST /api/analysis/report` returned a Zod-valid rule-fallback report with
  3 classifications, 2 remaining FIFO lots, 1 disposal, 3 gas treatments, and
  an explicit partial calculation status.
- `git diff --check` — passed. Git printed only the repository's Windows
  LF-to-CRLF conversion notices.
- Client secret scan — no `API_KEY`, `process.env`, GoldRush, or OpenAI secret
  reference appears in the client components.

### Browser-run limitation

Playwright execution was attempted. Windows blocked Chromium before any test
page opened with `browserType.launch: spawn EPERM`; therefore no application
assertion ran or failed. The in-app browser fallback was also attempted and was
blocked by the same host permission boundary while accessing its runtime under
`AppData`. The tests remain committed-ready and should run normally from a
regular local PowerShell session with:

```powershell
npm run test:e2e
```

### Self-review and fixes

- **Accessibility:** retained semantic headings, lists, buttons, links, labels,
  status/alert roles, busy state, keyboard controls, and visible focus rings.
  Limited `aria-invalid` to actual address-validation errors instead of
  provider failures.
- **Responsive layout:** moved the full evidence result out of the narrow
  desktop sidebar column; metric grids and transaction correction controls now
  collapse for smaller screens.
- **Legal certainty:** figures are consistently called a limited,
  deterministic reconciliation preview. The UI says surcharge and TDS credit
  are excluded and never presents a filing result.
- **Demo integrity:** every fixture result and export is labelled static demo
  data. Legacy asset IDs and obsolete implementation-stage wording were fixed.
- **Arithmetic trust boundary:** classifications and user corrections remain
  explanatory/auditable only. Only the deterministic reconciliation response
  supplies financial figures.
- **Secrets:** provider and model keys remain in server-only modules and are not
  exported to the browser.

No commit was created.

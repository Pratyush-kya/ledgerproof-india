# Day 7 — Viability-gate audit

Date: 2026-07-29

## Final production re-verification

- Re-verified local checkout, GitHub `main`, and the Vercel production
  deployment at commit `76c376eff5e6ca386010bbe509caa261a9806e11`.
- Vercel deployment `dpl_2ybPkEjJpasf9KuAtn2xrQ6E2znB` is `READY`, targets
  production, and serves `ledgerproof-india.vercel.app`.
- The public landing page opened without authentication.
- The static demo rendered its labelled fixture, deterministic figures,
  unknown-asset exclusion, FIFO evidence, and JSON export control.
- A live analysis of a known active public Ethereum address loaded and
  reconciled 50 validated transactions. Missing evidence and unsupported
  assets were excluded rather than assigned guessed figures.
- Invalid-address handling remained concise and blocked the API flow.
- `/api/health` returned HTTP 200 with `blockchainConfigured: true`,
  `historicalPricesConfigured: false`, and
  `classificationConfigured: false`. Production therefore used the designed
  rule fallback and omitted unavailable historical INR evidence.
- Vercel reported no runtime error clusters in the inspected seven-day range.
- Fresh local checks passed: lint, type checking, 55 Vitest tests, and the
  Next.js production build.
- All six Playwright assertions passed. On the restricted Windows runner the
  Playwright wrapper did not exit after printing the six passes because its
  spawned Next.js server could not be terminated by the runner. This is a
  runner-cleanup limitation; no assertion failed.

## Provider-enhanced demo gate

Before recording the provider-enhanced final demo:

- [ ] Add sensitive Production variables `COINGECKO_API_KEY` and
      `OPENAI_API_KEY` in Vercel.
- [ ] Set `OPENAI_MODEL=gpt-5-mini` in Production.
- [ ] Redeploy the already-reviewed commit; never expose or commit the values.
- [ ] Confirm `/api/health` reports both optional providers as configured.
- [ ] Run a known active wallet and confirm successful OpenAI output no longer
      displays `RULE FALLBACK`.
- [ ] Use a supported two-sided historical swap and confirm CoinGecko evidence
      appears only when a valid dated INR price exists.
- [ ] Confirm provider failure still falls back safely and never changes
      deterministic FIFO or tax arithmetic.
- [ ] Inspect Vercel runtime errors and ensure no credentials, raw histories,
      model payloads, or full reports are logged.

## Prompt supplied to Codex

> Act as a skeptical hackathon judge and release engineer for LedgerProof
> India.
>
> First write a Day 7 viability-gate checklist. Then inspect the entire
> repository and execute the core flow through the app as a user would.
> Verify:
>
> - public no-login behavior;
> - real-wallet and demo-ledger flows;
> - invalid and unavailable-provider states;
> - report accuracy against fixtures;
> - no LLM-controlled arithmetic;
> - no exposed secrets;
> - README/repository claims match the actual product.
>
> Run lint, all tests, production build, and browser tests. Perform a
> self-review as if a judge will compare the repository, deployment, and demo
> video. Fix every issue that can cause the viability gate to fail. Update
> `docs/codex-runs/day-07.md` with concrete test evidence and remaining risks.
> Do not add blockchain receipt functionality unless all core gates pass.

## Viability-gate checklist written before implementation

- [x] The root route is a meaningful, health-friendly page.
- [x] No application login or wallet connection blocks evaluation.
- [x] The static demo runs without external providers.
- [x] The simulated live-provider browser flow reaches a validated report.
- [x] Invalid-address, empty-history, rate-limit, timeout, and unavailable
      states fail safely.
- [x] Deterministic fixture calculations match expected results.
- [x] Unknown assets and incomplete evidence are excluded instead of guessed.
- [x] LLM output is classification/explanation only and cannot change
      arithmetic.
- [x] Provider and model secrets are server-only and ignored by Git.
- [x] Lint, type checking, unit/integration tests, build, and browser assertions
      pass.
- [x] README names the real repository and production URL.
- [x] GitHub and Vercel identify the same deployed commit.
- [ ] A known active wallet completes on the public deployment from a normal
      internet connection.
- [ ] The final demo video shows the same commit that is deployed.

The unchecked items block Day 8 receipt work.

## Inferred core story

A user opens the public no-login landing page, enters a public Ethereum address,
and submits it to `/api/analysis/fetch`. The server validates the address,
fetches and normalizes up to 50 GoldRush transactions, then submits those
normalized records to `/api/analysis/report`. CoinGecko may add historical INR
evidence; deterministic FIFO code owns all arithmetic; OpenAI may supply only
strictly validated classifications and explanations. The UI renders coverage,
unknowns, FIFO evidence, limited tax figures, and a downloadable evidence file.
If any provider fails, the core demo remains usable.

## Judge-style repository findings

### Technical execution

- Zod validates client input, provider data, agent output, reconciliation
  input, and API responses.
- GoldRush pagination is origin-checked before forwarding the Authorization
  header.
- Asset amounts use atomic-unit strings and tax arithmetic uses `bigint`.
- The calculation engine is deterministic, FIFO-based, and tested against
  fixtures.
- Positive gains and VDA losses remain separate.
- Missing basis, missing prices, unsupported assets, failed transactions, and
  ambiguous transfers are never silently included.
- Agent explanations reject financial arithmetic and tax conclusions.
- Agent classifications are validated for full transaction coverage and
  evidence hashes.
- LLM/provider failure visibly falls back to deterministic classifications.

### Privacy and security

- The app asks only for a public address—never a seed phrase or private key.
- `GOLDRUSH_API_KEY`, `COINGECKO_API_KEY`, `OPENAI_API_KEY`, and
  `OPENAI_MODEL` are not `NEXT_PUBLIC_` variables.
- `.env.local` is ignored and was not found in Git history or tracked files.
- Client components contain no `process.env` access.
- No raw wallet history, report, model payload, or credential logging was
  found.
- API requests have per-instance budgets, bounded bodies, and no-store
  responses.

### Product truthfulness

- The UI and README describe a reconciliation preview, not a filing-ready ITR
  or tax advice.
- Demo results are visibly labelled static fixture data.
- User corrections are recorded as an audit trail and explicitly do not alter
  deterministic calculations.
- Optional on-chain receipt work remains unimplemented and blocked.
- README now identifies the deployed application and its health route.

## Concrete test evidence

### Static verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — 9 files and 55 tests passed.
- `npm run build` — passed.
- `git diff --check` — required in the final verification before applying the
  patch to the primary checkout.

### Covered unit/integration behavior

- GoldRush normalization, paging, 50-record cap, unsafe-link rejection,
  wrong-wallet rejection, 429 mapping, and timeout mapping.
- Explicit fetch-route invalid-address, missing-key, rate-limit,
  unavailable-provider, oversized-body, and empty-history states.
- CoinGecko valid INR conversion, missing/invalid price, 429, timeout, supported
  swap valuation, and no invented one-sided basis.
- Deterministic fixture categories, FIFO, supported decimals, unsorted input,
  duplicate evidence, failed transactions, gains/loss separation, gas
  treatment, and unknown assets.
- Agent schema failures, invalid categories, provider failure, prompt-injection
  metadata, deterministic fallback, forbidden arithmetic explanations, and
  proof that agent output cannot change calculations.
- Health output contains configuration state but no secret values.

### Browser assertions

All six assertions completed successfully:

1. static demo result, correction audit, and JSON download;
2. actionable provider rate-limit state;
3. simulated live-wallet provider and report success;
4. explicit empty-history state;
5. unavailable-provider state with working demo recovery;
6. invalid address rejected before a request.

The Playwright assertions passed, but the command wrapper did not exit before
the 300-second outer timeout. No port was left listening afterward. Run
`npm run test:e2e` once from the primary checkout before committing to confirm
normal runner cleanup on the builder's machine.

### Manual browser evidence

- `/` rendered meaningful content and the expected title.
- The release label read `Day 7 release candidate`.
- No Next.js error overlay appeared.
- The static demo displayed `STATIC DEMO DATA`, `Reconciliation review`, and
  `Download JSON evidence`.
- No application-origin console error was recorded. Browser-extension warnings
  were excluded as unrelated to the app.

### GitHub and Vercel evidence

- Public repository:
  `https://github.com/Pratyush-kya/ledgerproof-india`.
- Production URL: `https://ledgerproof-india.vercel.app/`.
- Starting commit:
  `2b9f909cfb547db60575b8cb1700509bafd72259`.
- GitHub reported successful Vercel deployment statuses.
- Vercel reported primary deployment
  `dpl_HBTDyoiqKqaJxQ5JwyV4xPwcWSmg` as `READY`, production-targeted, sourced
  from the same commit, and assigned the production alias.
- Vercel reported no runtime error clusters during the inspected seven days.
- Direct public browsing from the audit sandbox timed out at the network
  boundary, so a production wallet transaction was not submitted.

## Self-review fixes

1. **Stale release claim:** changed the landing label from Day 5 to Day 7
   release candidate.
2. **Stalled blockchain provider:** added a 12-second server-side GoldRush
   timeout.
3. **Oversized public requests:** added bounded body parsing and concise 413
   errors.
4. **Environment uncertainty:** added a secret-safe `/api/health` endpoint.
5. **Missing browser gates:** added simulated live success, empty history, and
   unavailable-provider recovery scenarios.
6. **README mismatch:** added the production and health URLs and updated the
   application deliverable.
7. **Missing execution history:** added complete Day 6 and Day 7 Codex-run
   documents.

## Remaining risks and release decision

### Remaining risks

- The real production wallet flow still depends on GoldRush account status,
  network availability, credits, and the deployed key.
- Historical prices may be incomplete or rate-limited; the correct behavior is
  a partial report with missing valuation, not a guessed figure.
- The in-memory rate budget is per server instance. It is appropriate for a
  short hackathon demo but is not a distributed production rate limiter.
- A deployment can be `READY` while a provider credential is invalid. The
  health route confirms presence, not validity.
- The final video and repository must be captured after the patched commit is
  deployed.

### Decision

**Core code gate: pass. Production live-wallet gate: pending one manual
verification. Day 8 receipt work remains blocked until that check passes.**

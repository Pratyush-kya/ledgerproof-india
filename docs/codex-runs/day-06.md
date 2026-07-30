# Day 6 — Release hardening and public deployment readiness

Date: 2026-07-29

## Final provider activation steps

Production currently has GoldRush configured, while CoinGecko historical
pricing and OpenAI classification use their safe degraded behavior. To enable
both optional providers without exposing credentials:

1. Create a CoinGecko Demo API key in the CoinGecko developer dashboard.
2. Create a restricted OpenAI project API key with a small project budget.
3. Open Vercel Project Settings → Environment Variables for
   `ledgerproof-india`.
4. Add `COINGECKO_API_KEY` as a sensitive Production variable.
5. Add `OPENAI_API_KEY` as a sensitive Production variable.
6. Add `OPENAI_MODEL=gpt-5-mini` as a Production variable.
7. Do not use a `NEXT_PUBLIC_` prefix for any provider credential.
8. Redeploy commit `76c376eff5e6ca386010bbe509caa261a9806e11`; environment
   changes do not modify an already-built deployment.
9. Verify `/api/health` returns HTTP 200 with
   `historicalPricesConfigured: true` and
   `classificationConfigured: true`. This endpoint proves presence, not
   provider validity.
10. Analyze a known active public wallet. Confirm the report does not show
    `RULE FALLBACK` when OpenAI responds successfully and that supported,
    two-sided swaps receive historical INR evidence when CoinGecko has a price
    for the transaction date.
11. Temporarily test invalid keys in a Preview environment only. Confirm price
    failures omit valuations and OpenAI failures return to deterministic
    `RULE FALLBACK` without changing arithmetic.
12. Inspect Vercel runtime errors after the smoke test. Do not log or copy API
    key values, wallet histories, model payloads, or full reports.

Never paste either secret into Git, Codex chat, screenshots, or issue comments.
Keep the values in Vercel and ignored local `.env.local` only.

## Final production re-verification

- Local `main`, GitHub `main`, and production match at
  `76c376eff5e6ca386010bbe509caa261a9806e11`.
- Current Vercel production deployment:
  `dpl_2ybPkEjJpasf9KuAtn2xrQ6E2znB` (`READY`).
- The public no-login landing page, static demo, invalid-address state, and a
  live 50-transaction wallet analysis were exercised successfully.
- The live report used deterministic rule fallback because OpenAI was not
  configured. CoinGecko was also not configured, so missing historical price
  evidence was omitted and visibly marked instead of guessed.
- No Vercel runtime error clusters were reported for the inspected seven-day
  range.
- Fresh lint, type checking, the 55-test Vitest suite, and the production build
  passed.

## Objective

Harden the Day 5 core flow for a public Vercel release without adding the
optional blockchain receipt. Preserve the no-login demo, keep secrets on the
server, fail safely when providers are unavailable, and leave an exact
deployment and smoke-test procedure.

## Prompt supplied to Codex

> Treat Day 6 as release hardening for LedgerProof India.
>
> Inspect the production configuration and repository. Add only the
> code/configuration needed for a public Vercel deployment: safe server-only
> environment handling, concise errors, request limits appropriate for a
> hackathon demo, no sensitive wallet/report logging, and a health-friendly
> landing path.
>
> Create or improve a production smoke-test checklist that covers live
> analysis, demo-ledger analysis, invalid address, empty history, unknown
> asset, price failure, and LLM/provider failure. Run local lint, tests, build,
> and browser checks. Then self-review deployment risks: exposed secrets,
> fragile external APIs, uncaught errors, and UI states that block the core
> flow. Fix all findings.
>
> Document exact deploy and verification steps in
> `docs/codex-runs/day-06.md`. Do not commit or deploy for me.

## Plan accepted before implementation

1. Inspect the repository, environment-variable access, API routes, provider
   clients, public UI, tests, README, and deployment evidence.
2. Verify that `.env.local` is ignored and that no key is prefixed with
   `NEXT_PUBLIC_`.
3. Add only release-blocking protections found during review.
4. Expand automated coverage for provider failures and request limits.
5. Run lint, type checking, unit/integration tests, the production build,
   Playwright, and a direct browser check.
6. Record the exact Vercel deployment and smoke-test procedure.

## Changes made

- Added bounded JSON parsing:
  - wallet-fetch bodies are limited to 4 KiB;
  - report bodies are limited to 512 KiB;
  - oversized requests return concise `413` responses;
  - malformed JSON returns a concise `400` response.
- Added a 12-second server-side timeout to every GoldRush page request so a
  stalled provider cannot hold the core flow indefinitely.
- Added `GET /api/health`. It returns application health and provider
  configuration booleans, never credential values.
- Changed the landing-page release label from Day 5 to Day 7 release
  candidate.
- Added the public deployment and health URLs to the README.
- Added tests for bounded request bodies, the health response, GoldRush
  timeout behavior, and the unavailable-provider API state.
- Expanded Playwright from three to six scenarios: demo success, rate limit,
  simulated live success, empty history, unavailable provider with demo
  recovery, and invalid address.

## Production smoke-test checklist

Run this checklist after every production deployment.

### Deployment and configuration

- [ ] Open `https://ledgerproof-india.vercel.app/` in a signed-out/incognito
      window. The page must open without authentication.
- [ ] Open `https://ledgerproof-india.vercel.app/api/health`.
- [ ] Confirm `status` is `ok`.
- [ ] Confirm `blockchainConfigured` is `true`.
- [ ] Confirm `historicalPricesConfigured` is `true` when a CoinGecko key is
      intentionally configured.
- [ ] Confirm `classificationConfigured` is `true` when OpenAI
      classifications are intentionally enabled.
- [ ] Confirm the response contains no credential values.

### Core user flows

- [ ] **Live analysis:** use a known active Ethereum-mainnet address. Confirm
      the provider result loads and the validated reconciliation report
      renders.
- [ ] **Demo ledger:** select `Load static demo ledger`. Confirm
      `STATIC DEMO DATA`, report coverage, limitations, calculations,
      classifications, FIFO evidence, and JSON export appear.
- [ ] **Invalid address:** submit `not-an-address`. Confirm the browser rejects
      it before an API request and displays the 42-character address guidance.
- [ ] **Empty history:** use an address with no returned recent history or the
      mocked browser test. Confirm no report is invented and the empty message
      recommends another address or the demo.
- [ ] **Unknown asset:** confirm an unsupported asset is marked `unknown`,
      `Needs review`, and excluded from calculated figures.
- [ ] **Price failure:** simulate or test a missing/invalid CoinGecko price.
      Confirm valuation evidence is omitted and no guessed INR figure appears.
- [ ] **LLM failure:** remove or invalidate the OpenAI key in a preview
      environment. Confirm `RULE FALLBACK` appears and deterministic arithmetic
      remains available.
- [ ] **Blockchain-provider failure:** simulate a GoldRush `429`, `5xx`, or
      timeout. Confirm a concise retryable error appears and the demo remains
      usable.

### Privacy and evidence

- [ ] Inspect browser source/network payloads for API keys. None may appear.
- [ ] Inspect Vercel runtime logs. Raw wallet histories, wallet addresses,
      reports, API keys, and model request bodies must not be logged.
- [ ] Download JSON evidence and confirm it contains provenance and calculation
      evidence but no secret or environment data.

## Exact Vercel deployment steps

1. Keep these variables in Vercel Project Settings → Environment Variables for
   Production:

   ```text
   GOLDRUSH_API_KEY
   COINGECKO_API_KEY
   OPENAI_API_KEY
   OPENAI_MODEL
   ```

2. Keep the same keys in local `.env.local` only. Never commit `.env.local`.
3. Do not rename any key with a `NEXT_PUBLIC_` prefix.
4. Run the full local verification commands listed below.
5. Review `git status` and `git diff`; ensure no `.env*` file other than
   `.env.example` is staged.
6. Commit the reviewed release-hardening changes.
7. Push `main` to the public GitHub repository.
8. Wait for the Vercel deployment attached to that exact commit to reach
   `READY`.
9. Run the production smoke-test checklist above.
10. Record the deployed commit SHA and capture fresh Day 6/7 screenshots.

Codex did not commit, push, or deploy these changes.

## Verification evidence

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 9 files, 55 tests.
- `npm run build` — passed with Next.js 16.2.11.
- Build routes:
  - static `/`;
  - dynamic `/api/analysis/fetch`;
  - dynamic `/api/analysis/report`;
  - dynamic `/api/health`.
- Playwright assertions — all 6 scenarios passed.
- Manual local browser check — passed:
  - meaningful landing content rendered;
  - Day 7 release label rendered;
  - no Next.js error overlay;
  - demo report and JSON-download control rendered;
  - no application-origin console error.
- Local health request — returned HTTP 200 and no secrets. Provider booleans
  were `false` in the isolated staging copy because ignored `.env.local` was
  intentionally not copied.

The Playwright command printed all six passing scenarios but its wrapper
remained alive until the outer 300-second command timeout. Port 3000 was not
left listening afterward. This was recorded as a runner-cleanup limitation,
not as a failed browser assertion.

## Deployment evidence inspected

- GitHub commit `2b9f909cfb547db60575b8cb1700509bafd72259` matched the
  repository at the start of the audit.
- GitHub reported a successful Vercel status for the primary project.
- Vercel reported deployment `dpl_HBTDyoiqKqaJxQ5JwyV4xPwcWSmg` as
  `READY`, production-targeted, and aliased to
  `ledgerproof-india.vercel.app`.
- Vercel reported no runtime error clusters in the inspected seven-day range.

## Self-review and fixes

- **Exposed secrets:** environment access remains inside server-only routes and
  libraries. `.env*` stays ignored except `.env.example`. The health endpoint
  returns booleans, not values.
- **Fragile providers:** CoinGecko and OpenAI already had timeouts. GoldRush now
  has a matching server timeout and concise failure mapping.
- **Request abuse:** existing per-instance request budgets remain; bounded body
  parsing now prevents oversized public requests.
- **Sensitive logging:** no raw wallet or report logging was found. GoldRush
  schema-error logging contains validation paths/codes/messages only.
- **Blocking UI states:** invalid, rate-limited, empty, unavailable-provider,
  malformed-response, timeout, LLM fallback, and demo-recovery states are
  explicit.
- **Scope control:** no authentication, database, wallet connection, smart
  contract, or receipt feature was added.

## Remaining production check

The audit environment could not reach the public URL directly because outbound
browser/network access timed out. Vercel independently reported the production
deployment as `READY`. Before submission, manually run the live-address smoke
test from a normal internet connection and capture the result.

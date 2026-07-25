# Day 1 - Scaffold, evidence contracts, and static demo

## Plan

1. Scaffold a Next.js TypeScript App Router project with Tailwind and ESLint.
2. Add Zod schemas for public EVM addresses, normalized transactions, classifications, tax lots, coverage, summaries, and reports.
3. Build only a public address-validation screen and a clearly labelled static demo-ledger flow.
4. Add fixture, unit, and browser smoke tests. Do not add provider, price, LLM, wallet-connect, or tax-calculation code.

## Acceptance criteria

- The home page has an accessible Ethereum address input, a scope disclaimer, and a static-demo button.
- Invalid EVM addresses are rejected in the browser and unit tests.
- The static fixture is schema-validated and is visibly marked as demo data.
- There are no secrets, API calls, wallet connections, provider clients, or claims that static data is live.
- Lint, unit tests, production build, and Playwright smoke test pass.

## Commands and verification results

- `npx.cmd create-next-app@latest ledgerproof-india --yes --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm` - scaffolded the app in `ledgerproof-india/` after the workspace root was found to contain unrelated `work/` and `outputs/` directories.
- `npm.cmd run lint` - passed.
- `npm.cmd run test` - passed: 1 file, 5 tests. The local sandbox blocks Vitest's esbuild config loader from traversing parent directories, so this command was also verified with the scoped test-runner permission used for the final result.
- `npm.cmd run build` - passed: the `/` route is statically prerendered.
- `npm.cmd run test:e2e -- --reporter=line` - passed: 1 Playwright Chromium browser test. It verifies the initial page, invalid-address feedback, fixture address population, and the visible `DEMO DATA` label.
- `npm.cmd audit --omit=dev --audit-level=high` - reports three inherited high-severity findings through Next.js's PostCSS/Sharp dependency tree. The only proposed automatic remediation is a breaking downgrade to `next@9.3.3`, so no automated audit fix was applied.

## Self-review findings and fixes

- No API keys, provider clients, LLM calls, wallet connections, private-key requests, or unlabelled live-data claims were found. The only `process.env` reference is Playwright's `CI` switch.
- The static fixture is labelled in the button flow, live region, report metadata, UI badge, README, and tests. No UI surface calls it live data.
- The address field has an associated label, instructional text, an `aria-live` status region, keyboard-native buttons, and 48px minimum button height.
- Initial Vitest 4 execution was missing a Windows-native optional binding. Rather than retain a Windows-only direct dependency that could break a Linux Vercel build, Vitest was replaced with the cross-platform 3.2.4 release; its tests pass with the scoped local runner permission.
- The default Google-hosted `next/font` setup caused a production build failure in a network-restricted build. It was replaced with a system font stack, and the production build now passes without external font access.
- Initial Playwright verification had no Chromium binary, then was blocked by the sandbox from launching it, and then used a `127.0.0.1` base URL that Next.js rejected for development resources. Chromium was installed, the smoke test was given the scoped browser permission, and the config now consistently uses `localhost`.
- The scaffold did not create a Git repository. No Git state was created and no commit was made, as requested. A repository should be initialized or cloned before the first Day 1 commit.

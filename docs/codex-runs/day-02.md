# Day 02 - Ethereum wallet ingestion

## Objective

Add a production-safe, Ethereum-mainnet-only ingestion slice that accepts a public wallet address, retrieves up to 50 transactions from GoldRush on the server, validates the upstream payload, normalizes it into the existing LedgerProof schema, and presents explicit user-facing states.

## Repository observations

- The Day 1 application, schemas, fixture, unit tests, and browser test are present.
- `package.json`, TypeScript/Next.js/test configuration files, and `next-env.d.ts` are missing from the working repository.
- The only `package-lock.json` is an untracked empty npm lockfile. The minimum project configuration must be restored before verification can run.
- The current UI explicitly says live retrieval is not implemented; Day 2 must update that wording without relabelling static data as live.

## Implementation plan

1. Restore the minimum Next.js, TypeScript, ESLint, Vitest, and Playwright configuration required by the existing Day 1 source.
2. Extend the shared schemas with:
   - a bounded fetch request;
   - a strict GoldRush response subset;
   - a normalized fetch response;
   - stable API error codes.
3. Add a server-only GoldRush module that:
   - reads only `GOLDRUSH_API_KEY`;
   - requests Ethereum mainnet transaction pages;
   - uses Bearer authentication;
   - validates every upstream page before normalization;
   - follows at most enough pages to collect 50 unique transactions;
   - preserves transaction hash, timestamp, native/token amounts, decimals, gas fee, and Etherscan URL.
4. Add `POST /api/analysis/fetch` with explicit handling for:
   - malformed JSON or invalid address;
   - missing server key;
   - upstream 429;
   - invalid upstream data;
   - general upstream failure;
   - a valid empty history.
5. Add a sanitized GoldRush response fixture and fixture-driven unit tests so test execution never calls the network.
6. Update the address analyzer to call the live endpoint and visibly distinguish live, empty, error, and static-demo states.
7. Add a Playwright browser flow using route interception so the browser test is deterministic and offline.
8. Run lint, unit tests, production build, and Playwright. Review the diff for secret exposure, decimal conversion errors, pagination/cap mistakes, and misleading live labels. Fix findings and record evidence below.

## Acceptance criteria

- A valid request can return normalized Ethereum transactions with a maximum of 50.
- Provider data is rejected unless it matches the strict upstream schema.
- Token and native amounts remain non-negative atomic-unit strings; no floating-point conversion is used.
- The API key is referenced only from server code and `.env.example` contains a placeholder only.
- Invalid address, missing key, upstream rate limit, upstream failure, invalid upstream payload, and empty history are distinct states.
- Unit and browser tests do not require network access.
- Static fixture content remains explicitly labelled demo data; provider content is labelled live only after a successful API response.

## Verification evidence

- `npm test`: passed, 3 files and 15 tests. All provider responses came from the sanitized fixture or in-memory variants; no network request was made.
- `npm run lint`: passed with no findings.
- `npm run build`: passed. Next.js reports `/api/analysis/fetch` as a dynamic server route.
- `npm run test:e2e`: Playwright discovered both offline browser flows, but the managed Windows environment denied Chromium launch with `spawn EPERM`; both tests stopped before executing assertions.
- Fallback local-browser verification was also attempted, but the environment denied the local Next.js listener with `listen EACCES`.
- `git diff --check`: passed apart from Windows line-ending notices.

## Self-review findings and fixes

- **Secrets:** no credential value or `NEXT_PUBLIC` secret was found. Only `process.env.GOLDRUSH_API_KEY` in the server route and a placeholder in `.env.example` remain.
- **Token decimals:** expanded the schema from an application-specific maximum of 36 to the ERC-20 `uint8` range of 0-255. Atomic amounts remain strings and are never converted through floating-point arithmetic.
- **Untrusted pagination:** pagination is restricted to HTTPS, the GoldRush origin, and the requested Ethereum wallet path. A returned page must also identify the requested wallet.
- **Result cap:** fixed truncation detection at the provider-page boundary and retained a hard 50-transaction response limit.
- **Labels:** `LIVE PROVIDER DATA` is rendered only after a successful response passes the client response schema. The existing fixture remains labelled `DEMO DATA`.

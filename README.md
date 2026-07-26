# LedgerProof India

LedgerProof India is an evidence-first crypto tax reconciliation preview for
public Ethereum wallets. A user enters a public wallet address, the server
retrieves recent Ethereum mainnet transactions from GoldRush, validates the
provider response, and normalizes the results into a stable internal ledger
schema.

The application never asks for a seed phrase or private key. It is a
reconciliation preview, not tax advice and not an ITR filing service.

## Day 2 scope

- Fetch recent Ethereum mainnet activity through the server-only GoldRush
  client.
- Accept only `POST /api/analysis/fetch` requests with a valid Ethereum
  address.
- Validate client requests, provider responses, and normalized output with
  Zod.
- Preserve transaction hash, block timestamp, native value, ERC-20 atomic
  amounts, token decimals, gas fee, and Etherscan transaction URL.
- Follow provider pagination while returning no more than 50 unique
  transactions.
- Display explicit invalid-address, missing-key, provider-rate-limit,
  invalid-provider-response, upstream-failure, and empty-history states.
- Keep the original static ledger clearly labelled `DEMO DATA`.
- Label results `LIVE PROVIDER DATA` only after a successful, validated API
  response.
- Use sanitized provider fixtures and request interception so automated tests
  never require live blockchain access.

## Current user flow

1. Enter a public Ethereum wallet address.
2. Select **Analyze address**.
3. The browser sends the address to `POST /api/analysis/fetch`.
4. The server reads `GOLDRUSH_API_KEY` and requests Ethereum mainnet history.
5. Zod validates the untrusted GoldRush response before normalization.
6. The interface displays up to 50 normalized transactions or an explicit
   error/empty state.

Only public blockchain information is retrieved. Never enter a recovery
phrase, seed phrase, or private key.

## Technology

- Next.js App Router and TypeScript
- React
- Zod validation
- GoldRush Foundational API
- Vitest unit tests
- Playwright browser tests
- Tailwind CSS

## Local setup

Requirements:

- Node.js 20.9 or newer
- npm
- A GoldRush API key

Install dependencies:

```powershell
npm.cmd install
```

Create `.env.local` in the project root:

```dotenv
GOLDRUSH_API_KEY=your-goldrush-api-key
```

`GOLDRUSH_API_KEY` is a server-only secret. Do not rename it to a
`NEXT_PUBLIC_` variable, place its real value in `.env.example`, print it in
logs, or commit `.env.local`.

Start the application:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000` and analyze a public Ethereum wallet.

Restart the development server after adding or changing `.env.local`.

## Verification

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e
```

Unit tests use a sanitized provider fixture, and the Playwright flow intercepts
the API request. Passing automated tests therefore verifies normalization and
UI behavior without proving that a local GoldRush key or the live provider is
currently available. Test one known public wallet manually before recording
the demo or deploying.

## Architecture

- `src/app/api/analysis/fetch/route.ts` validates the request, reads the
  server-only key, calls the provider client, and maps failures to safe API
  responses.
- `src/lib/goldrush.ts` requests, validates, paginates, deduplicates, caps, and
  normalizes GoldRush transactions.
- `src/lib/schemas.ts` contains the shared request, response, ledger, and report
  contracts.
- `src/components/address-analyzer.tsx` manages loading, live-result, empty,
  error, and static-demo states.
- `src/fixtures/demo-ledger.json` remains the deliberately static Day 1 demo
  ledger.
- The sanitized GoldRush fixture supports deterministic tests without network
  access.

## Current limitations

- Ethereum mainnet only.
- Maximum of 50 transactions per analysis.
- No historical INR price acquisition or capital-gains calculation yet.
- No LLM explanation or automatic tax classification yet.
- No wallet connection or transaction signing.
- No on-chain report receipt yet.
- Decoded provider metadata may be missing or malformed; essential transaction
  fields remain strictly validated, while unusable optional event metadata is
  ignored.

## Codex build evidence

- `docs/codex-runs/day-01.md` documents the Day 1 plan, implementation,
  verification, and self-review.
- `docs/codex-runs/day-02.md` documents the Ethereum ingestion plan, acceptance
  criteria, verification evidence, and security/accuracy self-review.

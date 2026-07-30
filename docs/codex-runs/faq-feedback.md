# FAQ and secure feedback run

Date: 2026-07-30

Baseline commit: `c79d38dae66c499ae44776700a1e9b6932c01625`

Recommended commit message: `feat: add beginner FAQ and secure feedback workflow`

## Outcome

PASS in the isolated working copy.

LedgerProof India now has:

- a dedicated, searchable `/faq` page with all 23 required questions;
- native `details`/`summary` accordions with keyboard operation, visible
  open/closed indicators, and no added UI dependency;
- visible FAQ and issue links in the site navigation;
- an FAQ link in each rendered report;
- issue links in analysis errors and every report's Items needing evidence
  section;
- a dedicated `/feedback` page with strict validation, privacy copy, a
  honeypot, duplicate-submit prevention, retry/error states, and an accessible
  success confirmation;
- `POST /api/feedback`, which rate-limits and validates requests before sending
  only the entered fields to a server-only HTTPS endpoint; and
- a public support-email fallback that appears only when
  `NEXT_PUBLIC_SUPPORT_EMAIL` contains a valid email address.

No authentication, database, or new dependency was added. No commit, push,
deployment, email, or other external submission was made.

## Plan and implementation

### FAQ

- Added `src/app/faq/page.tsx`.
- Added the 23 required questions in `src/lib/faq-content.ts`.
- Added client-side text filtering in `src/components/faq-list.tsx`.
- Used native `details` and `summary` elements so Enter/Space behavior and
  disclosure semantics are provided by the browser.
- Kept answers short and explicit about Ethereum-only coverage, the 250-record
  cap, supported ETH/WETH/USDC/USDT assets, CEX blind spots, missing INR
  evidence, TDS limits, FIFO assumptions, privacy, and receipt limitations.

### Feedback

- Added `src/app/feedback/page.tsx` and
  `src/components/feedback-form.tsx`.
- Added all seven required feedback types.
- Message length is 20–2000 characters.
- Optional email, transaction hash, and report reference are validated.
- The originating application path and package version are added
  automatically.
- The sensitive-information confirmation is mandatory.
- The hidden `website` honeypot is rejected before provider contact.
- A synchronous ref lock prevents duplicate POST requests while submission is
  active.
- Success is shown only after the configured provider returns a successful HTTP
  status, with a generated `LPF-XXXXXXXX` reference.
- Validation and provider failures preserve form data and expose a retry state.
- Focus moves to the success result so keyboard and screen-reader users receive
  the state change.

### Server route and privacy

- Added strict Zod schemas in `src/lib/feedback-schema.ts`.
- Added `src/app/api/feedback/route.ts`.
- The API accepts at most 16 KiB and five attempts per client per minute per
  server instance.
- `FEEDBACK_FORM_ENDPOINT` must be a server-only HTTPS URL without embedded
  credentials.
- Provider calls have an eight-second timeout, do not follow redirects, and do
  not expose provider responses to the client.
- The route does not log the message, email, transaction hash, report
  reference, wallet, report, or provider response.
- The forwarding payload cannot contain a complete transaction history, report,
  CSV, wallet field, or arbitrary extra key because the request schema is
  strict.
- `NEXT_PUBLIC_SUPPORT_EMAIL` is intentionally public and is rendered only
  after email validation.

## Environment variables

Add these in `.env.local` for local use and in the intended Vercel project's
environment settings for deployment:

```text
# Server-only. Required for in-app feedback delivery.
FEEDBACK_FORM_ENDPOINT=

# Public. Optional mailto fallback shown to users.
NEXT_PUBLIC_SUPPORT_EMAIL=
```

`FEEDBACK_FORM_ENDPOINT` must not be renamed with a `NEXT_PUBLIC_` prefix.
Empty or invalid endpoint configuration returns HTTP 503 and never displays a
false success. The application remains usable without feedback delivery.

After changing either Vercel variable, create a new deployment so the public
fallback email and server configuration are present in that deployment.

## Test coverage added

### Vitest

- required FAQ question inventory and critical boundary language;
- valid feedback normalization;
- message minimum and maximum;
- invalid email and transaction hash;
- missing sensitive-information confirmation;
- safe current-page and report-reference validation;
- public support-email validation;
- required API fields;
- honeypot rejection;
- missing and invalid endpoint configuration;
- provider failure;
- successful minimized forwarding and reference ID;
- per-client request limiting.

### Playwright

- FAQ rendering of all 23 questions;
- native accordion activation with Enter;
- FAQ filtering and empty search state;
- required, short, invalid-email, invalid-hash, and missing-confirmation states;
- successful submission and focus placement;
- double-click submission prevention;
- missing configuration without false success;
- provider failure and retry;
- real-route honeypot rejection;
- opening feedback from an unavailable-provider analysis error;
- opening feedback from an Items needing evidence report section.

## Commands and final results

Commands were run from the isolated working copy unless otherwise stated.

```powershell
npm.cmd run lint
```

Result: PASS, exit 0, zero warnings.

```powershell
npm.cmd run typecheck
```

Result: PASS, exit 0.

```powershell
npm.cmd test
```

Result: PASS, 15 test files and 81 tests passed.

```powershell
npm.cmd run build
```

Result: PASS using Next.js 16.2.11/Turbopack. Routes produced:

- static `/`;
- static `/faq`;
- dynamic `/feedback`;
- dynamic `/api/feedback`;
- the existing analysis and health routes.

```powershell
npm.cmd run test:e2e
```

Result: PASS, 12 Chromium tests passed in 20.6 seconds.

```powershell
git diff --check
```

Result: PASS, no whitespace errors.

Rendered checks were also captured for desktop FAQ, desktop feedback, and a
390-pixel-wide FAQ view. Navigation, form controls, accordion rows, caution
copy, wrapping, spacing, and primary actions remain consistent with the
existing dark slate/cyan/amber design.

## Corrected verification setup issues

- `npm test -- --runInBand` was rejected because `--runInBand` is a Jest
  option, not a Vitest option. The repository's valid `npm test` command then
  passed all 81 tests.
- The first isolated clone used a `node_modules` junction. Turbopack correctly
  rejected a dependency symlink outside the project root. A verification clone
  with a real local dependency tree produced the successful build above.
- The first FAQ browser assertion focused the question's inner text span
  instead of the native `summary`. The locator was corrected to focus the
  actual summary; Enter opens the accordion and the complete suite passes.
- On this Windows runner, Playwright can wait indefinitely while terminating
  its spawned Next.js process. The final run used an explicitly managed local
  server, after which Playwright exited cleanly with all tests passing.

## Self-review findings and fixes

1. **Success focus was not explicit.** The success panel was visible but a
   keyboard user's focus could be left on a removed submit button. Added a
   focusable polite status region, moved focus after success, and added a
   Playwright assertion.
2. **App version could drift if maintained separately.** The initial constant
   duplicated `package.json`. It now derives directly from package metadata and
   is overridden server-side before forwarding.
3. **FAQ keyboard test targeted the wrong DOM node.** The implementation used
   native semantics correctly; the test now focuses `summary` and verifies the
   parent `details[open]` state.
4. **Provider response negotiation was implicit.** Added
   `Accept: application/json` while continuing to ignore and never expose the
   provider response body.
5. **Environment and log review.** Confirmed that
   `FEEDBACK_FORM_ENDPOINT` appears only in server code, `.env.example`, README,
   and this run document. No feedback content is logged.
6. **Privacy review.** Confirmed that issue links carry only the originating
   path and issue-source label. No wallet address, transaction list, tax
   amount, or report is attached automatically.
7. **Claims review.** FAQ and README describe a reconciliation preview, not tax
   advice or filing; CEX, ownership, price, TDS, final-liability, network, token,
   and receipt boundaries remain explicit.

No remaining self-review finding blocks the feature.

## Known limitations

- The request budget is in memory and per server instance. It is appropriate
  basic protection for the current hackathon deployment, not a distributed
  anti-abuse system.
- Delivery depends on the operator-configured feedback provider. A valid
  support email is the fallback when that provider is missing or unavailable.
- A provider's successful HTTP response confirms acceptance by that endpoint,
  not that a human has read or resolved the issue.
- Users are responsible for keeping sensitive content out of free text; the
  required confirmation and privacy warnings reduce risk but cannot detect
  every secret reliably without collecting more data.

## Workspace note

The supplied repository at
`C:\Users\ADMIN\Documents\Codex\2026-07-25\ledgerproof-india-complete` was
readable but this task's sandbox rejected direct writes outside its current
writable root. All changes were therefore made and verified from the same clean
baseline in:

`C:\Users\ADMIN\Documents\Codex\2026-07-29\ju\ledgerproof-faq-feedback-work3`

A complete patch is generated beside the working copy for application to the
supplied repository. The original repository was not changed.

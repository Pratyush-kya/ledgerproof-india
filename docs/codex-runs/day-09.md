# Day 9 final release and submission gate

Date: 30 July 2026 (Asia/Kolkata)

Decision: **CONDITIONAL PASS**

The committed product at `6677159423fd36e319682215266dc9cee7ae5bfb`
passes the core viability and production checks. GitHub `main` and the public
Vercel deployment use that exact source revision. Two judge-facing copy
corrections were made locally during this review, but they were not committed
or deployed because Day 9 explicitly prohibits those actions. A final demo
video tied to the eventual submission commit has also not been supplied.

No new product feature was added. No receipt was minted, no blockchain
transaction was sent, and no commit, push, or deployment was performed.

## Final release-gate checklist

- [x] Public production landing is available without login.
- [x] `/api/health` returns HTTP 200 with secret-safe provider booleans.
- [x] Static demo ledger produces the labelled evidence-first report.
- [x] A known active Ethereum wallet completes on the public deployment.
- [x] Invalid wallet input is rejected locally before any provider request.
- [x] Empty history has a distinct, non-error state.
- [x] Provider rate-limit and unavailable-provider states are concise and
  retryable; the static demo remains usable.
- [x] Unknown and unsupported assets are never silently included.
- [x] Isolated unsupported inbound spam is quarantined while unsafe outflows
  remain in review.
- [x] Partial provider history remains labelled `Complete history: No`.
- [x] Classification, FIFO, gains, losses, and tax arithmetic are
  deterministic.
- [x] No LLM or provider output controls financial arithmetic.
- [x] The current release makes no OpenAI request and has no OpenAI runtime
  dependency.
- [x] Server provider credentials have no `NEXT_PUBLIC_` prefix.
- [x] No tracked API key, private key, mnemonic, bearer token, or comparable
  secret-value pattern was found.
- [x] Raw provider payloads, wallet reports, addresses, and credentials are not
  logged.
- [x] The receipt UI is unavailable in production because no reviewed contract
  address is configured.
- [x] Receipt failure, wrong chain, duplicate status, or wallet rejection
  cannot block report review or JSON export.
- [x] JSON evidence export is covered by a real Playwright download event and
  its production click shows the completion state.
- [x] README product claims match the implemented deterministic product after
  the local Day 9 correction.
- [x] The currently deployed Vercel source SHA matches the current GitHub
  `main` SHA.
- [ ] Commit and deploy the local judge-copy corrections, then verify the new
  GitHub and Vercel full SHA pair.
- [ ] Record or supply the final demo video from that exact deployment and
  show its commit SHA.

## Release identity

- Repository: `Pratyush-kya/ledgerproof-india`
- GitHub branch: `main`
- GitHub full commit SHA:
  `6677159423fd36e319682215266dc9cee7ae5bfb`
- Local `HEAD`: `6677159423fd36e319682215266dc9cee7ae5bfb`
- Local `origin/main`: `6677159423fd36e319682215266dc9cee7ae5bfb`
- Vercel project ID: `prj_owZRsZpZDzNSPTQdxBE9kpLYSnH8`
- Vercel deployment ID: `dpl_ETSDFdgcjKLswWKi5vVwTkuHCKho`
- Production alias: <https://ledgerproof-india.vercel.app/>
- Immutable deployment URL:
  <https://ledgerproof-india-mwpmoa9ri-pratyushkiranrath4-3120s-projects.vercel.app/>
- Vercel deployment state: `READY`, target `production`
- Vercel Git metadata SHA:
  `6677159423fd36e319682215266dc9cee7ae5bfb`
- GitHub commit status: Vercel success for the same deployment

This establishes repository/deployment parity for the production verification
performed below. The local Day 9 edits listed under **Local corrections** are
intentionally outside that deployed revision.

## Commands and results

Commands were run from the repository root on Windows PowerShell.

### Repository and whitespace

```powershell
git rev-parse HEAD
git rev-parse origin/main
git status --short
git diff --check
```

Result:

- `HEAD` and `origin/main` both returned the full SHA above.
- The initial checkout was clean.
- `git diff --check` passed before the audit and after the Day 9 corrections.
- Final expected changes are README, landing release copy, its Playwright
  assertion, and this Day 9 document.
- Git printed informational LF-to-CRLF working-copy notices on Windows; it
  reported no whitespace error.

### Lint

```powershell
npm.cmd run lint -- --max-warnings=0
```

Result: PASS, exit 0, zero warnings. It passed before and after the local copy
correction.

### TypeScript

```powershell
npm.cmd run typecheck
```

Result: PASS, exit 0. It passed before and after the local copy correction.

### Vitest

```powershell
npm.cmd test
```

Result: PASS.

```text
Test Files  12 passed (12)
Tests       66 passed (66)
```

The expected stderr from negative tests contained only schema paths/error
codes and provider reason/status. No payload, address, report, or credential
was logged.

Coverage includes:

- health booleans without secret values;
- invalid address, missing provider key, upstream rate limit, unavailable
  provider, request-size bound, and empty history;
- deterministic results for unsorted input;
- exact supported-token decimals and large integer values;
- unknown assets, inbound spam quarantine, and unsafe unsupported outflows;
- duplicate evidence rejection;
- exact opening-lot FIFO and sale arithmetic;
- missing, invalid, rate-limited, and timed-out CoinGecko pricing;
- canonical receipt hashing, changed-evidence hashes, wallet rejection, and
  duplicate custom errors; and
- disabled receipt configuration by default.

### Production build

```powershell
npm.cmd run build
```

Result: PASS before and after the local correction.

```text
Compiled successfully
Finished TypeScript
Generated static pages (4/4)
○ /
ƒ /api/analysis/fetch
ƒ /api/analysis/report
ƒ /api/health
```

### Solidity

The first normal invocation reached neither Solidity compilation nor tests
because this restricted Windows runner returned
`uv_os_get_passwd ENOMEM` while `tsx` asked Node for the OS username. A safe
runner-only workaround supplied the known username to Node and copied the
already-installed Solidity 0.8.24 compiler cache into a writable temporary
directory. No repository, contract, wallet, RPC, or key configuration changed.

Commands after that runner workaround:

```powershell
npm.cmd run contract:compile
npm.cmd run contract:test
```

Result: PASS.

```text
Running Solidity tests
ReportReceiptTest
  testStoresOwnerAndTimestamp()
  testRejectsZeroHash()
  testRejectsDuplicateHash()
3 passing
```

### Core Playwright

A local Next.js server was started separately so Playwright did not need to
terminate its child process on the restricted Windows runner:

```powershell
npm.cmd run dev -- --port 3000
npm.cmd run test:e2e -- --reporter=line
```

Result: PASS after the local copy correction.

```text
6 passed (14.7s)
```

The suite verifies:

1. static demo, all core report sections, receipt-disabled state, and an actual
   JSON download event/filename;
2. rate-limit state;
3. evidence-driven deterministic rerun;
4. empty history;
5. unavailable provider with demo recovery; and
6. client-side invalid-address rejection.

### Receipt Playwright

The optional receipt was enabled only on a local test server with the existing
non-secret test address:

```powershell
$env:NEXT_PUBLIC_BASE_SEPOLIA_REPORT_RECEIPT_ADDRESS =
  "0x1111111111111111111111111111111111111111"
npm.cmd run dev -- --port 3001
npx.cmd playwright test --config="<temporary-local-reuse-config>" --reporter=line
```

The temporary config reused `http://localhost:3001` and ran the repository's
unchanged `tests/e2e-receipt/receipt.spec.ts`. It was removed after the run.

Result: PASS.

```text
6 passed (14.8s)
```

The suite verifies no wallet provider, rejected connection, wrong chain,
separate review/confirmation, rejected transaction, duplicate receipt, pending
state, and confirmed state. All wallet/RPC behavior was simulated. No real
transaction was requested or sent.

One discarded harness attempt used `127.0.0.1`; Next.js correctly blocked its
development HMR resource as a cross-origin request. Rerunning with the
repository's `localhost` origin passed all six tests. This was not a production
or product failure.

## Production verification evidence

### HTTP and Vercel evidence

- `GET https://ledgerproof-india.vercel.app/` returned HTTP 200.
- `GET https://ledgerproof-india.vercel.app/api/health` returned HTTP 200 and:

  ```json
  {
    "status": "ok",
    "application": "ledgerproof-india",
    "providers": {
      "blockchainConfigured": true,
      "historicalPricesConfigured": true,
      "classificationMode": "deterministic"
    }
  }
  ```

- The health response used `Cache-Control: no-store` and contained no key
  values.
- Vercel reported no runtime error clusters in the previous 24 hours.
- Latest-deployment requests observed during verification were HTTP 200/304.
- Post-browser route activity included `/`, `/api/health`,
  `/api/analysis/fetch`, and `/api/analysis/report`.
- No Vercel error, warning, or fatal runtime log was present in the 30-minute
  verification window.
- Error-only build logs contained no build error; Vercel reported
  `Build Completed`.

### Real browser evidence

The public production alias was opened in a fresh browser session.

1. **No login:** the wallet form and demo button were immediately available;
   no authentication gate or wallet connection was required.
2. **Invalid address:** `not-an-address` produced
   `Enter a valid 0x Ethereum wallet address.` No provider result appeared.
3. **Static demo:** the report displayed `STATIC DEMO DATA`, 3 fixture
   transactions, 4 supported movements, one calculated disposal, one evidence
   item, complete history, deterministic INR figures, FIFO detail, and visible
   limitations.
4. **Receipt disabled:** the demo and live report both displayed
   `Unavailable until a reviewed public contract address is explicitly
   configured.` No connect/mint control was offered.
5. **JSON export:** clicking `Download JSON evidence` displayed
   `JSON evidence downloaded, including quarantined movements.` The in-app
   browser did not surface its download event to the controller, while the
   core Playwright suite independently verified the real download event and
   expected filename.
6. **Known active wallet:** public address
   `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, FY 2026-27, completed
   successfully with:
   - `LIVE PROVIDER DATA`;
   - 50 validated transactions;
   - 4 supported movements;
   - 28 unsupported inbound movements quarantined;
   - 6 unsupported movements kept in review because isolation was unsafe;
   - 22 evidence items;
   - no supported disposal in the selected available history;
   - `Complete history: No`;
   - missing acquisition basis shown as `Not available`; and
   - `DETERMINISTIC RULE ENGINE — tax calculations do not depend on AI.`
7. **Console:** no browser console warning or error was captured.

This active-wallet result is deliberately conservative. A partial 50-record
provider window did not become a false complete report, and unsupported spam
did not enter supported-asset arithmetic.

## Provider and receipt configuration

### Providers

- GoldRush: configured in Production and exercised successfully by the known
  active-wallet browser check.
- CoinGecko: configured in Production according to `/api/health`.
- CoinGecko presence does not prove quota or every historical date. Its
  missing-price, invalid-price, rate-limit, timeout, and safe one-sided
  valuation boundaries pass unit tests.
- Classification: deterministic. The release does not read an OpenAI key and
  does not send an OpenAI request.
- The deterministic application remains usable if pricing fails. A static demo
  never requires an external provider.

### Receipt

- Production receipt contract address: not configured.
- Production receipt state: unavailable/disabled.
- Reviewed public deployment: none claimed.
- On-chain report or personal data: none.
- Mint or transaction performed during Day 9: none.
- Local Solidity and simulated-browser tests pass if the optional feature is
  enabled later.

## Deterministic arithmetic and LLM boundary

- `src/lib/analysis-service.ts` always reports
  `classificationMode: "deterministic"`.
- Transaction categories come from the rules in
  `src/lib/reconciliation.ts` plus strictly validated user evidence.
- Token quantities, FIFO basis, proceeds, gains, losses, 30% base tax, and
  optional cess use integer strings and `BigInt`.
- Historical CoinGecko numbers are converted to INR paisa before use and are
  limited to supported two-sided swaps. Market price is not substituted for a
  user's actual INR buy or sale value.
- There is no OpenAI import, endpoint, model setting, or fetch call in the
  product source.
- Provider or future model failure cannot replace or control FIFO/tax
  arithmetic.

## Privacy, secret, and logging review

- `.env.local` is ignored by Git; only `.env.example` is tracked.
- `.env.example` contains placeholders, not working credentials.
- `GOLDRUSH_API_KEY` and `COINGECKO_API_KEY` are accessed only from server
  routes/modules protected by `import "server-only"`.
- The only `NEXT_PUBLIC_` variable is the optional public receipt contract
  address.
- A tracked-file scan found no OpenAI-style key, 64-hex private-key candidate,
  mnemonic assignment, or literal bearer credential.
- Git-history searches found no OpenAI-style key or private-key pattern.
- Client components contain no provider environment access.
- `/api/health` returns only configuration booleans and deterministic mode.
- The application never asks for a seed phrase or private key.
- Public wallet history is normalized and may be held in a per-instance
  60-second memory cache; it is not written to durable storage or logs.
- Rate-limit state is per server instance and is not written to durable
  storage.
- Provider warnings contain only bounded failure reason/status. Validation
  warnings contain schema path/code/message, not provider values.
- JSON evidence is generated in the browser and intentionally contains the
  public wallet report being downloaded by that user. It contains no
  environment variables or provider credentials.
- If a receipt is enabled later, only the canonical `bytes32` hash, signer
  address, and timestamp are stored on Base Sepolia. The report remains
  off-chain.

## Local corrections made during Day 9

These files are deliberately uncommitted:

1. `src/app/page.tsx`
   - changed visible `Day 7 release candidate` copy to
     `Final release candidate`;
2. `README.md`
   - removed the obsolete hard-coded `d1b6932` deployment claim and directs
     exact SHA/deployment evidence to the latest Codex run;
3. `tests/e2e/landing.spec.ts`
   - added an assertion protecting the final-release label; and
4. `docs/codex-runs/day-09.md`
   - this release record.

These changes do not alter classification, arithmetic, providers, environment
boundaries, receipt behavior, or the contract.

## Known limitations and remaining risks

1. **Unpublished Day 9 corrections:** GitHub and production still show the
   pre-correction judge copy until the user explicitly commits and deploys.
2. **Final video parity not yet evidenced:** the final submitted video must be
   recorded from the deployment created from the eventual submission commit.
3. **Provider dependence for live wallets:** GoldRush can time out, throttle,
   change shape, or return partial history. The UI exposes this and keeps the
   static demo independent.
4. **Historical pricing:** CoinGecko can omit a date or fail. Missing pricing
   remains blocked/partial rather than invented.
5. **Incomplete public history:** the verified active wallet returned a safe
   partial window. Opening lots and user evidence may be needed for a useful
   tax figure.
6. **Public-chain ambiguity:** wallet history cannot prove centralized-exchange
   trades, wallet ownership, actual INR consideration, gift/reward treatment,
   TDS, residency, surcharge, or all DeFi/NFT context.
7. **Demo-grade rate limits:** request budgets are per Vercel instance, not a
   distributed abuse-prevention system.
8. **Optional receipt:** no reviewed contract is deployed/configured. A future
   public hash may be linkable to somebody who already has the underlying
   report.
9. **Windows runner cleanup:** Playwright may not terminate a Next.js child it
   starts. Reusing a separately started local server produced clean test exits.
   This does not affect Vercel runtime behavior.

## Two-to-three-minute final demo script

### 0:00-0:20 — Product and boundary

Open <https://ledgerproof-india.vercel.app/> in a signed-out window.

Say:

> LedgerProof India is a public, no-login, evidence-first crypto tax
> reconciliation preview for Ethereum. It never asks for a seed phrase, it is
> not filing software or tax advice, and missing facts stay visible instead of
> being guessed.

Briefly show the public-address form, financial year, 250-record cap, and
opening-lot option.

### 0:20-1:10 — Deterministic demo

Click **Load static demo ledger**.

Show:

- `STATIC DEMO DATA`;
- report coverage and `Complete history: Yes`;
- the partial state and missing-evidence item;
- separate positive gains and VDA losses;
- the 30% base preview;
- FIFO lots and disposal matches; and
- `Download JSON evidence`.

Say:

> Classification and every rupee calculation are deterministic. Quantities,
> FIFO, gains, losses, and tax use validated integer arithmetic. AI does not
> control any number.

Download the JSON and show the success message.

### 1:10-2:00 — Live conservative behavior

Enter the known public wallet
`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, keep FY 2026-27, and click
**Analyze live wallet**.

Show:

- `LIVE PROVIDER DATA`;
- the deterministic-rule banner;
- supported movements;
- unsupported inbound spam quarantined;
- unsafe unsupported outflows kept in review;
- missing basis as unavailable; and
- `Complete history: No`.

Say:

> This is the important safety behavior: a provider boundary never becomes a
> fake complete report, token symbols are not trusted, and unsupported or
> ambiguous movements cannot silently affect supported-asset arithmetic.

### 2:00-2:25 — Optional receipt and resilience

Show the disabled receipt panel.

Say:

> The Base Sepolia receipt is optional and disabled until a reviewed public
> contract address is configured. Analysis and export remain complete without
> a wallet, and rejection or receipt failure cannot block the report.

### 2:25-2:50 — Repository/deployment proof

Show the GitHub full commit SHA and the Vercel production deployment's Git
source SHA side by side. They must be identical for the final submission.

Close with:

> LedgerProof keeps evidence, unknowns, provider limits, and deterministic
> arithmetic visible. It is a reviewable reconciliation preview, not a
> black-box tax answer.

## Final submission checklist

Do not perform these steps until the user explicitly approves commit/push and
deployment:

1. Review `git diff` and confirm only the four Day 9 files above are intended.
2. Run:

   ```powershell
   npm.cmd run lint -- --max-warnings=0
   npm.cmd run typecheck
   npm.cmd test
   npm.cmd run build
   npm.cmd run contract:test
   npm.cmd run test:e2e
   npm.cmd run test:e2e:receipt
   git diff --check
   ```

3. Commit the reviewed Day 9 changes.
4. Push that commit to GitHub `main`.
5. Wait for the linked Vercel production deployment to become `READY`.
6. Copy the new GitHub full SHA and Vercel deployment ID.
7. Confirm Vercel's Git source SHA exactly equals the GitHub full SHA.
8. Recheck `/`, `/api/health`, static demo, the known active wallet, invalid
   input, JSON export, receipt-disabled copy, runtime logs, and console errors.
9. Update this document's release identity and production evidence to the new
   SHA/deployment ID.
10. Record the final demo from that exact deployment.
11. Show the identical GitHub/Vercel SHA in the recording.
12. Confirm no wallet transaction, receipt, secret, private key, or API-key
    value appears in the repository, deployment output, or video.
13. Submit the production URL, repository URL, and final video URL.

## Final decision

**CONDITIONAL PASS**

All core product, deterministic arithmetic, privacy, provider-failure,
contract, build, browser, active-wallet, and current deployment-parity gates
pass. Change this to **PASS** only after the local Day 9 corrections are
committed/deployed with explicit user approval, the new GitHub/Vercel full SHA
pair is recorded, and the final video is verified against that same deployed
commit.

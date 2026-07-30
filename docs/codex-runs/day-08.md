# Day 8 — Optional Base Sepolia report receipt

Date: 2026-07-30

## Gate and scope

Day 7 states that every mandatory viability gate passes, so optional receipt
work may begin. This implementation is based on commit
`64d9747d93c50378112ecc01be1db5b5dfa91ad9`.

The receipt is not part of the tax calculation and is disabled by default. No
contract was deployed, no transaction was sent, no private key was created, and
no commit or push was made.

## Implemented boundary

### Contract

`contracts/ReportReceipt.sol` is deliberately small:

- `mintReceipt(bytes32 reportHash)` is the only write;
- `ReceiptMinted` indexes the hash and owner and includes the timestamp;
- `receipts(reportHash)` stores and returns only owner and `uint64` timestamp;
- zero hashes are rejected;
- an existing hash cannot be written again;
- there is no token, NFT, transfer, metadata URI, administrator, fee, report
  payload, tax figure, wallet history, name, or personal-data storage.

The mapping uses a nonzero owner as the existence marker. `msg.sender` cannot be
the zero address, so the marker is unambiguous.

### Canonical representation

The hash domain is `ledgerproof-report-receipt-v1`. For a given in-memory
`ResultsViewModel`, the browser constructs:

```json
{
  "report": "<the complete JSON-compatible ResultsViewModel>",
  "schema": "ledgerproof-report-receipt-v1"
}
```

Canonicalization rules:

1. object keys are sorted lexicographically at every depth;
2. array order is preserved;
3. strings, booleans, finite numbers, and `null` use JSON encoding;
4. `undefined`, functions, symbols, bigints, non-finite numbers, class
   instances, and cycles are rejected;
5. the resulting string is UTF-8 encoded with viem `stringToHex`; and
6. viem `keccak256` produces the `bytes32` report hash.

`generatedAt` is part of the report. Re-running the analysis at a different
time intentionally creates a different report and therefore a different hash.
The original report never leaves the browser as part of the receipt flow.

### Browser-wallet flow

The Next.js integration:

- uses only `window.ethereum` through viem `custom`;
- checks Base Sepolia chain ID `84532`;
- uses the injected wallet provider for contract reads and receipt polling;
- requires one click to connect and review the hash, then a second click to
  request transaction confirmation;
- rechecks the chain and duplicate state immediately before sending;
- never switches chains, signs, or mints automatically;
- displays unavailable, connecting, connected, confirmation, pending, success,
  rejection, wrong-chain, provider/RPC-error, and duplicate states; and
- remains unavailable unless
  `NEXT_PUBLIC_BASE_SEPOLIA_REPORT_RECEIPT_ADDRESS` is a valid nonzero public
  address.

The disabled state does not request a wallet and does not load the receipt
controls. The existing no-login public-address analysis and static demo remain
unchanged.

## Tests added

- Solidity:
  - stores the caller and current block timestamp;
  - rejects a duplicate hash;
  - rejects the zero hash.
- Vitest:
  - stable recursive key ordering;
  - array-order preservation;
  - equal hashes for different object-key insertion order;
  - changed hash when report evidence changes;
  - rejection of unstable JSON values;
  - wallet-rejection and duplicate-error classification;
  - missing, zero, malformed, and valid public contract configuration.
- Playwright:
  - disabled state without configuration;
  - unavailable browser-wallet provider;
  - connection rejection;
  - wrong-chain handling;
  - separate connected and confirmation states;
  - transaction rejection;
  - existing duplicate receipt;
  - pending transaction and confirmed success with explorer link.

The configured receipt browser suite uses a mock EIP-1193 provider and a
non-deployed test address. It does not spend test ETH or contact a live RPC.

## Verification evidence

The reviewed Day 8 files were first prepared in the isolated clone
`C:\Users\ADMIN\Documents\Codex\2026-07-29\ju\ledgerproof-day8-work`, then
transferred without a commit to the primary repository
`C:\Users\ADMIN\Documents\Codex\2026-07-25\ledgerproof-india-complete`.
The work is based on `64d9747a7daa15d043827ead7d3cac2297b0f9c0`.
`npm install --no-audit --no-fund` completed in the primary repository and
updated `package-lock.json`.

Current command evidence:

- `npm run lint` — **passed** after the final wallet-state fix.
- `npm run typecheck` — **passed** after the final wallet-state fix.
- `npm test -- --run` — **passed**, 12 files and 63 tests.
- `npm run build` — **passed** with Next.js 16.2.11. `/` was prerendered and
  the three API routes were built as dynamic routes.
- `npm run contract:compile` — **passed** in the user's normal terminal:
  two Solidity files compiled with solc 0.8.24 for Shanghai. A second run
  correctly reported that no contracts needed compilation.
- `npm run test:e2e` — all **six assertions passed**: fixture/export,
  rate-limit, evidence rerun, empty history, provider unavailable, and invalid
  address. The command did not exit before the 60-second runner limit because
  this restricted Windows process could not terminate Playwright's spawned
  Next.js child after the results completed.
- `npm run test:e2e:receipt` — **passed**, all six cases in 18.6 seconds:
  provider unavailable, connection rejection, wrong chain, separate
  confirmation/rejection, duplicate receipt, and pending/success. Investigation
  found that spreading the runtime connected-state object after a new `kind`
  silently changed confirmation, pending, and success back to connected. The
  prepared payload is now reduced to only account/report hash, state
  discriminants cannot be overwritten, and test-controlled RPC gates make the
  transient assertions deterministic.
- `npm run contract:test` — **passed**, all three Solidity tests: owner and
  timestamp storage, zero-hash rejection, and duplicate-hash rejection.
- `git diff --check` — **clean**, with only expected Git LF-to-CRLF conversion
  warnings on Windows.

No commit, push, Vercel deployment, contract deployment, wallet signature, or
blockchain transaction was made.

## Post-Day 8 live-wallet ingestion hotfix

The production deployment at commit
`e591b989f69e9ccdda13d251d6b89b029fbcadf4` returned `502` for
`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` in FY 2026-27.
Production logs showed a caught `POST /api/analysis/fetch 502`, with no
uncaught runtime error. A sanitized provider probe established the cause:

- the original GoldRush address-history endpoint accepted the server-only key
  and returned HTTP `200`;
- the response exceeded 982 KB and was still downloading after 30 seconds;
- LedgerProof's 12-second per-page timeout therefore produced the concise
  unavailable-provider state.

The ingestion client now uses GoldRush's bounded cursor endpoint with:

- Ethereum mainnet and the requested public address fixed in a server-created
  URL;
- 50 records per page, decoded logs enabled, a 250-record cap, a 12-second
  per-page timeout, and a 35-second total fetch budget;
- provider cursors copied only into the `before` query parameter on the fixed
  GoldRush origin, preventing cursor-controlled host changes;
- validated partial results marked `truncated: true` and
  `historyComplete: false` when a later page exceeds the safe budget;
- exact gas fees derived with `BigInt(gas_price) * BigInt(gas_spent)` when the
  cursor API returns `fees_paid` as an unsafe JSON number;
- missing decoded log objects treated as undecoded evidence rather than a
  whole-wallet failure;
- secret-safe diagnostics containing only failure reason and HTTP status, with
  no API key, wallet, transaction, or report logging.

Concrete verification evidence:

- bounded provider probe: HTTP `200`, 50 items, about 298 KB in 8.8 seconds;
- fixed local route for the reported wallet/FY: HTTP `200`, 50 validated
  transactions in about 19.7 seconds, `truncated: true`,
  `historyComplete: false`;
- real browser flow: “Reconciled 50 validated transactions,” live-provider
  report rendered, no error overlay, and no browser console error;
- Vitest: **66/66 passed**;
- Solidity tests: **3/3 passed**;
- TypeScript, zero-warning ESLint, and production build: **passed**;
- Playwright core browser suite: **6/6 passed**;
- `git diff --check`: **clean**, apart from expected Windows line-ending
  warnings.

This hotfix is local only. The public Vercel deployment will retain the old
timeout behavior until these reviewed changes are committed and redeployed.

## Required clean-room verification

From the real repository directory:

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run contract:compile
npm run contract:test
npm run test:e2e
npm run test:e2e:receipt
```

All listed local verification commands have passed. Review the complete diff
before any commit. Contract deployment and UI enablement remain separate,
explicit manual actions.

## Exact local Base Sepolia deployment steps

These steps are manual and must be performed only after code review and all
tests pass.

1. Use a dedicated test wallet. Obtain free Base Sepolia test ETH from a
   reputable faucet. Never use a mainnet-funded private key.
2. Compile and test:

   ```powershell
   npm run contract:compile
   npm run contract:test
   ```

3. Set the public RPC URL in the current terminal only:

   ```powershell
   $env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
   ```

4. Read the dedicated test-wallet private key without writing it to a file,
   deploy, and remove it from the process environment:

   ```powershell
   $receiptSecureKey = Read-Host "Dedicated 0x-prefixed Base Sepolia private key" -AsSecureString
   $receiptKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($receiptSecureKey)
   try {
     $env:BASE_SEPOLIA_PRIVATE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($receiptKeyPointer)
     npm run contract:deploy:base-sepolia
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($receiptKeyPointer)
     Remove-Item Env:BASE_SEPOLIA_PRIVATE_KEY -ErrorAction SilentlyContinue
     Remove-Item Env:BASE_SEPOLIA_RPC_URL -ErrorAction SilentlyContinue
   }
   ```

5. Copy only the printed public contract address. Do not copy the private key,
   seed phrase, terminal history, or any report data.
6. Verify the deployment address and source/bytecode on the Base Sepolia
   explorer before enabling the UI.
7. Configure the public address locally:

   ```text
   NEXT_PUBLIC_BASE_SEPOLIA_REPORT_RECEIPT_ADDRESS=0xReviewedContractAddress
   ```

8. Restart the Next.js process. Load a static report, connect a browser wallet
   on Base Sepolia, review the hash, and explicitly confirm.
9. Verify the emitted `ReceiptMinted` event and the public
   `receipts(reportHash)` owner/timestamp. Submit the same report again and
   confirm the UI shows the duplicate state without offering another mint.
10. Remove the public address to confirm the feature returns to the unavailable
    state without affecting analysis or report export.

Do not place `BASE_SEPOLIA_PRIVATE_KEY` in `.env`, `.env.local`, Vercel, source
files, documentation, screenshots, or shell scripts. The Next.js application
never needs a private key.

## Self-review

| Risk | Review result |
| --- | --- |
| Privacy leakage | Only hash, signer, and timestamp enter calldata/storage/events. No report logging or server receipt endpoint exists. Deterministic hashes remain publicly linkable if an observer already has the report. |
| Canonical hash stability | Domain version, recursive key sorting, preserved array order, finite JSON values, and UTF-8 encoding are explicit and tested. A changed report timestamp creates a new report hash by design. |
| Incorrect encoding | The implementation uses viem `stringToHex` followed by `keccak256`, never hex-looking string concatenation or platform-default encoding. |
| Wrong chain | Chain ID is checked after connection and again immediately before the write. The UI never auto-switches. |
| Duplicate writes | A read preflight improves UX; the contract remains the final atomic duplicate guard, including races. |
| Wallet rejection | EIP-1193 code `4001` and nested viem rejection errors map to a concise rejected state; no raw provider error is displayed or logged. |
| Unavailable RPC/provider | Missing injection, failed reads, receipt timeout, and unknown provider errors map to a retryable provider-error state without blocking the report. |
| Unhandled UI states | Dedicated browser cases pass for disabled, connection, confirmation, pending, success, rejection, wrong-chain, provider error, and duplicate paths. Test-controlled RPC gates hold transient states until they are asserted. |
| Contract-address risk | Configuration accepts only a nonzero 20-byte public address, but operators must still verify deployed bytecode before enabling it. |
| Front-running/ownership claim | Anybody who learns a hash can register it first. The receipt proves only that an address submitted that hash at a testnet time; it is not identity, report ownership, tax correctness, or filing proof. |
| Core calculation regression | Wallet ingestion changed, but no reconciliation, classification, pricing, FIFO, or tax-arithmetic source file changed. All 66 Vitest cases and all six core Playwright assertions passed. |

## Remaining risks

1. The Playwright commands can print completed assertions but fail to exit on
   this restricted Windows runner because their spawned Next.js child is not
   cleaned up. The same receipt suite exited normally in the user's terminal.
2. A real deployment address does not exist. The feature correctly remains
   unavailable.
3. Base Sepolia RPCs, faucets, wallets, and explorer indexing are external and
   may be unavailable.
4. A testnet receipt has no tax, identity, legal, financial, or mainnet meaning.
5. The configured contract address is public client configuration, not a
   secret, but a wrong or malicious address could present misleading wallet
   prompts. Verify bytecode before enabling it.
6. Very active wallets can exceed the bounded public-demo fetch budget. The app
   now returns validated partial evidence and visibly marks history incomplete
   instead of failing the whole flow or implying complete tax coverage.

## Decision

The Day 8 local implementation passes every required verification command and is
ready for diff review. It remains intentionally undeployed and disabled until a
reviewed Base Sepolia contract address is explicitly configured. The
deterministic rule engine and tax arithmetic remain the only calculation path.

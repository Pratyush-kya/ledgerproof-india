# LedgerProof India

An evidence-first crypto tax reconciliation preview for public Ethereum wallets.

## Day 1 scope

- Ethereum address validation only.
- A clearly labelled, static demo ledger for the UI and tests.
- Typed schemas for normalized transactions, classifications, tax lots, report coverage, and reports.
- No blockchain provider, price source, LLM, wallet connection, or tax calculation yet.

The product must never ask for a seed phrase or private key. It is a reconciliation preview, not tax advice or an ITR filing service.

## Run locally

```powershell
npm.cmd run dev
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e
```

## Day 1 architecture

`src/lib/schemas.ts` holds the Zod contracts. `src/fixtures/demo-ledger.json` is the deliberately static demo payload, and `src/lib/demo-ledger.ts` validates it before the UI reads it.

See `docs/codex-runs/day-01.md` for the build plan, acceptance criteria, verification results, and self-review notes.

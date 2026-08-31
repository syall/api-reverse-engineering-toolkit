# Contributing

## Setup

```bash
npm install
```

## Repo layout

- `SKILL.md` — the skill itself, read by Claude. Keep it under ~500 lines;
  push detail into `references/` rather than growing this file.
- `references/` — detail docs loaded by Claude only when the skill's
  workflow points to them.
- `scripts/` — the verification script and the client-adapter examples,
  usable standalone (outside of Claude) as well.
- `examples/` — a worked fixtures file demonstrating the format.
- `tests/` — regression tests for `verify_endpoints.ts`'s internal logic,
  not for SKILL.md's content (that's better validated by actually
  running the skill against real tasks — see "Testing the skill itself"
  below).

This is a single-language-ecosystem repo: everything is TypeScript/
JavaScript on Node. Please don't introduce a Python (or any other
language's) dependency into `scripts/`, `tests/`, or the CI workflow —
if a check needs scripting, write it in TypeScript alongside the
existing script, or as a plain Node one-liner if it's small enough.

## Making changes to the verification script

`scripts/verify_endpoints.ts` has accompanying tests in
`tests/verify_endpoints.test.ts` that exercise its pass/fail logic
against in-process mock HTTP servers — no live network access needed to
run them. Run before opening a PR:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

If you change what a fixture field means or add a new one, update
`examples/fixtures.example.json` and, if the client-adapter contract is
affected, `scripts/adapters/README.md` and both example adapters too.

## Testing the skill itself

`SKILL.md`'s actual quality — does Claude follow the workflow well, does
it correctly classify auth-gated endpoints, does it pick a sensible
format — isn't something the automated test suite here can check; that
needs running real tasks through Claude with the skill installed and
reviewing the output. If you're changing the workflow described in
`SKILL.md` in a nontrivial way, describe in your PR what you ran it
against and what you observed, even informally.

## Commit style

Conventional commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`) are
appreciated but not enforced by tooling in this repo.

## Releasing an updated `.skill` package

If you have access to Anthropic's `skill-creator` tooling, use its
packaging script to produce a distributable `.skill` file from this
repo's contents. That packaging step is external tooling provided by
the Claude environment, not part of this repo.

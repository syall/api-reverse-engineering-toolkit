# API Reverse-Engineering Toolkit

A [Claude Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
for turning an undocumented HTTP API into a verified schema — plus a
standalone verification script you can run outside of Claude entirely,
in your own CI, once a spec or a generated client exists.

Point it at a list of URLs, a captured HAR file, or "here's how this
site's frontend calls its backend," and it will:

1. **Enumerate** the real endpoint surface (including endpoints that
   never appear in any URL a human visited, pulled from the site's own
   client-side JS).
2. **Classify** each one — auth-gated and mutating endpoints get
   documented from code, not invoked.
3. **Verify live** — every endpoint in the resulting spec is either a
   real, captured response, or explicitly marked as inferred/unverified
   and why.
4. **Choose a format deliberately** — OpenAPI vs. Smithy vs. GraphQL vs.
   gRPC, based on what the API actually looks like on the wire, not on
   habit.
5. **Recommend a code-generator**, and optionally scaffold a
   production-ready starter SDK repo.

The throughline is **provenance**: nothing in the output spec should be a
guess wearing the clothes of an observed fact.

This is a single-language-ecosystem repo — everything here is
TypeScript/JavaScript, run on Node. There's no Python anywhere in this
skill's own tooling.

## Repository layout

```
.
├── SKILL.md                      the skill Claude reads
├── references/                    detail docs the skill points into
│   ├── recon-techniques.md          extracting endpoints from client-side JS
│   ├── format-selection.md          OpenAPI vs Smithy vs GraphQL vs gRPC
│   ├── generator-comparison.md      current TypeScript codegen landscape
│   └── starter-repo-checklist.md    scaffolding a generated SDK repo
├── scripts/
│   ├── verify_endpoints.ts          raw-API check, optionally + a generated client
│   └── adapters/                    client-adapter contract + worked examples
├── examples/
│   └── fixtures.example.json        a worked example fixtures file
├── tests/                         regression tests for verify_endpoints.ts
├── .github/workflows/ci.yml       lint + typecheck + test on every push
└── package.json / tsconfig.json / eslint.config.js / .prettierrc
```

`SKILL.md` sits at the repo root alongside its supporting directories —
the same layout Anthropic's own bundled skills use — so this repo doubles
as both a normal, cloneable GitHub project _and_ something you can point
Claude's skill-loading mechanism straight at.

## Using this as a Claude Skill

- **Claude.ai / Claude Code / Cowork**: package it with `skill-creator`'s
  packaging script into a `.skill` file, or point your tooling at this
  repo directory directly if it supports loading a skill from a folder.
- Once installed, it triggers on requests like "reverse engineer this
  API," "map out this API's schema," or "turn these captured requests
  into an OpenAPI/Smithy spec" — see the `description` field in
  `SKILL.md`'s frontmatter for the exact trigger conditions.

## Using the verification script standalone

`scripts/verify_endpoints.ts` works independently of Claude — useful as
an ongoing regression check ("does the live API, and any generated
client, still match what we captured?") in your own CI, long after the
initial reverse-engineering work is done. It has two modes:

### Raw-only: checks the live API against expectations

```bash
# Node >=22.6 has native TypeScript support, no install needed:
node --experimental-strip-types scripts/verify_endpoints.ts examples/fixtures.example.json
```

Expected output, based on the live responses captured earlier in this
project (re-running it now will hit the real API fresh, and should match
unless the API itself has changed since):

```
[PASS] getBookById (Bible book) (raw): OK
[PASS] findVerses (populated result) (raw): OK
[PASS] findVerses (confirmed-empty result) (raw): OK
[PASS] getChapterById (raw): OK

4/4 checks passed
```

Exit code is non-zero on any failure, so it's CI-friendly as-is.

### Raw + client: also checks a generated client, and cross-checks it against the raw response

```bash
node --experimental-strip-types scripts/verify_endpoints.ts \
  examples/fixtures.example.json \
  --adapter=./scripts/adapters/your-adapter.ts

# Older Node, via tsx:
npx tsx scripts/verify_endpoints.ts examples/fixtures.example.json --adapter=./scripts/adapters/your-adapter.ts
```

Beyond checking the client's output against the same expectations as the
raw check, this mode diffs the raw response against the client's parsed
result — catching client-side serialization bugs (a silently dropped or
renamed field) that neither check alone would flag.

Every generated client has a different calling convention, so this mode
delegates to a small **adapter** module you write once per SDK — see
[`scripts/adapters/README.md`](scripts/adapters/README.md) and the two
worked examples there (one for an `openapi-fetch`-style client, one for
a Smithy `Client`/`Command`-style client).

## Development

```bash
npm install

npm run typecheck
npm run lint
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more, including how the test
suite is structured (in-process mock HTTP servers, no live network
access required to run it).

## License

MIT — see [LICENSE](LICENSE).

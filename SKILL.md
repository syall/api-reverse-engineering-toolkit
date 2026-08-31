---
name: api-reverse-engineering-toolkit
description: Reverse-engineer an undocumented or poorly-documented HTTP API into a verified schema (OpenAPI and/or Smithy), decide which spec format and protocol actually fits the API, recommend the right client code-generator for the target language, and optionally scaffold a starter SDK repo from it. Use this whenever the user shares a list of API URLs/endpoints or captured request-response examples and wants a spec, docs, or a generated client built from them; when they ask to "reverse engineer this API," "map out this API's schema," "figure out how this site's backend works," or "turn these captured requests into an OpenAPI/Smithy spec"; or when they want a TypeScript (or other language) SDK generated from an API that has no official spec. Every endpoint this skill documents should be verified against the live API wherever possible — don't write a schema purely from guessing.
---

# API Reverse-Engineering Toolkit

Turn a pile of URLs, captured network traffic, or "here's how the frontend calls this" into a verified, provenance-annotated API spec — and then help the user pick the right format, protocol, and code-generator for what they actually need.

The core discipline of this skill: **never write down a shape you haven't actually observed.** Every endpoint, field, and example in the output spec should be traceable to either a live response you captured, or clearly flagged as inferred (and from what source). This is what separates a reverse-engineered spec that's actually useful from one that silently propagates guesses as facts.

## When this applies vs. when it doesn't

Use this skill for undocumented/internal/third-party APIs the user wants to formalize. It is not a substitute for reading an API's own published OpenAPI/Smithy/GraphQL schema if one already exists — check for that first (common locations: `/openapi.json`, `/swagger.json`, `/.well-known/openapi.yaml`, an `/api/docs` page, a GraphQL introspection query against `/graphql`). Reverse-engineering is for when none of that exists or what exists is stale/incomplete.

## The workflow

This has five phases. Don't skip straight to writing the spec — the recon and verification phases are where reverse-engineered specs usually go wrong.

### 1. Enumerate candidate endpoints

Sources, roughly in order of reliability:

- **URLs the user already gave you.** Start here always — it's ground truth about what they actually care about.
- **The site's own client-side code**, if it's a web app. Fetch the built JS bundle(s) (check the page's `<script>` tags) and grep for API path patterns: string literals starting with `/api/`, `urlRoot`/`baseURL`-style config objects, `fetch(`/`axios.` call sites, GraphQL `gql`/`query` template literals. This reliably surfaces endpoints that never appear in any URL the user has visited (auth flows, admin actions, search-as-you-type debounced calls, etc.) — see `references/recon-techniques.md` for the specific grep patterns and how to pull surrounding context so you know the HTTP method and param names, not just the path.
- **`robots.txt` and sitemaps** — occasionally reveal API paths accidentally, rarely the main source.
- **A HAR file or captured requests the user exported from browser devtools**, if they have one — treat this the same as live-verified traffic (it already _is_ a captured real request/response).

Deduplicate aggressively: `/api/books/32`, `/api/books/1233`, `/api/books/91` are one endpoint template (`/api/books/{id}`), not three. Group by path template before doing anything else — it keeps the eventual spec proportional to the number of _distinct_ operations, not the number of example URLs the user happened to paste.

### 2. Classify each candidate before touching it

For every endpoint template, work out:

- **Does it need authentication?** Look for client-side gates (`if (user.isAuthenticated)`), session-scoped naming (`ForUser`, `MyX`, `userX`), or just try it unauthenticated and see if it 401s/403s/redirects to a login page.
- **Is it mutating?** POST/PUT/PATCH/DELETE, or a GET with a name like `/add`, `/delete`, `/save`, `/logoff` (some APIs — including real ones — use GET for actions they shouldn't; go by what it _does_, not its HTTP verb).

**Only invoke endpoints that are both unauthenticated and non-mutating**, unless the user explicitly says otherwise for a specific endpoint and it's clearly their own account/data. Document auth-gated and mutating endpoints from client-code evidence alone — name them, describe their apparent shape, and mark them unverified — rather than invoking them. This mirrors the instruction-source-boundary and prohibited/explicit-permission-required action categories that already govern tool use generally: reading a public, side-effect-free GET is fine to do proactively; logging in, changing settings, or triggering a send/delete/purchase-shaped endpoint is not something to do just because it showed up in a URL list.

### 3. Verify live, and capture real examples

For every endpoint that's safe to call, actually call it (via the fetch tool available in this environment, not guesswork) and record:

- Exact request (method, path, query/path params used)
- Full response: status code, `content-type`, and body
- Anything surprising: empty arrays where you expected data, `null` fields, string vs. number types that don't match the field name's implication, inconsistent shapes between similar endpoints

A few things that reliably bite people if skipped:

- **Hit each endpoint more than once with different inputs when feasible.** A single example makes an array field look mandatory-and-populated when it's actually usually empty (or vice versa). At minimum, try one input likely to return data and one likely to return an empty/edge case.
- **Numeric-looking IDs aren't proof of a type.** Bible-book IDs, user IDs, etc. are often modeled as strings in the wire format even when every value looks like an integer — check the actual JSON type, don't infer it from the value.
- **Enums are landmines.** Never assume a filter param is a numeric index or an unquoted keyword — invoke it with a guessed value first and read the error message or empty-result behavior; client-side constant objects (`CONST.SomeEnum = {A: "A", B: "B"}`) are the reliable source of the real literal values, not variable names.
- **Distinguish "confirmed empty" from "never observed populated."** If an endpoint returns `[]` every time you call it, that's a real, useful fact — but the _item_ schema inside that array is still a guess. Say so explicitly rather than inventing plausible-looking fields.
- **Note when tooling itself is the limiter.** POST-only endpoints you can't invoke with a GET-capable fetch tool, or endpoints that consistently time out, are still worth documenting (path, method, params inferred from client code) — just mark them clearly as unverified-due-to-tooling rather than silently omitting them or, worse, writing a response shape you never saw.

Keep a running provenance note per endpoint as you go — you'll need it in phase 4. Three tiers cover almost everything:

1. **Confirmed live** — you called it, here's the real response.
2. **Exists, unverified** — server acknowledged the route (e.g. returned 405 rather than 404 for a POST-only endpoint) or it's clearly present in client code, but you couldn't capture a real body.
3. **Excluded** — requires auth or is mutating; documented from client code only, not invoked.

### 4. Decide the format and protocol — don't default to OpenAPI on autopilot

Read `references/format-selection.md` for the full decision framework. The short version: look at what the API _actually is_ before picking how to describe it.

- **Plain REST-ish JSON over HTTP with resource-shaped paths** (`/api/books/{id}`, query-string filters) → **OpenAPI**. This is the common case and the ecosystem support (docs generators, mock servers, client generators in every language) is unmatched.
- **A single `/graphql` endpoint** → don't force it into OpenAPI. Introspect the schema (`__schema` query) directly if introspection is enabled; that gives you the real GraphQL SDL, which is a better fit than reverse-engineering individual queries by hand.
- **You want a protocol-agnostic model that could target REST, or a different transport later, with a stronger type system and less ambiguity than OpenAPI's `oneOf`/`nullable` conventions** → **Smithy**. Also the right call if the team already has Smithy tooling (common in AWS-adjacent shops) or genuinely wants server codegen, not just a client.
- **Binary/protobuf on the wire, `application/grpc` or `application/grpc-web` content-types** → you're looking at gRPC, not a REST API; the "spec" is a `.proto` file, and reverse-engineering it means recovering message shapes from serialized bytes, a fundamentally different and harder task — flag this to the user rather than trying to force OpenAPI/Smithy onto it.

If truly unsure, or the user wants both for comparison, it's reasonable to produce both an OpenAPI and a Smithy spec from the same verified endpoint data (they should describe the same reality, just in different type systems) — but say plainly which one you'd actually recommend shipping, and why, rather than presenting them as equally good defaults.

### 5. Write the spec with provenance built in

- Every operation gets a description grounded in what you actually saw, not the URL's vibes.
- Use the response body you captured as the `example`/`examples` field wherever the format supports it (OpenAPI: `example:` on the schema or `examples:` on the response; Smithy: doc comments, since Smithy has no native example trait for this in the base spec — put it in the operation's documentation).
- Mark inferred-not-observed shapes explicitly in a comment/description (`"Inferred shape (not observed populated)"`), and unverified/excluded endpoints just as explicitly, including _why_ (auth-gated, times out, POST-only + GET-only tooling, etc.).
- Validate the spec parses before calling it done: for OpenAPI, actually load the YAML (e.g. `yaml.safe_load`) rather than eyeballing it; for Smithy, at minimum check brace/bracket balance, and run the real `smithy build` CLI if it's available to you in this environment.

### 6. Recommend a code-generator, and optionally scaffold a starter SDK

Once the spec exists, help the user pick a generator rather than defaulting to whichever one you thought of first. Read `references/generator-comparison.md` — it covers the current OpenAPI→TypeScript field (types-only vs. full-client vs. batteries-included vs. multi-language) and the Smithy→TypeScript path (there's really one official generator, `smithy-typescript`, plus the option of converting Smithy→OpenAPI to unlock the whole OpenAPI generator ecosystem). Ask or infer:

- Target language(s) — TypeScript-only, or multiple languages from one spec (favors OpenAPI Generator)?
- Thin types + hand-rolled runtime, or a fuller batteries-included client with hooks/mocks/validation?
- Any existing framework commitment (React Query, a particular HTTP client) the generated code should slot into?

If the user wants an actual starter repo (not just a recommendation), `references/starter-repo-checklist.md` has the structural checklist distilled from building one end-to-end: the generated/runtime split, dual ESM+CJS build, `exports` map, CI codegen-drift check, and a release flow — plus the honest caveat that hand-authoring a "generated" layer in a starter kit (to keep it dependency-free and offline-buildable) is a legitimate but different thing from literal generator output, and should be labeled as such if you do it.

## Verification checklist before handing anything back

Run through this explicitly, don't just eyeball it:

- [ ] Every endpoint in the spec is tagged with its provenance tier (confirmed live / exists-unverified / excluded), and the tag is visible in the delivered spec, not just in your own scratch notes.
- [ ] No response field exists in the spec that wasn't either seen in a real response or explicitly marked inferred.
- [ ] Enum values, if any, came from the client's actual constant definitions or a live call's error/success behavior — not guessed from context.
- [ ] The spec file parses/validates (YAML loads for OpenAPI; brace-balanced and, ideally, `smithy build`-clean for Smithy).
- [ ] Auth-gated and mutating endpoints were documented, not invoked, unless the user explicitly authorized a specific one.
- [ ] If a starter SDK was generated, it actually typechecks (`tsc --noEmit` or the equivalent for the target language) before being presented as done — see `references/starter-repo-checklist.md`.
- [ ] If any endpoint could not be verified due to tooling limits (POST-only, persistent timeouts), that's stated to the user directly, not silently dropped from the summary.
- [ ] If a generated client was produced, offer `scripts/verify_endpoints.ts` with an adapter wired up (`--adapter=...`) as the ongoing regression check — it catches client-side serialization/parsing bugs that a raw-only check structurally can't see, since there's nothing to compare the raw response against without one.

## The verification script

`scripts/verify_endpoints.ts` is for the user/their CI to run after the fact (see the tooling note below), not for Claude to invoke mid-session. It has two modes, both driven by the same fixtures file:

- **Raw-only** (no `--adapter` flag, or fixtures with no `"client"` field): checks the live API against a fixtures file — status, content-type, expected top-level keys. Always applicable, works the moment you have a spec, no generated client required.
- **Raw + client** (`--adapter=./path/to/adapter.ts`, on fixtures that include a `"client": {"op", "args"}` field): additionally drives a generated client through the same fixture and cross-checks the raw response against the client's parsed result, flagging any divergence — this is the check that catches a client silently dropping or renaming a field even when both the raw call and the client call individually look fine. Needs a small adapter module bridging the generic `{op, args}` shape to your specific generated client's calling convention; see `scripts/adapters/README.md` and the two worked examples there (one for an `openapi-fetch`-style client, one for a Smithy `Client`/`Command`-style client) before writing your own.

Runs via `node --experimental-strip-types` on Node ≥22.6 (built into Node, no install needed), or via `tsx` on older Node. This skill's tooling is TypeScript/JavaScript end to end — nothing here requires Python.

Offer raw-only checking right after the spec itself is written; offer the client-checking mode once a generated client actually exists.

## A note on tooling inside this environment

Live verification calls should go through this environment's web-fetch tool, not `bash_tool`'s shell network access — the sandbox's outbound network from bash is typically restricted to package registries (npm, PyPI, GitHub, etc.) for installing dependencies, and won't reach arbitrary third-party hosts. `scripts/verify_endpoints.ts` in this skill is meant to be run by the _user_, locally or in their own CI, with normal outbound network access — use it as a regression check ("does the spec, and any generated client, still match reality?") after the fact, not as something you invoke yourself mid-conversation.

## Bundled resources

- `references/recon-techniques.md` — grep patterns and heuristics for pulling API endpoints out of client-side JS bundles, plus common false-positive traps.
- `references/format-selection.md` — full decision framework for OpenAPI vs. Smithy vs. GraphQL vs. gRPC, with the tradeoffs that matter in practice (tooling maturity, type-system expressiveness, team familiarity).
- `references/generator-comparison.md` — current-state comparison of OpenAPI→TypeScript generators (openapi-typescript/openapi-fetch, hey-api, Orval, Kubb, openapi-typescript-codegen, swagger-typescript-api, oazapfts, NSwag, OpenAPI Generator) and the Smithy→TypeScript path, with a recommendation matrix.
- `references/starter-repo-checklist.md` — the file-by-file structural checklist for a production-ready generated SDK repo (package.json fields, build config, CI drift-check, release flow).
- `scripts/verify_endpoints.ts` — replays a JSON fixtures file against the live API (and, optionally, a generated client via an adapter) and reports drift. Run by the user/their CI, not by Claude mid-session (see tooling note above). See `scripts/adapters/README.md` for the client-adapter contract.

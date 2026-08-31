# Starter repo checklist (generated TypeScript SDK)

Use this when the user wants an actual scaffolded repo, not just a generator recommendation. The structure below applies whether the source is OpenAPI or Smithy — only the codegen wiring (`scripts/generate.*`, the source-of-truth spec directory) differs.

## Directory shape

```
sdk-name/
├── <spec-dir>/                 openapi/*.yaml, or model/*.smithy (+ smithy-build.json at root)
├── src/
│   ├── generated/               never hand-edit — regenerated from the spec/model
│   └── runtime/                 hand-written: HTTP handling, retries, errors, auth hooks
├── src/index.ts                  public entrypoint; re-exports generated + runtime
├── test/unit/                     runtime logic tests, fetch injected as a stub
├── test/integration/               tests against a mocked network (msw), not the live API
├── examples/                        runnable usage examples
├── scripts/generate.*                 codegen driver
├── .github/workflows/{ci,release}.yml
├── package.json / tsconfig*.json / tsup.config.ts / eslint.config.js / .prettierrc
├── LICENSE / README.md / CHANGELOG.md / CONTRIBUTING.md
└── .changeset/                         if using changesets for releases
```

**The one structural decision that matters most**: keep `src/generated/` and `src/runtime/` in separate directories with nothing hand-written inside `generated/`. This is what lets regeneration happen without merge conflicts or accidentally clobbering hand-written retry/auth/error logic.

## package.json fields that actually matter for publishability

- `name`, `version`, `description`, `license`, `repository`, `author`
- `type: "module"`, plus `main`/`module`/`types` for older tooling
- `exports` map with `import`/`require`/`types` conditions per entry — the modern resolution mechanism; both ESM and CJS consumers need to resolve correctly
- `files: ["dist", ...]` — controls exactly what ships in the npm tarball; never let `src/` or `test/` leak into it
- `sideEffects: false` — enables tree-shaking downstream
- `engines.node` — set a floor

## Build output

Ship both `dist/esm` and `dist/cjs` unless you're confident every consumer is ESM-only. `tsup` gets you there without hand-rolling a bundler config; two `tsup.config.ts` entries (one per format) with a shared `tsconfig.build.json` (narrower `include` than the dev tsconfig — `src` only, no tests/examples) is enough.

## The codegen-drift CI check

The single highest-leverage CI step for a generated SDK: regenerate `src/generated/` in CI and fail if it produces an uncommitted diff. This catches "spec changed but nobody re-ran codegen" before it ships, which is the most common way generated SDKs silently go stale.

```yaml
- run: npm run generate
- run: |
    if [ -n "$(git status --porcelain src/generated)" ]; then
      echo "::error::src/generated is out of date. Run 'npm run generate' and commit the result."
      exit 1
    fi
```

For a Smithy source, this step needs a JDK + the Smithy CLI in the CI image, not just Node — call that out explicitly in the workflow and in the README, since it's an easy thing to forget when copying a CI config from an OpenAPI-sourced repo.

## Honesty about hand-authored "generated" code in starter kits

It's reasonable, in a starter repo meant to be reviewable and to build/typecheck without any installs, to hand-author `src/generated/` for a representative subset of operations rather than running the real generator against the full spec — especially for Smithy, where the literal generator output depends on the `@smithy/*` npm packages and won't typecheck offline. If you do this:

- Say so explicitly, in the file header comment and in the README, not just once in conversation.
- Make clear which parts are "pattern-faithful but hand-written" vs. literal generator output.
- Give the real generation command/script anyway, and point out where its real output will differ in structure from the hand-authored subset, so the user isn't surprised when they run it for real and get more files or different imports than what's checked in.

## Release flow

[changesets](https://github.com/changesets/changesets) is a solid default: `npx changeset` to describe a change and pick a semver bump, a release workflow that opens/updates a "Version Packages" PR on merge to main, and publishing happens when that PR is merged. Requires `permissions: id-token: write` in the release workflow for npm provenance, and an `NPM_TOKEN` secret.

## Verification gate before calling the repo "done"

Don't hand back a starter repo without actually running, at minimum:

- `tsc --noEmit` against the real tsconfig — this catches wrong generic variance, missing `rootDir`, and similar issues that are easy to introduce when hand-authoring types to match a generator's output style.
- A JSON validity check on `package.json` and any other JSON config files.
- If claiming the build config works, actually run the build tool (or at least `tsc -p tsconfig.build.json`) rather than assuming the config is correct from inspection alone.

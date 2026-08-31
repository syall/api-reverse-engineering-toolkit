# Code-generator comparison (TypeScript-focused)

This assumes TypeScript as the target since it's the most common ask; the "multi-language" row in each table is the escape hatch when it isn't.

## OpenAPI → TypeScript

### Types-only / thin-client

| Tool                 | What it gives you                             | Pick it when                                                                                        |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `openapi-typescript` | Pure `paths`/`components` types, zero runtime | You want full control over the HTTP layer and zero generated-runtime dependency                     |
| `openapi-fetch`      | Official thin runtime companion to the above  | Pairing with `openapi-typescript` and you're fine with no response validation (it trusts the types) |

### Full client generators

| Tool                                       | What it gives you                                                                        | Pick it when                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@hey-api/openapi-ts`                      | Typed client + optional runtime validation (Zod/Valibot) + SDKs + TanStack Query hooks   | Starting fresh and want more than bare types, with the most active current momentum           |
| Orval                                      | React Query/SWR/Axios hooks + MSW mocks + Zod schemas, one config                        | You want the whole frontend data-fetching layer generated, not just a client                  |
| Kubb                                       | Composable plugins generating multiple correlated outputs (types, Zod, React Query, MSW) | You want Orval-like breadth but more control over exactly which outputs get generated and how |
| `openapi-typescript-codegen` (ferdikoomen) | Typed client, template-based                                                             | Only for existing projects already using it — superseded by hey-api for new work              |
| `swagger-typescript-api`                   | Template-based (Handlebars/EJS) axios/fetch client                                       | Need heavy template customization and don't mind an older, more manual tool                   |
| `oazapfts`                                 | Typed fetch client                                                                       | `oneOf`/discriminated-union handling is a priority                                            |
| NSwag                                      | TypeScript client generation alongside .NET-side tooling                                 | Already using NSwag for the .NET/C# side of the same API                                      |

### Multi-language

| Tool              | What it gives you                                                                                                      | Pick it when                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| OpenAPI Generator | 50+ language/framework targets (`typescript-fetch`, `typescript-axios`, plus Go/Kotlin/Swift/Python/...) from one spec | You need clients in more than one language from the same source of truth |

**Default recommendation absent other constraints**: `openapi-typescript` + `openapi-fetch` for a lean, dependency-light client; `@hey-api/openapi-ts` if the team wants more built in (validation, hooks) without going all the way to Orval's opinionated scope.

## Smithy → TypeScript

Much smaller field — there's a reference implementation, not a competitive market:

| Tool                                                                                                           | What it gives you                                               | Notes                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `smithy-typescript`, `typescript-client-codegen` plugin                                                        | AWS-SDK-v3-style `Client`/`Command` pattern client              | The standard path; requires a JDK + the Smithy CLI in the build (not npm-only)                                    |
| `smithy-typescript`, `typescript-server-codegen` plugin                                                        | Server-side scaffolding/handlers with typed validation          | Only relevant if you're implementing the service, not just consuming it                                           |
| `smithy-aws-typescript-codegen`                                                                                | AWS-protocol extensions on top of the above                     | Only relevant if modeling an actual AWS-protocol service (this is literally what generates the AWS SDK for JS v3) |
| Convert to OpenAPI via `smithy-openapi`'s `openapi` build plugin, then use any tool in the OpenAPI table above | Full OpenAPI generator ecosystem, from a Smithy source of truth | Legitimate way to get Orval/hey-api/etc. output without hand-maintaining a second spec                            |

**smithy-build.json plugin name gotcha**: the client-codegen plugin is `typescript-client-codegen`, not `typescript-codegen` — this is an easy typo to propagate since Smithy's own docs/examples aren't as heavily cross-linted as npm package names are. Double check the plugin name and the `smithy-typescript-codegen` Maven artifact version against https://github.com/smithy-lang/smithy-typescript before finalizing a `smithy-build.json`, since both drift over time.

## Questions to ask (or infer) before recommending

1. **One language or several?** Several → OpenAPI Generator (or Smithy→OpenAPI→OpenAPI Generator) regardless of anything else.
2. **Minimal dependency footprint, or batteries included?** Minimal → openapi-typescript+openapi-fetch / hand-rolled Smithy runtime. Batteries → Orval/Kubb/hey-api.
3. **Existing framework commitment?** React Query already in use → Orval or hey-api's query-hook output slots in directly; a custom or framework-agnostic data layer → prefer thin/types-only.
4. **Does the team already run a JVM anywhere in CI?** If not, that's a real cost to introducing Smithy that's worth surfacing explicitly, not just a footnote.

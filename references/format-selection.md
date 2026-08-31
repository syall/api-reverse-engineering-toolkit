# Format & protocol selection

The question to answer isn't "which spec format do I like" — it's "what is this API actually shaped like, and which description format tells that story with the least distortion." Pick based on observed behavior, not on what's trendy or what you already have a template for.

## Step 1: identify the protocol from what you actually observed

| Observation                                                                                                                            | Protocol                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Multiple resource-shaped paths, JSON in/out, standard HTTP verbs (even if not used perfectly RESTfully)                                | REST-ish HTTP+JSON                                            |
| Single endpoint (often `/graphql`), all requests are POST with a `query`/`mutation` string body                                        | GraphQL                                                       |
| `content-type: application/grpc` or `application/grpc-web`, binary body                                                                | gRPC / gRPC-Web                                               |
| Every request/response is one big RPC-style call with an "operation name" rather than a resource path (`/api/DoThing`, `/rpc/DoThing`) | RPC-style HTTP (Smithy's `restJson1`, or a custom RPC scheme) |

Don't assume from the URL alone — check the actual `content-type` header and body shape of a real captured response before deciding.

## Step 2: for REST-ish HTTP+JSON, choose the description format

This is the common case, and where the real decision lives.

### OpenAPI — the default, and usually the right one

Pick OpenAPI when:

- The API already has resource-shaped, REST-y paths (`/api/books/{id}`, `/api/books?category=x`).
- You want the widest possible tooling reach: every mainstream client generator, every API gateway, every mock-server tool, every documentation renderer (Swagger UI, Redoc, Scalar) speaks OpenAPI.
- The consuming team is polyglot, or you don't yet know what languages will consume this spec — OpenAPI Generator alone covers 50+ targets.
- You want low ceremony: OpenAPI is "just YAML/JSON," no separate build toolchain, no JVM dependency.

Real tradeoffs to be honest about:

- `oneOf`/`anyOf` unions are structurally weaker than a real tagged union — most generators render them as a plain TypeScript union with no discriminant, pushing runtime narrowing logic onto the consumer.
- `nullable` vs. "optional" vs. "required-but-sometimes-empty-string" are three different things APIs conflate constantly, and OpenAPI's type system doesn't stop you from being sloppy about which one you mean — be precise when you write the spec, since the generator will faithfully propagate whatever ambiguity you leave in.

### Smithy — the deliberate choice, not the default

Pick Smithy when:

- You want a genuinely protocol-agnostic model — the same operation/shape definitions can target `restJson1` today and a different protocol trait later without re-modeling.
- The type system matters more than the tooling breadth: Smithy unions are true discriminated unions (`union Foo { bar: Bar, baz: Baz }`), enums are first-class, and there's a real distinction machinery for required vs. optional vs. nullable that doesn't rely on convention.
- The team is already in the Smithy/AWS-SDK-v3 ecosystem, or genuinely wants to generate _server_ scaffolding (`typescript-server-codegen`) as well as a client, not just a client.
- You're comfortable with — or already have — a JVM in the build pipeline. `smithy build` is a Java process; there's no way around that prerequisite the way there is for the fully-npm OpenAPI toolchain.

Real tradeoffs to be honest about:

- Ecosystem is much smaller. There's essentially one reference TypeScript generator (`smithy-typescript`), not a competitive field.
- Extra toolchain weight (JDK + Smithy CLI) for a benefit (stronger unions, protocol-agnosticism) that many REST APIs never actually need.
- If you want the OpenAPI generator ecosystem's breadth _and_ Smithy's modeling, remember Smithy can export an OpenAPI projection (`smithy-openapi` build plugin) — model once in Smithy, generate an OpenAPI doc as a build output, and point any OpenAPI generator at that. This is a legitimate way to get both without maintaining two hand-written specs.

### When to genuinely recommend both

Only when the user explicitly wants to compare, is evaluating a migration, or needs Smithy's protocol-agnostic modeling _and_ wants to hand a docs/mock-server team an OpenAPI doc today. Producing both by default "just in case" is wasted effort — pick one and say why.

## Step 3: don't force GraphQL or gRPC into OpenAPI or Smithy

If step 1 identified GraphQL, the right artifact is the GraphQL SDL (ideally obtained via introspection, not hand-transcribed from captured queries). If it identified gRPC, the right artifact is a `.proto` file, and recovering one from wire traffic without the original `.proto` is a much harder, lossier process — say so plainly rather than quietly approximating it as JSON/REST.

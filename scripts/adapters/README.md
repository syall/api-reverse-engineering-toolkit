# Client adapters for `verify_endpoints.ts`

Every generated client has a different calling convention — an
`openapi-fetch`-style client is called as `client.GET(path, {params})`;
a Smithy-style client is called as `client.send(new SomeCommand(input))`;
a hand-rolled client might expose one method per operation
(`client.getBookById(91)`). `verify_endpoints.ts` doesn't know
or care which of these your generated client uses — it delegates to a
small **adapter** module you write once per SDK, which bridges the
generic `{ op, args }` shape in a fixture's `"client"` field to an actual
call against your specific client.

## The contract

An adapter module's default export (or its named exports, if there's no
default) must be an object shaped like:

```ts
interface ClientAdapter {
  invoke(fixture: Fixture): Promise<{ status?: number; body: unknown }>;
}
```

`fixture.client.op` tells you which operation to call; `fixture.client.args`
carries whatever arguments that operation needs. What you do with them is
entirely up to your client's shape — typically a `switch` on `op`.

`status` is optional in the return value because many generated clients
(including both examples below) don't surface the raw HTTP status code on
success — they throw on non-2xx instead. When you can't get a real status
code, either omit it (the script simply won't check it for the client
half) or synthesize `200` for the success path and let a caught exception
represent the failure path instead.

## Example: `openapi-fetch`-style client

See `example-openapi-fetch-adapter.ts` — matches the `openapi-typescript` +
hand-rolled-runtime SDK shape (`client.GET("/api/books/{id}", { params:
{ path: { id: 91 } } })`) built earlier for this API.

## Example: Smithy `Client`/`Command`-style client

See `example-smithy-adapter.ts` — matches the `smithy-typescript`-style SDK
shape (`client.send(new GetBookByIdCommand({ id: 91 }))`).

## Writing your own

1. Import your actual generated client at the top of a new adapter file.
2. Construct one client instance (module-level, so it's reused across
   fixtures rather than reconnected per call).
3. Implement `invoke(fixture)`: switch on `fixture.client.op`, call the
   corresponding client method/Command with `fixture.client.args`, and
   return `{ body: result }` (add `status` if your client exposes it).
4. Wrap the call in try/catch only if you want to normalize a thrown
   client error into a specific status/body shape — otherwise, let it
   throw; `verify_endpoints.ts` already treats a thrown error
   from `invoke()` as a failed check.
5. Point `--adapter=./path/to/your-adapter.ts` at it when running the
   script.

Keep the adapter itself free of assertions or expectations — it's purely
a translation layer. All the pass/fail logic (status codes, expected
keys, raw-vs-client parity) lives in the main script, so the same
adapter can be reused as fixtures change over time.

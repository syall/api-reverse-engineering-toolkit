# Recon techniques: pulling endpoints out of client-side code

## Finding the code

For a server-rendered or SPA-style web app, the API surface usually lives in one or a handful of bundled JS files linked from the page's `<script src="...">` tags. Fetch the page first, find the script URLs, then fetch those directly. Bundles are often large (hundreds of KB minified) — search within them rather than reading linearly.

## Grep patterns that find real endpoints

Search the fetched bundle text for these, roughly in order of signal quality:

1. **`urlRoot` / `baseURL` style config on model/collection objects** (common in Backbone, and analogous patterns exist in most hand-rolled data layers):
   `urlRoot:"/api/something/"` or `urlRoot: "/api/something/"`. These are extremely reliable — they're the base path a whole family of endpoints hangs off of.

2. **String concatenation onto a base path**: `urlRoot+"someAction"`, `this.url+"/sub-path"`, `` `${baseUrl}/thing` ``. This is where the _actual_ endpoint segment (not just the base) shows up — `urlRoot+"find"` combined with `urlRoot:"/api/verses/"` means the real endpoint is `/api/verses/find`.

3. **Direct path literals**: `"/api/..."`, `"/app/..."`, `'/graphql'`. Straightforward but can also surface dead code or endpoints behind feature flags — treat as candidates to verify, not confirmed facts.

4. **HTTP call sites**: `fetch(`, `axios.get(`, `axios.post(`, `$.get(`, `$.post(`, `a.get(`/`a.post(` (common minified alias for a promise/ajax helper). Pull generous context around each match (100-200 chars before and after) — the method tells you GET vs POST, and the surrounding object literal often has the real parameter names.

5. **Enum/constant definitions**: look for `CONST`, `ENUM`, or similarly-named top-level config objects. These give you the _real_ literal values for filter/type params, which matter a lot — a query param that looks numeric in every example you've seen can turn out to be a string enum whose members happen to render as words, not numbers (`bookType: "CommonBook"` vs. an integer index).

6. **GraphQL-specific**: search for `` gql` ``, `graphql(`, or a literal `/graphql` path. If found, prefer introspecting the live endpoint over reverse-engineering individual queries from the bundle — introspection gives you the authoritative schema directly.

## Common false-positive traps

- **Matching on a bare word finds the wrong owner.** A method name like `find` or `search` might appear on several different model classes with different `urlRoot`s. Trace _which_ object's `.extend({...})` block the method literally sits inside before assuming which base path it combines with — don't just guess by proximity in unrelated code.
- **Enum-looking names aren't always what they seem.** A field that looks like it should be a numeric index (`bookType=0`, `bookType=1`) might actually be a string enum where the app never uses numeric values at all — verify the real enum values from the client's constant definitions, not from a plausible-looking guess, before spending a request on it.
- **A route that 404s on a plausible guess doesn't mean the feature doesn't exist.** It usually means you guessed the wrong base path (e.g. assuming a search method hangs off `/api/books/` when it actually hangs off `/api/verses/` because that's whose collection the method was defined on) or the wrong casing/segment. Re-check which object's `urlRoot` actually owns the call before concluding the endpoint is fictional.
- **A 405 (Method Not Allowed) is a confirmation, not a failure.** If a GET to a path you found returns 405 rather than 404, that's strong evidence the route exists and is POST/PUT/etc.-only — document it as "exists, unverified" rather than treating the failed GET as proof of nothing.
- **Client-side auth gates are a strong signal, but verify server-side too.** Code like `if (user.isAuthenticated) { fetchThing() }` tells you the _intended_ access pattern, but the safest confirmation is trying the endpoint unauthenticated and checking for a 401/403 — some APIs gate features in the UI without actually enforcing it server-side (worth flagging to the user either way, but don't assume the gate is real without checking).

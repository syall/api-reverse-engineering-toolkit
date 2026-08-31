/**
 * Example adapter for an `openapi-typescript`-generated-types client with
 * a hand-rolled `client.GET(path, { params })` / `client.POST(...)` runtime
 * — the pattern built for the bibleread.online OpenAPI SDK earlier in this
 * project. Copy this file, update the import path and the `op` cases for
 * your actual client and operations, then point
 * `--adapter=./adapters/my-adapter.ts` at it.
 */
// Update this import to point at your actual built/generated client entrypoint.
// import { BibleReadOnlineClient } from "../../bibleread-online-sdk-openapi/src/index.js";

interface Fixture {
  client?: { op: string; args?: unknown };
}

// const client = new BibleReadOnlineClient();

const adapter = {
  async invoke(fixture: Fixture): Promise<{ status?: number; body: unknown }> {
    const { op, args } = fixture.client ?? {};

    switch (op) {
      case "getBookById": {
        const { id } = args as { id: number };
        // const result = await client.GET("/api/books/{id}", { params: { path: { id } } });
        const result = await placeholderCall("getBookById", { id });
        return { status: 200, body: result };
      }

      case "findVerses": {
        const { query, matchWholeWord } = args as { query: string; matchWholeWord?: boolean };
        // const result = await client.GET("/api/verses/find", { params: { query: { query, matchWholeWord } } });
        const result = await placeholderCall("findVerses", { query, matchWholeWord });
        return { status: 200, body: result };
      }

      default:
        throw new Error(`No case wired up for client op "${op}" — add one in this adapter.`);
    }
  },
};

// Remove this once the real client calls above are uncommented — it exists
// only so this example file is syntactically complete and self-explanatory
// on its own, without needing the actual SDK installed to read it.
function placeholderCall(op: string, args: unknown): Promise<never> {
  return Promise.reject(
    new Error(
      `placeholderCall("${op}") was reached — this example adapter needs its ` +
        `import and client calls uncommented and wired to your real generated client. ` +
        `Args received: ${JSON.stringify(args)}`,
    ),
  );
}

export default adapter;

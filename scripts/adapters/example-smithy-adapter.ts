/**
 * Example adapter for a `smithy-typescript`-style generated client — the
 * `client.send(new SomeCommand(input))` pattern built for the
 * bibleread.online Smithy SDK earlier in this project. Copy this file,
 * update the import path and the `op` cases for your actual client and
 * Commands, then point `--adapter=./adapters/my-adapter.ts` at it.
 */
// Update these imports to point at your actual built/generated client entrypoint.
// import {
//   BibleReadOnlineClient,
//   GetBookByIdCommand,
//   FindVersesCommand,
// } from "../../bibleread-online-sdk-smithy/src/index.js";

interface Fixture {
  client?: { op: string; args?: unknown };
}

// const client = new BibleReadOnlineClient();

const adapter = {
  async invoke(fixture: Fixture): Promise<{ status?: number; body: unknown }> {
    const { op, args } = fixture.client ?? {};

    switch (op) {
      case "getBookById": {
        // const result = await client.send(new GetBookByIdCommand(args as { id: number }));
        const result = await placeholderCall("getBookById", args);
        // Smithy/AWS-SDK-v3-style clients typically don't surface a raw
        // status code on success — they throw a ServiceException on
        // failure instead, which this script's try/catch around
        // adapter.invoke() already treats as a failed check.
        return { body: result };
      }

      case "findVerses": {
        // const result = await client.send(new FindVersesCommand(args as { query: string; matchWholeWord?: boolean }));
        const result = await placeholderCall("findVerses", args);
        return { body: result };
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

#!/usr/bin/env -S node --experimental-strip-types
/**
 * Replay captured API examples against a live endpoint and report drift
 * — and, for any fixture with a "client" field, also drive a generated
 * client through the same check and cross-check its parsed result
 * against the raw response. A mismatch there usually means a bug in the
 * client's request serialization or response parsing rather than in the
 * API itself.
 *
 * This is meant to be run by the user (or their CI), with normal
 * outbound network access — NOT invoked by Claude mid-conversation
 * inside a sandboxed environment, where shell network access is
 * typically restricted to package registries and won't reach arbitrary
 * third-party hosts. Use it after a spec has been written, as a
 * regression check: "does the live API (and, if applicable, the
 * generated client) still match what we captured?"
 *
 * Run with one of:
 *   node --experimental-strip-types verify_endpoints.ts fixtures.json
 *   node --experimental-strip-types verify_endpoints.ts fixtures.json --adapter=./adapters/my-adapter.ts
 *   npx tsx verify_endpoints.ts fixtures.json --adapter=./adapters/my-adapter.ts
 * (Node >=22.6 supports --experimental-strip-types natively; use tsx on
 * older Node or if your adapter needs full type-checking, not just
 * stripping.)
 *
 * The `--adapter` flag is optional — omit it (or omit a fixture's
 * "client" field) to check only the raw endpoint, which is all you need
 * before a generated client exists.
 *
 * Fixtures file format (JSON array):
 * [
 *   {
 *     "name": "getBookById (Bible book)",
 *     "method": "GET",
 *     "url": "https://example.com/api/books/91",
 *     "expectedStatus": 200,
 *     "expectedKeys": ["book"],
 *     "expectedContentType": "application/json",
 *     "client": { "op": "getBookById", "args": { "id": 91 } }
 *   }
 * ]
 *
 * The "client" field is optional per-fixture. Fixtures without it are
 * only checked against the raw endpoint (still useful — e.g. for
 * endpoints the generated client doesn't cover yet). Its shape is
 * intentionally generic ({ op, args }) because every generator has a
 * different calling convention (openapi-fetch's client.GET(path, {...})
 * vs. a Smithy Command class vs. a hand-rolled method-per-operation
 * client) — see ./adapters/README.md for the adapter contract that
 * bridges "op" to an actual call against your specific generated client.
 *
 * `expectedKeys` checks top-level keys are present in a JSON object
 * response (or, for a JSON array response, that each item has those
 * keys when the array is non-empty — an empty array is treated as a
 * pass, since "confirmed empty" is itself a valid, previously-observed
 * state, not a failure).
 */

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export interface Fixture {
  name?: string;
  method?: string;
  url: string;
  expectedStatus?: number;
  expectedKeys?: string[];
  expectedContentType?: string;
  client?: {
    op: string;
    args?: unknown;
  };
}

/**
 * The contract every adapter module must satisfy. An adapter wraps
 * whatever a specific generated client's calling convention looks like
 * behind this one shape, so this script can stay generator-agnostic.
 * See adapters/README.md and the two example adapters alongside it.
 */
export interface ClientAdapter {
  /**
   * Invoke the generated client for the given fixture's `client.op` +
   * `client.args`, and normalize the result to { status, body } — or
   * throw, which this script treats as a failed check (with the error
   * message recorded), the same way an HTTP error would be.
   */
  invoke(fixture: Fixture): Promise<{ status?: number; body: unknown }>;
}

interface CheckOutcome {
  name: string;
  ok: boolean;
  diffs: string[];
}

interface FixtureReport {
  name: string;
  raw: CheckOutcome;
  client?: CheckOutcome;
  crossCheck?: CheckOutcome;
}

export function applyBaseUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) return url;
  const parsed = new URL(url);
  const base = new URL(baseUrl);
  parsed.protocol = base.protocol;
  parsed.host = base.host;
  return parsed.toString();
}

function diffAgainstExpectations(
  status: number | undefined,
  contentType: string | undefined,
  body: unknown,
  fixture: Fixture,
): string[] {
  const diffs: string[] = [];

  if (fixture.expectedStatus !== undefined && status !== fixture.expectedStatus) {
    diffs.push(`status: expected ${fixture.expectedStatus}, got ${status}`);
  }

  if (
    fixture.expectedContentType &&
    contentType !== undefined &&
    !contentType.includes(fixture.expectedContentType)
  ) {
    diffs.push(
      `content-type: expected to contain '${fixture.expectedContentType}', got '${contentType}'`,
    );
  }

  if (fixture.expectedKeys && fixture.expectedKeys.length > 0) {
    if (Array.isArray(body)) {
      // Confirmed-empty is a pass, not a failure — an endpoint that always
      // returns [] is still a real, useful, previously-observed fact.
      if (body.length > 0) {
        const first = body[0] as Record<string, unknown>;
        const missing = fixture.expectedKeys.filter((k) => !(k in first));
        if (missing.length > 0) {
          diffs.push(`first array item missing key(s): ${JSON.stringify(missing)}`);
        }
      }
    } else if (body && typeof body === "object") {
      const missing = fixture.expectedKeys.filter((k) => !(k in (body as Record<string, unknown>)));
      if (missing.length > 0) {
        diffs.push(`missing top-level key(s): ${JSON.stringify(missing)}`);
      }
    } else if (body !== undefined) {
      diffs.push(
        `expected an object or array with keys ${JSON.stringify(fixture.expectedKeys)}, got ${typeof body}`,
      );
    }
  }

  return diffs;
}

export async function checkRaw(
  fixture: Fixture,
  baseUrl: string | undefined,
  timeoutMs: number,
): Promise<CheckOutcome> {
  const name = fixture.name ?? fixture.url;
  const url = applyBaseUrl(fixture.url, baseUrl);
  const method = (fixture.method ?? "GET").toUpperCase();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    let body: unknown = undefined;
    if (contentType.includes("application/json") && text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return { name, ok: false, diffs: ["body: expected JSON, failed to parse"] };
      }
    }
    const diffs = diffAgainstExpectations(response.status, contentType, body, fixture);
    return { name, ok: diffs.length === 0, diffs };
  } catch (err) {
    return { name, ok: false, diffs: [`request failed: ${(err as Error).message}`] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkClient(fixture: Fixture, adapter: ClientAdapter): Promise<CheckOutcome> {
  const name = fixture.name ?? fixture.client?.op ?? fixture.url;
  try {
    const { status, body } = await adapter.invoke(fixture);
    const diffs = diffAgainstExpectations(status, "application/json", body, fixture);
    return { name, ok: diffs.length === 0, diffs };
  } catch (err) {
    return { name, ok: false, diffs: [`client call failed: ${(err as Error).message}`] };
  }
}

/**
 * Compare the raw response body to the client's parsed result. This is
 * the check that only makes sense once a client exists to compare
 * against — the reason this script's client-checking mode earns its
 * keep beyond just re-running the raw check twice. A structural
 * mismatch here usually means the client is mis-parsing a field (wrong
 * type coercion, dropped nullable, wrong key name) even when both
 * individually "pass" against expectedKeys.
 */
export function crossCheck(rawBody: unknown, clientBody: unknown): CheckOutcome {
  const diffs: string[] = [];
  const rawKeys =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? Object.keys(rawBody).sort()
      : null;
  const clientKeys =
    clientBody && typeof clientBody === "object" && !Array.isArray(clientBody)
      ? Object.keys(clientBody).sort()
      : null;

  if (rawKeys && clientKeys) {
    const onlyInRaw = rawKeys.filter((k) => !clientKeys.includes(k));
    const onlyInClient = clientKeys.filter((k) => !rawKeys.includes(k));
    if (onlyInRaw.length > 0)
      diffs.push(
        `key(s) present in raw response but not client result: ${JSON.stringify(onlyInRaw)}`,
      );
    if (onlyInClient.length > 0)
      diffs.push(
        `key(s) present in client result but not raw response: ${JSON.stringify(onlyInClient)}`,
      );
  }

  return { name: "raw vs. client parity", ok: diffs.length === 0, diffs };
}

async function loadAdapter(adapterPath: string): Promise<ClientAdapter> {
  const resolved = resolve(process.cwd(), adapterPath);
  const mod = (await import(pathToFileURL(resolved).href)) as {
    default?: ClientAdapter;
  } & Partial<ClientAdapter>;
  const adapter = mod.default ?? mod;
  if (typeof (adapter as ClientAdapter).invoke !== "function") {
    throw new Error(
      `Adapter at ${adapterPath} must export an object with an async invoke(fixture) function`,
    );
  }
  return adapter as ClientAdapter;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const fixturesPath = args.find((a) => !a.startsWith("--"));
  const baseUrlArg = args.find((a) => a.startsWith("--base-url="))?.split("=")[1];
  const adapterArg = args.find((a) => a.startsWith("--adapter="))?.split("=")[1];
  const timeoutArg = args.find((a) => a.startsWith("--timeout="))?.split("=")[1];
  const timeoutMs = timeoutArg ? Number(timeoutArg) * 1000 : 15_000;

  if (!fixturesPath) {
    console.error(
      "Usage: verify_endpoints.ts <fixtures.json> [--base-url=URL] [--adapter=./path.ts] [--timeout=SECONDS]",
    );
    return 2;
  }

  const fixtures: Fixture[] = JSON.parse(await readFile(fixturesPath, "utf-8")) as Fixture[];
  const adapter = adapterArg ? await loadAdapter(adapterArg) : undefined;

  const reports: FixtureReport[] = [];

  for (const fixture of fixtures) {
    const name = fixture.name ?? fixture.url;
    const raw = await checkRaw(fixture, baseUrlArg, timeoutMs);

    let client: CheckOutcome | undefined;
    let cross: CheckOutcome | undefined;

    if (fixture.client && adapter) {
      client = await checkClient(fixture, adapter);

      // Only worth cross-checking bodies when both calls actually
      // succeeded — comparing a thrown error to a raw 200 body isn't
      // a useful signal, the client-failure diff already says enough.
      if (raw.ok && client.ok) {
        try {
          const rawUrl = applyBaseUrl(fixture.url, baseUrlArg);
          const rawResp = await fetch(rawUrl, { headers: { accept: "application/json" } });
          const rawBody = (await rawResp.json().catch(() => undefined)) as unknown;
          const { body: clientBody } = await adapter.invoke(fixture);
          cross = crossCheck(rawBody, clientBody);
        } catch {
          // If re-fetching for the cross-check itself fails, don't count
          // it against the fixture — the primary raw/client checks above
          // already captured the meaningful pass/fail signal.
        }
      }
    }

    reports.push({ name, raw, client, crossCheck: cross });
  }

  let failures = 0;
  for (const r of reports) {
    const rawLabel = r.raw.ok ? "PASS" : "FAIL";
    console.log(`[${rawLabel}] ${r.name} (raw): ${r.raw.ok ? "OK" : r.raw.diffs.join("; ")}`);
    if (!r.raw.ok) failures++;

    if (r.client) {
      const clientLabel = r.client.ok ? "PASS" : "FAIL";
      console.log(
        `  [${clientLabel}] ${r.name} (client): ${r.client.ok ? "OK" : r.client.diffs.join("; ")}`,
      );
      if (!r.client.ok) failures++;
    }

    if (r.crossCheck) {
      const crossLabel = r.crossCheck.ok ? "PASS" : "FAIL";
      console.log(
        `  [${crossLabel}] ${r.name} (raw vs. client parity): ${r.crossCheck.ok ? "OK" : r.crossCheck.diffs.join("; ")}`,
      );
      if (!r.crossCheck.ok) failures++;
    }
  }

  const totalChecks = reports.reduce(
    (n, r) => n + 1 + (r.client ? 1 : 0) + (r.crossCheck ? 1 : 0),
    0,
  );
  console.log(`\n${totalChecks - failures}/${totalChecks} checks passed`);

  return failures > 0 ? 1 : 0;
}

// Only run when executed directly (`node verify_endpoints.ts`), not when
// imported as a module -- e.g. by tests/verify_endpoints.test.ts, which imports the functions above to test them in isolation without
// triggering a CLI run (and its process.exit calls) as a side effect.
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

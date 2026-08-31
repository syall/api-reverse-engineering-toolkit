/**
 * Tests for scripts/verify_endpoints.ts.
 *
 * Uses Node's built-in test runner (node:test) so this needs no extra
 * dev dependency. Spins up a real in-process HTTP server (node:http)
 * plus a real adapter object exercising every branch, then imports the
 * script's exported helper functions directly rather than only
 * shelling out to it — this is what caught, during development, that
 * the raw-vs-client parity check needs a *structural* diff (top-level
 * keys) rather than deep equality to be useful across generators.
 *
 * Run with: node --experimental-strip-types --test tests/*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  checkRaw,
  checkClient,
  crossCheck,
  applyBaseUrl,
  type Fixture,
  type ClientAdapter,
} from "../scripts/verify_endpoints.ts";

async function withMockServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ book: { id: 1, title: "X" } }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to bind to a port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("checkRaw passes when status/content-type/keys all match", async () => {
  await withMockServer(async (baseUrl) => {
    const fixture: Fixture = {
      name: "ok",
      url: `${baseUrl}/ok`,
      expectedStatus: 200,
      expectedKeys: ["book"],
      expectedContentType: "application/json",
    };
    const result = await checkRaw(fixture, undefined, 5000);
    assert.equal(result.ok, true, result.diffs.join("; "));
  });
});

test("checkRaw fails on status mismatch", async () => {
  await withMockServer(async (baseUrl) => {
    const fixture: Fixture = { name: "missing", url: `${baseUrl}/missing`, expectedStatus: 200 };
    const result = await checkRaw(fixture, undefined, 5000);
    assert.equal(result.ok, false);
    assert.match(result.diffs.join("; "), /status/);
  });
});

test("checkClient surfaces a thrown adapter error as a failed check", async () => {
  const throwingAdapter: ClientAdapter = {
    invoke() {
      return Promise.reject(new Error("client boom"));
    },
  };
  const fixture: Fixture = { name: "throws", url: "http://unused", client: { op: "x" } };
  const result = await checkClient(fixture, throwingAdapter);
  assert.equal(result.ok, false);
  assert.match(result.diffs.join("; "), /client boom/);
});

test("crossCheck passes when raw and client bodies have the same top-level keys", () => {
  const result = crossCheck(
    { book: { id: 1 } },
    { book: { id: 1, title: "different but same key" } },
  );
  assert.equal(result.ok, true);
});

test("crossCheck fails when the client body has an extra top-level key", () => {
  const result = crossCheck({ book: { id: 1 } }, { book: { id: 1 }, meta: { cached: true } });
  assert.equal(result.ok, false);
  assert.match(result.diffs.join("; "), /meta/);
});

test("applyBaseUrl swaps only scheme and host, keeping path and query", () => {
  const result = applyBaseUrl("https://real-api.example.com/api/x?y=1", "http://127.0.0.1:9999");
  assert.equal(result, "http://127.0.0.1:9999/api/x?y=1");
});

test("applyBaseUrl is a no-op when no base URL is given", () => {
  const result = applyBaseUrl("https://real-api.example.com/api/x", undefined);
  assert.equal(result, "https://real-api.example.com/api/x");
});

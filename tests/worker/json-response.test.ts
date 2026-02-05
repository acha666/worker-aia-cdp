/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  jsonError,
  jsonSuccess,
  mergeJsonHeaders,
} from "../../src/worker/utils/json-response";

test("jsonSuccess wraps payload with metadata and default headers", async () => {
  const response = jsonSuccess(
    { hello: "world" },
    {
      status: 202,
      meta: { count: 1 },
      headers: {
        "x-extra": "value",
      },
    },
  );

  assert.equal(response.status, 202);
  assert.equal(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("x-extra"), "value");

  const body = await response.json();
  assert.deepEqual(body, {
    data: { hello: "world" },
    meta: { count: 1 },
    error: null,
  });
});

test("jsonError encodes error object and preserves headers", async () => {
  const response = jsonError(
    415,
    "unsupported_type",
    "Only DER or PEM are allowed",
    {
      headers: {
        "x-trace-id": "test-trace",
        "cache-control": "no-store",
      },
      details: { foo: "bar" },
    },
  );

  assert.equal(response.status, 415);
  assert.equal(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("x-trace-id"), "test-trace");
  assert.equal(response.headers.get("cache-control"), "no-store");

  const body = await response.json();
  assert.deepEqual(body, {
    data: null,
    meta: null,
    error: {
      code: "unsupported_type",
      message: "Only DER or PEM are allowed",
      details: { foo: "bar" },
    },
  });
});

test("mergeJsonHeaders allows overriding content type", () => {
  const headers = mergeJsonHeaders({
    "Content-Type": "application/vnd.api+json",
  });
  assert.equal(headers.get("content-type"), "application/vnd.api+json");
});

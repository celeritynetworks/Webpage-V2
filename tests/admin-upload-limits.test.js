import test from "node:test";
import assert from "node:assert/strict";
import { parseMultipartForm } from "../functions/api/admin/_upload.js";

const boundary = "celerity-test-boundary";

function makeRequest(body, headers = {}) {
  return new Request("https://example.com/upload", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      ...headers
    },
    body,
    duplex: "half"
  });
}

function multipartBody(fieldValue = "hello") {
  return [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="title"\r\n',
    "\r\n",
    `${fieldValue}\r\n`,
    `--${boundary}--\r\n`
  ].join("");
}

test("parses a valid multipart form within the size limit", async () => {
  const body = multipartBody("Celerity dataset");
  const request = makeRequest(body);

  const result = await parseMultipartForm(request, 1024);

  assert.equal(result.error, null);
  assert.equal(result.form.get("title"), "Celerity dataset");
});

test("rejects an oversized streamed body when Content-Length is missing", async () => {
  const body = multipartBody("x".repeat(256));
  const request = makeRequest(body);

  const result = await parseMultipartForm(request, 100);

  assert.equal(result.form, null);
  assert.equal(result.error, "too_large");
});

test("rejects an oversized streamed body when Content-Length is understated", async () => {
  const body = multipartBody("x".repeat(256));
  const request = makeRequest(body, { "Content-Length": "1" });

  const result = await parseMultipartForm(request, 100);

  assert.equal(result.form, null);
  assert.equal(result.error, "too_large");
});

test("rejects a declared Content-Length above the limit before parsing", async () => {
  const request = makeRequest(multipartBody(), {
    "Content-Length": "2048"
  });

  const result = await parseMultipartForm(request, 100);

  assert.equal(result.form, null);
  assert.equal(result.error, "too_large");
});

test("rejects a malformed Content-Length header", async () => {
  const request = makeRequest(multipartBody(), {
    "Content-Length": "not-a-number"
  });

  const result = await parseMultipartForm(request, 1024);

  assert.equal(result.form, null);
  assert.equal(result.error, "invalid_length");
});

test("rejects malformed multipart data", async () => {
  const request = makeRequest("this is not a multipart form");

  const result = await parseMultipartForm(request, 1024);

  assert.equal(result.form, null);
  assert.equal(result.error, "invalid_form");
});
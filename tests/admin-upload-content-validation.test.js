import test from "node:test";
import assert from "node:assert/strict";
import { validateUploadedFile } from "../functions/api/admin/_upload.js";

function arrayBuffer(bytes) {
  return Uint8Array.from(bytes).buffer;
}

function makeZip(names) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const name of names) {
    const nameBytes = encoder.encode(name);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);

    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);

    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);

    centralParts.push(central);
    localOffset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const totalSize = localOffset + centralSize + 22;
  const output = new Uint8Array(totalSize);

  let position = 0;

  for (const part of localParts) {
    output.set(part, position);
    position += part.length;
  }

  const centralOffset = position;

  for (const part of centralParts) {
    output.set(part, position);
    position += part.length;
  }

  const end = new DataView(output.buffer, position, 22);
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, names.length, true);
  end.setUint16(10, names.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  end.setUint16(20, 0, true);

  return output.buffer;
}

test("accepts valid UTF-8 CSV text", () => {
  const result = validateUploadedFile(
    arrayBuffer(new TextEncoder().encode("name,score\nAda,95")),
    "csv"
  );

  assert.equal(result.valid, true);
});

test("rejects binary data presented as CSV", () => {
  const result = validateUploadedFile(
    arrayBuffer([0xFF, 0xFE, 0x00, 0x01]),
    "csv"
  );

  assert.equal(result.valid, false);
});

test("accepts valid JSON objects", () => {
  const result = validateUploadedFile(
    arrayBuffer(new TextEncoder().encode('{"name":"Celerity"}')),
    "json"
  );

  assert.equal(result.valid, true);
});

test("accepts valid JSON with a UTF-8 BOM", () => {
  const result = validateUploadedFile(
    arrayBuffer([
      0xEF, 0xBB, 0xBF,
      ...new TextEncoder().encode('{"name":"Celerity"}')
    ]),
    "json"
  );

  assert.equal(result.valid, true);
});

test("rejects malformed JSON", () => {
  const result = validateUploadedFile(
    arrayBuffer(new TextEncoder().encode('{"name":')),
    "json"
  );

  assert.equal(result.valid, false);
});

test("accepts an XLS file with the OLE compound-file signature", () => {
  const result = validateUploadedFile(
    arrayBuffer([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]),
    "xls"
  );

  assert.equal(result.valid, true);
});

test("rejects an XLS file with the wrong signature", () => {
  const result = validateUploadedFile(
    arrayBuffer([0, 1, 2, 3, 4, 5, 6, 7]),
    "xls"
  );

  assert.equal(result.valid, false);
});

test("accepts Parquet data with PAR1 at the beginning and end", () => {
  const result = validateUploadedFile(
    arrayBuffer([
      0x50, 0x41, 0x52, 0x31,
      1, 2, 3, 4,
      0x50, 0x41, 0x52, 0x31
    ]),
    "parquet"
  );

  assert.equal(result.valid, true);
});

test("rejects Parquet data without the ending signature", () => {
  const result = validateUploadedFile(
    arrayBuffer([
      0x50, 0x41, 0x52, 0x31,
      1, 2, 3, 4,
      0, 0, 0, 0
    ]),
    "parquet"
  );

  assert.equal(result.valid, false);
});

test("accepts a structurally valid ZIP archive", () => {
  const result = validateUploadedFile(
    makeZip(["readme.txt", "data.csv"]),
    "zip"
  );

  assert.equal(result.valid, true);
});

test("rejects malformed ZIP data", () => {
  const result = validateUploadedFile(
    arrayBuffer([0x50, 0x4B, 0x03, 0x04, 1, 2, 3]),
    "zip"
  );

  assert.equal(result.valid, false);
});

test("accepts an XLSX archive containing required workbook entries", () => {
  const result = validateUploadedFile(
    makeZip(["[Content_Types].xml", "xl/workbook.xml"]),
    "xlsx"
  );

  assert.equal(result.valid, true);
});

test("rejects a ZIP archive incorrectly named as XLSX", () => {
  const result = validateUploadedFile(
    makeZip(["readme.txt", "data.csv"]),
    "xlsx"
  );

  assert.equal(result.valid, false);
});

test("rejects unsupported extensions", () => {
  const result = validateUploadedFile(
    arrayBuffer([1, 2, 3]),
    "exe"
  );

  assert.equal(result.valid, false);
});

test("rejects empty or non-ArrayBuffer input", () => {
  assert.equal(validateUploadedFile(new ArrayBuffer(0), "csv").valid, false);
  assert.equal(validateUploadedFile("not bytes", "csv").valid, false);
});

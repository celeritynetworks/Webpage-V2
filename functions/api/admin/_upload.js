export async function parseMultipartForm(request, maxBytes) {
  const contentType = request.headers.get("Content-Type") || "";

  const contentLengthHeader = request.headers.get("Content-Length");

  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      return { form: null, error: "invalid_length" };
    }

    const contentLength = Number(contentLengthHeader);

    if (!Number.isSafeInteger(contentLength) || contentLength > maxBytes) {
      return { form: null, error: "too_large" };
    }
  }

  if (!request.body) {
    return { form: null, error: "invalid_form" };
  }

  const reader = request.body.getReader();
  let totalBytes = 0;
  let tooLarge = false;

  const limitedStream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        totalBytes += value.byteLength;

        if (totalBytes > maxBytes) {
          tooLarge = true;

          try {
            await reader.cancel();
          } catch {}

          controller.error(new Error("UPLOAD_TOO_LARGE"));
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },

    async cancel(reason) {
      await reader.cancel(reason);
    }
  });

  try {
    const response = new Response(limitedStream, {
      headers: { "Content-Type": contentType }
    });

    const form = await response.formData();

    return { form, error: null };
  } catch {
    return {
      form: null,
      error: tooLarge ? "too_large" : "invalid_form"
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

export function validateUploadedFile(fileBytes, extension) {
  if (!(fileBytes instanceof ArrayBuffer) || fileBytes.byteLength === 0) {
    return { valid: false, reason: "empty_or_invalid" };
  }

  const bytes = new Uint8Array(fileBytes);
  const view = new DataView(fileBytes);
  const hasSignature = (...signature) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (extension === "xls") {
    return {
      valid: hasSignature(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1),
      reason: "invalid_xls"
    };
  }

  if (extension === "parquet") {
    const valid = bytes.length >= 12 &&
      hasSignature(0x50, 0x41, 0x52, 0x31) &&
      bytes.slice(-4).every((byte, index) =>
        byte === [0x50, 0x41, 0x52, 0x31][index]
      );

    return { valid, reason: "invalid_parquet" };
  }

  if (extension === "csv" || extension === "json") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");

      if (text.includes("\u0000")) {
        return { valid: false, reason: "invalid_text" };
      }

      if (extension === "json") {
        JSON.parse(text);
      }

      return { valid: text.trim().length > 0, reason: "invalid_text" };
    } catch {
      return {
        valid: false,
        reason: extension === "json" ? "invalid_json" : "invalid_text"
      };
    }
  }

  if (extension !== "zip" && extension !== "xlsx") {
    return { valid: false, reason: "unsupported_format" };
  }

  // Validate ZIP end-of-central-directory and directory entries.
  // No archive entries are extracted or executed.
  if (bytes.length < 22) {
    return { valid: false, reason: "invalid_zip" };
  }

  const minimumOffset = Math.max(0, bytes.length - 65557);
  let endOffset = -1;

  for (let offset = bytes.length - 22; offset >= minimumOffset; offset--) {
    if (
      view.getUint32(offset, true) === 0x06054B50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) {
    return { valid: false, reason: "invalid_zip" };
  }

  const diskNumber = view.getUint16(endOffset + 4, true);
  const directoryDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk = view.getUint16(endOffset + 8, true);
  const totalEntries = view.getUint16(endOffset + 10, true);
  const directorySize = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);

  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0 ||
    totalEntries === 0xFFFF ||
    directorySize === 0xFFFFFFFF ||
    directoryOffset === 0xFFFFFFFF ||
    directoryOffset + directorySize > endOffset
  ) {
    return { valid: false, reason: "invalid_zip" };
  }

  const names = new Set();
  let position = directoryOffset;
  const directoryEnd = directoryOffset + directorySize;
  const decoder = new TextDecoder("utf-8");

  try {
    for (let index = 0; index < totalEntries; index++) {
      if (
        position + 46 > directoryEnd ||
        view.getUint32(position, true) !== 0x02014B50
      ) {
        return { valid: false, reason: "invalid_zip" };
      }

      const filenameLength = view.getUint16(position + 28, true);
      const extraLength = view.getUint16(position + 30, true);
      const commentLength = view.getUint16(position + 32, true);
      const entryEnd = position + 46 + filenameLength + extraLength + commentLength;

      if (entryEnd > directoryEnd) {
        return { valid: false, reason: "invalid_zip" };
      }

      const filename = decoder.decode(
        bytes.slice(position + 46, position + 46 + filenameLength)
      );

      names.add(filename);
      position = entryEnd;
    }
  } catch {
    return { valid: false, reason: "invalid_zip" };
  }

  if (position !== directoryEnd) {
    return { valid: false, reason: "invalid_zip" };
  }

  if (extension === "xlsx") {
    const validWorkbook =
      names.has("[Content_Types].xml") &&
      names.has("xl/workbook.xml");

    return {
      valid: validWorkbook,
      reason: "invalid_xlsx"
    };
  }

  return { valid: true, reason: null };
}

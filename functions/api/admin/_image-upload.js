export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export async function validateThumbnail(file) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return { valid: false, message: "Choose a thumbnail image." };
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return { valid: false, message: "Thumbnail images must be 5 MB or smaller." };
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  if (isPng) return { valid: true, contentType: "image/png", extension: "png" };
  if (isJpeg) return { valid: true, contentType: "image/jpeg", extension: "jpg" };
  if (isWebp) return { valid: true, contentType: "image/webp", extension: "webp" };
  return { valid: false, message: "Use a valid PNG, JPG or WEBP image." };
}

export async function storeThumbnail({ file, bucket, resourceType, resourceId, adminEmail }) {
  if (!file || !file.size) return null;
  const validation = await validateThumbnail(file);
  if (!validation.valid) throw new Error(validation.message);
  const key = `thumbnails/${resourceType}/${resourceId}/${crypto.randomUUID()}.${validation.extension}`;
  const bytes = await file.arrayBuffer();
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: validation.contentType, cacheControl: "public, max-age=3600" },
    customMetadata: { resourceType, resourceId, uploadedBy: adminEmail }
  });
  return key;
}

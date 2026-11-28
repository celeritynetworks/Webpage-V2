export async function onRequestGet({ params, env }) {
  if (!env.REGISTRATIONS || !env.DATASETS_BUCKET) {
    return new Response("Not found", { status: 404 });
  }
  const slug = String(params.slug || "").slice(0, 140);
  const dataset = await env.REGISTRATIONS.prepare(`
    SELECT thumbnail_key FROM datasets WHERE slug = ? AND status = 'published' LIMIT 1
  `).bind(slug).first();
  if (!dataset?.thumbnail_key) return new Response("Not found", { status: 404 });
  const object = await env.DATASETS_BUCKET.get(dataset.thumbnail_key);
  if (!object) return new Response("Not found", { status: 404 });
  const contentType = object.httpMetadata?.contentType;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox"
    }
  });
}

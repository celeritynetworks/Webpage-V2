function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function safeFilename(value) {
  const filename = String(value || 'dataset-download')
    .replace(/[\r\n"\\/]/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 180);

  return filename && filename !== '.' && filename !== '..'
    ? filename
    : 'dataset-download';
}

function contentType(format) {
  const types = {
    csv: 'text/csv; charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    zip: 'application/zip',
    json: 'application/json',
    parquet: 'application/octet-stream'
  };

  return types[String(format || '').toLowerCase()] || 'application/octet-stream';
}

export async function onRequestGet({ params, env }) {
  if (!env.REGISTRATIONS || !env.DATASETS_BUCKET) {
    return json({ error: 'Dataset download service is temporarily unavailable.' }, 503);
  }

  const slug = String(params?.slug || '').trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return json({ error: 'Invalid dataset.' }, 400);
  }

  try {
    const dataset = await env.REGISTRATIONS.prepare(`
      SELECT id, file_key, file_name, file_format
      FROM datasets
      WHERE slug = ?
        AND status = 'published'
      LIMIT 1
    `).bind(slug).first();

    if (!dataset || !dataset.file_key || !dataset.file_name) {
      return json({ error: 'Dataset not found or unavailable.' }, 404);
    }

    const expectedPrefix = `datasets/${dataset.id}/`;

    if (!dataset.file_key.startsWith(expectedPrefix)) {
      console.error('Dataset storage key failed validation.');
      return json({ error: 'Dataset file is unavailable.' }, 404);
    }

    const object = await env.DATASETS_BUCKET.get(dataset.file_key);

    if (!object) {
      return json({ error: 'Dataset file is currently unavailable.' }, 404);
    }

    const filename = safeFilename(dataset.file_name);
    const headers = new Headers();

    if (object.writeHttpMetadata) {
      object.writeHttpMetadata(headers);
    }

    headers.set('Content-Type', contentType(dataset.file_format));
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-store');

    if (Number.isFinite(object.size)) {
      headers.set('Content-Length', String(object.size));
    }

    try {
      await env.REGISTRATIONS.prepare(`
        UPDATE datasets
        SET download_count = download_count + 1
        WHERE id = ?
          AND status = 'published'
      `).bind(dataset.id).run();
    } catch (countError) {
      console.warn('Dataset download counter update failed:', countError);
    }

    return new Response(object.body, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Dataset download failed:', error);
    return json({ error: 'Unable to download this dataset at this time.' }, 503);
  }
}

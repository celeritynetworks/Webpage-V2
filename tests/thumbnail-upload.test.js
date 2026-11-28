import test from 'node:test';
import assert from 'node:assert/strict';
import { validateThumbnail, storeThumbnail } from '../functions/api/admin/_image-upload.js';
import { onRequestGet as getDatasetThumbnail } from '../functions/api/datasets/[slug]/thumbnail.js';
import { onRequestGet as getCompetitionThumbnail } from '../functions/api/competitions/[slug]/thumbnail.js';

const pngBytes = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0,0,0,0]);

test('accepts a PNG thumbnail by its file signature', async () => {
  const result = await validateThumbnail(new File([pngBytes], 'cover.png', { type: 'image/png' }));
  assert.equal(result.valid, true);
  assert.equal(result.contentType, 'image/png');
});

test('rejects an SVG or renamed non-image file as a thumbnail', async () => {
  const result = await validateThumbnail(new File(['<svg></svg>'], 'cover.png', { type: 'image/png' }));
  assert.equal(result.valid, false);
});

test('stores a validated thumbnail with a private R2 key and image content type', async () => {
  let stored;
  const key = await storeThumbnail({
    file: new File([pngBytes], 'cover.png'),
    bucket: { put: async (objectKey, bytes, metadata) => { stored = { objectKey, bytes, metadata }; } },
    resourceType: 'datasets', resourceId: 'dataset-1', adminEmail: 'admin@example.com'
  });
  assert.match(key, /^thumbnails\/datasets\/dataset-1\//);
  assert.equal(stored.metadata.httpMetadata.contentType, 'image/png');
  assert.equal(stored.metadata.customMetadata.uploadedBy, 'admin@example.com');
});

test('does not serve thumbnails for unpublished datasets', async () => {
  const env = {
    REGISTRATIONS: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
    DATASETS_BUCKET: { get: async () => { throw new Error('must not read R2'); } }
  };
  const response = await getDatasetThumbnail({ params: { slug: 'draft-one' }, env });
  assert.equal(response.status, 404);
});

test('does not serve thumbnails for archived competitions', async () => {
  const env = {
    REGISTRATIONS: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
    DATASETS_BUCKET: { get: async () => { throw new Error('must not read R2'); } }
  };
  const response = await getCompetitionThumbnail({ params: { slug: 'archived-one' }, env });
  assert.equal(response.status, 404);
});

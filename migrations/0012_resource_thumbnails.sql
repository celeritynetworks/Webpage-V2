-- Public thumbnail metadata for datasets and competitions.
ALTER TABLE datasets ADD COLUMN thumbnail_key TEXT;
ALTER TABLE competitions ADD COLUMN thumbnail_key TEXT;

-- Preserve any older dataset preview image references where present.
UPDATE datasets
SET thumbnail_key = preview_image_key
WHERE thumbnail_key IS NULL AND preview_image_key IS NOT NULL;

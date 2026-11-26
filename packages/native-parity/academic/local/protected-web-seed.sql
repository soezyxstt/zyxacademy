-- Additional synthetic content for protected Next.js page references.
BEGIN;

INSERT INTO quiz_templates
  (id, course_id, title, category, visibility, status, selection_rules, created_at, updated_at)
VALUES
  ('academic-web-quiz-1', 'biologi-dasar', 'Kuis Struktur Sel', 'chapter', 'free', 'draft',
   '{"count":1}', '2026-11-21T03:00:00Z', '2026-11-21T03:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO impor_bundle
  (id, bundle_id, checksum, bundle_type, course_id, source_uri_or_key, status, validation_report,
   requested_by, created_at, updated_at)
VALUES
  ('academic-web-idea-1', 'academic-web-idea-1', 'academic-web-idea-1', 'idea', 'biologi-dasar',
   'local-fixtures/academic-web-idea-1.zip', 'received', '{}', 'academic-admin',
   '2026-11-21T03:00:00Z', '2026-11-21T03:00:00Z'),
  ('academic-web-product-1', 'academic-web-product-1', 'academic-web-product-1', 'product', 'biologi-dasar',
   'local-fixtures/academic-web-product-1.zip', 'received', '{}', 'academic-admin',
   '2026-11-21T03:00:00Z', '2026-11-21T03:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO artikel
  (id, mata_kuliah_id, slug, title, content_markdown, status, source_hash, generation_hash,
   creator_id, created_at, updated_at)
VALUES
  ('academic-web-document-1', 'academic-course-1', 'academic-web-document-1', 'Catatan Struktur Sel',
   'Membran sel memisahkan isi sel dari lingkungannya. Inti sel menyimpan informasi genetik.',
   'draft', 'academic-web-document-1', 'academic-web-document-1', 'academic-admin',
   '2026-11-21T03:00:00Z', '2026-11-21T03:00:00Z')
ON CONFLICT (id) DO NOTHING;

COMMIT;

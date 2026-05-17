-- 2026-05-16 — Add detail columns to School for the /my-courses
-- location-sort + course-detail-drawer features (wave-12.2).
--
-- All nullable + IF NOT EXISTS-guarded per CLAUDE.md A5. Existing
-- rows are unaffected; bootstrap fills the new fields on next boot
-- from the curated catalogSchools.js data. The columns are also
-- write-only from the backend (we never persist user lat/lng from
-- the geolocation API — that's per-request only).
--
-- Columns:
--   description     — 1-2 paragraph neutral school summary.
--   websiteUrl      — official site (https://).
--   latitude        — for haversine sort. Null = sort to bottom.
--   longitude       — for haversine sort. Null = sort to bottom.
--   enrollmentSize  — rough total student count. Null when unknown.
--   foundedYear     — year founded. Null when unknown.
--   mascot          — fun fact for the drawer. Null when unknown.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'School'
      AND column_name = 'description'
  ) THEN
    ALTER TABLE "School" ADD COLUMN "description" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'School'
      AND column_name = 'websiteUrl'
  ) THEN
    ALTER TABLE "School" ADD COLUMN "websiteUrl" VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'School'
      AND column_name = 'latitude'
  ) THEN
    ALTER TABLE "School" ADD COLUMN "latitude" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'School'
      AND column_name = 'longitude'
  ) THEN
    ALTER TABLE "School" ADD COLUMN "longitude" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'School'
      AND column_name = 'enrollmentSize'
  ) THEN
    ALTER TABLE "School" ADD COLUMN "enrollmentSize" INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'School'
      AND column_name = 'foundedYear'
  ) THEN
    ALTER TABLE "School" ADD COLUMN "foundedYear" INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'School'
      AND column_name = 'mascot'
  ) THEN
    ALTER TABLE "School" ADD COLUMN "mascot" VARCHAR(80);
  END IF;
END $$;

-- B-tree index on (latitude, longitude) supports a future PostGIS
-- upgrade and helps when filtering schools by region. For now the
-- haversine sort is computed in JS (small N) so this index is
-- belt-and-suspenders for when N grows past a few hundred rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'School_latitude_longitude_idx'
  ) THEN
    CREATE INDEX "School_latitude_longitude_idx"
      ON "School" ("latitude", "longitude");
  END IF;
END $$;

-- Add allowEditing to StudySheet for owner-controlled edit access
-- Idempotent: re-running this migration must be a no-op so partial
-- bootstrap states (manually-applied column, retry after failure) do
-- not break `prisma migrate deploy`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'StudySheet' AND column_name = 'allowEditing'
  ) THEN
    ALTER TABLE "StudySheet" ADD COLUMN "allowEditing" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

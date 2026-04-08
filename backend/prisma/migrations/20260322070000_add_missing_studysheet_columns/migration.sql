-- Add missing StudySheet columns that were omitted from the repair migration

-- reviewedById (foreign key to User)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='reviewedById') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "reviewedById" INTEGER;
  END IF;
END $$;

-- reviewedAt
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='reviewedAt') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "reviewedAt" TIMESTAMP(3);
  END IF;
END $$;

-- reviewReason
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='reviewReason') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "reviewReason" TEXT;
  END IF;
END $$;

-- reviewFindingsSnapshot
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='reviewFindingsSnapshot') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "reviewFindingsSnapshot" JSONB;
  END IF;
END $$;

-- downloads counter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='downloads') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "downloads" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- forks counter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='forks') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "forks" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- attachmentName (for StudySheet — the repair migration only added it to FeedPost)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='attachmentName') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "attachmentName" TEXT;
  END IF;
END $$;

-- allowDownloads
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='allowDownloads') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "allowDownloads" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- Foreign key for reviewedById -> User
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='StudySheet_reviewedById_fkey') THEN
    ALTER TABLE "StudySheet" ADD CONSTRAINT "StudySheet_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

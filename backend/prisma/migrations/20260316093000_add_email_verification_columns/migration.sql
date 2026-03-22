DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='emailVerificationCode') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerificationCode" TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='emailVerificationExpiry') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerificationExpiry" TIMESTAMP(3);
  END IF;
END $$;

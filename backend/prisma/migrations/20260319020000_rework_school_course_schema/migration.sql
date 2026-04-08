-- AlterTable: Add new columns to School
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='School' AND column_name='city') THEN
    ALTER TABLE "School" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='School' AND column_name='state') THEN
    ALTER TABLE "School" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'MD';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='School' AND column_name='schoolType') THEN
    ALTER TABLE "School" ADD COLUMN "schoolType" TEXT NOT NULL DEFAULT 'public';
  END IF;
END $$;

-- AlterTable: Add department column to Course
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Course' AND column_name='department') THEN
    ALTER TABLE "Course" ADD COLUMN "department" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- CreateIndex: Unique constraint on School.short
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'School_short_key') THEN
    CREATE UNIQUE INDEX "School_short_key" ON "School"("short");
  END IF;
END
$$;

-- CreateIndex: Unique constraint on Course (schoolId, code)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Course_schoolId_code_key') THEN
    CREATE UNIQUE INDEX "Course_schoolId_code_key" ON "Course"("schoolId", "code");
  END IF;
END
$$;

-- Update foreign key on Course -> School to CASCADE on delete
ALTER TABLE "Course" DROP CONSTRAINT IF EXISTS "Course_schoolId_fkey";
ALTER TABLE "Course" ADD CONSTRAINT "Course_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update foreign key on Enrollment -> User to CASCADE on delete
ALTER TABLE "Enrollment" DROP CONSTRAINT IF EXISTS "Enrollment_userId_fkey";
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update foreign key on Enrollment -> Course to CASCADE on delete
ALTER TABLE "Enrollment" DROP CONSTRAINT IF EXISTS "Enrollment_courseId_fkey";
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

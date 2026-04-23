-- Migration: 20260427000001_add_teacher_materials_tables
--
-- Week 3 of the Design Refresh v2 cycle — section-aware publishing for
-- teacher-role accounts. Introduces four tables that together let a
-- teacher curate materials (backed by existing StudySheet or Note rows),
-- group students into sections, and assign materials to one or more
-- sections with optional due dates.
--
-- See:
--   docs/internal/design-refresh-v2-week2-to-week5-execution.md (Week 3)
--   docs/internal/design-refresh-v2-roles-integration.md
--
-- Cascade behavior follows the repo's existing patterns:
--   - Section          : CASCADE from Course + SET NULL from teacher archive
--   - SectionEnrollment: CASCADE from Section AND User (student leaves = row gone)
--   - Material         : CASCADE from teacher; SET NULL from StudySheet/Note
--                        so deleting the source content orphans the curation
--                        record (teacher can then re-link or delete it)
--   - MaterialAssignment: CASCADE from both Material and Section
--
-- No data backfill required — all four tables are net-new.

-- CreateTable: Section — teacher-owned cohort for grouping students.
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER,
    "teacherId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "joinCode" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SectionEnrollment — student membership in a section.
CREATE TABLE "SectionEnrollment" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Material — teacher-curated wrapper around a StudySheet or Note.
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "sheetId" INTEGER,
    "noteId" INTEGER,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "week" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MaterialAssignment — join between Material and Section with metadata.
CREATE TABLE "MaterialAssignment" (
    "id" SERIAL NOT NULL,
    "materialId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialAssignment_pkey" PRIMARY KEY ("id")
);

-- Uniqueness constraints
CREATE UNIQUE INDEX "Section_joinCode_key" ON "Section"("joinCode");
CREATE UNIQUE INDEX "SectionEnrollment_sectionId_userId_key" ON "SectionEnrollment"("sectionId", "userId");
CREATE UNIQUE INDEX "MaterialAssignment_materialId_sectionId_key" ON "MaterialAssignment"("materialId", "sectionId");

-- Query indexes
CREATE INDEX "Section_teacherId_archived_idx" ON "Section"("teacherId", "archived");
CREATE INDEX "Section_courseId_idx" ON "Section"("courseId");
CREATE INDEX "SectionEnrollment_userId_idx" ON "SectionEnrollment"("userId");
CREATE INDEX "Material_teacherId_archived_idx" ON "Material"("teacherId", "archived");
CREATE INDEX "Material_sheetId_idx" ON "Material"("sheetId");
CREATE INDEX "Material_noteId_idx" ON "Material"("noteId");
CREATE INDEX "MaterialAssignment_sectionId_dueAt_idx" ON "MaterialAssignment"("sectionId", "dueAt");

-- Foreign keys: Section
ALTER TABLE "Section"
  ADD CONSTRAINT "Section_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Section"
  ADD CONSTRAINT "Section_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: SectionEnrollment
ALTER TABLE "SectionEnrollment"
  ADD CONSTRAINT "SectionEnrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionEnrollment"
  ADD CONSTRAINT "SectionEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: Material
ALTER TABLE "Material"
  ADD CONSTRAINT "Material_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Material"
  ADD CONSTRAINT "Material_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Material"
  ADD CONSTRAINT "Material_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys: MaterialAssignment
ALTER TABLE "MaterialAssignment"
  ADD CONSTRAINT "MaterialAssignment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAssignment"
  ADD CONSTRAINT "MaterialAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

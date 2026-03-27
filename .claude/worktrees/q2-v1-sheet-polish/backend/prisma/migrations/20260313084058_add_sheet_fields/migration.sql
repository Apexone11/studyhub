/*
  Warnings:

  - Added the required column `updatedAt` to the `StudySheet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StudySheet" ADD COLUMN     "downloads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stars" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- Data migration: Populate School.city and Course.department
-- These columns were added but never populated in production.
-- Values sourced from backend/src/lib/catalogData.js

-- ═══════════════════════════════════════════════════════════════════════════
-- School cities — match by "short" column
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "School" SET "city" = 'College Park' WHERE "short" = 'UMD' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'UMBC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Towson' WHERE "short" = 'TU' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'Morgan' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Bowie' WHERE "short" = 'Bowie' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'Coppin' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Salisbury' WHERE "short" = 'SU' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Frostburg' WHERE "short" = 'FSU' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'UBalt' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Princess Anne' WHERE "short" = 'UMES' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Adelphi' WHERE "short" = 'UMGC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'St. Mary''s City' WHERE "short" = 'SMCM' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Annapolis' WHERE "short" = 'USNA' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'JHU' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'Loyola' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Westminster' WHERE "short" = 'McDaniel' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Frederick' WHERE "short" = 'Hood' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Towson' WHERE "short" = 'Goucher' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Emmitsburg' WHERE "short" = 'MSM' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Chestertown' WHERE "short" = 'WashCol' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Stevenson' WHERE "short" = 'Stevenson' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'NDMU' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Rockville' WHERE "short" = 'MC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Largo' WHERE "short" = 'PGCC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Baltimore' WHERE "short" = 'CCBC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Arnold' WHERE "short" = 'AACC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Columbia' WHERE "short" = 'HCC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Frederick' WHERE "short" = 'FCC' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Bel Air' WHERE "short" = 'Harford' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'Westminster' WHERE "short" = 'Carroll' AND ("city" IS NULL OR "city" = '');
UPDATE "School" SET "city" = 'La Plata' WHERE "short" = 'CSM' AND ("city" IS NULL OR "city" = '');

-- ═══════════════════════════════════════════════════════════════════════════
-- Course departments — derive from course code prefix
-- Uses a CASE expression to map code prefixes to department names.
-- Only updates rows where department is currently empty.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "Course" SET "department" = CASE
  WHEN "code" LIKE 'CMSC%' THEN 'Computer Science'
  WHEN "code" LIKE 'MATH%' THEN 'Mathematics'
  WHEN "code" LIKE 'PHYS%' THEN 'Physics'
  WHEN "code" LIKE 'CHEM%' THEN 'Chemistry'
  WHEN "code" LIKE 'BSCI%' OR "code" LIKE 'BIOL%' THEN 'Biology'
  WHEN "code" LIKE 'ENGL%' OR "code" LIKE 'ENG1%' THEN 'English'
  WHEN "code" LIKE 'HIST%' THEN 'History'
  WHEN "code" LIKE 'PSYC%' THEN 'Psychology'
  WHEN "code" LIKE 'ECON%' THEN 'Economics'
  WHEN "code" LIKE 'STAT%' THEN 'Statistics'
  WHEN "code" LIKE 'GOVT%' OR "code" LIKE 'GVPT%' THEN 'Government & Politics'
  WHEN "code" LIKE 'COMM%' THEN 'Communication'
  WHEN "code" LIKE 'SOCY%' OR "code" LIKE 'SOCI%' THEN 'Sociology'
  WHEN "code" LIKE 'PHIL%' THEN 'Philosophy'
  WHEN "code" LIKE 'ARTT%' OR "code" LIKE 'ART%' THEN 'Art'
  WHEN "code" LIKE 'MUSC%' OR "code" LIKE 'MUS%' THEN 'Music'
  WHEN "code" LIKE 'KNES%' OR "code" LIKE 'KINE%' THEN 'Kinesiology'
  WHEN "code" LIKE 'BMGT%' OR "code" LIKE 'BUDT%' OR "code" LIKE 'BUSN%' OR "code" LIKE 'BUS%' OR "code" LIKE 'MGMT%' OR "code" LIKE 'ACCT%' OR "code" LIKE 'MKTG%' OR "code" LIKE 'FINC%' THEN 'Business'
  WHEN "code" LIKE 'EDUC%' OR "code" LIKE 'EDCI%' OR "code" LIKE 'EDSP%' THEN 'Education'
  WHEN "code" LIKE 'NURS%' OR "code" LIKE 'NRSG%' THEN 'Nursing'
  WHEN "code" LIKE 'ENES%' OR "code" LIKE 'ENME%' OR "code" LIKE 'ENEE%' OR "code" LIKE 'ENCE%' OR "code" LIKE 'ENPM%' OR "code" LIKE 'BIOE%' OR "code" LIKE 'ENGR%' THEN 'Engineering'
  WHEN "code" LIKE 'SPAN%' THEN 'Spanish'
  WHEN "code" LIKE 'FREN%' THEN 'French'
  WHEN "code" LIKE 'GERM%' THEN 'German'
  WHEN "code" LIKE 'CHIN%' THEN 'Chinese'
  WHEN "code" LIKE 'JAPN%' THEN 'Japanese'
  WHEN "code" LIKE 'ARAB%' THEN 'Arabic'
  WHEN "code" LIKE 'AASP%' THEN 'African American Studies'
  WHEN "code" LIKE 'ANTH%' THEN 'Anthropology'
  WHEN "code" LIKE 'GEOG%' THEN 'Geography'
  WHEN "code" LIKE 'GEOL%' THEN 'Geology'
  WHEN "code" LIKE 'ASTR%' THEN 'Astronomy'
  WHEN "code" LIKE 'JOUR%' THEN 'Journalism'
  WHEN "code" LIKE 'INST%' THEN 'Information Studies'
  WHEN "code" LIKE 'HLTH%' THEN 'Public Health'
  WHEN "code" LIKE 'WMST%' THEN 'Women''s Studies'
  WHEN "code" LIKE 'PLSC%' THEN 'Plant Science'
  WHEN "code" LIKE 'CJUS%' OR "code" LIKE 'CCJS%' THEN 'Criminal Justice'
  ELSE 'General'
END
WHERE "department" IS NULL OR "department" = '';

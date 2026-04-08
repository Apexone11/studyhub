-- Add GIN indexes for PostgreSQL full-text search on StudySheet
CREATE INDEX IF NOT EXISTS "StudySheet_title_search_idx" ON "StudySheet" USING GIN (to_tsvector('english', "title"));
CREATE INDEX IF NOT EXISTS "StudySheet_description_search_idx" ON "StudySheet" USING GIN (to_tsvector('english', "description"));
CREATE INDEX IF NOT EXISTS "StudySheet_content_search_idx" ON "StudySheet" USING GIN (to_tsvector('english', "content"));

-- Combined index for multi-field search
CREATE INDEX IF NOT EXISTS "StudySheet_fulltext_combined_idx" ON "StudySheet" USING GIN (
  to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("content", ''))
);

-- Full-text index on User username for faster user search
CREATE INDEX IF NOT EXISTS "User_username_search_idx" ON "User" USING GIN (to_tsvector('english', "username"));

-- Full-text index on Course name and code
CREATE INDEX IF NOT EXISTS "Course_name_search_idx" ON "Course" USING GIN (to_tsvector('english', "name"));
CREATE INDEX IF NOT EXISTS "Course_code_search_idx" ON "Course" USING GIN (to_tsvector('english', "code"));

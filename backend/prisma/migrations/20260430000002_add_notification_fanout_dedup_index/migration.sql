CREATE INDEX IF NOT EXISTS "Notification_fanout_dedup_idx"
  ON "Notification"("userId", "type", "actorId", "sheetId", "createdAt" DESC);

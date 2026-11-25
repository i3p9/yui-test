-- Channel pages, related videos and channel stats filter by uploader_id.
CREATE INDEX IF NOT EXISTS "video_uploader_id_idx" ON "video"("uploader_id");

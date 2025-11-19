/*
  Warnings:

  - You are about to drop the column `generated_thumbnail` on the `video` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_video" (
    "video_id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "uploader" TEXT,
    "uploader_id" TEXT,
    "upload_date" TEXT,
    "duration_seconds" INTEGER,
    "filesize_bytes" BIGINT,
    "description" TEXT,
    "tags" TEXT,
    "media_type" TEXT NOT NULL,
    "library_path" TEXT NOT NULL,
    "video_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "has_thumbnails" BOOLEAN NOT NULL DEFAULT false,
    "thumbnail_source" TEXT,
    "resolution" TEXT,
    "video_codec" TEXT,
    "audio_codec" TEXT,
    "has_complete_metadata" BOOLEAN NOT NULL DEFAULT false,
    "metadata_source" TEXT NOT NULL,
    "info_json_mtime" TEXT,
    "media_mtime" TEXT,
    "missing_on_disk" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TEXT NOT NULL,
    "last_scanned_at" TEXT NOT NULL
);
INSERT INTO "new_video" ("audio_codec", "description", "duration_seconds", "filesize_bytes", "first_seen_at", "has_complete_metadata", "info_json_mtime", "last_scanned_at", "library_path", "media_mtime", "media_type", "metadata_source", "missing_on_disk", "resolution", "tags", "thumbnail_path", "title", "upload_date", "uploader", "uploader_id", "video_codec", "video_id", "video_path") SELECT "audio_codec", "description", "duration_seconds", "filesize_bytes", "first_seen_at", "has_complete_metadata", "info_json_mtime", "last_scanned_at", "library_path", "media_mtime", "media_type", "metadata_source", "missing_on_disk", "resolution", "tags", "thumbnail_path", "title", "upload_date", "uploader", "uploader_id", "video_codec", "video_id", "video_path" FROM "video";
DROP TABLE "video";
ALTER TABLE "new_video" RENAME TO "video";
CREATE INDEX "video_uploader_idx" ON "video"("uploader");
CREATE INDEX "video_upload_date_idx" ON "video"("upload_date");
CREATE INDEX "video_media_type_idx" ON "video"("media_type");
CREATE INDEX "video_missing_on_disk_idx" ON "video"("missing_on_disk");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

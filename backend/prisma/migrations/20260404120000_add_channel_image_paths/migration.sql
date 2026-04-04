-- AlterTable: Add active channel image paths to channel table
-- avatar_path and banner_path are only for actively downloaded channel images.
-- The legacy thumbnail_path field remains as a passive fallback for older data.
ALTER TABLE "channel" ADD COLUMN "avatar_path" TEXT;
ALTER TABLE "channel" ADD COLUMN "banner_path" TEXT;

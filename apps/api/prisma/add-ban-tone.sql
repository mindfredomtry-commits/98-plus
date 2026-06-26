-- Optional ban delivery tone/character (future feature).
-- Safe to re-run.

ALTER TABLE "Ban" ADD COLUMN IF NOT EXISTS "tone" TEXT;

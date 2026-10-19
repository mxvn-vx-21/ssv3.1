-- 0003_images.sql — image host fallback storage (used only when no R2 bucket is bound as IMAGES). Safe to re-run.
CREATE TABLE IF NOT EXISTS images(name TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, created INTEGER NOT NULL);

-- 0002_v2.sql — run ONCE, after schema.sql (v1). Additive only; existing rows are kept.
-- NOT repeatable: SQLite has no "ADD COLUMN IF NOT EXISTS". If it errors with "duplicate column", it was already applied.
ALTER TABLE inquiries ADD COLUMN status TEXT NOT NULL DEFAULT 'New';
ALTER TABLE inquiries ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE inquiries ADD COLUMN notes_internal TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiries ADD COLUMN client_id TEXT;
ALTER TABLE inquiries ADD COLUMN email_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE inquiries ADD COLUMN discord_status TEXT NOT NULL DEFAULT 'unknown';
CREATE INDEX IF NOT EXISTS idx_inq_status ON inquiries(status, created);
CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(day TEXT NOT NULL, t TEXT NOT NULL, p TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL, dev TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,t,p,ref,dev));
-- Rollback (only if needed): DROP TABLE versions; DROP TABLE events; then ALTER TABLE inquiries DROP COLUMN <each new column>;
-- (existing inquiry rows are never touched by this migration)

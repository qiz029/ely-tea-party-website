-- Sign-in moves to WorkOS AuthKit (Google, GitHub, email); accounts gain a public profile.
DROP TABLE codes;

ALTER TABLE users ADD COLUMN workos_id TEXT;
CREATE UNIQUE INDEX users_workos ON users (workos_id);

-- Display name, bio and up to four https links, shown on /u/<handle>.
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
-- The profile picture's file in R2 under avatars/<id>/, e.g. "3f2a9c0d1b2e4f56.webp"; null shows the initial.
ALTER TABLE users ADD COLUMN avatar TEXT;

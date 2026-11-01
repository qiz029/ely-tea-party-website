-- The skin market: accounts by email code, packs and their reports.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  handle TEXT UNIQUE,
  banned INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

-- One pending code per address, stored as a keyed hash.
CREATE TABLE codes (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);

-- Recent rate-limited events: code mails by address and by IP, uploads by user.
CREATE TABLE events (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX events_key ON events (key, at);

CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);

CREATE TABLE skins (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  name TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT,
  license TEXT,
  homepage TEXT,
  target TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('agent', 'whale')),
  -- {"idle": {"type": "image/webp", "width": 224, "height": 224, "frames": 48, "size": 123}, ...}
  actions TEXT NOT NULL,
  skipped TEXT NOT NULL DEFAULT '[]',
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  downloads INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'public' CHECK (status IN ('public', 'hidden')),
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX skins_new ON skins (status, kind, updated DESC);
CREATE INDEX skins_popular ON skins (status, kind, downloads DESC);
CREATE INDEX skins_owner ON skins (user_id);

CREATE TABLE reports (
  skin_id TEXT NOT NULL REFERENCES skins (id) ON DELETE CASCADE,
  reporter TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (skin_id, reporter)
);

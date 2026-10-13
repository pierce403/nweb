CREATE TABLE users (
 address TEXT PRIMARY KEY NOT NULL UNIQUE,
 submit_token TEXT,
 points_earned INTEGER DEFAULT 0,
 points_rewarded INTEGER DEFAULT 0,
 ctime TEXT
);
CREATE TABLE submissions (
 id TEXT PRIMARY KEY,
 address TEXT NOT NULL REFERENCES users(address),
 payload TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','accepted')),
 created_at TEXT NOT NULL
);

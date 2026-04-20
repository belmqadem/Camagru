CREATE TABLE IF NOT EXISTS sessions (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_sessions_expire ON sessions (expire);

CREATE TABLE users (
  id               SERIAL PRIMARY KEY,
  username         VARCHAR(50) UNIQUE NOT NULL,
  email            VARCHAR(255) UNIQUE NOT NULL,
  password         TEXT NOT NULL,
  verified         BOOLEAN DEFAULT FALSE,
  verify_token     TEXT,
  verify_expires   TIMESTAMP,
  reset_token      TEXT,
  reset_expires    TIMESTAMP,
  notify_comments  BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE overlays (
  id        SERIAL PRIMARY KEY,
  filename  TEXT NOT NULL
);

CREATE TABLE images (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE likes (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  image_id  INTEGER REFERENCES images(id) ON DELETE CASCADE,
  UNIQUE(user_id, image_id)
);

CREATE TABLE comments (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  image_id    INTEGER REFERENCES images(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Seed your overlay stickers
INSERT INTO overlays (filename) VALUES
  ('frame.png'),
  ('frame2.png'),
  ('glasses-blue.png'),
  ('glasses-colors.png'),
  ('hair.png'),
  ('men-hat.png'),
  ('women-hat.png');

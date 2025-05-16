CREATE TABLE IF NOT EXISTS users(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    created_at timestamp DEFAULT NOW()
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


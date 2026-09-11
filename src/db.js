import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

export async function initDb() {
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      username varchar(32) unique not null,
      email varchar(160) unique not null,
      password_hash text not null,
      xp integer not null default 0,
      created_at timestamptz not null default now()
    );
    create table if not exists bookmarks (
      id serial primary key,
      user_id integer not null references users(id) on delete cascade,
      title varchar(120) not null,
      url text not null,
      shortcut varchar(20),
      position integer not null default 0,
      created_at timestamptz not null default now()
    );
    create table if not exists workspace_tabs (
      id serial primary key,
      user_id integer not null references users(id) on delete cascade,
      title varchar(120) not null,
      url text not null,
      position integer not null default 0,
      created_at timestamptz not null default now()
    );
    create table if not exists tables_data (
      id serial primary key,
      user_id integer not null references users(id) on delete cascade,
      name varchar(120) not null,
      payload jsonb not null default '{"columns":[],"rows":[]}'::jsonb,
      updated_at timestamptz not null default now()
    );
    create table if not exists friendships (
      id serial primary key,
      requester_id integer not null references users(id) on delete cascade,
      addressee_id integer not null references users(id) on delete cascade,
      status varchar(20) not null default 'pending',
      created_at timestamptz not null default now(),
      unique(requester_id, addressee_id)
    );
    create table if not exists messages (
      id bigserial primary key,
      sender_id integer not null references users(id) on delete cascade,
      recipient_id integer not null references users(id) on delete cascade,
      body varchar(2000) not null,
      created_at timestamptz not null default now()
    );
  `);
}

export async function q(text, params = []) { return pool.query(text, params); }

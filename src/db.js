import pg from 'pg';
const { Pool } = pg;

if (!process.env.DATABASE_URL) console.warn('[OrbitDesk] DATABASE_URL is not set. The server cannot start until Postgres is configured.');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      username varchar(32) unique not null,
      email varchar(160) unique not null,
      password_hash text not null,
      xp integer not null default 0,
      created_at timestamptz not null default now()
    );
    create table if not exists user_settings (
      user_id integer primary key references users(id) on delete cascade,
      payload jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
    create table if not exists bookmarks (
      id serial primary key,
      user_id integer not null references users(id) on delete cascade,
      title varchar(120) not null,
      url text not null,
      shortcut varchar(40),
      icon varchar(8) not null default '🌐',
      category varchar(30) not null default 'custom',
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
    create table if not exists photos (
      id bigserial primary key,
      user_id integer not null references users(id) on delete cascade,
      filename varchar(180) not null,
      mime_type varchar(80) not null,
      size_bytes integer not null,
      data bytea not null,
      created_at timestamptz not null default now()
    );
  `);
  // Upgrade old bookmarks schema safely.
  await pool.query(`alter table bookmarks add column if not exists icon varchar(8) not null default '🌐'`);
  await pool.query(`alter table bookmarks add column if not exists category varchar(30) not null default 'custom'`);
  await pool.query(`alter table bookmarks add column if not exists shortcut varchar(40)`);
  await pool.query(`alter table bookmarks add column if not exists position integer not null default 0`);
}
export async function q(text, params = []) { return pool.query(text, params); }

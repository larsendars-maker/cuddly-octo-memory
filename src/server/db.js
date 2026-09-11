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
      role varchar(20) not null default 'user',
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
    create table if not exists sessions (
      id bigserial primary key,
      token_hash char(64) unique not null,
      user_id integer not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );
    create index if not exists sessions_user_idx on sessions(user_id);
    create index if not exists sessions_expires_idx on sessions(expires_at);
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
  await pool.query(`create index if not exists bookmarks_user_idx on bookmarks(user_id, position, id)`);
  await pool.query(`create index if not exists tabs_user_idx on workspace_tabs(user_id, position, id)`);
  await pool.query(`create index if not exists tables_user_idx on tables_data(user_id, updated_at desc)`);
  await pool.query(`create index if not exists friends_addressee_idx on friendships(addressee_id, status)`);
  await pool.query(`create index if not exists friends_requester_idx on friendships(requester_id, status)`);
  await pool.query(`create index if not exists messages_pair_idx on messages(sender_id, recipient_id, id desc)`);
  await pool.query(`create index if not exists photos_user_idx on photos(user_id, id desc)`);
  await pool.query(`alter table users add column if not exists role varchar(20) not null default 'user'`);
  await pool.query(`update users set role='user' where role is null or role not in ('admin','assistant','user')`);
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
    await pool.query(`update users set role='admin' where lower(email)=lower($1)`, [process.env.BOOTSTRAP_ADMIN_EMAIL]);
  } else {
    const count = await pool.query('select count(*)::int as n from users');
    if (count.rows[0].n === 0) {
      // The first registered account becomes admin only on a brand-new database.
    }
  }
  // Upgrade old bookmarks schema safely.
  await pool.query(`alter table bookmarks add column if not exists icon varchar(8) not null default '🌐'`);
  await pool.query(`alter table bookmarks add column if not exists category varchar(30) not null default 'custom'`);
  await pool.query(`alter table bookmarks add column if not exists shortcut varchar(40)`);
  await pool.query(`alter table bookmarks add column if not exists position integer not null default 0`);
}
export async function q(text, params = []) { return pool.query(text, params); }

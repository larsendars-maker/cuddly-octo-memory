import pg from 'pg';
const { Pool } = pg;

const hasPg = Boolean(process.env.DATABASE_URL);
let pool = null;
let memoryMode = !hasPg;

const mem = {
  next: { users:1, bookmarks:1, tabs:1, tables:1, friendships:1, messages:1, sessions:1, photos:1, visits:1, audit:1, integrations:1, oauth_states:1, email_verifications:1, email_codes:1 },
  users: [], settings: new Map(), bookmarks: [], tabs: [], tables: [], friendships: [], messages: [], sessions: [], photos: [], visits: [], audit: [], integrations: [], oauth_states: [], email_verifications: [], email_codes: []
};
const now = () => new Date();
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
function result(rows=[]) { return { rows, rowCount: rows.length }; }
function uid(kind){ return mem.next[kind]++; }

if (hasPg) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
} else {
  console.warn('[OrbitDesk] DATABASE_URL is not set. Using temporary in-memory storage so the Web Service can start. Add Render PostgreSQL for persistent data.');
}

export const dbMode = () => memoryMode ? 'memory' : 'postgres';

export async function initDb() {
  if (!pool) return;
  await pool.query(`
    create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now());
    create table if not exists users (
      id serial primary key, username varchar(32) unique not null, email varchar(160) unique not null,
      password_hash text not null, xp integer not null default 0, role varchar(20) not null default 'user',
      email_verified boolean not null default false, email_verified_at timestamptz, registration_ip inet, registration_device_hash char(64), blocked boolean not null default false, block_reason varchar(240), blocked_at timestamptz, created_at timestamptz not null default now()
    );
    create table if not exists user_settings (user_id integer primary key references users(id) on delete cascade, payload jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
    create table if not exists bookmarks (id serial primary key, user_id integer not null references users(id) on delete cascade, title varchar(120) not null, url text not null, shortcut varchar(40), icon varchar(8) not null default '🌐', category varchar(30) not null default 'custom', position integer not null default 0, created_at timestamptz not null default now());
    create table if not exists workspace_tabs (id serial primary key, user_id integer not null references users(id) on delete cascade, title varchar(120) not null, url text not null, position integer not null default 0, created_at timestamptz not null default now());
    create table if not exists tables_data (id serial primary key, user_id integer not null references users(id) on delete cascade, name varchar(120) not null, payload jsonb not null default '{"columns":[],"rows":[]}'::jsonb, updated_at timestamptz not null default now());
    create table if not exists friendships (id serial primary key, requester_id integer not null references users(id) on delete cascade, addressee_id integer not null references users(id) on delete cascade, status varchar(20) not null default 'pending', created_at timestamptz not null default now(), unique(requester_id, addressee_id));
    create table if not exists messages (id bigserial primary key, sender_id integer not null references users(id) on delete cascade, recipient_id integer not null references users(id) on delete cascade, body varchar(2000) not null, created_at timestamptz not null default now());
    create table if not exists sessions (id bigserial primary key, token_hash char(64) unique not null, user_id integer not null references users(id) on delete cascade, expires_at timestamptz not null, created_at timestamptz not null default now());
    create table if not exists photos (id bigserial primary key, user_id integer not null references users(id) on delete cascade, filename varchar(180) not null, mime_type varchar(80) not null, size_bytes integer not null, data bytea not null, created_at timestamptz not null default now());
create table if not exists visits (id bigserial primary key, user_id integer not null references users(id) on delete cascade, url text not null, title varchar(200) not null default '', visited_at timestamptz not null default now());
    create table if not exists audit_logs (id bigserial primary key, actor_id integer references users(id) on delete set null, action varchar(120) not null, target_id integer, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
    create table if not exists integrations (id bigserial primary key, user_id integer not null references users(id) on delete cascade, provider varchar(40) not null, token_cipher text, refresh_cipher text, meta jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, provider));
    create table if not exists oauth_states (id bigserial primary key, user_id integer not null references users(id) on delete cascade, provider varchar(40) not null, state_hash char(64) unique not null, expires_at timestamptz not null, created_at timestamptz not null default now());
    create table if not exists email_verifications (id bigserial primary key, user_id integer not null references users(id) on delete cascade, token_hash char(64) unique not null, expires_at timestamptz not null, created_at timestamptz not null default now());
    create table if not exists email_verification_codes (id bigserial primary key, user_id integer unique not null references users(id) on delete cascade, code_hash char(64) not null, attempts integer not null default 0, expires_at timestamptz not null, created_at timestamptz not null default now());
  `);
  await pool.query(`alter table users add column if not exists email_verified boolean not null default false`);
  await pool.query(`alter table users add column if not exists registration_ip inet`);
  await pool.query(`alter table users add column if not exists registration_device_hash char(64)`);
  await pool.query(`alter table users add column if not exists email_verified_at timestamptz`);
  await pool.query(`alter table users add column if not exists blocked boolean not null default false`);
  await pool.query(`alter table users add column if not exists block_reason varchar(240)`);
  await pool.query(`alter table users add column if not exists blocked_at timestamptz`);
  for (const v of [1]) await pool.query('insert into schema_migrations(version) values($1) on conflict(version) do nothing',[v]);
  const adminName = process.env.ADMIN_USERNAME || 'Larsenda';
  await pool.query(`update users set role='admin' where lower(username)=lower($1)`, [adminName]);
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = path.dirname(fileURLToPath(import.meta.url));
    const file = process.env.ADMIN_USERS_FILE || path.join(root, '..', '..', 'admins.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const admins = Array.isArray(data) ? data : data.admins;
    if (Array.isArray(admins)) for (const name of admins.map(x=>String(x).trim()).filter(Boolean)) await pool.query(`update users set role='admin' where lower(username)=lower($1)`, [name]);
  } catch {}
  for (const sql of [
    `create index if not exists sessions_user_idx on sessions(user_id)`,
    `create index if not exists sessions_expires_idx on sessions(expires_at)`,
    `create index if not exists bookmarks_user_idx on bookmarks(user_id, position, id)`,
    `create index if not exists tabs_user_idx on workspace_tabs(user_id, position, id)`,
    `create index if not exists tables_user_idx on tables_data(user_id, updated_at desc)`,
    `create index if not exists friends_addressee_idx on friendships(addressee_id, status)`,
    `create index if not exists friends_requester_idx on friendships(requester_id, status)`,
    `create index if not exists messages_pair_idx on messages(sender_id, recipient_id, id desc)`,
    `create index if not exists photos_user_idx on photos(user_id, id desc)`,
    `create index if not exists visits_user_idx on visits(user_id, visited_at desc)`,
    `create index if not exists audit_created_idx on audit_logs(created_at desc)`,
    `create index if not exists audit_actor_idx on audit_logs(actor_id, created_at desc)`,
    `create index if not exists oauth_states_idx on oauth_states(state_hash, expires_at)`,
    `create index if not exists email_verify_idx on email_verifications(token_hash, expires_at)`,
    `create index if not exists email_code_idx on email_verification_codes(user_id, expires_at)`
  ]) await pool.query(sql);
  await pool.query(`alter table users add column if not exists role varchar(20) not null default 'user'`);
  await pool.query(`alter table bookmarks add column if not exists icon varchar(8) not null default '🌐'`);
  await pool.query(`alter table bookmarks add column if not exists category varchar(30) not null default 'custom'`);
  await pool.query(`alter table bookmarks add column if not exists shortcut varchar(40)`);
  await pool.query(`alter table bookmarks add column if not exists position integer not null default 0`);
  await pool.query(`update users set role='user' where role is null or role not in ('admin','assistant','user')`);
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) await pool.query(`update users set role='admin' where lower(email)=lower($1)`, [process.env.BOOTSTRAP_ADMIN_EMAIL]);
}

function memQ(text, params=[]) {
  const s=text.replace(/\s+/g,' ').trim().toLowerCase();
  const p=i=>params[i-1];
  if (s==='select 1') return result([{ '?column?': 1 }]);

  if (s.startsWith('select id from users where lower(username)=lower($1) or lower(email)=lower($2)')) {
    const r=mem.users.find(u=>u.username.toLowerCase()===String(p(1)).toLowerCase()||u.email.toLowerCase()===String(p(2)).toLowerCase()); return result(r?[r]:[]);
  }
  if (s.startsWith('select count(*)::int as count from users where registration_device_hash=$1')) { const n=mem.users.filter(u=>u.registration_device_hash===String(p(1))).length; return result([{count:n}]); }
  if (s.startsWith('select count(*)::int as count from users where registration_ip=$1 and created_at > now() - interval')) { const cutoff=Date.now()-24*60*60*1000; const n=mem.users.filter(u=>String(u.registration_ip)===String(p(1)) && new Date(u.created_at).getTime()>cutoff).length; return result([{count:n}]); }
  if (s.startsWith('select * from users where lower(username)=lower($1) or lower(email)=lower($1)')) {
    const r=mem.users.find(u=>u.username.toLowerCase()===String(p(1)).toLowerCase()||u.email.toLowerCase()===String(p(1)).toLowerCase()); return result(r?[r]:[]);
  }
  if (s.startsWith('insert into users(')) {
    const u={id:uid('users'),username:p(1),email:p(2),password_hash:p(3),xp:Number(p(4)),role:p(5),email_verified:false,registration_ip:p(6),registration_device_hash:p(7),blocked:false,block_reason:null,blocked_at:null,created_at:now().toISOString()}; mem.users.push(u); return result([clone(u)]);
  }
  if (s.startsWith('select id,username,email,xp,role,email_verified,created_at from users where id=$1')) { const r=mem.users.find(u=>u.id===Number(p(1))); return result(r?[clone(r)]:[]); }
  if (s.startsWith('select role from users where id=$1')) { const r=mem.users.find(u=>u.id===Number(p(1))); return result(r?[{role:r.role}]:[]); }
  if (s.startsWith('update users set role=')) { const r=mem.users.find(u=>u.id===Number(p(2))); if(!r)return result([]); r.role=p(1); return result([clone(r)]); }
  if (s.startsWith('select id,username,email,xp,role,email_verified,created_at,blocked,block_reason,blocked_at from users order by id desc')) return result(mem.users.slice().sort((a,b)=>b.id-a.id).slice(0,500).map(u=>clone(u)));
  if (s.startsWith('select username from users where id=$1')) { const r=mem.users.find(u=>u.id===Number(p(1))); return result(r?[{username:r.username}]:[]); }
  if (s.startsWith('update users set blocked=$1,block_reason=$2')) { const r=mem.users.find(u=>u.id===Number(p(3))); if(!r)return result([]); r.blocked=Boolean(p(1));r.block_reason=p(2);r.blocked_at=r.blocked?now().toISOString():null;return result([clone(r)]); }
  if (s.startsWith('delete from sessions where user_id=$1')) { mem.sessions=mem.sessions.filter(x=>x.user_id!==Number(p(1))); return result([]); }
  if (s.startsWith('select id,username,email,xp,role,created_at from users order by id desc')) { return result(mem.users.slice().sort((a,b)=>b.id-a.id).slice(0,200).map(clone)); }
  if (s.startsWith('select id,username,xp from users where id<>$1 and username ilike $2')) { const needle=String(p(2)).replace(/%/g,'').toLowerCase(); return result(mem.users.filter(u=>u.id!==Number(p(1))&&u.username.toLowerCase().includes(needle)).sort((a,b)=>a.username.localeCompare(b.username)).slice(0,20).map(u=>({id:u.id,username:u.username,xp:u.xp}))); }
  if (s.startsWith('update users set xp=xp+5 where id=$1')) { const r=mem.users.find(u=>u.id===Number(p(1))); if(r)r.xp+=5; return result([]); }
  if (s.startsWith('select xp,role,username from users where id=$1')) { const r=mem.users.find(u=>u.id===Number(p(1))); return result(r?[{xp:r.xp,role:r.role,username:r.username}]:[]); }
  if (s.startsWith('update users set xp=$1 where id=$2 returning')) { const r=mem.users.find(u=>u.id===Number(p(2))); if(!r)return result([]); r.xp=Number(p(1)); return result([clone(r)]); }

  if (s.startsWith('insert into user_settings')) { const id=Number(p(1)); mem.settings.set(id,clone(p(2))); return result([]); }
  if (s.startsWith('select payload from user_settings where user_id=$1')) { const v=mem.settings.get(Number(p(1))); return result(v!==undefined?[{payload:clone(v)}]:[]); }

  if (s.startsWith('select * from bookmarks where user_id=$1')) return result(mem.bookmarks.filter(x=>x.user_id===Number(p(1))).sort((a,b)=>a.position-b.position||a.id-b.id).map(clone));
  if (s.startsWith('insert into bookmarks(')) { const r={id:uid('bookmarks'),user_id:Number(p(1)),title:p(2),url:p(3),shortcut:p(4),icon:p(5),category:p(6),position:mem.bookmarks.length,created_at:now().toISOString()}; mem.bookmarks.push(r); return result([clone(r)]); }
  if (s.startsWith('update bookmarks set title=$1,icon=$2,shortcut=$3')) { const r=mem.bookmarks.find(x=>x.id===Number(p(4))&&x.user_id===Number(p(5))); if(!r)return result([]); r.title=p(1);r.icon=p(2);r.shortcut=p(3);return result([clone(r)]); }
  if (s.startsWith('update bookmarks set position=$1 where id=$2 and user_id=$3')) { const r=mem.bookmarks.find(x=>x.id===Number(p(2))&&x.user_id===Number(p(3))); if(r)r.position=Number(p(1)); return result([]); }
  if (s.startsWith('delete from bookmarks where id=$1')) { mem.bookmarks=mem.bookmarks.filter(x=>!(x.id===Number(p(1))&&x.user_id===Number(p(2)))); return result([]); }

  if (s.startsWith('select * from workspace_tabs where user_id=$1')) return result(mem.tabs.filter(x=>x.user_id===Number(p(1))).sort((a,b)=>a.position-b.position||a.id-b.id).map(clone));
  if (s.startsWith('delete from workspace_tabs where user_id=$1')) { mem.tabs=mem.tabs.filter(x=>x.user_id!==Number(p(1))); return result([]); }
  if (s.startsWith('insert into workspace_tabs(')) { mem.tabs.push({id:uid('tabs'),user_id:Number(p(1)),title:p(2),url:p(3),position:Number(p(4)),created_at:now().toISOString()}); return result([]); }

  if (s.startsWith('select id,name,payload,updated_at from tables_data where user_id=$1')) return result(mem.tables.filter(x=>x.user_id===Number(p(1))).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(x=>({id:x.id,name:x.name,payload:clone(x.payload),updated_at:x.updated_at})));
  if (s.startsWith('insert into tables_data(')) { const r={id:uid('tables'),user_id:Number(p(1)),name:p(2),payload:clone(p(3)),updated_at:now().toISOString()}; mem.tables.push(r); return result([clone(r)]); }
  if (s.startsWith('update tables_data set name=$1,payload=$2')) { const r=mem.tables.find(x=>x.id===Number(p(3))&&x.user_id===Number(p(4))); if(!r)return result([]); r.name=p(1);r.payload=clone(p(2));r.updated_at=now().toISOString();return result([clone(r)]); }
  if (s.startsWith('delete from tables_data where id=$1')) { mem.tables=mem.tables.filter(x=>!(x.id===Number(p(1))&&x.user_id===Number(p(2)))); return result([]); }

  if (s.startsWith('insert into friendships(')) { const exists=mem.friendships.find(f=>f.requester_id===Number(p(1))&&f.addressee_id===Number(p(2))); if(exists)return result([]); const r={id:uid('friendships'),requester_id:Number(p(1)),addressee_id:Number(p(2)),status:'pending',created_at:now().toISOString()};mem.friendships.push(r);return result([clone(r)]); }
  if (s.startsWith('select 1 from friendships where status=\'accepted\'')) { const a=Number(p(1)), b=Number(p(2)); const ok=mem.friendships.some(f=>f.status==='accepted'&&((f.requester_id===a&&f.addressee_id===b)||(f.requester_id===b&&f.addressee_id===a))); return result(ok?[{ '?column?':1 }]:[]); }
  if (s.startsWith('select f.id,u.id as user_id,u.username,u.xp from friendships f join users u on u.id=f.requester_id where f.addressee_id=$1')) { return result(mem.friendships.filter(f=>f.addressee_id===Number(p(1))&&f.status==='pending').sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(f=>{const u=mem.users.find(x=>x.id===f.requester_id);return u?{id:f.id,user_id:u.id,username:u.username,xp:u.xp}:null}).filter(Boolean)); }
  if (s.startsWith('update friendships set status=\'accepted\'')) { const f=mem.friendships.find(x=>x.id===Number(p(1))&&x.addressee_id===Number(p(2))&&x.status==='pending'); if(!f)return result([]);f.status='accepted';return result([clone(f)]); }
  if (s.startsWith('select f.id,f.status,u.id as user_id')) { const me=Number(p(1)); const rows=mem.friendships.filter(f=>(f.requester_id===me||f.addressee_id===me)&&f.status==='accepted').map(f=>{const uid2=f.requester_id===me?f.addressee_id:f.requester_id;const u=mem.users.find(x=>x.id===uid2);return u?{id:f.id,status:f.status,user_id:u.id,username:u.username,xp:u.xp}:null}).filter(Boolean).sort((a,b)=>a.username.localeCompare(b.username));return result(rows); }

  if (s.startsWith('select m.id,m.sender_id,m.recipient_id,m.body,m.created_at,u.username as sender_name from messages')) { const a=Number(p(1)),b=Number(p(2)); const rows=mem.messages.filter(m=>(m.sender_id===a&&m.recipient_id===b)||(m.sender_id===b&&m.recipient_id===a)).sort((x,y)=>x.id-y.id).slice(-120).map(m=>({...m,sender_name:mem.users.find(u=>u.id===m.sender_id)?.username||'user'})); return result(rows); }
  if (s.startsWith('insert into messages(')) { const r={id:uid('messages'),sender_id:Number(p(1)),recipient_id:Number(p(2)),body:p(3),created_at:now().toISOString()};mem.messages.push(r);return result([clone(r)]); }

  if (s.startsWith('insert into sessions(')) { const expires=new Date(Date.now()+14*86400000).toISOString(); const r={id:uid('sessions'),token_hash:p(1),user_id:Number(p(2)),expires_at:expires,created_at:now().toISOString()};mem.sessions.push(r);return result([]); }
  if (s.startsWith('delete from sessions where token_hash=$1')) { mem.sessions=mem.sessions.filter(x=>x.token_hash!==p(1)); return result([]); }
  if (s.startsWith('select u.id,u.username,u.email,u.xp,u.role,u.created_at,u.blocked,u.block_reason from sessions s join users u on u.id=s.user_id')) { const srow=mem.sessions.find(x=>x.token_hash===p(1)&&new Date(x.expires_at)>new Date()); const u=srow?mem.users.find(x=>x.id===srow.user_id):null; return result(u?[clone(u)]:[]); }
  if (s.startsWith('delete from sessions where expires_at <= now()')) { mem.sessions=mem.sessions.filter(x=>new Date(x.expires_at)>new Date()); return result([]); }

  if (s.startsWith('select id,filename,mime_type,size_bytes,created_at from photos where user_id=$1')) return result(mem.photos.filter(x=>x.user_id===Number(p(1))).sort((a,b)=>b.id-a.id).slice(0,50).map(({data,...rest})=>clone(rest)));
  if (s.startsWith('select mime_type,data from photos where id=$1 and user_id=$2')) { const x=mem.photos.find(x=>x.id===Number(p(1))&&x.user_id===Number(p(2)));return result(x?[{mime_type:x.mime_type,data:x.data}]:[]); }
  if (s.startsWith('select count(*)::int as n from photos where user_id=$1')) return result([{n:mem.photos.filter(x=>x.user_id===Number(p(1))).length}]);
  if (s.startsWith('insert into photos(')) { const r={id:uid('photos'),user_id:Number(p(1)),filename:p(2),mime_type:p(3),size_bytes:Number(p(4)),data:Buffer.from(p(5)),created_at:now().toISOString()};mem.photos.push(r);return result([{id:r.id,filename:r.filename,mime_type:r.mime_type,size_bytes:r.size_bytes,created_at:r.created_at}]); }
  if (s.startsWith('delete from photos where id=$1')) { mem.photos=mem.photos.filter(x=>!(x.id===Number(p(1))&&x.user_id===Number(p(2)))); return result([]); }

  if (s.startsWith('delete from email_verification_codes where user_id=$1')) { mem.email_codes=mem.email_codes.filter(x=>x.user_id!==Number(p(1))); return result([]); }
  if (s.startsWith('insert into email_verification_codes(')) { const r={id:uid('email_codes'),user_id:Number(p(1)),code_hash:p(2),expires_at:new Date(Date.now()+15*60*1000).toISOString(),attempts:0}; mem.email_codes.push(r); return result([clone(r)]); }
  if (s.startsWith('select user_id,code_hash,attempts from email_verification_codes where user_id=$1')) { const r=mem.email_codes.find(x=>x.user_id===Number(p(1))&&new Date(x.expires_at)>new Date()); return result(r?[clone(r)]:[]); }
  if (s.startsWith('update email_verification_codes set attempts=attempts+1 where user_id=$1')) { const r=mem.email_codes.find(x=>x.user_id===Number(p(1))); if(r)r.attempts++; return result([]); }
  throw new Error(`MEMORY_DB_UNSUPPORTED: ${text.slice(0,160)}`);
}

export async function q(text, params = []) { return pool ? pool.query(text, params) : memQ(text, params); }

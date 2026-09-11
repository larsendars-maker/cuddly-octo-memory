import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { initDb, q } from './src/db.js';
import { signUser, hashPassword, verifyPassword, requireAuth, verifyToken } from './src/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const sockets = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

function validUrl(u) {
  try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol); } catch { return false; }
}
function rank(xp) {
  const ranks = [['Bronze', 0], ['Silver', 300], ['Gold', 800], ['Platinum', 1600], ['Diamond', 2800], ['Master', 4500], ['Legend', 7000]];
  let r = ranks[0]; for (const item of ranks) if (xp >= item[1]) r = item;
  return { name: r[0], xp };
}
function send(ws, data) { if (ws.readyState === 1) ws.send(JSON.stringify(data)); }
function normalizeSettings(s = {}) {
  const allowedThemes = ['midnight', 'graphite', 'light', 'amoled'];
  return {
    theme: allowedThemes.includes(s.theme) ? s.theme : 'midnight',
    accent: /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : '#68a1ff',
    compact: Boolean(s.compact),
    blur: Math.max(0, Math.min(24, Number(s.blur) || 16)),
    sidebar: Math.max(220, Math.min(360, Number(s.sidebar) || 270)),
    roundness: Math.max(6, Math.min(24, Number(s.roundness) || 14)),
    wallpaper: validUrl(s.wallpaper) ? s.wallpaper : '',
    showClock: s.showClock !== false
  };
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'OrbitDesk', db: Boolean(process.env.DATABASE_URL) }));
app.get('/api/config', (_req, res) => res.json({ sites: PRESET_SITES }));

const PRESET_SITES = [
  { id: 'gdz', title: 'ГДЗ', url: 'https://gdz.top/', icon: '📚', category: 'study' },
  { id: 'sfpd', title: 'SFPD DB', url: 'https://sfpd-gov.ru/db/', icon: '🛡️', category: 'rp' },
  { id: 'evolve', title: 'Evolve RP', url: 'https://evolve-rp.su/', icon: '🎮', category: 'rp' },
  { id: 'vk', title: 'VK', url: 'https://vk.com/', icon: '💬', category: 'social' },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/', icon: '▶️', category: 'media' },
  { id: 'google', title: 'Google', url: 'https://www.google.com/', icon: '🔎', category: 'web' },
  { id: 'lichess', title: 'Lichess', url: 'https://lichess.org/', icon: '♟️', category: 'games' },
  { id: 'crazygames', title: 'CrazyGames', url: 'https://www.crazygames.com/', icon: '🎯', category: 'games' }
];

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username || '')) return res.status(400).json({ error: 'BAD_USERNAME' });
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'BAD_EMAIL' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'WEAK_PASSWORD' });
    const existing = await q('select id from users where lower(username)=lower($1) or lower(email)=lower($2)', [username, email]);
    if (existing.rowCount) return res.status(409).json({ error: 'ALREADY_EXISTS' });
    const h = await hashPassword(password);
    const r = await q('insert into users(username,email,password_hash,xp) values($1,$2,$3,50) returning id,username,email,xp,created_at', [username, email, h]);
    const user = r.rows[0];
    await q('insert into user_settings(user_id,payload) values($1,$2) on conflict(user_id) do nothing', [user.id, normalizeSettings({})]);
    res.json({ token: signUser(user), user: { ...user, rank: rank(user.xp) } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'REGISTER_FAILED' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const r = await q('select * from users where lower(username)=lower($1) or lower(email)=lower($1)', [login || '']);
    const user = r.rows[0];
    if (!user || !(await verifyPassword(password || '', user.password_hash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    await q('insert into user_settings(user_id,payload) values($1,$2) on conflict(user_id) do nothing', [user.id, normalizeSettings({})]);
    res.json({ token: signUser(user), user: { id: user.id, username: user.username, email: user.email, xp: user.xp, rank: rank(user.xp) } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'LOGIN_FAILED' }); }
});
app.get('/api/me', requireAuth, async (req, res) => {
  const r = await q('select id,username,email,xp,created_at from users where id=$1', [req.user.sub]);
  if (!r.rowCount) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  res.json({ ...r.rows[0], rank: rank(r.rows[0].xp) });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  const r = await q('select payload from user_settings where user_id=$1', [req.user.sub]);
  res.json(normalizeSettings(r.rows[0]?.payload || {}));
});
app.put('/api/settings', requireAuth, async (req, res) => {
  const payload = normalizeSettings(req.body || {});
  await q(`insert into user_settings(user_id,payload) values($1,$2)
           on conflict(user_id) do update set payload=excluded.payload, updated_at=now()`, [req.user.sub, payload]);
  res.json(payload);
});

app.get('/api/bookmarks', requireAuth, async (req, res) => { const r = await q('select * from bookmarks where user_id=$1 order by position,id', [req.user.sub]); res.json(r.rows); });
app.post('/api/bookmarks', requireAuth, async (req, res) => {
  const { title, url, shortcut, icon, category } = req.body || {};
  if (!title || !validUrl(url)) return res.status(400).json({ error: 'BAD_BOOKMARK' });
  const r = await q('insert into bookmarks(user_id,title,url,shortcut,icon,category) values($1,$2,$3,$4,$5,$6) returning *', [req.user.sub, String(title).slice(0, 120), url, String(shortcut || '').slice(0, 40), String(icon || '🌐').slice(0, 8), String(category || 'custom').slice(0, 30)]);
  res.json(r.rows[0]);
});
app.delete('/api/bookmarks/:id', requireAuth, async (req, res) => { await q('delete from bookmarks where id=$1 and user_id=$2', [req.params.id, req.user.sub]); res.json({ ok: true }); });

app.get('/api/tabs', requireAuth, async (req, res) => { const r = await q('select * from workspace_tabs where user_id=$1 order by position,id', [req.user.sub]); res.json(r.rows); });
app.put('/api/tabs', requireAuth, async (req, res) => {
  const tabs = Array.isArray(req.body?.tabs) ? req.body.tabs.slice(0, 16) : [];
  await q('delete from workspace_tabs where user_id=$1', [req.user.sub]);
  for (let i = 0; i < tabs.length; i++) { const t = tabs[i]; if (validUrl(t.url)) await q('insert into workspace_tabs(user_id,title,url,position) values($1,$2,$3,$4)', [req.user.sub, String(t.title || 'Tab').slice(0, 120), t.url, i]); }
  res.json({ ok: true });
});

app.get('/api/tables', requireAuth, async (req, res) => { const r = await q('select id,name,payload,updated_at from tables_data where user_id=$1 order by updated_at desc', [req.user.sub]); res.json(r.rows); });
app.post('/api/tables', requireAuth, async (req, res) => { const name = String(req.body?.name || 'Новая таблица').slice(0, 120); const payload = req.body?.payload || { columns: ['A', 'B', 'C'], rows: [['', '', '']] }; const r = await q('insert into tables_data(user_id,name,payload) values($1,$2,$3) returning *', [req.user.sub, name, payload]); await q('update users set xp=xp+10 where id=$1', [req.user.sub]); res.json(r.rows[0]); });
app.put('/api/tables/:id', requireAuth, async (req, res) => { const r = await q('update tables_data set name=$1,payload=$2,updated_at=now() where id=$3 and user_id=$4 returning *', [String(req.body?.name || 'Таблица').slice(0, 120), req.body?.payload || {}, req.params.id, req.user.sub]); if (!r.rowCount) return res.status(404).json({ error: 'NOT_FOUND' }); res.json(r.rows[0]); });
app.delete('/api/tables/:id', requireAuth, async (req, res) => { await q('delete from tables_data where id=$1 and user_id=$2', [req.params.id, req.user.sub]); res.json({ ok: true }); });

app.get('/api/users/search', requireAuth, async (req, res) => { const term = String(req.query.q || '').trim(); const r = await q('select id,username,xp from users where id<>$1 and username ilike $2 order by username limit 20', [req.user.sub, `%${term}%`]); res.json(r.rows.map(x => ({ ...x, rank: rank(x.xp) }))); });
app.post('/api/friends/request', requireAuth, async (req, res) => { const to = Number(req.body?.userId); if (!to || to === Number(req.user.sub)) return res.status(400).json({ error: 'BAD_USER' }); try { const r = await q("insert into friendships(requester_id,addressee_id,status) values($1,$2,'pending') on conflict(requester_id,addressee_id) do nothing returning *", [req.user.sub, to]); res.json({ ok: true, created: Boolean(r.rowCount) }); } catch { res.status(400).json({ error: 'REQUEST_FAILED' }); } });
app.get('/api/friends/incoming', requireAuth, async (req, res) => { const r = await q(`select f.id,u.id as user_id,u.username,u.xp from friendships f join users u on u.id=f.requester_id where f.addressee_id=$1 and f.status='pending' order by f.created_at desc`, [req.user.sub]); res.json(r.rows.map(x => ({ ...x, rank: rank(x.xp) }))); });
app.post('/api/friends/accept', requireAuth, async (req, res) => { const id = Number(req.body?.requestId); const r = await q("update friendships set status='accepted' where id=$1 and addressee_id=$2 and status='pending' returning *", [id, req.user.sub]); if (!r.rowCount) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' }); res.json({ ok: true }); });
app.get('/api/friends', requireAuth, async (req, res) => { const r = await q(`select f.id,f.status,u.id as user_id,u.username,u.xp from friendships f join users u on u.id=case when f.requester_id=$1 then f.addressee_id else f.requester_id end where (f.requester_id=$1 or f.addressee_id=$1) and f.status='accepted' order by u.username`, [req.user.sub]); res.json(r.rows.map(x => ({ ...x, rank: rank(x.xp) }))); });
app.get('/api/messages/:userId', requireAuth, async (req, res) => { const other = Number(req.params.userId); const r = await q(`select m.id,m.sender_id,m.recipient_id,m.body,m.created_at,u.username as sender_name from messages m join users u on u.id=m.sender_id where (m.sender_id=$1 and m.recipient_id=$2) or (m.sender_id=$2 and m.recipient_id=$1) order by m.id desc limit 120`, [req.user.sub, other]); res.json(r.rows.reverse()); });

app.get('/api/photos', requireAuth, async (req, res) => { const r = await q('select id,filename,mime_type,size_bytes,created_at from photos where user_id=$1 order by id desc limit 50', [req.user.sub]); res.json(r.rows.map(p => ({ ...p, url: `/api/photos/${p.id}` }))); });
app.get('/api/photos/:id', async (req, res) => { const r = await q('select mime_type,data from photos where id=$1', [req.params.id]); if (!r.rowCount) return res.sendStatus(404); res.setHeader('Content-Type', r.rows[0].mime_type); res.setHeader('Cache-Control', 'public, max-age=86400'); res.end(r.rows[0].data); });
app.post('/api/photos', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PHOTO_REQUIRED' });
  if (!['image/png','image/jpeg','image/webp','image/gif'].includes(req.file.mimetype)) return res.status(415).json({ error: 'UNSUPPORTED_IMAGE' });
  const count = await q('select count(*)::int as n from photos where user_id=$1', [req.user.sub]);
  if (count.rows[0].n >= 50) return res.status(400).json({ error: 'PHOTO_LIMIT' });
  const r = await q('insert into photos(user_id,filename,mime_type,size_bytes,data) values($1,$2,$3,$4,$5) returning id,filename,mime_type,size_bytes,created_at', [req.user.sub, String(req.file.originalname).slice(0, 180), req.file.mimetype, req.file.size, req.file.buffer]);
  res.json({ ...r.rows[0], url: `/api/photos/${r.rows[0].id}` });
});
app.delete('/api/photos/:id', requireAuth, async (req, res) => { await q('delete from photos where id=$1 and user_id=$2', [req.params.id, req.user.sub]); res.json({ ok: true }); });

wss.on('connection', (ws, req) => {
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true);
  ws.on('message', async raw => {
    try {
      if (raw.length > 12000) return;
      const data = JSON.parse(raw.toString());
      if (data.type === 'auth') {
        const claims = verifyToken(String(data.token || ''));
        ws.userId = Number(claims.sub); ws.username = claims.username; sockets.set(ws.userId, ws); send(ws, { type: 'ready' }); return;
      }
      if (!ws.userId) return;
      if (data.type === 'chat') {
        const to = Number(data.to); const body = String(data.body || '').trim().slice(0, 2000); if (!to || !body) return;
        const fr = await q(`select 1 from friendships where status='accepted' and ((requester_id=$1 and addressee_id=$2) or (requester_id=$2 and addressee_id=$1))`, [ws.userId, to]);
        if (!fr.rowCount) return send(ws, { type: 'error', message: 'Доступно только друзьям' });
        const r = await q('insert into messages(sender_id,recipient_id,body) values($1,$2,$3) returning id,sender_id,recipient_id,body,created_at', [ws.userId, to, body]);
        const msg = { type: 'chat', message: r.rows[0], sender_name: ws.username }; send(ws, msg); const peer = sockets.get(to); if (peer) send(peer, msg);
      }
    } catch { send(ws, { type: 'error', message: 'WS error' }); }
  });
  ws.on('close', () => { if (ws.userId && sockets.get(ws.userId) === ws) sockets.delete(ws.userId); });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 25000);

app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const port = Number(process.env.PORT || 10000);
try {
  await initDb();
} catch (e) {
  console.error('DATABASE_INIT_FAILED');
  console.error(process.env.DATABASE_URL ? e : 'DATABASE_URL is missing. Configure Render Postgres / DATABASE_URL.');
  process.exit(1);
}
server.listen(port, '0.0.0.0', () => console.log(`OrbitDesk listening on 0.0.0.0:${port}`));

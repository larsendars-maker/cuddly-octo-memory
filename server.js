import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { initDb, q, dbMode } from './src/server/db.js';
import { hashPassword, verifyPassword, requireAuth, getCookie, setCookie, clearCookie, createSession, destroySession, issueCsrf, validCsrf } from './src/server/auth.js';
import { encryptBuffer, decryptBuffer } from './src/server/crypto.js';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
function sha256(v){ return crypto.createHash('sha256').update(v).digest('hex'); }
function b64(v){ return Buffer.isBuffer(v) ? v.toString('base64') : Buffer.from(v).toString('base64'); }
function unb64(v){ return Buffer.from(v, 'base64'); }
const mailer = (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ? nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'false')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}) : null;
function googleConfigured(){ return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI); }
function googleClient(){ return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI); }
async function audit(actorId, action, targetId=null, metadata={}){ try{ await q('insert into audit_logs(actor_id,action,target_id,metadata) values($1,$2,$3,$4)',[actorId,action,targetId,metadata]); }catch(e){ console.warn('[audit]',e.message); } }
async function ensureFrontendBuild() {
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) return;
  console.log('[OrbitDesk] dist/index.html is missing; running npm run build automatically.');
  try {
    await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: __dirname, env: process.env, timeout: 120000 });
    if (!fs.existsSync(distIndex)) throw new Error('Vite build completed but dist/index.html was not created');
  } catch (e) {
    console.error('[OrbitDesk] Frontend build failed:', e?.stderr || e?.message || e);
    throw e;
  }
}
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const sockets = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      frameSrc: ['https:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      fontSrc: ["'self'", 'data:']
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
});
app.use(securityHeaders);
app.use((req,res,next)=>{ res.setHeader('Cache-Control','no-store'); if(req.path.startsWith('/api/')) res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive'); next(); });
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'dist'), { extensions: ['html'], etag: true, maxAge: '1h' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req,res)=>res.status(429).json({error:'RATE_LIMITED'}) });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use((req,res,next)=>{
  if (!req.headers.cookie?.includes('od_csrf=')) issueCsrf(res);
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method) || !req.path.startsWith('/api/') || req.path === '/api/auth/login' || req.path === '/api/auth/register') return next();
  if (!validCsrf(req)) return res.status(403).json({error:'CSRF_FAILED'});
  next();
});

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
    showClock: s.showClock !== false,
    displayName: String(s.displayName || '').slice(0, 40),
    bio: String(s.bio || '').slice(0, 240),
    avatarUrl: validUrl(s.avatarUrl) ? s.avatarUrl : ''
  };
}

app.get('/health', async (_req, res) => { try { await q('select 1'); res.json({ ok: true, service: 'OrbitDesk', db: dbMode() }); } catch { res.status(503).json({ ok: false, service: 'OrbitDesk', db: false }); } });
app.get('/api/config', requireAuth, async (req, res) => { const u = await q('select role from users where id=$1',[req.user.sub]); const role = u.rows[0]?.role || 'user'; res.json({ role, sites: PRESET_SITES.filter(x => x.roles.includes(role)).map(({roles,...x})=>x) }); });

const PRESET_SITES = [
  { id: 'gdz', title: 'ГДЗ', url: 'https://gdz.top/', icon: '📚', category: 'study', roles: ['user','assistant','admin'] },
  { id: 'vk', title: 'VK', url: 'https://vk.com/', icon: '💬', category: 'social', roles: ['user','assistant','admin'] },
  { id: 'evolve', title: 'Evolve RP', url: 'https://evolve-rp.su/', icon: '🎮', category: 'rp', roles: ['assistant','admin'] },
  { id: 'sfpd', title: 'SFPD DB', url: 'https://sfpd-gov.ru/db/', icon: '🛡️', category: 'rp', roles: ['assistant','admin'] },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/', icon: '▶️', category: 'media', roles: ['user','assistant','admin'] },
  { id: 'google', title: 'Google', url: 'https://www.google.com/', icon: '🔎', category: 'web', roles: ['user','assistant','admin'] },
  { id: 'lichess', title: 'Lichess', url: 'https://lichess.org/', icon: '♟️', category: 'games', roles: ['user','assistant','admin'] },
  { id: 'crazygames', title: 'CrazyGames', url: 'https://www.crazygames.com/', icon: '🎯', category: 'games', roles: ['assistant','admin'] }
];

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username || '')) return res.status(400).json({ error: 'BAD_USERNAME' });
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'BAD_EMAIL' });
    if (typeof password !== 'string' || password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'WEAK_PASSWORD' });
    const existing = await q('select id from users where lower(username)=lower($1) or lower(email)=lower($2)', [username, email]);
    if (existing.rowCount) return res.status(409).json({ error: 'ALREADY_EXISTS' });
    const h = await hashPassword(password);
    const adminUsername = (process.env.ADMIN_USERNAME || 'Larsenda').toLowerCase();
    const bootstrapAdmin = (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() === String(email).toLowerCase()) || String(username).toLowerCase() === adminUsername;
    const role = bootstrapAdmin ? 'admin' : 'user';
    const r = await q('insert into users(username,email,password_hash,xp,role,email_verified) values($1,$2,$3,50,$4,false) returning id,username,email,xp,role,email_verified,created_at', [username, email.toLowerCase(), h, role]);
    const user = r.rows[0];
    const verifyToken = crypto.randomBytes(32).toString('base64url');
    await q("insert into email_verifications(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')",[user.id,sha256(verifyToken)]);
    if (mailer) { const base=`${req.protocol}://${req.get('host')}`; await mailer.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:user.email,subject:'OrbitDesk: подтверждение почты',html:`<h2>OrbitDesk</h2><p>Подтверди почту:</p><p><a href="${base}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}">Подтвердить email</a></p>`}); } else { console.warn(`[OrbitDesk] SMTP is not configured. Verification URL for ${user.email}: /api/auth/verify-email?token=${verifyToken}`); }
    await q('insert into user_settings(user_id,payload) values($1,$2) on conflict(user_id) do nothing', [user.id, normalizeSettings({})]);
    const session = await createSession(user.id);
    setCookie(res, 'od_session', session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 60 * 60 * 24 * 14 });
    issueCsrf(res);
    res.json({ user: { ...user, rank: rank(user.xp) } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'REGISTER_FAILED' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const r = await q('select * from users where lower(username)=lower($1) or lower(email)=lower($1)', [login || '']);
    const user = r.rows[0];
    if (!user || !(await verifyPassword(password || '', user.password_hash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    if (String(process.env.REQUIRE_EMAIL_VERIFICATION || 'true') !== 'false' && user.email_verified === false) return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
    await q('insert into user_settings(user_id,payload) values($1,$2) on conflict(user_id) do nothing', [user.id, normalizeSettings({})]);
    const old = getCookie(req, 'od_session');
    if (old) await destroySession(old);
    const session = await createSession(user.id);
    setCookie(res, 'od_session', session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 60 * 60 * 24 * 14 });
    issueCsrf(res);
    res.json({ user: { id: user.id, username: user.username, email: user.email, xp: user.xp, role: user.role, rank: rank(user.xp) } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'LOGIN_FAILED' }); }
});
app.get('/api/auth/verify-email', async (req,res)=>{ try{ const token=String(req.query.token||''); if(!token) return res.status(400).send('Неверная ссылка'); const r=await q('select user_id from email_verifications where token_hash=$1 and expires_at>now()',[sha256(token)]); if(!r.rowCount) return res.status(400).send('Ссылка недействительна или истекла'); await q('update users set email_verified=true,email_verified_at=now() where id=$1',[r.rows[0].user_id]); await q('delete from email_verifications where user_id=$1',[r.rows[0].user_id]); await audit(r.rows[0].user_id,'email.verified'); res.send('<h2>OrbitDesk</h2><p>Почта подтверждена. Можно закрыть эту страницу и войти в OrbitDesk.</p>'); }catch{ res.status(500).send('Ошибка подтверждения'); }});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await destroySession(getCookie(req, 'od_session'));
  clearCookie(res, 'od_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const r = await q('select id,username,email,xp,role,created_at from users where id=$1', [req.user.sub]);
  if (!r.rowCount) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  res.json({ ...r.rows[0], rank: rank(r.rows[0].xp) });
});

app.get('/api/email/status', requireAuth, async (req,res)=>{ const r=await q('select email_verified,email_verified_at from users where id=$1',[req.user.sub]); res.json(r.rows[0]||{email_verified:false}); });
app.post('/api/email/resend', requireAuth, async (req,res)=>{ const r=await q('select id,email from users where id=$1',[req.user.sub]); if(!r.rowCount) return res.status(404).json({error:'USER_NOT_FOUND'}); if(!mailer) return res.status(503).json({error:'SMTP_NOT_CONFIGURED'}); const token=crypto.randomBytes(32).toString('base64url'); await q('delete from email_verifications where user_id=$1',[req.user.sub]); await q("insert into email_verifications(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')",[req.user.sub,sha256(token)]); const base=`${req.protocol}://${req.get('host')}`; await mailer.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:r.rows[0].email,subject:'OrbitDesk: подтверждение почты',html:`<a href="${base}/api/auth/verify-email?token=${encodeURIComponent(token)}">Подтвердить email</a>`}); res.json({ok:true}); });

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

app.post('/api/history', requireAuth, async (req,res)=>{ const url=String(req.body?.url||''); const title=String(req.body?.title||'').slice(0,200); if(!validUrl(url)) return res.status(400).json({error:'BAD_URL'}); await q('insert into visits(user_id,url,title) values($1,$2,$3)',[req.user.sub,url,title]); await q('delete from visits where user_id=$1 and id not in (select id from visits where user_id=$1 order by visited_at desc limit 500)',[req.user.sub]); res.json({ok:true}); });
app.get('/api/history', requireAuth, async (req,res)=>{ const r=await q('select id,url,title,visited_at from visits where user_id=$1 order by visited_at desc limit 200',[req.user.sub]); res.json(r.rows); });

app.get('/api/tables', requireAuth, async (req, res) => { const r = await q('select id,name,payload,updated_at from tables_data where user_id=$1 order by updated_at desc', [req.user.sub]); res.json(r.rows); });
app.post('/api/tables', requireAuth, async (req, res) => { const name = String(req.body?.name || 'Новая таблица').slice(0, 120); const payload = req.body?.payload || { columns: ['A', 'B', 'C'], rows: [['', '', '']] }; const r = await q('insert into tables_data(user_id,name,payload) values($1,$2,$3) returning *', [req.user.sub, name, payload]); await q('update users set xp=xp+10 where id=$1', [req.user.sub]); res.json(r.rows[0]); });
app.put('/api/tables/:id', requireAuth, async (req, res) => { const r = await q('update tables_data set name=$1,payload=$2,updated_at=now() where id=$3 and user_id=$4 returning *', [String(req.body?.name || 'Таблица').slice(0, 120), req.body?.payload || {}, req.params.id, req.user.sub]); if (!r.rowCount) return res.status(404).json({ error: 'NOT_FOUND' }); res.json(r.rows[0]); });
app.delete('/api/tables/:id', requireAuth, async (req, res) => { await q('delete from tables_data where id=$1 and user_id=$2', [req.params.id, req.user.sub]); res.json({ ok: true }); });

async function requireRole(req,res,roles){ const u=await q('select role from users where id=$1',[req.user.sub]); const role=u.rows[0]?.role||'user'; if(!roles.includes(role)) { res.status(403).json({error:'FORBIDDEN'}); return null; } return role; }
app.get('/api/admin/history', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const r=await q('select v.id,v.url,v.title,v.visited_at,u.username from visits v join users u on u.id=v.user_id order by v.visited_at desc limit 1000'); res.json(r.rows); });
app.get('/api/admin/audit', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const r=await q('select a.id,a.action,a.target_id,a.metadata,a.created_at,u.username from audit_logs a left join users u on u.id=a.actor_id order by a.created_at desc limit 1000'); res.json(r.rows); });

app.get('/api/admin/users', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const r=await q('select id,username,email,xp,role,created_at from users order by id desc limit 200'); res.json(r.rows.map(x=>({...x,rank:rank(x.xp)}))); });
app.put('/api/admin/users/:id/role', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const role=String(req.body?.role||'user'); if(!['admin','assistant','user'].includes(role)) return res.status(400).json({error:'BAD_ROLE'}); const r=await q('update users set role=$1 where id=$2 returning id,username,email,xp,role', [role,Number(req.params.id)]); if(!r.rowCount) return res.status(404).json({error:'NOT_FOUND'}); await audit(req.user.sub,'admin.role_change',Number(req.params.id),{role}); res.json({...r.rows[0],rank:rank(r.rows[0].xp)}); });
app.get('/api/users/search', requireAuth, async (req, res) => { const term = String(req.query.q || '').trim(); const r = await q('select id,username,xp from users where id<>$1 and username ilike $2 order by username limit 20', [req.user.sub, `%${term}%`]); res.json(r.rows.map(x => ({ ...x, rank: rank(x.xp) }))); });
app.post('/api/friends/request', requireAuth, async (req, res) => { const to = Number(req.body?.userId); if (!to || to === Number(req.user.sub)) return res.status(400).json({ error: 'BAD_USER' }); try { const r = await q("insert into friendships(requester_id,addressee_id,status) values($1,$2,'pending') on conflict(requester_id,addressee_id) do nothing returning *", [req.user.sub, to]); res.json({ ok: true, created: Boolean(r.rowCount) }); } catch { res.status(400).json({ error: 'REQUEST_FAILED' }); } });
app.get('/api/friends/incoming', requireAuth, async (req, res) => { const r = await q(`select f.id,u.id as user_id,u.username,u.xp from friendships f join users u on u.id=f.requester_id where f.addressee_id=$1 and f.status='pending' order by f.created_at desc`, [req.user.sub]); res.json(r.rows.map(x => ({ ...x, rank: rank(x.xp) }))); });
app.post('/api/friends/accept', requireAuth, async (req, res) => { const id = Number(req.body?.requestId); const r = await q("update friendships set status='accepted' where id=$1 and addressee_id=$2 and status='pending' returning *", [id, req.user.sub]); if (!r.rowCount) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' }); res.json({ ok: true }); });
app.get('/api/friends', requireAuth, async (req, res) => { const r = await q(`select f.id,f.status,u.id as user_id,u.username,u.xp from friendships f join users u on u.id=case when f.requester_id=$1 then f.addressee_id else f.requester_id end where (f.requester_id=$1 or f.addressee_id=$1) and f.status='accepted' order by u.username`, [req.user.sub]); res.json(r.rows.map(x => ({ ...x, rank: rank(x.xp) }))); });
app.get('/api/messages/:userId', requireAuth, async (req, res) => { const other = Number(req.params.userId); const r = await q(`select m.id,m.sender_id,m.recipient_id,m.body,m.created_at,u.username as sender_name from messages m join users u on u.id=m.sender_id where (m.sender_id=$1 and m.recipient_id=$2) or (m.sender_id=$2 and m.recipient_id=$1) order by m.id desc limit 120`, [req.user.sub, other]); res.json(r.rows.reverse()); });

app.get('/api/integrations', requireAuth, async (req,res)=>{ const r=await q('select provider,meta,created_at,updated_at from integrations where user_id=$1 order by provider',[req.user.sub]); res.json(r.rows); });
app.get('/api/integrations/google/start', requireAuth, async (req,res)=>{ if(!googleConfigured()) return res.status(503).json({error:'GOOGLE_OAUTH_NOT_CONFIGURED'}); const state=crypto.randomBytes(24).toString('base64url'); await q(`insert into oauth_states(user_id,provider,state_hash,expires_at) values($1,'google',$2,now()+interval '10 minutes')`,[req.user.sub,sha256(state)]); const client=googleClient(); const url=client.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['openid','email','profile','https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/spreadsheets'],state}); res.redirect(url); });
app.get('/api/integrations/google/callback', async (req,res)=>{ try{ if(!googleConfigured()) return res.status(500).send('Google OAuth is not configured'); const state=String(req.query.state||''); const sr=await q(`select user_id from oauth_states where state_hash=$1 and provider='google' and expires_at>now()`,[sha256(state)]); if(!sr.rowCount) return res.status(400).send('Invalid OAuth state'); const client=googleClient(); const {tokens}=await client.getToken(String(req.query.code||'')); const meta={scope:tokens.scope||'',email:null}; const tokenCipher=b64(encryptBuffer(Buffer.from(JSON.stringify(tokens.access_token||'')))); const refreshCipher=tokens.refresh_token?b64(encryptBuffer(Buffer.from(JSON.stringify(tokens.refresh_token)))):null; await q(`insert into integrations(user_id,provider,token_cipher,refresh_cipher,meta) values($1,'google',$2,$3,$4) on conflict(user_id,provider) do update set token_cipher=excluded.token_cipher,refresh_cipher=coalesce(excluded.refresh_cipher,integrations.refresh_cipher),meta=excluded.meta,updated_at=now()`,[sr.rows[0].user_id,tokenCipher,refreshCipher,meta]); await q('delete from oauth_states where state_hash=$1',[sha256(state)]); await audit(sr.rows[0].user_id,'integration.google.connected'); res.redirect('/?integration=google_connected'); }catch(e){ console.error(e); res.status(500).send('Google OAuth error'); }});
async function googleAuthForUser(userId){ const r=await q(`select token_cipher,refresh_cipher from integrations where user_id=$1 and provider='google'`,[userId]); if(!r.rowCount) return null; const client=googleClient(); let access=JSON.parse(decryptBuffer(unb64(r.rows[0].token_cipher)).toString()); let refresh=r.rows[0].refresh_cipher?JSON.parse(decryptBuffer(unb64(r.rows[0].refresh_cipher)).toString()):null; client.setCredentials({access_token:access||undefined,refresh_token:refresh||undefined}); if(refresh){ try{ const {credentials}=await client.refreshAccessToken(); if(credentials.access_token){ access=credentials.access_token; await q(`update integrations set token_cipher=$1,updated_at=now() where user_id=$2 and provider='google'`,[b64(encryptBuffer(Buffer.from(JSON.stringify(access)))),userId]); client.setCredentials({access_token:access,refresh_token:refresh}); }}catch{} } return {client,access,refresh}; }
app.delete('/api/integrations/:provider', requireAuth, async (req,res)=>{ await q('delete from integrations where user_id=$1 and provider=$2',[req.user.sub,String(req.params.provider)]); await audit(req.user.sub,'integration.disconnected',null,{provider:req.params.provider}); res.json({ok:true}); });
app.get('/api/google/sheets', requireAuth, async (req,res)=>{ try{ const auth=await googleAuthForUser(req.user.sub); if(!auth) return res.status(404).json({error:'GOOGLE_NOT_CONNECTED'}); const drive=google.drive({version:'v3',auth:auth.client}); const r=await drive.files.list({q:"mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",fields:'files(id,name,modifiedTime,webViewLink)',pageSize:50,orderBy:'modifiedTime desc'}); res.json(r.data.files||[]); }catch(e){console.error(e);res.status(502).json({error:'GOOGLE_SHEETS_FAILED'});} });
app.get('/api/google/sheets/:id', requireAuth, async (req,res)=>{ try{ const auth=await googleAuthForUser(req.user.sub); if(!auth) return res.status(404).json({error:'GOOGLE_NOT_CONNECTED'}); const sheets=google.sheets({version:'v4',auth:auth.client}); const spreadsheet=await sheets.spreadsheets.get({spreadsheetId:req.params.id}); const first=spreadsheet.data.sheets?.[0]?.properties?.title||'Sheet1'; const range=String(req.query.range||`${first}!A1:Z40`); const values=await sheets.spreadsheets.values.get({spreadsheetId:req.params.id,range}); res.json({spreadsheetId:req.params.id,range,values:values.data.values||[],sheets:(spreadsheet.data.sheets||[]).map(x=>x.properties)}); }catch(e){console.error(e);res.status(502).json({error:'GOOGLE_SHEET_READ_FAILED'});} });
app.put('/api/google/sheets/:id', requireAuth, async (req,res)=>{ try{ const auth=await googleAuthForUser(req.user.sub); if(!auth) return res.status(404).json({error:'GOOGLE_NOT_CONNECTED'}); const sheets=google.sheets({version:'v4',auth:auth.client}); const range=String(req.body?.range||'Sheet1!A1'); const values=Array.isArray(req.body?.values)?req.body.values.slice(0,500).map(r=>Array.isArray(r)?r.slice(0,50).map(v=>String(v).slice(0,500)):[]):[]; const out=await sheets.spreadsheets.values.update({spreadsheetId:req.params.id,range,valueInputOption:'USER_ENTERED',requestBody:{values}}); await audit(req.user.sub,'google.sheet.update',null,{spreadsheetId:req.params.id,range}); res.json({updatedCells:out.data.updatedCells||0,range}); }catch(e){console.error(e);res.status(502).json({error:'GOOGLE_SHEET_WRITE_FAILED'});} });

wss.on('connection', async (ws, req) => {
  const origin = req.headers.origin;
  const expected = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${req.headers.host}`;
  if (origin && origin !== expected) return ws.close(1008, 'ORIGIN');
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true);
  try {
    const token = getCookie(req, 'od_session');
    const user = await (async()=>{
      const { sessionUser } = await import('./src/server/auth.js');
      return sessionUser(token);
    })();
    if (!user) return ws.close(1008, 'AUTH');
    ws.userId = Number(user.id); ws.username = user.username; sockets.set(ws.userId, ws); send(ws, { type: 'ready' });
  } catch { return ws.close(1011, 'AUTH_ERROR'); }
  ws.on('message', async raw => {
    try {
      if (raw.length > 12000) return;
      const data = JSON.parse(raw.toString());
      if (!ws.userId) return;
      if (data.type === 'chat') {
        const to = Number(data.to); const body = String(data.body || '').normalize('NFKC').trim().slice(0, 2000); if (!to || !body) return;
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

app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const port = Number(process.env.PORT || 10000);
try { await initDb(); await ensureFrontendBuild(); console.log(`[OrbitDesk] Storage ready: ${dbMode()}`); }
catch (e) { console.error('[OrbitDesk] Startup failed:', e?.message || e); process.exit(1); }
setInterval(() => q('delete from sessions where expires_at <= now()').catch(()=>{}), 60 * 60 * 1000).unref();
server.listen(port, '0.0.0.0', () => console.log(`OrbitDesk listening on 0.0.0.0:${port}`));

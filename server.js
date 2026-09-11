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
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const ADMIN_FILE = process.env.ADMIN_USERS_FILE || path.join(__dirname, 'admins.json');
function loadAdminUsernames(){
  try {
    const raw=JSON.parse(fs.readFileSync(ADMIN_FILE,'utf8'));
    const list=Array.isArray(raw)?raw:raw.admins;
    return new Set((Array.isArray(list)?list:[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean));
  } catch { return new Set(['larsenda']); }
}
function isConfiguredAdmin(username){ return loadAdminUsernames().has(String(username||'').trim().toLowerCase()); }
function sha256(v){ return crypto.createHash('sha256').update(v).digest('hex'); }
function b64(v){ return Buffer.isBuffer(v) ? v.toString('base64') : Buffer.from(v).toString('base64'); }
function unb64(v){ return Buffer.from(v, 'base64'); }
function mailStatus(){
  return {
    configured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    provider: 'resend-api',
    from: process.env.RESEND_FROM_EMAIL || '',
    name: process.env.RESEND_FROM_NAME || 'OrbitDesk'
  };
}

function resendConfigured(){
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

async function sendViaResend({to, subject, text, html}){
  if(!resendConfigured()){
    const e=new Error('MAIL_API_NOT_CONFIGURED'); e.status=503; throw e;
  }
  const fromName=String(process.env.RESEND_FROM_NAME || 'OrbitDesk').replace(/[<>\r\n]/g,'').trim() || 'OrbitDesk';
  const fromEmail=String(process.env.RESEND_FROM_EMAIL || '').trim();
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Authorization':`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:`${fromName} <${fromEmail}>`,to:[to],subject,text,html})
  });
  const raw=await response.text();
  let data={}; try{ data=raw?JSON.parse(raw):{}; }catch{}
  if(!response.ok){
    const detail=data?.message || data?.name || raw || `RESEND_HTTP_${response.status}`;
    const e=new Error(detail); e.status=response.status===401||response.status===403?502:502; e.provider='resend'; throw e;
  }
  return data;
}

async function sendVerificationEmail(user, reason='verify'){
  const code=String(crypto.randomInt(100000,1000000));
  const subject=reason==='resend'?'OrbitDesk: новый код подтверждения':'OrbitDesk: код подтверждения';
  const html=`<html><body style="font-family:Arial,sans-serif;background:#0b1020;padding:24px;color:#fff"><div style="max-width:520px;margin:auto;background:#151c31;border-radius:18px;padding:28px"><h2 style="margin-top:0">OrbitDesk</h2><p>Ваш код подтверждения:</p><p style="font-size:34px;font-weight:800;letter-spacing:10px;margin:18px 0">${code}</p><p>Код действует 15 минут.</p><p style="opacity:.7">Если вы не создавали аккаунт OrbitDesk, просто игнорируйте это письмо.</p></div></body></html>`;
  const text=`Код OrbitDesk: ${code}. Он действует 15 минут.`;

  // Never persist an un-sendable verification code. The code is written only
  // after the provider has accepted the message.
  await sendViaResend({to:user.email,subject,text,html});
  await q('delete from email_verification_codes where user_id=$1',[user.id]);
  await q("insert into email_verification_codes(user_id,code_hash,expires_at,attempts) values($1,$2,now()+interval '15 minutes',0)",[user.id,sha256(code)]);
}

function googleConfigured(){ return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI); }
function googleClient(){ return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI); }
async function audit(actorId, action, targetId=null, metadata={}){ try{ await q('insert into audit_logs(actor_id,action,target_id,metadata) values($1,$2,$3,$4)',[actorId,action,targetId,metadata]); }catch(e){ console.warn('[audit]',e.message); } }
async function ensureFrontendBuild() {
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) return;
  throw new Error('Frontend build is missing: run npm run build before starting OrbitDesk.');
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
app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'dist'), { extensions: ['html'], etag: true, maxAge: '1h' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req,res)=>res.status(429).json({error:'RATE_LIMITED'}) });
const verificationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req,res)=>res.status(429).json({error:'RATE_LIMITED'}) });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/verify-code', verificationLimiter);
app.use('/api/auth/resend-code', verificationLimiter);
app.use('/api/email/resend', verificationLimiter);

app.use((req,res,next)=>{
  if (!req.headers.cookie?.includes('od_csrf=')) issueCsrf(res);
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method) || !req.path.startsWith('/api/') || ['/api/auth/login','/api/auth/register','/api/auth/verify-code','/api/auth/resend-code','/api/email/resend'].includes(req.path)) return next();
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
  const allowedThemes = ['midnight', 'graphite', 'light', 'amoled', 'ocean', 'sunset'];
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
    avatarUrl: (validUrl(s.avatarUrl) || String(s.avatarUrl||'').startsWith('data:image/')) ? String(s.avatarUrl).slice(0, 2_000_000) : '',
    particlesEnabled: Boolean(s.particlesEnabled),
    particleColor: /^#[0-9a-f]{6}$/i.test(s.particleColor || '') ? s.particleColor : '#8ab4ff',
    particleDensity: Math.max(8, Math.min(72, Number(s.particleDensity) || 24)),
    particleMaxSize: Math.max(2, Math.min(6, Number(s.particleMaxSize) || 4)),
    particleSpeed: Math.max(0.1, Math.min(1.5, Number(s.particleSpeed) || 0.45))
  };
}

app.get('/health', async (_req, res) => { try { await q('select 1'); res.json({ ok: true, service: 'OrbitDesk', db: dbMode() }); } catch { res.status(503).json({ ok: false, service: 'OrbitDesk', db: false }); } });
app.get('/api/config', requireAuth, async (req, res) => { const u = await q('select role from users where id=$1',[req.user.sub]); const role = u.rows[0]?.role || 'user'; res.json({ role, sites: PRESET_SITES.filter(x => x.roles.includes(role)).sort((a,b)=>b.popularity-a.popularity).map(({roles,popularity,...x})=>x) }); });

const PRESET_SITES = [
  {id:'google-docs',title:'Google Docs',url:'https://docs.google.com/document/',icon:'📝',category:'productivity',popularity:99,roles:['user','assistant','admin']},
  {id:'google-sheets',title:'Google Sheets',url:'https://docs.google.com/spreadsheets/',icon:'📊',category:'productivity',popularity:98,roles:['user','assistant','admin']},
  {id:'google-drive',title:'Google Drive',url:'https://drive.google.com/',icon:'📁',category:'productivity',popularity:97,roles:['user','assistant','admin']},
  { id:'vk', title:'VK', url:'https://vk.com/', icon:'💬', category:'social', roles:['user','assistant','admin'], popularity:100 },
  { id:'youtube', title:'YouTube', url:'https://www.youtube.com/', icon:'▶️', category:'media', roles:['user','assistant','admin'], popularity:98 },
  { id:'google', title:'Google', url:'https://www.google.com/', icon:'🔎', category:'web', roles:['user','assistant','admin'], popularity:97 },
  { id:'github', title:'GitHub', url:'https://github.com/', icon:'🐙', category:'dev', roles:['user','assistant','admin'], popularity:96 },
  { id:'wikipedia', title:'Wikipedia', url:'https://www.wikipedia.org/', icon:'🌐', category:'reference', roles:['user','assistant','admin'], popularity:93 },
  { id:'discord', title:'Discord', url:'https://discord.com/app', icon:'🎧', category:'social', roles:['user','assistant','admin'], popularity:92 },
  { id:'lichess', title:'Lichess', url:'https://lichess.org/', icon:'♟️', category:'games', roles:['user','assistant','admin'], popularity:88 },
  { id:'steam', title:'Steam', url:'https://store.steampowered.com/', icon:'🎮', category:'games', roles:['user','assistant','admin'], popularity:87 },
  { id:'evolve', title:'Evolve RP', url:'https://evolve-rp.su/', icon:'🎮', category:'rp', roles:['assistant','admin'], popularity:80 },
  { id:'sfpd', title:'SFPD DB', url:'https://sfpd-gov.ru/db/', icon:'🛡️', category:'rp', roles:['assistant','admin'], popularity:78 },
  { id:'crazygames', title:'CrazyGames', url:'https://www.crazygames.com/', icon:'🎯', category:'games', roles:['assistant','admin'], popularity:70 }
];


app.get('/api/sites/suggest', requireAuth, async (req,res)=>{
  const qstr=String(req.query.q||'').trim().toLowerCase().slice(0,80);
  const roleRow=await q('select role from users where id=$1',[req.user.sub]);
  const role=roleRow.rows[0]?.role||'user';
  const base=PRESET_SITES.filter(x=>x.roles.includes(role)).map(x=>({...x,score:x.popularity,uses:0}));
  const [bm,vis]=await Promise.all([
    q('select id,title,url,shortcut,icon,category from bookmarks where user_id=$1 order by position,id',[req.user.sub]),
    q('select id,url,title,visited_at from visits where user_id=$1 order by visited_at desc limit 500',[req.user.sub])
  ]);
  const counts=new Map(); for(const x of vis.rows){const key=String(x.url);counts.set(key,(counts.get(key)||0)+1);}
  const merged=new Map();
  for(const x of base) merged.set(x.url,{id:x.id,title:x.title,url:x.url,icon:x.icon,category:x.category,score:x.score+(counts.get(x.url)||0)*5,uses:counts.get(x.url)||0});
  for(const x of bm.rows){const key=x.url;const item={id:`b-${x.id}`,title:x.title,url:x.url,icon:x.icon,category:x.category,score:62+(counts.get(key)||0)*7,uses:counts.get(key)||0};if(!merged.has(key)||qstr&&x.title.toLowerCase().includes(qstr))merged.set(key,item);}
  for(const [url,uses] of counts){if(!merged.has(url))merged.set(url,{id:`h-${url}`,title:url.replace(/^https?:\/\//,'').slice(0,42),url,icon:'🌐',category:'history',score:35+uses*9,uses});}
  let arr=[...merged.values()]; if(qstr)arr=arr.filter(x=>`${x.title} ${x.url}`.toLowerCase().includes(qstr)); arr.sort((a,b)=>b.score-a.score); res.json({suggestions:arr.slice(0,10)});
});
app.post('/api/sites/add', requireAuth, async (req,res)=>{
  const title=String(req.body?.title||'').trim().slice(0,120),url=String(req.body?.url||'').trim();
  if(!title||!validUrl(url))return res.status(400).json({error:'BAD_SITE'});
  const r=await q('insert into bookmarks(user_id,title,url,shortcut,icon,category) values($1,$2,$3,$4,$5,$6) returning *',[req.user.sub,title,url,String(req.body?.shortcut||'').slice(0,40),String(req.body?.icon||'🌐').slice(0,8),'custom']);
  res.json(r.rows[0]);
});

app.get('/api/auth/mail-status', (_req,res)=>res.json(mailStatus()));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username || '')) return res.status(400).json({ error: 'BAD_USERNAME' });
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'BAD_EMAIL' });
    if (typeof password !== 'string' || password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'WEAK_PASSWORD' });
    if (!resendConfigured()) return res.status(503).json({ error:'MAIL_API_NOT_CONFIGURED' });
    const existing = await q('select id from users where lower(username)=lower($1) or lower(email)=lower($2)', [username, email]);
    if (existing.rowCount) return res.status(409).json({ error: 'ALREADY_EXISTS' });
    const h = await hashPassword(password);
    const adminUsername = (process.env.ADMIN_USERNAME || 'Larsenda').toLowerCase();
    const bootstrapAdmin = (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() === String(email).toLowerCase()) || String(username).toLowerCase() === adminUsername;
    const role = bootstrapAdmin ? 'admin' : 'user';
    const r = await q('insert into users(username,email,password_hash,xp,role,email_verified) values($1,$2,$3,50,$4,false) returning id,username,email,xp,role,email_verified,created_at', [username, email.toLowerCase(), h, role]);
    const user = r.rows[0];
    try {
      await sendVerificationEmail(user,'verify');
    } catch (mailError) {
      await q('delete from users where id=$1',[user.id]);
      if (mailError?.message === 'MAIL_API_NOT_CONFIGURED') return res.status(503).json({error:'MAIL_API_NOT_CONFIGURED'});
      console.error('[mail]', mailError);
      return res.status(502).json({error:'EMAIL_SEND_FAILED'});
    }
    await q('insert into user_settings(user_id,payload) values($1,$2) on conflict(user_id) do nothing',[user.id,normalizeSettings({})]);
    await audit(user.id,'account.created',user.id,{username:user.username,email:user.email,role:user.role,created_at:user.created_at});
    res.json({pendingVerification:true,email:user.email,username:user.username});
  } catch (e) { console.error(e); res.status(500).json({ error: 'REGISTER_FAILED' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const r = await q('select * from users where lower(username)=lower($1) or lower(email)=lower($1)', [login || '']);
    const user = r.rows[0];
    if (!user || !(await verifyPassword(password || '', user.password_hash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    if (user.blocked) return res.status(403).json({ error: 'ACCOUNT_BLOCKED', reason: user.block_reason || '' });
    if (isConfiguredAdmin(user.username) && user.role !== 'admin') { await q("update users set role='admin' where id=$1",[user.id]); user.role='admin'; }
    if (String(process.env.REQUIRE_EMAIL_VERIFICATION || 'true') !== 'false' && user.email_verified === false) {
      try {
        await sendVerificationEmail({id:user.id,email:user.email}, 'verify');
      } catch (mailError) {
        console.error('[mail/login-unverified]', mailError);
        if (mailError?.message === 'MAIL_API_NOT_CONFIGURED') return res.status(503).json({ error:'MAIL_API_NOT_CONFIGURED' });
        console.error('[mail/login-unverified] provider error:', mailError?.message || mailError);
        return res.status(502).json({ error:'EMAIL_SEND_FAILED' });
      }
      return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED', email:user.email, codeSent:true });
    }
    await q('insert into user_settings(user_id,payload) values($1,$2) on conflict(user_id) do nothing', [user.id, normalizeSettings({})]);
    const old = getCookie(req, 'od_session');
    if (old) await destroySession(old);
    const session = await createSession(user.id);
    setCookie(res, 'od_session', session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 60 * 60 * 24 * 14 });
    issueCsrf(res);
    res.json({ user: { id: user.id, username: user.username, email: user.email, xp: user.xp, role: user.role, rank: rank(user.xp) } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'LOGIN_FAILED' }); }
});
app.post('/api/auth/verify-code', async (req,res)=>{try{const email=String(req.body?.email||'').trim().toLowerCase();const code=String(req.body?.code||'').replace(/\D/g,'').slice(0,6);if(!email||code.length!==6)return res.status(400).json({error:'BAD_CODE'});const ur=await q('select id,username,email,xp,role,email_verified,blocked,block_reason from users where lower(email)=lower($1)',[email]);if(!ur.rowCount)return res.status(404).json({error:'USER_NOT_FOUND'});const u=ur.rows[0];if(u.blocked)return res.status(403).json({error:'ACCOUNT_BLOCKED',reason:u.block_reason||''});if(u.email_verified)return res.json({ok:true});const r=await q("select user_id,code_hash,attempts from email_verification_codes where user_id=$1 and expires_at>now()",[u.id]);if(!r.rowCount)return res.status(400).json({error:'CODE_EXPIRED'});if(Number(r.rows[0].attempts)>=5)return res.status(429).json({error:'TOO_MANY_ATTEMPTS'});if(sha256(code)!==r.rows[0].code_hash){await q('update email_verification_codes set attempts=attempts+1 where user_id=$1',[u.id]);return res.status(400).json({error:'BAD_CODE'});}await q('update users set email_verified=true,email_verified_at=now() where id=$1',[u.id]);await q('delete from email_verification_codes where user_id=$1',[u.id]);await audit(u.id,'email.verified');const old=getCookie(req,'od_session');if(old) await destroySession(old);const session=await createSession(u.id);setCookie(res,'od_session',session,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'Strict',maxAge:60*60*24*14});issueCsrf(res);res.json({ok:true,user:{id:u.id,username:u.username,email:u.email,xp:u.xp,role:u.role,rank:rank(u.xp)}});}catch(e){console.error(e);res.status(500).json({error:'VERIFY_FAILED'});}});
app.get('/api/auth/verify-email', async (_req,res)=>res.status(410).send('Подтверждение теперь проходит кодом из письма. Вернитесь в OrbitDesk.'));

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await destroySession(getCookie(req, 'od_session'));
  clearCookie(res, 'od_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const r = await q('select id,username,email,xp,role,email_verified,created_at from users where id=$1', [req.user.sub]);
  if (!r.rowCount) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  res.json({ ...r.rows[0], rank: rank(r.rows[0].xp) });
});

app.get('/api/email/status', requireAuth, async (req,res)=>{ const r=await q('select email_verified,email_verified_at from users where id=$1',[req.user.sub]); res.json(r.rows[0]||{email_verified:false}); });
app.post('/api/auth/resend-code', async (req,res)=>{try{
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:'BAD_EMAIL'});
  const r=await q('select id,email,email_verified from users where lower(email)=lower($1)',[email]);
  if(!r.rowCount) return res.status(404).json({error:'USER_NOT_FOUND'});
  if(r.rows[0].email_verified) return res.json({ok:true,alreadyVerified:true});
  await sendVerificationEmail({id:r.rows[0].id,email},'resend');
  res.json({ok:true});
}catch(e){console.error('[mail/resend]',e);if(e?.message==='MAIL_API_NOT_CONFIGURED') return res.status(503).json({error:'MAIL_API_NOT_CONFIGURED'});res.status(502).json({error:'EMAIL_SEND_FAILED'});}});

app.post('/api/email/resend', requireAuth, async (req,res)=>{const r=await q('select id,email,email_verified from users where id=$1',[req.user.sub]);if(!r.rowCount)return res.status(404).json({error:'USER_NOT_FOUND'});if(r.rows[0].email_verified)return res.json({ok:true,alreadyVerified:true});await sendVerificationEmail({id:r.rows[0].id,email:r.rows[0].email},'resend');res.json({ok:true});});

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

// Built-in free helper: deterministic spreadsheet/code assistant. No external API key required.
app.post('/api/ai/help', requireAuth, async (req,res)=>{
  try{
    const prompt=String(req.body?.prompt||'').trim().slice(0,1200);
    const table=req.body?.table;
    const lower=prompt.toLowerCase();
    if(!prompt) return res.status(400).json({error:'AI_PROMPT_REQUIRED'});
    let answer='';
    const cols=Array.isArray(table?.columns)?table.columns.join(', '):'';
    if(/формул|formula|sum|сумм/i.test(lower)){
      const col=(Array.isArray(table?.columns)?table.columns.find((c)=>/(сум|цена|amount|price|count|кол)/i.test(String(c))):'C')||'C';
      answer=`Попробуй формулу Google Sheets:\n=SUM(${col}2:${col}100)\n\nЕсли нужен итог только по условию:\n=SUMIF(A:A;\"условие\";${col}:${col})\n\nТекущие столбцы: ${cols||'не указаны'}`;
    } else if(/код|javascript|typescript|api|fetch|node|python/i.test(lower)){
      answer=`Пример безопасного запроса:\nconst response = await fetch('/api/example', {\n  method: 'POST',\n  headers: { 'content-type': 'application/json' },\n  body: JSON.stringify({ value: 123 })\n});\nconst data = await response.json();\n\nДля OrbitDesk не вставляй секреты/API-ключи в frontend — держи их на сервере.`;
    } else if(/структур|таблиц|колон|sheet|google/i.test(lower)){
      answer=`По таблице можно сделать так:\n1. Первая строка — понятные заголовки.\n2. Один тип данных на один столбец.\n3. Числа не смешивать с текстом.\n4. Для итогов использовать отдельную строку или SUM/SUMIF.\n5. Для Google Sheets сначала выбери таблицу, затем нужный диапазон.\n\nСтолбцы: ${cols||'не указаны'}`;
    } else {
      answer=`Бесплатный Orbit AI может помочь с формулами, структурой таблиц и небольшими фрагментами кода.\n\nПопробуй запрос:\n• «формула суммы столбца C»\n• «как сделать SUMIF»\n• «напиши JS fetch для API»\n• «проверь структуру этой таблицы»`;
    }
    await audit(req.user.sub,'ai.help',null,{prompt:prompt.slice(0,180)});
    res.json({answer});
  }catch(e){console.error(e);res.status(500).json({error:'AI_HELP_FAILED'});}
});

app.get('/api/tables', requireAuth, async (req, res) => { const r = await q('select id,name,payload,updated_at from tables_data where user_id=$1 order by updated_at desc', [req.user.sub]); res.json(r.rows); });
app.post('/api/tables', requireAuth, async (req, res) => { const name = String(req.body?.name || 'Новая таблица').slice(0, 120); const payload = req.body?.payload || { columns: ['A', 'B', 'C'], rows: [['', '', '']] }; const r = await q('insert into tables_data(user_id,name,payload) values($1,$2,$3) returning *', [req.user.sub, name, payload]); await q('update users set xp=xp+10 where id=$1', [req.user.sub]); res.json(r.rows[0]); });
app.put('/api/tables/:id', requireAuth, async (req, res) => { const r = await q('update tables_data set name=$1,payload=$2,updated_at=now() where id=$3 and user_id=$4 returning *', [String(req.body?.name || 'Таблица').slice(0, 120), req.body?.payload || {}, req.params.id, req.user.sub]); if (!r.rowCount) return res.status(404).json({ error: 'NOT_FOUND' }); res.json(r.rows[0]); });
app.delete('/api/tables/:id', requireAuth, async (req, res) => { await q('delete from tables_data where id=$1 and user_id=$2', [req.params.id, req.user.sub]); res.json({ ok: true }); });

async function requireRole(req,res,roles){ const u=await q('select role,username from users where id=$1',[req.user.sub]); const role=u.rows[0]?.role||'user'; const effective=isConfiguredAdmin(u.rows[0]?.username)?'admin':role; if(!roles.includes(effective)) { res.status(403).json({error:'FORBIDDEN'}); return null; } return effective; }

app.get('/api/admin/mail/status', requireAuth, async (req,res)=>{
  if(!(await requireRole(req,res,['admin']))) return;
  res.json(mailStatus());
});
app.post('/api/admin/mail/test', requireAuth, async (req,res)=>{
  if(!(await requireRole(req,res,['admin']))) return;
  const to=String(req.body?.email||process.env.BOOTSTRAP_ADMIN_EMAIL||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(to)) return res.status(400).json({error:'BAD_EMAIL'});
  try{
    await sendViaResend({to,subject:'OrbitDesk: тест почты',text:'Почта OrbitDesk работает. Тестовое сообщение.',html:'<p><b>OrbitDesk</b>: почта работает. Это тестовое сообщение.</p>'});
  }catch(e){ console.error('[mail/test]',e); if(e?.message==='MAIL_API_NOT_CONFIGURED') return res.status(503).json({error:'MAIL_API_NOT_CONFIGURED'}); return res.status(502).json({error:'EMAIL_SEND_FAILED'}); }
  await audit(req.user.sub,'mail.test',null,{to,provider:'resend'});
  res.json({ok:true,to,provider:'resend'});
});

app.get('/api/admin/history', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const r=await q('select v.id,v.url,v.title,v.visited_at,u.username,u.email from visits v join users u on u.id=v.user_id order by v.visited_at desc limit 1000'); res.json(r.rows); });
app.get('/api/admin/audit', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const r=await q('select a.id,a.action,a.target_id,a.metadata,a.created_at,u.username,u.email from audit_logs a left join users u on u.id=a.actor_id order by a.created_at desc limit 1000'); res.json(r.rows); });

app.get('/api/admin/users', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const r=await q('select id,username,email,xp,role,email_verified,created_at,blocked,block_reason,blocked_at from users order by id desc limit 500'); res.json(r.rows.map(x=>({...x,rank:rank(x.xp),configuredAdmin:isConfiguredAdmin(x.username)}))); });
app.put('/api/admin/users/:id/role', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const role=String(req.body?.role||'user'); if(!['admin','assistant','user'].includes(role)) return res.status(400).json({error:'BAD_ROLE'}); const targetId=Number(req.params.id); const tr=await q('select username from users where id=$1',[targetId]); if(!tr.rowCount)return res.status(404).json({error:'NOT_FOUND'}); if(role!=='admin' && isConfiguredAdmin(tr.rows[0].username)) return res.status(400).json({error:'ADMIN_CONFIGURED_IN_FILE'}); const r=await q('update users set role=$1 where id=$2 returning id,username,email,xp,role,email_verified,created_at,blocked,block_reason,blocked_at', [role,targetId]); await audit(req.user.sub,'admin.role_change',targetId,{role}); res.json({...r.rows[0],rank:rank(r.rows[0].xp),configuredAdmin:isConfiguredAdmin(r.rows[0].username)}); });
app.put('/api/admin/users/:id/block', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; const targetId=Number(req.params.id); if(targetId===Number(req.user.sub)) return res.status(400).json({error:'CANNOT_BLOCK_SELF'}); const block=req.body?.blocked!==false; const reason=String(req.body?.reason||'Без указания причины').slice(0,240); const r=await q('update users set blocked=$1,block_reason=$2,blocked_at=case when $1 then now() else null end where id=$3 returning id,username,email,xp,role,email_verified,created_at,blocked,block_reason,blocked_at',[block,reason,targetId]); if(!r.rowCount)return res.status(404).json({error:'NOT_FOUND'}); if(block) await q('delete from sessions where user_id=$1',[targetId]); await audit(req.user.sub,block?'admin.account.block':'admin.account.unblock',targetId,{reason}); res.json({...r.rows[0],rank:rank(r.rows[0].xp),configuredAdmin:isConfiguredAdmin(r.rows[0].username)}); });
app.get('/api/admin/admins', requireAuth, async (req,res)=>{ if(!(await requireRole(req,res,['admin']))) return; res.json({file:ADMIN_FILE,admins:[...loadAdminUsernames()]}); });
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
app.post('/api/google/sheets', requireAuth, async (req,res)=>{try{const auth=await googleAuthForUser(req.user.sub);if(!auth)return res.status(401).json({error:'GOOGLE_NOT_CONNECTED'});const title=String(req.body?.title||'Новая таблица').slice(0,120);const sheets=google.sheets({version:'v4',auth:auth.client});const out=await sheets.spreadsheets.create({requestBody:{properties:{title}}});await audit(req.user.sub,'google.sheet.create',null,{spreadsheetId:out.data.spreadsheetId,title});res.json({id:out.data.spreadsheetId,name:title,url:out.data.spreadsheetUrl});}catch(e){console.error(e);res.status(502).json({error:'GOOGLE_SHEET_CREATE_FAILED'});}});
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
try {
  await initDb();
  await ensureFrontendBuild();
  console.log(`[OrbitDesk] Storage ready: ${dbMode()}`);
  const mail=mailStatus();
  console.log(`[OrbitDesk] Mail provider: ${mail.provider}; configured=${mail.configured}; from=${mail.from || '(not set)'}`);
  if(!mail.configured) console.warn('[OrbitDesk] Resend email is not configured. Registration/email verification will remain unavailable until RESEND_API_KEY and RESEND_FROM_EMAIL are set.');
}
catch (e) { console.error('[OrbitDesk] Startup failed:', e?.message || e); process.exit(1); }
setInterval(() => q('delete from sessions where expires_at <= now()').catch(()=>{}), 60 * 60 * 1000).unref();
server.listen(port, '0.0.0.0', () => console.log(`OrbitDesk listening on 0.0.0.0:${port}`));

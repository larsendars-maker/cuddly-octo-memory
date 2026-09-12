import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q } from './db.js';

const SESSION_DAYS = 14;

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getCookie(req, name) {
  return parseCookies(req.headers.cookie || '')[name] || null;
}

export function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push('Priority=High');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearCookie(res, name, options = {}) {
  setCookie(res, name, '', { ...options, maxAge: 0 });
}

export function issueCsrf(res) {
  const token = crypto.randomBytes(24).toString('base64url');
  setCookie(res, 'od_csrf', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 * 30
  });
  return token;
}

export async function createSession(userId, { privileged = false } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const digest = hashToken(token);
  await q(`insert into sessions(token_hash,user_id,expires_at,privileged_at) values($1,$2,now()+$3::interval,$4)`, [digest, userId, `${SESSION_DAYS} days`, privileged ? new Date().toISOString() : null]);
  return token;
}

export async function elevateSession(token) {
  if (!token) return false;
  const r = await q('update sessions set privileged_at=now() where token_hash=$1 and expires_at>now() returning id', [hashToken(token)]);
  return Boolean(r.rowCount);
}

export async function clearPrivilege(token) {
  if (!token) return false;
  const r = await q('update sessions set privileged_at=null where token_hash=$1 returning id', [hashToken(token)]);
  return Boolean(r.rowCount);
}

export async function destroySession(token) {
  if (!token) return;
  await q('delete from sessions where token_hash=$1', [hashToken(token)]);
}

export async function sessionUser(token) {
  if (!token) return null;
  const r = await q(`select u.id,u.username,u.email,u.xp,u.role,u.email_verified,u.email_verified_at,u.created_at,u.blocked,u.block_reason,s.privileged_at
                     from sessions s join users u on u.id=s.user_id
                     where s.token_hash=$1 and s.expires_at>now()`, [hashToken(token)]);
  if (!r.rowCount) return null;
  if (r.rows[0].blocked) return null;
  return r.rows[0];
}

export async function requireSession(req, res, next) {
  try {
    const token = getCookie(req, 'od_session');
    const user = await sessionUser(token);
    if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    req.user = { sub: user.id, id: user.id, username: user.username, role: user.role, xp: user.xp, privileged: Boolean(user.privileged_at) };
    next();
  } catch (err) {
    console.error('[auth]', err?.message || err);
    res.status(500).json({ error: 'AUTH_CHECK_FAILED' });
  }
}

function privilegedRole(role) { return role === 'assistant' || role === 'admin' || role === 'gl.admin'; }

export async function requireAuth(req, res, next) {
  try {
    const token = getCookie(req, 'od_session');
    const user = await sessionUser(token);
    if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    if (privilegedRole(user.role) && !user.privileged_at) {
      return res.status(403).json({ error: 'PRIVILEGE_REQUIRED', user: { id:user.id, username:user.username, email:user.email, xp:user.xp, role:user.role, email_verified:user.email_verified, chat_enabled:true, rank:{name:'',xp:user.xp} } });
    }
    req.user = { sub: user.id, id: user.id, username: user.username, role: user.role, xp: user.xp, privileged: true };
    next();
  } catch (err) {
    console.error('[auth]', err?.message || err);
    res.status(500).json({ error: 'AUTH_CHECK_FAILED' });
  }
}

export async function hashPassword(password) { return bcrypt.hash(password, 12); }
export async function verifyPassword(password, hash) { return bcrypt.compare(password, hash); }

export function validCsrf(req) {
  const cookie = getCookie(req, 'od_csrf');
  const header = req.get('X-CSRF-Token');
  if (!cookie || !header || cookie.length !== header.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}

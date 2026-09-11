const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const ROOT = __dirname;
const MAX_PLAYERS = 64;
const players = new Map();
let nextId = 1;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath || '/'); } catch { return null; }
  if (decoded === '/') decoded = '/index.html';
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, '');
  const full = path.resolve(ROOT, normalized);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/health' || urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, players: players.size }));
  }

  const file = safePath(urlPath);
  if (!file) return res.writeHead(403).end('Forbidden');

  fs.stat(file, (statErr, stat) => {
    if (statErr || !stat.isFile()) return res.writeHead(404).end('Not found');
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(500).end('Internal server error');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=3600'
      });
      res.end(data);
    });
  });
});

const wss = new WebSocketServer({ server, clientTracking: true, maxPayload: 16 * 1024 });

function cleanName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const name = value.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20);
  return name || fallback;
}

function cleanHero(value) {
  return typeof value === 'string' ? value.slice(0, 30) : 'warrior';
}

function cleanColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function snapshot() {
  const out = {};
  for (const [id, p] of players) {
    out[id] = {
      id,
      name: p.name,
      hero: p.hero,
      color: p.color,
      x: p.x,
      y: p.y,
      hp: p.hp,
      maxHp: p.maxHp,
      team: p.team
    };
  }
  return JSON.stringify({ type: 'state', players: out, online: players.size, ts: Date.now() });
}

function broadcast() {
  const msg = snapshot();
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) {
    ws.close(1013, 'Server is full');
    return;
  }

  const id = String(nextId++);
  const p = {
    ws,
    id,
    name: `Player_${id}`,
    hero: 'warrior',
    color: '#3498db',
    x: 250,
    y: 2350,
    hp: 700,
    maxHp: 700,
    team: players.size % 2 === 0 ? 'blue' : 'red',
    lastPacket: 0,
    alive: true
  };
  players.set(id, p);

  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    team: p.team,
    online: players.size,
    serverTime: Date.now()
  }));
  broadcast();

  ws.on('pong', () => { p.lastPong = Date.now(); });

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - p.lastPacket < 40) return;
    p.lastPacket = now;

    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m.type !== 'string') return;

    if (m.type === 'join') {
      p.name = cleanName(m.name, p.name);
      p.hero = cleanHero(m.hero);
      if (m.color) p.color = cleanColor(m.color, p.color);
      broadcast();
      return;
    }

    if (m.type === 'state') {
      p.x = clampNumber(m.x, 0, 2600, p.x);
      p.y = clampNumber(m.y, 0, 2600, p.y);
      p.hp = Math.max(0, clampNumber(m.hp, 0, 10000, p.hp));
      p.maxHp = clampNumber(m.maxHp, 1, 10000, p.maxHp);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      p.name = cleanName(m.name, p.name);
      p.hero = cleanHero(m.hero);
      p.color = cleanColor(m.color, p.color);
      return;
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast();
  });
  ws.on('error', () => {
    players.delete(id);
    broadcast();
  });
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (p.lastPong && now - p.lastPong > 35000) {
      try { p.ws.terminate(); } catch {}
      continue;
    }
    if (p.ws.readyState === WebSocket.OPEN) p.ws.ping();
  }
  broadcast();
}, 5000);

function shutdown(signal) {
  clearInterval(heartbeat);
  for (const p of players.values()) {
    try { p.ws.close(1001, 'Server shutting down'); } catch {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MOBA Arena server listening on 0.0.0.0:${PORT}`);
});

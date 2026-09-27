// Crewboard server: serves the app and keeps one shared workspace for the whole team.
// No dependencies. Data lives in a JSON file (put it on a Railway volume so it survives redeploys).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'crewboard.json');
const PASSWORD = process.env.CREWBOARD_PASSWORD || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 2 * 1024 * 1024;

// ---------- state ----------
// Starting data: SEED_FILE if set, else seed.local.json (your own data, kept out of git), else the example seed.json.
function seedFile() {
  if (process.env.SEED_FILE) return path.resolve(process.env.SEED_FILE);
  const local = path.join(__dirname, 'seed.local.json');
  return fs.existsSync(local) ? local : path.join(__dirname, 'seed.json');
}
function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('Could not read ' + DATA_FILE + ', starting from the seed:', e.message);
  }
  const seed = JSON.parse(fs.readFileSync(seedFile(), 'utf8'));
  return { version: 1, people: seed.people || [], workspace: seed.workspace || { name: 'Main workspace', order: [], dashboards: [] }, boards: seed.boards || {} };
}
fs.mkdirSync(DATA_DIR, { recursive: true });
const state = loadState();
if (typeof state.version !== 'number') state.version = 1;

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(state), (err) => {
      if (err) return console.error('Save failed:', err.message);
      fs.rename(tmp, DATA_FILE, (err2) => { if (err2) console.error('Save failed:', err2.message); });
    });
  }, 250);
}
function bump() { state.version += 1; persist(); return state.version; }
persist();


// Merge task-by-task so teammates editing different tasks on the same board never overwrite each other.
function mergeBoard(base, inc) {
  if (!base) return inc;
  const del = new Map();
  (base.deletedTasks || []).concat(inc.deletedTasks || []).forEach((d) => { if (!del.has(d.id) || del.get(d.id) < d.at) del.set(d.id, d.at); });
  const pick = new Map();
  (base.tasks || []).forEach((t) => pick.set(t.id, t));
  (inc.tasks || []).forEach((t) => { const o = pick.get(t.id); if (!o || (t.u || 0) >= (o.u || 0)) pick.set(t.id, t); });
  const order = (inc.tasks || []).map((t) => t.id);
  (base.tasks || []).forEach((t) => { if (!order.includes(t.id)) order.push(t.id); });
  const tasks = order.map((id) => pick.get(id)).filter((t) => !(del.has(t.id) && del.get(t.id) >= (t.u || 0)));
  const out = Object.assign({}, inc, { tasks, deletedTasks: Array.from(del, ([id, at]) => ({ id, at })).slice(-300) });
  const gids = new Set((out.groups || []).map((g) => g.id));
  tasks.forEach((t) => { if (!gids.has(t.groupId)) { const g = (base.groups || []).find((x) => x.id === t.groupId); if (g) { out.groups = (out.groups || []).concat([g]); gids.add(g.id); } } });
  return out;
}

// ---------- helpers ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': type || 'application/json', 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(buf);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}
function authorized(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  const a = Buffer.from(pass), b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const validId = (id) => /^[A-Za-z0-9_.:-]{1,80}$/.test(id);

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/healthz') return send(res, 200, { ok: true });
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Crewboard", charset="UTF-8"', 'Content-Type': 'text/plain' });
    return res.end('Enter the team password to open Crewboard. Any username works.');
  }
  try {
    if (p.startsWith('/api/')) {
      if (req.method === 'GET' && p === '/api/state') return send(res, 200, state);
      // Test-only: restore the starting data. Enabled only when CREWBOARD_TEST=1 (never on Railway unless you set it).
      if (req.method === 'POST' && p === '/api/__reset' && process.env.CREWBOARD_TEST === '1') {
        const seed = JSON.parse(fs.readFileSync(seedFile(), 'utf8'));
        state.people = seed.people; state.workspace = seed.workspace; state.boards = seed.boards;
        return send(res, 200, { version: bump() });
      }
      if (req.method === 'GET' && p === '/api/version') return send(res, 200, { version: state.version });
      let m;
      if ((m = p.match(/^\/api\/boards\/([^/]+)$/))) {
        const id = decodeURIComponent(m[1]);
        if (!validId(id)) return send(res, 400, { error: 'bad_id' });
        if (req.method === 'PUT') {
          const body = await readJson(req);
          if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'bad_body' });
          body.id = id; state.boards[id] = mergeBoard(state.boards[id], body);
          return send(res, 200, { version: bump() });
        }
        if (req.method === 'DELETE') { delete state.boards[id]; return send(res, 200, { version: bump() }); }
      }
      if (p === '/api/workspace' && req.method === 'PUT') {
        const body = await readJson(req);
        if (!body || typeof body !== 'object') return send(res, 400, { error: 'bad_body' });
        state.workspace = body; return send(res, 200, { version: bump() });
      }
      if (p === '/api/team' && req.method === 'PUT') {
        const body = await readJson(req);
        if (!body || !Array.isArray(body.people)) return send(res, 400, { error: 'bad_body' });
        state.people = body.people; return send(res, 200, { version: bump() });
      }
      return send(res, 404, { error: 'not_found' });
    }
    // static files
    let file = path.normalize(path.join(PUBLIC_DIR, p === '/' ? 'index.html' : decodeURIComponent(p)));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) file = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(file, (err2, buf) => {
        if (err2) return send(res, 404, 'Not found', 'text/plain');
        send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream');
      });
    });
  } catch (e) {
    const code = e.message === 'too_large' ? 413 : 400;
    send(res, code, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log('Crewboard running on port ' + PORT + ' · data file: ' + DATA_FILE + (PASSWORD ? ' · password on' : ' · no password set'));
});
